#!/usr/bin/env node
/**
 * Enforce per-day ID convention: either one bare YYYYMMDD, or all suffixes a–f in order.
 * Run: yarn tsx src/scripts/fix_id_convention.ts
 * Dry-run: yarn tsx src/scripts/fix_id_convention.ts --dry-run
 */
import fs from "node:fs";
import { hasFlag } from "../lib/cli.js";
import { loadLectureCatalog } from "../lib/catalog.js";
import { LECTURE_CATALOG_PATH } from "../lib/paths.js";
import type { LectureEntry } from "../lib/types.js";

const dryRun = hasFlag(process.argv.slice(2), "--dry-run");

function letterForIndex(i: number): string {
  return String.fromCharCode(97 + i);
}

function parseId(id: string): { date: string; suffix: string } | null {
  const m = id.match(/^(\d{8})([a-f]?)$/);
  if (!m) return null;
  return { date: m[1]!, suffix: m[2] ?? "" };
}

function groupNeedsFix(ids: string[]): boolean {
  const bare = ids.filter((id) => /^\d{8}$/.test(id));
  const lettered = ids.filter((id) => /^\d{8}[a-f]$/.test(id));
  if (ids.some((id) => /^\d{8}g/.test(id))) return true;
  if (bare.length && lettered.length) return true;
  if (bare.length > 1) return true;
  if (lettered.length) {
    const letters = lettered.map((id) => id.slice(-1)).sort();
    const expected = "abcdef".slice(0, lettered.length).split("");
    if (letters.join("") !== expected.join("")) return true;
  }
  return false;
}

function targetIdForGroup(date: string, count: number, index: number): string {
  if (count === 1) return date;
  return `${date}${letterForIndex(index)}`;
}

const lectures = loadLectureCatalog();

// Preserve catalog order within each date group
const byDate = new Map<string, LectureEntry[]>();
for (const lec of lectures) {
  const parsed = parseId(lec.id);
  if (!parsed) continue;
  if (!byDate.has(parsed.date)) byDate.set(parsed.date, []);
  byDate.get(parsed.date)!.push(lec);
}

const changes: { uuid: string; oldId: string; newId: string }[] = [];

for (const [date, group] of byDate) {
  const ids = group.map((l) => l.id);
  if (!groupNeedsFix(ids)) continue;

  for (let i = 0; i < group.length; i++) {
    const lec = group[i]!;
    const newId = targetIdForGroup(date, group.length, i);
    if (lec.id !== newId) {
      changes.push({ uuid: lec.uuid, oldId: lec.id, newId });
    }
  }
}

// 19231231g is invalid (7th on one day) — move to next day as f
const gEntry = lectures.find((l) => l.id === "19231231g");
if (gEntry) {
  changes.push({ uuid: gEntry.uuid, oldId: "19231231g", newId: "19240101f" });
}

console.log(`Planned changes: ${changes.length}`);
for (const c of changes) {
  console.log(`  ${c.oldId} → ${c.newId}  (${c.uuid.slice(0, 8)}…)`);
}

if (dryRun) {
  console.log("\n(dry run — no file written)");
  process.exit(0);
}

let text = fs.readFileSync(LECTURE_CATALOG_PATH, "utf8");

for (const { uuid, oldId, newId } of changes) {
  const pattern = new RegExp(
    `(  - id: )${oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\n    uuid: ${uuid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`
  );
  if (!pattern.test(text)) {
    console.error(`WARN: pattern not found for ${oldId} uuid=${uuid}`);
    continue;
  }
  text = text.replace(pattern, `$1${newId}$2`);
}

// Datum for moved Silvester entry
if (gEntry) {
  text = text.replace(
    /(  - id: 19240101f\n    uuid: 67335f53-90ff-59e1-9052-846b89789e93\n    datum: )31\.12\.1923/,
    "$101.01.1924"
  );
  text = text.replace(
    /(  - id: 19240101f\n    uuid: 67335f53-90ff-59e1-9052-846b89789e93\n    jahr: "1923")/,
    '$1'.replace('"1923"', '"1924"') // noop fallback
  );
  text = text.replace(
    /(  - id: 19240101f\n    uuid: 67335f53-90ff-59e1-9052-846b89789e93\n    datum: 01\.01\.1924\n    jahr: "1923")/,
    '$1'.replace('jahr: "1923"', 'jahr: "1924"')
  );
  text = text.replace(
    `  - id: 19240101f
    uuid: 67335f53-90ff-59e1-9052-846b89789e93
    datum: 01.01.1924
    jahr: "1923"`,
    `  - id: 19240101f
    uuid: 67335f53-90ff-59e1-9052-846b89789e93
    datum: 01.01.1924
    jahr: "1924"`
  );
}

fs.writeFileSync(LECTURE_CATALOG_PATH, text);
console.log("\nWrote", LECTURE_CATALOG_PATH);
