#!/usr/bin/env node
/**
 * Add missing GA numbers to rudolf-steiner-ga-lecture-catalog.yaml.
 *
 * Scans GA PDFs from band 051 onward, finds table-of-contents pages, extracts lecture
 * dates (format: "5. Mai 1919"), and checks whether the catalog has an entry for each
 * date. Missing GA numbers are logged (bright green) but not written unless --write is set.
 *
 * Requires: pdftotext (poppler)
 * Usage: tsx src/scripts/maintain-lecture-catalog/add_ga_from_ga_pdf_toc.ts [--write] [--range 51,52|332-337|68a,68b|68a-68c]
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLectureCatalogRaw, writeLectureCatalogRaw } from "../../lib/catalog.js";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLACKLIST_PATH = path.join(__dirname, "add_ga_from_ga_pdf_toc.blacklist");

/** GA volumes without lectures — skipped */
const GA_EXCLUDED = new Set([244, 246, 251, 260, 266, 277]);

/** UUID v5 namespace for add_ga blacklist (6ba7b810-9dad-11d1-80b4-00c04fd430c8 = DNS) */
const UUID5_NAMESPACE = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");

function uuidv5(name: string): string {
  const hash = createHash("sha1")
    .update(Buffer.concat([UUID5_NAMESPACE, Buffer.from(String(name), "utf-8")]))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return [
    bytes.subarray(0, 4).toString("hex"),
    bytes.subarray(4, 6).toString("hex"),
    bytes.subarray(6, 8).toString("hex"),
    bytes.subarray(8, 10).toString("hex"),
    bytes.subarray(10, 16).toString("hex"),
  ].join("-");
}

function loadBlacklist(): Set<string> {
  if (!fs.existsSync(BLACKLIST_PATH)) return new Set();
  const content = fs.readFileSync(BLACKLIST_PATH, "utf-8");
  return new Set(
    content
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#"))
  );
}

function formatDatumForDisplay(datum: string): { display: string; id: string } {
  const m = datum.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return { display: datum, id: datum.replace(/\./g, "") };
  const [, dd, mm, yyyy] = m;
  const month = GERMAN_MONTHS[parseInt(mm!, 10) - 1] ?? mm;
  return { display: `${parseInt(dd!, 10)}. ${month} ${yyyy}`, id: `${yyyy}${mm}${dd}` };
}

function findTocPage(pdfPath: string): number | null {
  const text = extractPdfPages(pdfPath, 1, 15);
  const pages = text.split(/\f/);
  const tocRe = /^\s*(INHALT|INHALTSVERZEICHNIS)\s*$/im;
  for (let i = 0; i < pages.length; i++) {
    const firstLines = pages[i]!.split("\n").slice(0, 5).join("\n");
    if (tocRe.test(firstLines)) return i + 1;
  }
  return null;
}

interface ParsedLectureDate {
  datum: string;
  hasCommaBefore: boolean;
  hasOrtBefore: boolean;
  hasVortragBefore: boolean;
  hasZumVortragVom: boolean;
  lineStartsWithDate: boolean;
  inParentheses: boolean;
  wordsBefore: string[];
  wordsAfter: string[];
  sourceLine: string;
}

