#!/usr/bin/env node
/**
 * Suggest GA volumes for catalog entries missing a GA number.
 *
 * Loads YAML entries without a ga field, scans the first 60 pages of GA PDFs
 * for lecture dates (dd. mmm yyyy), and suggests matching GA volumes.
 *
 * Requires: pdftotext (poppler)
 */

import fs from "node:fs";
import { colors, flagValue, hasFlag } from "../../lib/cli.js";
import {
  GERMAN_MONTHS,
  extractPdfPages,
  gaNumberFromFilename,
  gaPdfPath,
  listGaPdfFilenames,
  parseRangeArg,
  resolveGaPdfDir,
} from "../../lib/ga-pdf.js";
import { loadLocationsSorted } from "../../lib/locations.js";
import { LECTURE_CATALOG_PATH } from "../../lib/paths.js";

interface CatalogEntryWithoutGa {
  id: string;
  datum: string | null;
  ort: string | null;
  vortragstitel: string;
}

interface YamlParseState {
  id: string;
  datum: string | null;
  ort: string | null;
  vortragstitel: string | null;
  hasGa: boolean;
  gaValue: string | null;
}

interface TocDateEntry {
  datum: string;
  lineBefore: string;
  lineOf: string;
  lineAfter: string;
}

interface GaDateExtraction extends TocDateEntry {
  gaNum: string;
}

const HELP_TEXT = `Suggest GA volumes for catalog entries missing a GA number.

Loads YAML entries without a ga field, scans the first 60 pages of all GA PDFs
for lecture dates (dd. Month yyyy), and suggests matching GA volumes.

Requires: pdftotext (poppler)

Usage:
  tsx src/scripts/maintain-lecture-catalog/suggest_ga_for_missing.ts [options]

Options:
  --help, -h     Show this help
  --range RANGE  Limit GA bands to scan
                 Examples: 51,52,53  or  332-337  or  68a-68d

Environment:
  GA_PDF_DIR     Path to local GA PDF directory (default: ~/GA 180dpi/GA-Acrobat/GA)
`;

function addGasForDatum(
  gasPerDatum: Map<string, Set<string>>,
  datum: string,
  gaValue: string
): void {
  const parts = gaValue
    .split(/[\s,]+/)
    .map((p) => p.replace(/['']/g, "").trim())
    .filter(Boolean);
  if (!gasPerDatum.has(datum)) gasPerDatum.set(datum, new Set());
  const set = gasPerDatum.get(datum)!;
  for (const p of parts) {
    set.add(p);
  }
}

function loadYamlEntriesWithoutGa(yamlContent: string): {
  entriesWithoutGa: CatalogEntryWithoutGa[];
  gasPerDatum: Map<string, Set<string>>;
} {
  const entriesWithoutGa: CatalogEntryWithoutGa[] = [];
  const gasPerDatum = new Map<string, Set<string>>();

  const lines = yamlContent.split("\n");
  let currentEntry: YamlParseState | null = null;

  function flushEntry(entry: YamlParseState): void {
    if (entry.datum && entry.hasGa && entry.gaValue) {
      addGasForDatum(gasPerDatum, entry.datum, entry.gaValue);
    }
    if (!entry.hasGa) {
      entriesWithoutGa.push({
        id: entry.id,
        datum: entry.datum,
        ort: entry.ort,
        vortragstitel: entry.vortragstitel ?? "",
      });
    }
  }

  for (const line of lines) {
    const idMatch = line.match(/^\s+-\s+id:\s*(.+)$/);
    if (idMatch) {
      if (currentEntry) flushEntry(currentEntry);
      currentEntry = {
        id: idMatch[1]!.trim(),
        datum: null,
        ort: null,
        vortragstitel: null,
        hasGa: false,
        gaValue: null,
      };
    }

    if (!currentEntry) continue;

    const datumMatch = line.match(/^\s+datum:\s*(.+)$/);
    if (datumMatch) currentEntry.datum = datumMatch[1]!.trim();

    const ortMatch = line.match(/^\s+ort:\s*(.+)$/);
    if (ortMatch) currentEntry.ort = ortMatch[1]!.trim();

    const titelMatch = line.match(/^\s+vortragstitel:\s*(.+)$/);
    if (titelMatch) currentEntry.vortragstitel = titelMatch[1]!.trim();

    const gaMatch = line.match(/^\s+ga:\s*(.+)$/);
    if (gaMatch) {
      currentEntry.hasGa = true;
      currentEntry.gaValue = gaMatch[1]!.trim();
    }
  }

  if (currentEntry) flushEntry(currentEntry);

  return { entriesWithoutGa, gasPerDatum };
}

