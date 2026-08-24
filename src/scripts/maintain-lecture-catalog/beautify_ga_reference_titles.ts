#!/usr/bin/env node
/**
 * Beautify titel fields in reference/ga/GAXX.yaml files.
 *
 * Conservative rules only — uncertain titles are left unchanged.
 *
 * Usage: tsx src/scripts/maintain-lecture-catalog/beautify_ga_reference_titles.ts [--write]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasFlag } from "../../lib/cli.js";
import { loadLocationsSorted } from "../../lib/locations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REF_GA_DIR = path.join(__dirname, "../../../reference/ga");

const MONTHS =
  /Januar|Februar|März|Marz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Jan\.|Feb\.|Mär\.|Mar\.|Apr\.|Jun\.|Jul\.|Aug\.|Sep\.|Sept\.|Okt\.|Nov\.|Dez\./i;

const ROMAN = /^(I{1,3}|IV|VI{0,3}|IX|X{1,3}|XI{0,3}|XII{0,3}|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX)$/i;

function parseTitelValue(raw: string): { value: string; quoted: boolean } {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return { value: trimmed.slice(1, -1), quoted: true };
  }
  return { value: trimmed, quoted: false };
}

function formatTitelValue(value: string, quoted: boolean): string {
  if (quoted || /[:#"'&*!?|>@[\]{},]/.test(value) || value.includes("  ")) {
    return `titel: "${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return `titel: ${value}`;
}

function tokenizeSpacedCaps(s: string): string[] {
  const parts = s.trim().split(/\s+/);
  const tokens: string[] = [];
  let buf = "";
  for (const p of parts) {
    if (p.length === 1 && /[A-Za-zÄÖÜäöüß]/.test(p)) {
      buf += p;
    } else {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
      tokens.push(p);
    }
  }
  if (buf) tokens.push(buf);
  return tokens;
}

function isSpacedCaps(s: string): boolean {
  const parts = s.trim().split(/\s+/);
  if (parts.length < 3) return false;
  const singles = parts.filter((p) => p.length === 1 && /[A-Za-zÄÖÜäöüß]/.test(p)).length;
  return singles >= 3 && singles / parts.length >= 0.35;
}

function capitalizeWord(w: string): string {
  if (!w) return w;
  if (ROMAN.test(w)) return w.toUpperCase();
  if (w.includes("-")) {
    return w
      .split("-")
      .map((part) => capitalizeWord(part))
      .join("-");
  }
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

const ORDINALS = [
  "EINUNDZWANZIGSTER",
  "ZWEIUNDZWANZIGSTER",
  "DREIUNDZWANZIGSTER",
  "VIERUNDZWANZIGSTER",
  "FÜNFUNDZWANZIGSTER",
  "SECHSUNDZWANZIGSTER",
  "SIEBENUNDZWANZIGSTER",
  "ACHTUNDZWANZIGSTER",
  "NEUNUNDZWANZIGSTER",
  "DREISSIGSTER",
  "EINUNDDREISSIGSTER",
  "ZWANZIGSTER",
  "NEUNZEHNTER",
  "ACHTZEHNTER",
  "SIEBZEHNTER",
  "SECHZEHNTER",
  "FÜNFZEHNTER",
  "VIERZEHNTER",
  "DREIZEHNTER",
  "ZWÖLFTER",
  "ELFTER",
  "ZEHNTER",
  "NEUNTER",
  "ACHTER",
  "SIEBTER",
  "SIEBENTER",
  "SECHSTER",
  "FÜNFTER",
  "VIERTER",
  "DRITTER",
  "ZWEITER",
  "ERSTER",
].sort((a, b) => b.length - a.length);

const KNOWN_SUFFIXES = [
  "STUDIENABEND",
  "FRAGEABEND",
  "DISKUSSIONSABEND",
  "MITGLIEDERVORTRAG",
  "VORTRÄGE",
  "VORTRAG",
  "ANSPRACHE",
].sort((a, b) => b.length - a.length);

function splitKnownSuffixes(token: string): string[] {
  const upper = token.toUpperCase();
  for (const suffix of KNOWN_SUFFIXES) {
    if (upper.endsWith(suffix) && upper.length > suffix.length) {
      const prefix = upper.slice(0, upper.length - suffix.length);
      if (prefix.length >= 3) {
        return [...splitOrdinalPrefix(prefix), suffix];
      }
    }
  }
  return splitOrdinalPrefix(upper);
}

function splitOrdinalPrefix(token: string): string[] {
  const upper = token.toUpperCase();
  for (const ord of ORDINALS) {
    if (upper === ord) return [ord];
    if (upper.startsWith(ord) && upper.length > ord.length) {
      const rest = upper.slice(ord.length);
      return [ord, ...splitKnownSuffixes(rest)];
    }
  }
  return [upper];
}

function normalizeAllCaps(s: string): string {
  const tokens = isSpacedCaps(s) ? tokenizeSpacedCaps(s) : s.trim().split(/\s+/);
  const expanded: string[] = [];
  for (const token of tokens) {
    if (/^[A-ZÄÖÜß-]+$/.test(token) && token.length > 3 && !token.includes(" ")) {
      expanded.push(...splitKnownSuffixes(token));
    } else {
      expanded.push(token);
    }
  }
  return expanded.map((t) => capitalizeWord(t)).join(" ");
}

function isAllCapsTitle(s: string): boolean {
  if (!/[A-ZÄÖÜ]/.test(s) || /[a-zäöüß]/.test(s)) return false;
  const tokens = isSpacedCaps(s) ? tokenizeSpacedCaps(s) : s.trim().split(/\s+/);
  if (tokens.length === 0) return false;
  return tokens.every((t) => /^[A-ZÄÖÜß-]+$/.test(t) && t.length >= 2);
}

function isDateFragment(s: string): boolean {
  const t = s.trim();
  if (/^\d{1,2}\.\s+und\s*\.?\s*$/i.test(t)) return true;
  if (!MONTHS.test(t) || !/\d/.test(t)) return false;
  if (/\bund\s*\.?\s*$/.test(t)) return true;
  if (/^\d{1,2}\.,\s*\d{1,2}\.\s+\w+/i.test(t)) return true;
  if (/^\d{1,2}\.\s*,\s*\d{1,2}\./.test(t)) return true;
  return false;
}

function isEditorialJunk(s: string): boolean {
  return /^Zu dieser Ausgabe/i.test(s.trim());
}

function isLocationOnly(s: string, ort: string | null, locations: Set<string>): boolean {
  const t = s.trim();
  if (!t || t === "—" || t === "Kein Titel") return false;
  if (ort && ort !== "—" && t === ort) return true;
  if (locations.has(t)) return true;
  const lower = t.toLowerCase();
  for (const loc of locations) {
    if (loc.toLowerCase() === lower) return true;
  }
  return false;
}

function fixMergedCompound(s: string): string | null {
  if (/\s/.test(s)) return null;
  const parts = splitKnownSuffixes(s.toUpperCase());
  if (parts.length <= 1) return null;
  const result = parts.map((t) => capitalizeWord(t)).join(" ");
  return result !== s ? result : null;
}

function beautifyTitel(
  raw: string,
  ort: string | null,
  locations: Set<string>
): string | null {
  const { value } = parseTitelValue(raw);
  if (!value || value === "—" || value === "Kein Titel") return null;

  if (isEditorialJunk(value)) return "Kein Titel";
  if (isDateFragment(value)) return "Kein Titel";
  if (isLocationOnly(value, ort, locations)) return "Kein Titel";

  if (isSpacedCaps(value) || isAllCapsTitle(value)) {
    const normalized = normalizeAllCaps(value);
    if (normalized !== value) return normalized;
  }

  const merged = fixMergedCompound(value);
  if (merged) return merged;

  return null;
}

function processFile(filePath: string, locations: Set<string>, doWrite: boolean): number {
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  let changed = 0;
  let currentOrt: string | null = null;
  let inEntry = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (/^\s+-\s+seq:/.test(line)) {
      inEntry = true;
      currentOrt = null;
      continue;
    }

    if (!inEntry) continue;

    const ortMatch = line.match(/^\s+ort:\s*(.+)$/);
    if (ortMatch) {
      const { value } = parseTitelValue(ortMatch[1]!);
      currentOrt = value;
      continue;
    }

    const titelMatch = line.match(/^(\s+titel:\s*)(.+)$/);
    if (titelMatch) {
      const indent = titelMatch[1]!.match(/^(\s+)/)?.[1] ?? "    ";
      const raw = titelMatch[2]!;
      const { quoted } = parseTitelValue(raw);
      const newValue = beautifyTitel(raw, currentOrt, locations);
      if (newValue != null) {
        changed++;
        lines[i] = `${indent}${formatTitelValue(newValue, quoted)}`;
      }
    }
  }

  if (changed > 0 && doWrite) {
    fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
  }
  return changed;
}

function main(): void {
  const doWrite = hasFlag(process.argv.slice(2), "--write");
  const locations = new Set(loadLocationsSorted());
  const files = fs
    .readdirSync(REF_GA_DIR)
    .filter((f) => /^GA\d+[a-z]*\.yaml$/i.test(f))
    .sort();

  let total = 0;
  let filesChanged = 0;

  for (const f of files) {
    const n = processFile(path.join(REF_GA_DIR, f), locations, doWrite);
    if (n > 0) {
      filesChanged++;
      total += n;
      console.log(`${f}: ${n} title(s) ${doWrite ? "updated" : "would update"}`);
    }
  }

  console.log(
    `\n${total} title(s) in ${filesChanged} file(s) ${doWrite ? "updated" : "would be updated (preview — use --write)"}.`
  );
}

main();