function parseLectureDatesFromToc(text: string, locations: string[] = []): ParsedLectureDate[] {
  const results: ParsedLectureDate[] = [];
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

  function getContextWords(line: string, matchStart: number, matchEnd: number) {
    const before = line.slice(0, matchStart).trim();
    const after = line.slice(matchEnd).trim();
    const wordsBefore = before ? before.split(/\s+/).slice(-5) : [];
    const wordsAfter = after ? after.split(/\s+/).slice(0, 5) : [];
    return { wordsBefore, wordsAfter };
  }

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
    let textBefore = line.slice(0, match.index);
    const lineStartsWithDate = textBefore.trim() === "";
    if (lineStartsWithDate && lineIndex > 0) {
      textBefore = lines[lineIndex - 1]! + "\n" + textBefore;
    }
    const hasCommaBefore = /[,\u00BB\u203A\u201C\u201D;]\s*$/.test(textBefore);
    const hasOrtBefore = locations.some((ort) => textBefore.trim().endsWith(ort));
    const hasVortragBefore = /(?:V\s*O\s*R\s*T\s*R\s*A\s*G|VORTRAG)\s*$/i.test(
      textBefore.trim()
    );
    const hasZumVortragVom = /(?:Zum Vortrag|Zu den Vorträgen) vom\s*$/i.test(textBefore);
    const openParens = (textBefore.match(/\(/g) || []).length;
    const closeParens = (textBefore.match(/\)/g) || []).length;
    const inParentheses = openParens > closeParens;
    const { wordsBefore, wordsAfter } = getContextWords(
      line,
      match.index!,
      match.index! + match[0].length
    );
    const sourceLine =
      textBefore.trim() === "" && lineIndex > 0
        ? `${lines[lineIndex - 1]!.trim()} ${line.trim()}`
        : line.trim();
    results.push({
      datum,
      hasCommaBefore,
      hasOrtBefore,
      hasVortragBefore,
      hasZumVortragVom,
      lineStartsWithDate,
      inParentheses,
      wordsBefore,
      wordsAfter,
      sourceLine,
    });
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

function gaContainsNumber(gaValue: string | null, gaNum: string): boolean {
  if (!gaValue) return false;
  const s = String(gaValue);
  const n = String(gaNum).replace(/^0+/, "");
  const re = new RegExp(
    `(?:^|[\\s,/])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[\\s,/']|$)`,
    "u"
  );
  return re.test(s);
}

interface YamlEntry {
  lineStart: number;
  lineEnd: number;
  datum: string | null;
  hasGa: boolean;
  gaValue: string | null;
  gaLineIndex: number | null;
}

function buildYamlIndex(lines: string[]): Map<string, YamlEntry[]> {
  const byDatum = new Map<string, YamlEntry[]>();
  let i = 0;
  let currentEntry: YamlEntry | null = null;

  while (i < lines.length) {
    const line = lines[i]!;
    const idMatch = line.match(/^\s+-\s+id:\s*(.+)$/);
    if (idMatch) {
      if (currentEntry) {
        currentEntry.lineEnd = i - 1;
        const datum = currentEntry.datum;
        if (datum) {
          if (!byDatum.has(datum)) byDatum.set(datum, []);
          byDatum.get(datum)!.push(currentEntry);
        }
      }
      currentEntry = {
        lineStart: i,
        lineEnd: -1,
        datum: null,
        hasGa: false,
        gaValue: null,
        gaLineIndex: null,
      };
    }

    if (currentEntry) {
      const datumMatch = line.match(/^\s+datum:\s*(.+)$/);
      if (datumMatch) currentEntry.datum = datumMatch[1]!.trim();

      const gaMatch = line.match(/^\s+ga:\s*(.+)$/);
      if (gaMatch) {
        currentEntry.hasGa = true;
        currentEntry.gaValue = gaMatch[1]!.trim();
        currentEntry.gaLineIndex = i;
      }
    }
    i++;
  }

  if (currentEntry) {
    currentEntry.lineEnd = lines.length - 1;
    const datum = currentEntry.datum;
    if (datum) {
      if (!byDatum.has(datum)) byDatum.set(datum, []);
      byDatum.get(datum)!.push(currentEntry);
    }
  }

  return byDatum;
}

function insertGaIntoEntry(lines: string[], entry: YamlEntry, gaNum: string): string[] {
  const insertLine = entry.lineEnd + 1;
  const indent = "    ";
  const gaLine = `${indent}ga: ${gaNum}`;
  return [...lines.slice(0, insertLine), gaLine, ...lines.slice(insertLine)];
}

function appendGaToEntry(lines: string[], entry: YamlEntry, gaNum: string): string[] {
  if (entry.gaLineIndex == null) return lines;
  const line = lines[entry.gaLineIndex]!;
  const m = line.match(/^(\s+ga:\s*)(.+)$/);
  if (!m) return lines;
  const newValue = `${m[2]!.trim()},${gaNum}`;
  const newLine = `${m[1]}${newValue}`;
  const newLines = [...lines];
  newLines[entry.gaLineIndex] = newLine;
  return newLines;
}

function listGaPdfs(rangeSet?: Set<string> | null): string[] {
  return listGaPdfFilenames({ rangeSet, minGaNum: 51 }).filter((f) => {
    const n = gaNumberFromFilename(f);
    if (!n) return false;
    const num = parseInt(String(n).replace(/\D/g, ""), 10);
    return !GA_EXCLUDED.has(num);
  });
}

const HELP_TEXT = `Add missing GA numbers to rudolf-steiner-ga-lecture-catalog.yaml.

Scans GA PDFs from band 051 onward, finds table-of-contents pages, extracts lecture
dates (format: "5. Mai 1919"), and checks whether the catalog has an entry for each
date. Missing GA numbers are logged (bright green) but not written unless --write is set.

Requires: pdftotext (poppler)

Usage:
  tsx src/scripts/maintain-lecture-catalog/add_ga_from_ga_pdf_toc.ts [options]

Options:
  --help, -h     Show this help
  --write        Write changes to the catalog YAML (default: preview only)
  --range RANGE  Limit GA bands, e.g. 51,52,53 or 332-337 or 68a,68b or 68a-68c

Environment:
  GA_PDF_DIR     Path to local GA PDF directory
`;

function main(): void {
  const args = process.argv.slice(2);
  if (hasFlag(args, "--help", "-h")) {
    console.log(HELP_TEXT);
    return;
  }

  const doWrite = hasFlag(args, "--write");
  const rangeSet = parseRangeArg(flagValue(args, "--range"));

  const gaDir = resolveGaPdfDir();
  if (!fs.existsSync(gaDir)) {
    console.error(`${colors.red}GA PDF directory not found: ${gaDir}${colors.reset}`);
    process.exit(1);
  }
  if (!fs.existsSync(LECTURE_CATALOG_PATH)) {
    console.error(
      `${colors.red}Lecture catalog not found: ${LECTURE_CATALOG_PATH}${colors.reset}`
    );
    process.exit(1);
  }

  const allPdfs = listGaPdfs(rangeSet);
  const total = allPdfs.length;
  if (total === 0) {
    console.log("No GA PDFs found in the requested range.");
    return;
  }

  let yamlLines = loadLectureCatalogRaw().split("\n");
  const blacklist = loadBlacklist();
  const locations = loadLocationsSorted();
  let totalInserted = 0;
  let totalErrors = 0;
  let totalChecked = 0;
  let totalFound = 0;

  for (let idx = 0; idx < total; idx++) {
    const filename = allPdfs[idx]!;
    const gaNum = gaNumberFromFilename(filename);
    if (!gaNum) continue;

    const pct = total > 1 ? Math.round(((idx + 1) / total) * 100) : 100;
    const barLen = 20;
    const filled = Math.round(((idx + 1) / total) * barLen);
    const bar =
      "=".repeat(filled) +
      (filled < barLen ? ">" : "") +
      " ".repeat(Math.max(0, barLen - filled - 1));
    const progress = `[${bar}] ${idx + 1}/${total} (${pct}%)`;
    process.stdout.write(`${progress} GA ${gaNum} ... `);

    const pdfPath = gaPdfPath(filename);
    if (!fs.existsSync(pdfPath)) {
      console.log("PDF not found, skipping.");
      continue;
    }

    const tocPage = findTocPage(pdfPath);
    if (!tocPage) {
      console.log("No table of contents in the first 15 pages.");
      continue;
    }

    const tocText = extractPdfPages(pdfPath, tocPage, tocPage + 19);
    const lectures = parseLectureDatesFromToc(tocText, locations);

    if (lectures.length === 0) {
      console.log("No lecture dates found in TOC.");
      continue;
    }

    const byDatum = buildYamlIndex(yamlLines);
    let inserted = 0;
    let errors = 0;
    let checked = 0;
    let found = 0;
    const pendingInserts: { entry: YamlEntry; gaNum: string; append: boolean }[] = [];

    for (const lecture of lectures) {
      const {
        datum,
        hasCommaBefore,
        hasOrtBefore,
        hasVortragBefore,
        hasZumVortragVom,
        lineStartsWithDate,
        inParentheses,
        sourceLine,
      } = lecture;

      if (inParentheses) continue;

      if (!hasCommaBefore && !hasOrtBefore && !hasVortragBefore && !lineStartsWithDate) {
        if (hasZumVortragVom) continue;
        console.log("");
        console.log(`${colors.yellow}  Warning — possible date: GA ${gaNum}${colors.reset}`);
        if (sourceLine) {
          console.log(`${colors.gray}  Line: ${sourceLine}${colors.reset}`);
        }
        continue;
      }

      checked++;
      const entries = byDatum.get(datum) ?? [];
      if (entries.length > 0) found++;

      const withGa = entries.find((e) => e.hasGa && gaContainsNumber(e.gaValue, gaNum));
      if (withGa) continue;

      const withoutGa = entries.filter((e) => !e.hasGa);
      const withGaButNotOurs = entries.filter(
        (e) => e.hasGa && !gaContainsNumber(e.gaValue, gaNum)
      );

      if (withoutGa.length === 0 && withGaButNotOurs.length === 0) {
        const lineId = sourceLine ? uuidv5(sourceLine) : null;
        if (lineId && blacklist.has(lineId)) continue;

        console.log("");
        const { display, id } = formatDatumForDisplay(datum);
        const prefix = lineId ? `[${lineId}] ` : "";
        const msg =
          entries.length === 0
            ? "no matching entry found"
            : "no entry without GA number found";
        console.error(
          `${colors.red}${prefix}Error: GA ${gaNum}, date ${display} (${id}) ${datum} — ${msg}.${colors.reset}`
        );
        if (sourceLine) {
          console.error(`${colors.orange}  Line: ${sourceLine}${colors.reset}`);
        }
        errors++;
        totalErrors++;
        continue;
      }

      const lineId = sourceLine ? uuidv5(sourceLine) : null;
      if (lineId && blacklist.has(lineId)) continue;

      const targetEntry = withoutGa.length > 0 ? withoutGa[0]! : withGaButNotOurs[0]!;
      const isAppend = withoutGa.length === 0;

      if ((withoutGa.length > 1 || withGaButNotOurs.length > 1) && !isAppend) {
        console.log("");
        process.stdout.write(
          `  Warning: ${withoutGa.length} entries without GA on ${datum}, using first. `
        );
      } else if (withGaButNotOurs.length > 1) {
        console.log("");
        process.stdout.write(
          `  Warning: ${withGaButNotOurs.length} entries with other GA on ${datum}, using first. `
        );
      }

      inserted++;
      totalInserted++;
      pendingInserts.push({ entry: targetEntry, gaNum, append: isAppend });
      const { display, id } = formatDatumForDisplay(datum);
      const prefix = lineId ? `[${lineId}] ` : "";
      console.log("");
      const color = isAppend ? colors.green : colors.brightGreen;
      const action = isAppend
        ? doWrite
          ? "appended"
          : "would append"
        : doWrite
          ? "inserted"
          : "would insert";
      console.log(
        `${color}  ${prefix}GA number ${action}: ga: ${gaNum} for ${display} (${id})${colors.reset}`
      );
      if (sourceLine) {
        console.log(`${colors.gray}  Line: ${sourceLine}${colors.reset}`);
      }
    }

    if (doWrite && pendingInserts.length > 0) {
      const appends = pendingInserts.filter((p) => p.append);
      const inserts = pendingInserts.filter((p) => !p.append);
      for (const { entry, gaNum } of appends) {
        yamlLines = appendGaToEntry(yamlLines, entry, gaNum);
      }
      const sortedInserts = [...inserts].sort((a, b) => b.entry.lineEnd - a.entry.lineEnd);
      for (const { entry, gaNum } of sortedInserts) {
        yamlLines = insertGaIntoEntry(yamlLines, entry, gaNum);
      }
      writeLectureCatalogRaw(yamlLines.join("\n"));
    }

    if (inserted === 0 && errors === 0) {
      console.log(`OK (${checked} checked, ${found} found, all already have GA).`);
    } else if (inserted > 0 && errors === 0) {
      console.log(
        `  ${inserted} GA number(s) ${doWrite ? "inserted" : "would be inserted"} (${checked} checked, ${found} found).`
      );
    } else if (checked > 0) {
      console.log(`  (${checked} checked, ${found} found)`);
    }
    totalChecked += checked;
    totalFound += found;
  }

  if (totalInserted > 0) {
    console.log(
      `\n${totalInserted} GA number(s) ${doWrite ? "inserted" : "would be inserted (preview only — no changes written)"}.`
    );
  }

  if (totalErrors > 0) {
    console.error(
      `\n${colors.red}${totalErrors} error(s) (no matching catalog entry).${colors.reset}`
    );
  }

  if (totalChecked > 0) {
    console.log(`\nTotal: ${totalChecked} checked, ${totalFound} found.`);
  }
}

main();