function parseDatesFromToc(text: string, locations: string[] = []): TocDateEntry[] {
  const results: TocDateEntry[] = [];
  const lines = text.split("\n");
  let lastYear: number | null = null;
  let pending: {
    day: number;
    monthIdx: number;
    match: RegExpMatchArray;
    line: string;
    lineIndex: number;
  } | null = null;

  const dateRe = new RegExp(
    `(\\d{1,2})\\.\\s+(${GERMAN_MONTHS.join("|")})\\s*(\\d{4})?`,
    "gi"
  );

  function output(
    day: number,
    monthIdx: number,
    year: number,
    line: string,
    match: RegExpMatchArray,
    lineIndex: number
  ): void {
    const month = monthIdx + 1;
    const dd = String(day).padStart(2, "0");
    const mm = String(month).padStart(2, "0");
    const datum = `${dd}.${mm}.${year}`;
    const textBefore = line.slice(0, match.index).trim();
    const lineStartsWithDate = textBefore === "";
    let effectiveBefore = textBefore;
    if (lineStartsWithDate && lineIndex > 0) {
      effectiveBefore = lines[lineIndex - 1]!.trim();
    }
    const hasLocationBefore = locations.some(
      (ort) => effectiveBefore.endsWith(ort) || effectiveBefore.endsWith(`${ort},`)
    );
    const openParens = (effectiveBefore.match(/\(/g) ?? []).length;
    const closeParens = (effectiveBefore.match(/\)/g) ?? []).length;
    const inParentheses = openParens > closeParens;

    if (inParentheses) return;
    if (!lineStartsWithDate && !hasLocationBefore) return;

    const lineBefore = lineIndex > 0 ? lines[lineIndex - 1]!.trim() : "";
    const lineOf = line.trim();
    const lineAfter = lineIndex < lines.length - 1 ? lines[lineIndex + 1]!.trim() : "";

    results.push({ datum, lineBefore, lineOf, lineAfter });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    const yearOnly = /^\s*(\d{4})\s*$/.exec(trimmed);
    if (yearOnly) {
      lastYear = parseInt(yearOnly[1]!, 10);
      if (pending) {
        output(
          pending.day,
          pending.monthIdx,
          lastYear,
          pending.line,
          pending.match,
          pending.lineIndex
        );
        pending = null;
      }
    } else {
      lastYear = null;
    }

    for (const m of line.matchAll(dateRe)) {
      const day = parseInt(m[1]!, 10);
      const monthName = m[2]!;
      const yearStr = m[3];
      const monthIdx = GERMAN_MONTHS.findIndex(
        (mo) => mo.toLowerCase() === monthName.toLowerCase()
      );
      if (monthIdx < 0) continue;

      if (yearStr) {
        const year = parseInt(yearStr, 10);
        output(day, monthIdx, year, line, m, i);
        pending = null;
      } else if (lastYear) {
        output(day, monthIdx, lastYear, line, m, i);
      } else {
        pending = { day, monthIdx, match: m, line, lineIndex: i };
      }
    }
  }

  return results;
}

