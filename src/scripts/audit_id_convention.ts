#!/usr/bin/env node
import { loadLectureCatalog } from "../lib/catalog.js";

const lectures = loadLectureCatalog();
const byDate = new Map<string, string[]>();

for (const lec of lectures) {
  const m = lec.id.match(/^(\d{8})([a-f]?)$/);
  if (!m) {
    console.log("INVALID ID:", lec.id);
    continue;
  }
  const [, date, suffix] = m;
  if (!byDate.has(date)) byDate.set(date, []);
  byDate.get(date)!.push(suffix || "");
}

const issues: string[] = [];

for (const [date, suffixes] of [...byDate.entries()].sort()) {
  const bare = suffixes.filter((s) => s === "");
  const lettered = suffixes.filter((s) => s !== "").sort();
  const fullIds = suffixes.map((s) => date + (s || ""));

  if (bare.length && lettered.length) {
    issues.push(`MIXED ${date}: ${fullIds.join(", ")}`);
  }
  if (bare.length > 1) {
    issues.push(`MULTI_BARE ${date}: ${bare.length} (${fullIds.join(", ")})`);
  }
  if (lettered.length) {
    const expected = "abcdef".slice(0, lettered.length).split("");
    if (lettered.join("") !== expected.join("")) {
      issues.push(
        `BAD_SEQ ${date}: got ${lettered.join("")} expected ${expected.join("")} (${lettered.map((s) => date + s).join(",")})`
      );
    }
  }
  if (suffixes.length > 6) {
    issues.push(`TOO_MANY ${date}: ${suffixes.length} (${fullIds.join(", ")})`);
  }
}

const idCount = new Map<string, number>();
for (const lec of lectures) {
  idCount.set(lec.id, (idCount.get(lec.id) ?? 0) + 1);
}
for (const [id, c] of idCount) {
  if (c > 1) issues.unshift(`DUP ${id} x${c}`);
}

console.log(`Issues: ${issues.length}`);
for (const i of issues) console.log(i);
