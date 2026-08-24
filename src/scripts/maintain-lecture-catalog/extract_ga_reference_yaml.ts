#!/usr/bin/env node
/**
 * Extract reference/ga/GAXX.yaml from GA PDF table of contents.
 *
 * Parses lecture entries (Vorträge, Ansprachen, Fragenbeantwortungen, Auszüge)
 * from the INHALT section and writes YAML files matching the GA277 reference schema.
 *
 * Requires: pdftotext (poppler)
 * Usage: tsx src/scripts/maintain-lecture-catalog/extract_ga_reference_yaml.ts [--range 68a-68d|111] [--write]
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flagValue, hasFlag } from "../../lib/cli.js";
import { loadGaCatalog } from "../../lib/ga-catalog.js";
import {
  GERMAN_MONTHS,
  gaPdfPath,
  parseRangeArg,
  resolveGaPdfDir,
} from "../../lib/ga-pdf.js";
import { loadLocationsSorted } from "../../lib/locations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REF_GA_DIR = path.join(__dirname, "../../../reference/ga");

const MONTH_PATTERN = GERMAN_MONTHS.join("|");
const MONTH_ALIASES: Record<string, number> = {
  januar: 1,
  "jan.": 1,
  jänner: 1,
  "jän.": 1,
  februar: 2,
  "feb.": 2,
  märz: 3,
  "mär.": 3,
  marz: 3,
  "mar.": 3,
  april: 4,
  "apr.": 4,
  mai: 5,
  juni: 6,
  "jun.": 6,
  juli: 7,
  "jul.": 7,
  august: 8,
  "aug.": 8,
  september: 9,
  "sept.": 9,
  "sep.": 9,
  oktober: 10,
  "okt.": 10,
  november: 11,
  "nov.": 11,
  dezember: 12,
  "dez.": 12,
};

interface ParsedEntry {
  type: string;
  datum: string;
  ort: string;
  titel: string;
  beschreibung?: string;
  reihe?: string;
}

function normalizeGaId(ga: string): string {
  const m = ga.match(/^(\d+)([a-z]+)?$/i);
  if (!m) return ga;
  return `${parseInt(m[1]!, 10)}${m[2] ?? ""}`;
}

/** Parse GA id from filename: "GA 051.pdf" -> "51", "GA 201t.pdf" -> "201t" */
function gaIdFromPdfFilename(filename: string): string | null {
  const m = filename.match(/GA\s+0*(\d+)([a-z]+)?\.pdf$/i);
  if (!m) return null;
  return `${parseInt(m[1]!, 10)}${m[2] ?? ""}`;
}

function gaPdfFilename(ga: string): string {
  const m = ga.match(/^(\d+)([a-z]+)?$/i);
  if (!m) return `GA ${ga}.pdf`;
  const num = m[1]!.padStart(3, "0");
  return m[2] ? `GA ${num}${m[2]}.pdf` : `GA ${num}.pdf`;
}

function yamlBasename(ga: string): string {
  const m = ga.match(/^(\d+)([a-z]+)?$/i);
  if (!m) return `GA${ga}.yaml`;
  return `GA${parseInt(m[1]!, 10).toString().padStart(3, "0")}${m[2] ?? ""}.yaml`;
}

/** Skip online duplicate PDFs (*o.pdf) and transcript variants (*t.pdf). */
function isExcludedGaPdfFilename(filename: string): boolean {
  return /[ot]\.pdf$/i.test(filename);
}

function listLocalGaPdfIds(): string[] {
  const gaDir = resolveGaPdfDir();
  if (!fs.existsSync(gaDir)) return [];
  return fs
    .readdirSync(gaDir)
    .filter((f) => /^GA\s+0*\d+[a-z]*\.pdf$/i.test(f) && !isExcludedGaPdfFilename(f))
    .map((f) => gaIdFromPdfFilename(f))
    .filter((g): g is string => g != null)
    .sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10);
      const numB = parseInt(b.replace(/\D/g, ""), 10);
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b);
    });
}

function listExistingReferenceGaIds(): Set<string> {
  const ids = new Set<string>();
  if (!fs.existsSync(REF_GA_DIR)) return ids;
  for (const f of fs.readdirSync(REF_GA_DIR)) {
    const m = f.match(/^GA0*(\d+)([a-z]+)?\.yaml$/i);
    if (m) ids.add(`${parseInt(m[1]!, 10)}${m[2] ?? ""}`);
  }
  return ids;
}