function main(): void {
  const args = process.argv.slice(2);
  if (hasFlag(args, "--help", "-h")) {
    console.log(HELP_TEXT);
    return;
  }

  const rangeSet = parseRangeArg(flagValue(args, "--range"));

  const gaDir = resolveGaPdfDir();
  if (!fs.existsSync(gaDir)) {
    console.error(`${colors.red}Error: GA PDF directory not found: ${gaDir}${colors.reset}`);
    process.exit(1);
  }
  if (!fs.existsSync(LECTURE_CATALOG_PATH)) {
    console.error(
      `${colors.red}Error: catalog not found: ${LECTURE_CATALOG_PATH}${colors.reset}`
    );
    process.exit(1);
  }

  const yamlContent = fs.readFileSync(LECTURE_CATALOG_PATH, "utf-8");
  const { entriesWithoutGa, gasPerDatum } = loadYamlEntriesWithoutGa(yamlContent);
  const locations = loadLocationsSorted();

  console.log(`Entries without GA: ${entriesWithoutGa.length}`);
  if (entriesWithoutGa.length === 0) {
    console.log("No entries without a GA number.");
    return;
  }

  const allPdfs = listGaPdfFilenames({ rangeSet, minGaNum: 51 });
  if (allPdfs.length === 0) {
    console.error(`${colors.red}No GA PDFs found.${colors.reset}`);
    return;
  }

  const gaToDates = new Map<string, TocDateEntry[]>();
  const allExtractions: GaDateExtraction[] = [];

  console.log(`\nScanning ${allPdfs.length} GA volume(s) (pages 1–60)…`);
  for (let idx = 0; idx < allPdfs.length; idx++) {
    const filename = allPdfs[idx]!;
    const gaNum = gaNumberFromFilename(filename);
    if (!gaNum) continue;

    const pct =
      allPdfs.length > 1 ? Math.round(((idx + 1) / allPdfs.length) * 100) : 100;
    const barLen = 20;
    const filled = Math.round(((idx + 1) / allPdfs.length) * barLen);
    const bar =
      "=".repeat(filled) +
      (filled < barLen ? ">" : "") +
      " ".repeat(Math.max(0, barLen - filled - 1));
    process.stdout.write(
      `\r[${bar}] ${idx + 1}/${allPdfs.length} (${pct}%) GA ${gaNum}    `
    );

    const pdfPath = gaPdfPath(filename);
    const text = extractPdfPages(pdfPath, 1, 60);
    const dates = parseDatesFromToc(text, locations);

    gaToDates.set(gaNum, dates);
    for (const d of dates) {
      allExtractions.push({ gaNum, ...d });
    }
  }
  console.log("\n");

  function findFreeGasForDatum(datum: string): GaDateExtraction[] {
    const assigned = gasPerDatum.get(datum) ?? new Set<string>();
    const candidates: GaDateExtraction[] = [];
    for (const [gaNum, dates] of gaToDates) {
      if (assigned.has(gaNum)) continue;
      const match = dates.find((d) => d.datum === datum);
      if (match) candidates.push({ gaNum, ...match });
    }
    return candidates;
  }

  function findPossibleMatches(
    titlePrefix: string,
    excludeDatum: string
  ): GaDateExtraction[] {
    const prefix = (titlePrefix || "").slice(0, 80).trim();
    if (prefix.length < 10) return [];
    const prefixLower = prefix.toLowerCase();
    const results: GaDateExtraction[] = [];
    const seen = new Set<string>();
    for (const ex of allExtractions) {
      if (ex.datum === excludeDatum) continue;
      const combined = `${ex.lineOf} ${ex.lineAfter}`.toLowerCase();
      if (combined.includes(prefixLower)) {
        const key = `${ex.gaNum}:${ex.datum}:${ex.lineOf}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(ex);
        }
      }
    }
    return results;
  }

  console.log("Output per entry without GA:\n");

  for (const entry of entriesWithoutGa) {
    const { id, datum, vortragstitel } = entry;
    if (!datum) continue;

    const candidates = findFreeGasForDatum(datum);

    if (candidates.length > 0) {
      for (const c of candidates) {
        console.log(
          `${colors.yellow}${id}, ${datum}, ${(vortragstitel || "").slice(0, 60)}${colors.reset}`
        );
        console.log(`${colors.brightRed}  GA ${c.gaNum}${colors.reset}`);
        console.log(`${colors.gray}  Line before: ${c.lineBefore || "(empty)"}${colors.reset}`);
        console.log(`${colors.gray}  Line: ${c.lineOf}${colors.reset}`);
        console.log(`${colors.gray}  Line after: ${c.lineAfter || "(empty)"}${colors.reset}`);
        console.log("");
      }
    } else {
      const hasAnyAtDatum = [...gaToDates.entries()].some(([, dates]) =>
        dates.some((d) => d.datum === datum)
      );

      const msg = hasAnyAtDatum ? "No free match found" : "Entry not found";
      console.log(
        `${colors.red}${msg}: ${datum} ${(vortragstitel || "").slice(0, 80)}${colors.reset}`
      );

      const possible = findPossibleMatches(vortragstitel, datum);
      for (const v of possible) {
        const fullTitle = `${v.lineOf} ${v.lineAfter}`.trim().slice(0, 120);
        console.log(`${colors.orange}  Possible: ${v.datum}, ${fullTitle}${colors.reset}`);
      }
      if (possible.length > 0) console.log("");
    }
  }
}

main();