function listMissingGaVolumes(): string[] {
  const existing = listExistingReferenceGaIds();
  return listLocalGaPdfIds().filter((g) => !existing.has(g));
}

function extractFullText(pdfPath: string): string {
  return execSync(`pdftotext -layout "${pdfPath}" - 2>/dev/null`, {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

function findTocBounds(lines: string[]): { start: number; end: number } | null {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const compact = lines[i]!.replace(/\s+/g, "").toUpperCase();
    if ((compact === "INHALT" || compact === "INHALTSVERZEICHNIS") && i > 20) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  const endMarkers = [
    /^Hinweise zum Text/i,
    /^Abkürzungen in den Quellenachweisen/i,
    /^Abkürzungen\s*$/,
    /^Anhang\s*$/,
  ];

  let end = lines.length;
  for (let i = start + 30; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (endMarkers.some((re) => re.test(trimmed))) {
      end = i;
      break;
    }
    if (/^Zu dieser Ausgabe/i.test(trimmed) && i > start + 100) {
      end = i;
      break;
    }
  }

  // Documentary volumes without back-matter markers: cap TOC scan
  if (end - start > 2000) {
    end = start + 800;
  }

  return { start, end };
}

function monthToNum(name: string): number | null {
  const key = name.toLowerCase().replace("ä", "a").replace("ö", "o").replace("ü", "u");
  return MONTH_ALIASES[key] ?? null;
}

function formatDatum(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

function stripPageNumber(line: string): string {
  return line.replace(/\s+\.{2,}\s*\d{1,3}\s*$/, "").replace(/\s+\d{1,3}\s*$/, "");
}

function isIndented(line: string): boolean {
  return /^\s{2,}/.test(line) && line.trim().length > 0;
}

function isExcludedHeader(line: string): boolean {
  const s = line.trim();
  if (!s) return true;
  if (/^Copyright Rudolf Steiner/i.test(s)) return true;
  if (/^Buch:\s*\d/i.test(s)) return true;
  if (/^\d{4}\s*$/.test(s)) return true;
  if (/^(SCHRIFTLICHE|MÜNDLICHE|FRAGENBEANTWORTUNGEN|Schriftliche Fragenbeantwortungen)/i.test(s)) {
    return true;
  }
  if (/^undatiert/i.test(s)) return true;
  if (/^\[?\d+\.?\]?\s*$/i.test(s)) return true;
  return false;
}

function classifyType(text: string, context: string): string {
  const combined = `${text} ${context}`.toLowerCase();
  if (/fragenbeantwortung/.test(combined)) return "fragenbeantwortung";
  if (/auszug aus dem vortrag|aus dem vortrag|auszug aus/.test(combined)) return "auszug_aus_vortrag";
  if (/ansprache/.test(combined)) return "ansprache";
  if (/öffentlicher vortrag/.test(combined)) return "vortrag";
  if (/mitglied/.test(context.toLowerCase())) return "mitgliedervortrag";
  if (/besprechung|konferenz/.test(combined)) return "besprechung";
  if (/vortrag|lehrstunde|kurs/.test(combined)) return "vortrag";
  return "vortrag";
}

function parseOrtFromBeforeDate(before: string, locations: string[]): string {
  const trimmed = before.trim().replace(/[,;]\s*$/, "");
  const commaMatch = trimmed.match(/,\s*([^,]+)$/);
  if (commaMatch) {
    const candidate = commaMatch[1]!.trim();
    if (locations.some((loc) => candidate === loc || candidate.startsWith(loc))) {
      return candidate;
    }
    if (/^[A-ZÄÖÜ]/.test(candidate) && candidate.length < 40) return candidate;
  }
  for (const loc of locations) {
    if (trimmed.endsWith(loc)) return loc;
    const m = trimmed.match(new RegExp(`(${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\s*,?\\s*$`));
    if (m) return m[1]!;
  }
  const vortragOrt = trimmed.match(/,\s*([A-Za-zÄÖÜäöüß .-]+)\s*$/);
  if (vortragOrt && vortragOrt[1]!.length < 35) return vortragOrt[1]!.trim();
  return "—";
}

function extractTitle(before: string, ort: string): string {
  let title = before.trim();
  if (ort !== "—") {
    title = title.replace(new RegExp(`\\s*,?\\s*${ort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*,?\\s*$`), "");
  }
  title = title.replace(/^(Erster|Zweiter|Dritter|Vierter|Fünfter|Sechster|Siebter|Achter|Neunter|Zehnter|Elfter|Zwölfter|Dreizehnter|Vierzehnter|Fünfzehnter|Sechzehnter|Siebzehnter|Achtzehnter|Neunzehnter|Zwanzigster|\d+\.?\s*(?:Vortrag|VORTRAG))[:,.\s-]*/i, "");
  title = title.replace(/^(Öffentlicher Vortrag|Mitgliedervortrag|Vortrag|VORTRAG)\s*[:,]?\s*/i, "");
  title = title.replace(/\s*[:,]\s*$/, "").trim();
  if (!title) return "—";
  return title.length > 200 ? title.slice(0, 197) + "..." : title;
}

function hasPageMarker(line: string): boolean {
  return /\s+\.{2,}\s*\d{0,3}\s*$/.test(line) || /\s+\d{1,3}\s*$/.test(line.trim());
}

function isSubItemLine(trimmed: string): boolean {
  if (/^(I{1,3}|IV|V|VI{0,3}|IX|X{1,3})\.\s/i.test(trimmed)) return true;
  if (/^Bericht in (der|den)/i.test(trimmed)) return true;
  if (/^Auszug aus dem/i.test(trimmed) && !/\d{4}/.test(trimmed)) return true;
  return false;
}

function isEntryDateLine(line: string, dateMatch: RegExpMatchArray): boolean {
  const trimmed = line.trim();
  if (isSubItemLine(trimmed)) return false;
  if (/^\d{4}\s*$/.test(trimmed)) return false;
  if (/vom \d{1,2}\.\s/i.test(trimmed) && !hasPageMarker(line) && !/^[^,]+,\s*\d/.test(trimmed)) {
    return false;
  }
  if (hasPageMarker(line)) return true;
  if (/^[^,]{2,40},\s*\d{1,2}\./.test(trimmed)) return true;
  if (/VORTRAG|Vortrag|Lehrstunde|Ansprache|Fragenbeantwortung/i.test(trimmed)) return true;
  if (/^\d{1,2}\.\s/i.test(trimmed) && /(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)/i.test(trimmed)) {
    return true;
  }
  return false;
}

const dateReGlobal = new RegExp(
  `(\\d{1,2})\\.\\s*(${MONTH_PATTERN})\\s+(\\d{4})`,
  "i"
);

function findTitleBefore(lines: string[], index: number): string {
  const parts: string[] = [];
  for (let j = index - 1; j >= Math.max(0, index - 12); j--) {
    const prev = lines[j]!.trim();
    if (!prev || isExcludedHeader(prev)) break;
    if (isSubItemLine(prev)) continue;
    if (/^IN\s*H\s*A\s*L\s*T$/i.test(prev.replace(/\s+/g, ""))) break;
    if (/^(Aus dem Jahr|Bundesgründung|SCHRIFTLICHE|MÜNDLICHE)/i.test(prev)) break;
    if (dateReGlobal.test(prev) && hasPageMarker(lines[j]!)) break;
    if (/^Brief an /i.test(prev)) break;
    parts.unshift(prev);
    if (/Vortrag|VORTRAG|Lehrstunde|Ansprache|Auszug|Aus dem Vortrag/i.test(prev)) break;
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function parseTocEntries(tocLines: string[], ga: string, locations: string[]): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const dateRe = new RegExp(
    `(\\d{1,2})\\.\\s*(${MONTH_PATTERN})\\s+(\\d{4})`,
    "gi"
  );

  let cycleContext = "";

  for (let i = 0; i < tocLines.length; i++) {
    const raw = tocLines[i]!;
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed || isExcludedHeader(trimmed)) continue;
    if (/^IN\s*H\s*A\s*L\s*T$/i.test(trimmed.replace(/\s+/g, ""))) continue;
    if (/^Hinweise zum Text/i.test(trimmed)) continue;

    if (/gehalten|vom \d|bis \d|Mitgliedern|öffentliche Vorträge/i.test(trimmed) && trimmed.length > 35) {
      cycleContext = trimmed;
    }
    if (/^in [A-ZÄÖÜ]/i.test(trimmed)) {
      cycleContext = cycleContext ? `${cycleContext} ${trimmed}` : trimmed;
    }

    const withoutPage = stripPageNumber(line);
    const matches = [...withoutPage.matchAll(dateRe)];
    if (matches.length === 0) continue;

    const m = matches[matches.length - 1]!;
    if (!isEntryDateLine(line, m)) continue;

    const day = parseInt(m[1]!, 10);
    const month = monthToNum(m[2]!);
    const year = parseInt(m[3]!, 10);
    if (!month || year < 1880 || year > 1925) continue;

    const dateStart = m.index!;
    const before = withoutPage.slice(0, dateStart);
    const ort = parseOrtFromBeforeDate(before, locations);
    const titleFromBefore = extractTitle(before, ort);
    const titleFromPrev = findTitleBefore(tocLines, i);
    let titel = titleFromBefore !== "—" && titleFromBefore.length > 2 ? titleFromBefore : titleFromPrev;
    if (!titel || titel === "—") {
      titel = before.replace(/,\s*$/, "").trim() || "—";
    }
    if (/^Berlin,\s*$/.test(titel) || titel.length < 4) {
      titel = titleFromPrev || titel;
    }
    if (/^Brief an /i.test(titel) || /^Bericht in /i.test(titel)) continue;

    const type = classifyType(titel + " " + before, cycleContext);
    let finalOrt = ort;
    if (finalOrt === "—") {
      const fromCycle = cycleContext ? ortFromCycle(cycleContext) : null;
      if (fromCycle) finalOrt = fromCycle;
    }
    if (finalOrt === "—" && /Dornach/i.test(before + " " + titel)) finalOrt = "Dornach";

    const entry: ParsedEntry = {
      type,
      datum: formatDatum(day, month, year),
      ort: finalOrt,
      titel,
    };
    if (cycleContext && /vortrag|kurs|lehrstunde|gehalten/i.test(cycleContext)) {
      entry.reihe = cycleContext.length > 120 ? cycleContext.slice(0, 117) + "..." : cycleContext;
    }

    entries.push(entry);
  }

  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.datum}|${e.ort}|${e.titel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function computePeriod(entries: ParsedEntry[]): string {
  const years = entries
    .map((e) => e.datum.match(/(\d{4})$/)?.[1])
    .filter(Boolean)
    .map(Number);
  if (years.length === 0) return "—";
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? String(min) : `${min}–${max}`;
}

function cleanTitle(titleDisplay: string | undefined, ga: string): string {
  if (!titleDisplay) return `GA ${ga}`;
  let t = titleDisplay
    .replace(/^Band GA \d+[a-z]?\s+RUDOLF STEINER\s+/i, "")
    .replace(/^Band GA \d+[a-z]?\s+/i, "")
    .replace(/^Buch:.*?Seite:\s*\d+\s+/i, "")
    .replace(/^Seite:\s*\d+\s+Copyright.*?Seite:\s*\d+\s+RUDOLF STEINER\s+/i, "")
    .replace(/^Seite:\s*\d+\s+Copyright.*?RUDOLF STEINER\s+/i, "")
    .trim();
  if (t.length < 15 || /^Copyright|^Buch:/i.test(t)) {
    return `GA ${ga}`;
  }
  return t.length > 120 ? t.slice(0, 117) + "..." : t;
}

function ortFromCycle(cycle: string): string | null {
  const m = cycle.match(/\b(?:in|zu)\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß .-]{2,30}?)(?:\s+between|\s+vom|\s+,\s|\s+gehalten|$)/i);
  if (m) return m[1]!.trim();
  return null;
}

function yamlQuote(s: string): string {
  if (/[:#"'&*!?|>@[\]{},]/.test(s) || s.startsWith(" ") || s.endsWith(" ")) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

function writeReferenceYaml(
  ga: string,
  title: string,
  pdf: string,
  entries: ParsedEntry[],
  outPath: string
): void {
  const period = computePeriod(entries);
  const lines: string[] = [
    `# GA ${ga} — lectures spoken by Rudolf Steiner (excludes newspaper articles,`,
    `# programmes, participant notes, and editorial material where noted).`,
    `# Extracted from ${pdf} table of contents.`,
    "",
    `ga: ${ga}`,
    `title: ${yamlQuote(title)}`,
    `pdf: ${pdf}`,
    `period: ${period}`,
    `entry_count: ${entries.length}`,
    "",
    "excluded:",
    "  - Programme, Plakate, Postkarten, Zeitungsartikel und -annoncen (unless the volume consists of lecture reports)",
    "  - Notizen, Briefe, Reiseprogramme, Lehrpläne ohne Vortragstext",
    "  - Teilnehmer-Aufzeichnungen und undatierte Fragmente",
    "",
    "entries:",
  ];

  entries.forEach((e, idx) => {
    lines.push(`  - seq: ${idx + 1}`);
    lines.push(`    ga: ${ga}`);
    lines.push(`    type: ${e.type}`);
    lines.push(`    datum: ${e.datum}`);
    lines.push(`    ort: ${yamlQuote(e.ort)}`);
    if (e.reihe) lines.push(`    reihe: ${yamlQuote(e.reihe)}`);
    lines.push(`    titel: ${yamlQuote(e.titel)}`);
    if (e.beschreibung) lines.push(`    beschreibung: ${yamlQuote(e.beschreibung)}`);
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");
}

const DEFAULT_VOLUMES =
  "068a,068b,068c,068d,069b,069c,069d,069e,070a,070b,071a,071b,080a,080b,080c,085,087,090a,090b,090c,111,117a,208,244,246,250,251,269,291a,332b,336";

const HELP = `Extract reference/ga/GAXX.yaml from GA PDF table of contents.

Usage:
  tsx src/scripts/maintain-lecture-catalog/extract_ga_reference_yaml.ts [options]

Options:
  --help, -h     Show this help
  --write        Write YAML files (default: preview counts only)
  --missing      Process all local GA PDFs without a reference YAML (excludes *o.pdf, *t.pdf)
  --list-missing Print GA bands still missing reference YAML and exit
  --range RANGE  GA bands (default: supplement volumes list unless --missing)

Environment:
  GA_PDF_DIR     Path to local GA PDF directory
`;

function main(): void {
  const args = process.argv.slice(2);
  if (hasFlag(args, "--help", "-h")) {
    console.log(HELP);
    return;
  }

  if (hasFlag(args, "--list-missing")) {
    const missing = listMissingGaVolumes();
    console.log(`${missing.length} GA volume(s) without reference YAML:\n`);
    console.log(missing.join(", "));
    return;
  }

  const doWrite = hasFlag(args, "--write");
  const useMissing = hasFlag(args, "--missing");
  const rangeArg = flagValue(args, "--range");
  let rangeSet: Set<string>;
  if (useMissing) {
    rangeSet = new Set(listMissingGaVolumes());
  } else if (rangeArg) {
    rangeSet = parseRangeArg(rangeArg) ?? new Set();
  } else {
    rangeSet = new Set(DEFAULT_VOLUMES.split(","));
  }

  if (rangeSet.size === 0) {
    console.log("No GA volumes to process.");
    return;
  }
  const catalog = loadGaCatalog();
  const catalogByGa = new Map(catalog.map((b) => [normalizeGaId(String(b.ga)), b]));
  const locations = loadLocationsSorted();

  for (const gaRaw of [...rangeSet].sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ""), 10);
    const numB = parseInt(b.replace(/\D/g, ""), 10);
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b);
  })) {
    const ga = normalizeGaId(gaRaw);
    const pdf = gaPdfFilename(ga);
    const pdfPath = gaPdfPath(pdf);
    const outPath = path.join(REF_GA_DIR, yamlBasename(ga));
    const band = catalogByGa.get(ga);
    const title = cleanTitle(band?.titleDisplay, ga);

    if (!fs.existsSync(pdfPath)) {
      console.log(`MISS ${ga}: ${pdfPath}`);
      continue;
    }

    const text = extractFullText(pdfPath);
    const lines = text.split("\n");
    const bounds = findTocBounds(lines);

    if (!bounds) {
      console.log(`NO TOC ${ga}${doWrite ? " -> " + path.basename(outPath) : ""}`);
      if (doWrite) writeReferenceYaml(ga, title, pdf, [], outPath);
      continue;
    }

    const tocLines = lines.slice(bounds.start, bounds.end);
    const entries = parseTocEntries(tocLines, ga, locations);

    console.log(`${ga}: ${entries.length} entries (${computePeriod(entries)})${doWrite ? " -> " + path.basename(outPath) : ""}`);

    if (doWrite) {
      writeReferenceYaml(ga, title, pdf, entries, outPath);
    }
  }
}

main();
