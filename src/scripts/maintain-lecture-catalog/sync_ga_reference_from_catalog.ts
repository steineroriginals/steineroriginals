#!/usr/bin/env node
/**
 * Sync reference/ga/GAXX.yaml against the SSOT lecture catalog (both directions).
 *
 * Catalog → YAML:
 *   - Catalog lectures with ga: X missing from the reference YAML
 *   - Entry-count mismatch (catalog vs YAML must be equal)
 *   - YAML duplicates on the same date (more rows than catalog) are auto-trimmed and written
 *   - With --write: add / enrich / remove artifacts in the YAML
 *   - With --rebuild --write: replace YAML entries entirely from catalog
 *
 * YAML → Catalog:
 *   - YAML dates present in catalog but missing ga: X
 *   - YAML dates not present in the catalog at all
 *   - With --write-catalog: set or append ga: X on matching catalog entries
 *
 * Usage:
 *   tsx src/scripts/maintain-lecture-catalog/sync_ga_reference_from_catalog.ts --ga 52
 *   tsx src/scripts/maintain-lecture-catalog/sync_ga_reference_from_catalog.ts --ga 52 --write
 *   tsx src/scripts/maintain-lecture-catalog/sync_ga_reference_from_catalog.ts --ga 52 --write-catalog
 *   tsx src/scripts/maintain-lecture-catalog/sync_ga_reference_from_catalog.ts --range 51-55 --write --write-catalog
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  loadLectureCatalogRaw,
  writeLectureCatalogRaw,
} from "../../lib/catalog.js";
import { colors, flagValue, hasFlag } from "../../lib/cli.js";
import { parseRangeArg } from "../../lib/ga-pdf.js";
import { loadLocationsSorted } from "../../lib/locations.js";
import { LECTURE_CATALOG_PATH } from "../../lib/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REF_GA_DIR = path.join(__dirname, "../../../reference/ga");

interface CatalogLecture {
  id: string;
  datum: string;
  ort?: string;
  vortragstitel?: string;
  reihe?: string;
  anlass?: string;
  ga?: string | number;
}

interface RefEntry {
  seq?: number;
  ga: string;
  type: string;
  datum: string;
  ort: string;
  reihe?: string;
  titel: string;
  beschreibung?: string;
}

interface RefFile {
  ga: string;
  title?: string;
  pdf?: string;
  period?: string;
  entry_count?: number;
  excluded?: string[];
  entries: RefEntry[];
}

interface CatalogLineEntry {
  id: string;
  lineStart: number;
  lineEnd: number;
  datum: string | null;
  ort: string | null;
  hasGa: boolean;
  gaValue: string | null;
  gaLineIndex: number | null;
}

function normalizeGaId(ga: string): string {
  const m = ga.match(/^(\d+)([a-z]+)?$/i);
  if (!m) return ga;
  return `${parseInt(m[1]!, 10)}${m[2] ?? ""}`;
}

function yamlBasename(ga: string): string {
  const m = ga.match(/^(\d+)([a-z]+)?$/i);
  if (!m) return `GA${ga}.yaml`;
  return `GA${parseInt(m[1]!, 10).toString().padStart(3, "0")}${m[2] ?? ""}.yaml`;
}

function pdfFilename(ga: string): string {
  const m = ga.match(/^(\d+)([a-z]+)?$/i);
  if (!m) return `GA ${ga}.pdf`;
  return m[2] ? `GA ${m[1]!.padStart(3, "0")}${m[2]}.pdf` : `GA ${m[1]!.padStart(3, "0")}.pdf`;
}

function gaContains(gaValue: unknown, gaNum: string): boolean {
  if (gaValue == null || gaValue === "") return false;
  const n = normalizeGaId(gaNum);
  const re = new RegExp(
    `(?:^|[\\s,/])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[\\s,/']|$)`,
    "u"
  );
  return re.test(String(gaValue));
}

function parseDatumKey(datum: string): number {
  const m = datum.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return 0;
  return Number(`${m[3]}${m[2]!.padStart(2, "0")}${m[1]!.padStart(2, "0")}`);
}

const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

/** Format catalog datum (e.g. 14.03.1906) as "14. März 1906"; otherwise return as-is. */
function formatDatumLong(datum: string): string {
  const m = String(datum || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$/);
  if (!m) return String(datum || "");
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3]!;
  const suffix = m[4] ?? "";
  if (month < 1 || month > 12) return String(datum);
  return `${day}. ${MONTHS_DE[month - 1]} ${year}${suffix}`;
}

function yamlQuote(s: string): string {
  if (/[:#"'&*!?|>@[\]{},]/.test(s) || s.startsWith(" ") || s.endsWith(" ") || s === "") {
    return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return String(s);
}

function isJunkTitel(titel: string, ort: string, locations: Set<string>): boolean {
  const t = titel.trim();
  if (!t || t === "—" || t === "Kein Titel") return true;
  if (/^Zu dieser Ausgabe/i.test(t)) return true;
  if (ort && ort !== "—" && t === ort) return true;
  if (locations.has(t)) return true;
  if (/^\d{1,2}\.,\s*\d{1,2}\./.test(t) && / und\s*$/.test(t)) return true;
  if (/^\d{1,2}\.\s+und\s*$/i.test(t)) return true;
  if (/^(punkt|sophie\s+[IVX]+)$/i.test(t)) return true;
  return false;
}

/** Higher score = prefer keeping when trimming YAML duplicates for a date. */
function yamlKeepScore(y: RefEntry, locations: Set<string>): number {
  const t = (y.titel || "").trim();
  let s = 0;
  if (!isJunkTitel(t, y.ort || "", locations)) s += 100;
  if (/^Vortrag$/i.test(t)) s -= 50;
  if (/^(Erster|Zweiter|Dritter|Vierter|Fünfter|Sechster|Siebenter|Siebter|Achter|Neunter|Zehnter|Elfter|Zwölfter|Dreizehnter|Vierzehnter|Fünfzehnter|Sechzehnter|Siebzehnter|Achtzehnter|Neunzehnter|Zwanzigster)\s+Vortrag$/i.test(t)) {
    s -= 40;
  }
  if (/^\w+ter\s+Vortrag$/i.test(t)) s -= 40;
  if (y.reihe) s += 25;
  if (y.ort && y.ort !== "—") s += 10;
  s += Math.min(t.length, 100);
  return s;
}

/**
 * Drop excess YAML rows when a date has more YAML entries than catalog lectures
 * for this GA (typical TOC-extract duplicates). Keeps the best-scoring rows.
 */
function trimYamlDuplicates(
  yamlEntries: RefEntry[],
  byDatumCat: Map<string, CatalogLecture[]>,
  locations: Set<string>
): { kept: RefEntry[]; removed: RefEntry[] } {
  const byDatum = new Map<string, RefEntry[]>();
  for (const e of yamlEntries) {
    if (!byDatum.has(e.datum)) byDatum.set(e.datum, []);
    byDatum.get(e.datum)!.push(e);
  }

  const removed: RefEntry[] = [];
  const kept: RefEntry[] = [];
  const dates = [...byDatum.keys()].sort(
    (a, b) => parseDatumKey(a) - parseDatumKey(b) || a.localeCompare(b)
  );

  for (const datum of dates) {
    const group = byDatum.get(datum)!;
    const nCat = byDatumCat.get(datum)?.length ?? 0;
    if (nCat >= 1 && group.length > nCat) {
      const ranked = [...group].sort(
        (a, b) => yamlKeepScore(b, locations) - yamlKeepScore(a, locations)
      );
      kept.push(...ranked.slice(0, nCat));
      removed.push(...ranked.slice(nCat));
    } else {
      kept.push(...group);
    }
  }

  kept.sort(
    (a, b) =>
      parseDatumKey(a.datum) - parseDatumKey(b.datum) ||
      (a.ort || "").localeCompare(b.ort || "") ||
      a.titel.localeCompare(b.titel)
  );
  return { kept, removed };
}

function catalogToRefEntry(c: CatalogLecture, ga: string, type = "vortrag"): RefEntry {
  const entry: RefEntry = {
    ga,
    type,
    datum: c.datum,
    ort: c.ort || "—",
    titel: (c.vortragstitel && c.vortragstitel.trim()) || "Kein Titel",
  };
  if (c.reihe) entry.reihe = c.reihe;
  if (c.anlass) entry.beschreibung = c.anlass;
  return entry;
}

function loadCatalog(): CatalogLecture[] {
  const raw = yaml.load(fs.readFileSync(LECTURE_CATALOG_PATH, "utf-8")) as {
    lectures: CatalogLecture[];
  };
  // YAML parses bare numeric ids (e.g. 19030928) as numbers — keep them as strings
  return (raw.lectures ?? []).map((e) => ({
    ...e,
    id: e.id != null ? String(e.id) : e.id,
  }));
}

function loadRefFile(ga: string): RefFile | null {
  const p = path.join(REF_GA_DIR, yamlBasename(ga));
  if (!fs.existsSync(p)) return null;
  return yaml.load(fs.readFileSync(p, "utf-8")) as RefFile;
}

function computePeriod(entries: RefEntry[]): string {
  const keys = entries.map((e) => parseDatumKey(e.datum)).filter(Boolean);
  if (keys.length === 0) return "—";
  const min = String(Math.min(...keys)).slice(0, 4);
  const max = String(Math.max(...keys)).slice(0, 4);
  return min === max ? min : `${min}–${max}`;
}

function writeRefFile(ga: string, file: RefFile, entries: RefEntry[]): void {
  const period = computePeriod(entries);
  const lines: string[] = [
    `# GA ${ga} — lectures spoken by Rudolf Steiner (excludes newspaper articles,`,
    `# programmes, participant notes, and editorial material where noted).`,
    `# Synced from SSOT catalog (ga: ${ga}).`,
    "",
    `ga: ${ga}`,
    `title: ${yamlQuote(file.title || `GA ${ga}`)}`,
    `pdf: ${file.pdf || pdfFilename(ga)}`,
    `period: ${period}`,
    `entry_count: ${entries.length}`,
    "",
    "excluded:",
  ];

  const excluded =
    file.excluded ??
    [
      "Programme, Plakate, Postkarten, Zeitungsartikel und -annoncen (unless the volume consists of lecture reports)",
      "Notizen, Briefe, Reiseprogramme, Lehrpläne ohne Vortragstext",
      "Teilnehmer-Aufzeichnungen und undatierte Fragmente",
    ];
  for (const ex of excluded) lines.push(`  - ${ex}`);

  lines.push("", "entries:");
  entries.forEach((e, i) => {
    lines.push(`  - seq: ${i + 1}`);
    lines.push(`    ga: ${ga}`);
    lines.push(`    type: ${e.type || "vortrag"}`);
    lines.push(`    datum: ${e.datum}`);
    lines.push(`    ort: ${yamlQuote(e.ort || "—")}`);
    if (e.reihe) lines.push(`    reihe: ${yamlQuote(e.reihe)}`);
    lines.push(`    titel: ${yamlQuote(e.titel)}`);
    if (e.beschreibung) lines.push(`    beschreibung: ${yamlQuote(e.beschreibung)}`);
  });

  const outPath = path.join(REF_GA_DIR, yamlBasename(ga));
  fs.mkdirSync(REF_GA_DIR, { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");
}

function matchKey(datum: string, ort?: string): string {
  return `${datum}|${(ort || "").trim().toLowerCase()}`;
}

function buildCatalogLineIndex(lines: string[]): {
  byDatum: Map<string, CatalogLineEntry[]>;
  byId: Map<string, CatalogLineEntry>;
} {
  const byDatum = new Map<string, CatalogLineEntry[]>();
  const byId = new Map<string, CatalogLineEntry>();
  let current: CatalogLineEntry | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const idMatch = line.match(/^\s+-\s+id:\s*(.+)$/);
    if (idMatch) {
      if (current) {
        current.lineEnd = i - 1;
        if (current.datum) {
          if (!byDatum.has(current.datum)) byDatum.set(current.datum, []);
          byDatum.get(current.datum)!.push(current);
        }
        byId.set(current.id, current);
      }
      current = {
        id: idMatch[1]!.trim(),
        lineStart: i,
        lineEnd: -1,
        datum: null,
        ort: null,
        hasGa: false,
        gaValue: null,
        gaLineIndex: null,
      };
    }
    if (!current) continue;
    const datumMatch = line.match(/^\s+datum:\s*(.+)$/);
    if (datumMatch) current.datum = datumMatch[1]!.trim();
    const ortMatch = line.match(/^\s+ort:\s*(.+)$/);
    if (ortMatch) current.ort = ortMatch[1]!.trim();
    const gaMatch = line.match(/^\s+ga:\s*(.+)$/);
    if (gaMatch) {
      current.hasGa = true;
      current.gaValue = gaMatch[1]!.trim();
      current.gaLineIndex = i;
    }
  }
  if (current) {
    current.lineEnd = lines.length - 1;
    if (current.datum) {
      if (!byDatum.has(current.datum)) byDatum.set(current.datum, []);
      byDatum.get(current.datum)!.push(current);
    }
    byId.set(current.id, current);
  }
  return { byDatum, byId };
}

function insertGaIntoEntry(lines: string[], entry: CatalogLineEntry, gaNum: string): string[] {
  const insertLine = entry.lineEnd + 1;
  return [...lines.slice(0, insertLine), `    ga: ${gaNum}`, ...lines.slice(insertLine)];
}

function appendGaToEntry(lines: string[], entry: CatalogLineEntry, gaNum: string): string[] {
  if (entry.gaLineIndex == null) return lines;
  const line = lines[entry.gaLineIndex]!;
  const m = line.match(/^(\s+ga:\s*)(.+)$/);
  if (!m) return lines;
  const newLines = [...lines];
  newLines[entry.gaLineIndex] = `${m[1]}${m[2]!.trim()},${gaNum}`;
  return newLines;
}

function pickCatalogMatch(
  matches: CatalogLecture[],
  ort: string
): CatalogLecture | null {
  if (matches.length === 0) return null;
  const ortLc = (ort || "").toLowerCase();
  const byOrt = matches.filter((c) => (c.ort || "").toLowerCase() === ortLc);
  if (byOrt.length === 1) return byOrt[0]!;
  if (matches.length === 1) return matches[0]!;
  if (byOrt.length > 1) return byOrt[0]!;
  return matches[0]!;
}

/** One line per missing entry, wrong GA, or count mismatch (YAML or SSOT). */
function problemLine(
  kind: "MISSING YAML" | "MISSING SSOT" | "WRONG GA SSOT" | "EXTRA YAML" | "COUNT MISMATCH",
  ga: string,
  id: string,
  datum: string,
  ort: string | undefined,
  title: string | undefined,
  extra?: string
): string {
  const color =
    kind === "WRONG GA SSOT"
      ? colors.brightRed
      : kind === "MISSING YAML"
        ? colors.red
        : kind === "EXTRA YAML"
          ? colors.yellow
          : kind === "COUNT MISMATCH"
            ? colors.brightRed
            : colors.orange;
  const idPad = String(id || "—").padEnd(12);
  const datumShort = String(datum || "—");
  const datumLong = formatDatumLong(datumShort);
  const datumPart =
    datumLong && datumLong !== datumShort
      ? `${datumShort.padEnd(12)} ${datumLong.padEnd(18)}`
      : datumShort.padEnd(31);
  const ortPart = String(ort && ort !== "—" ? ort : "—").padEnd(12);
  const titlePart = String(title || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  const suffix = extra ? `  ${extra}` : "";
  return `${color}${kind.padEnd(14)} ga:${ga}  ${idPad} ${datumPart} ${ortPart} ${titlePart}${suffix}${colors.reset}`;
}

function syncVolume(
  ga: string,
  catalog: CatalogLecture[],
  locations: Set<string>,
  opts: {
    write: boolean;
    writeCatalog: boolean;
    rebuild: boolean;
    removeArtifacts: boolean;
  },
  catalogLines: string[]
): string[] {
  const gaNorm = normalizeGaId(ga);
  const byDatumAll = new Map<string, CatalogLecture[]>();
  for (const e of catalog) {
    if (!e.datum) continue;
    if (!byDatumAll.has(e.datum)) byDatumAll.set(e.datum, []);
    byDatumAll.get(e.datum)!.push(e);
  }

  const catForGa = catalog
    .filter((e) => gaContains(e.ga, gaNorm))
    .sort(
      (a, b) =>
        parseDatumKey(a.datum) - parseDatumKey(b.datum) ||
        String(a.id).localeCompare(String(b.id))
    );

  let ref = loadRefFile(gaNorm);
  if (!ref) {
    ref = {
      ga: gaNorm,
      title: `GA ${gaNorm}`,
      pdf: pdfFilename(gaNorm),
      entries: [],
    };
    console.log(`${colors.yellow}GA ${gaNorm}: no reference YAML yet — will create${colors.reset}`);
  }

  let yamlEntries = [...(ref.entries ?? [])];
  const byDatumCat = new Map<string, CatalogLecture[]>();
  for (const c of catForGa) {
    if (!byDatumCat.has(c.datum)) byDatumCat.set(c.datum, []);
    byDatumCat.get(c.datum)!.push(c);
  }

  console.log(`\n=== GA ${gaNorm} ===`);

  const { kept: dedupedYaml, removed: yamlDupes } = trimYamlDuplicates(
    yamlEntries,
    byDatumCat,
    locations
  );
  if (yamlDupes.length > 0) {
    yamlEntries = dedupedYaml;
    writeRefFile(gaNorm, ref, yamlEntries);
    console.log(
      `${colors.gray}Removed ${yamlDupes.length} duplicate YAML entr${yamlDupes.length === 1 ? "y" : "ies"} (wrote ${yamlBasename(gaNorm)})${colors.reset}`
    );
  }

  const byDatumYaml = new Map<string, RefEntry[]>();
  for (const e of yamlEntries) {
    if (!byDatumYaml.has(e.datum)) byDatumYaml.set(e.datum, []);
    byDatumYaml.get(e.datum)!.push(e);
  }

  console.log(`Catalog with ga:${gaNorm}: ${catForGa.length} | YAML entries: ${yamlEntries.length}`);

  const countMismatch = catForGa.length !== yamlEntries.length;
  if (countMismatch) {
    console.log(
      problemLine(
        "COUNT MISMATCH",
        gaNorm,
        "—",
        "—",
        "—",
        "",
        `catalog=${catForGa.length} yaml=${yamlEntries.length}`
      )
    );
    const dates = [
      ...new Set([...byDatumCat.keys(), ...byDatumYaml.keys()]),
    ].sort((a, b) => parseDatumKey(a) - parseDatumKey(b) || a.localeCompare(b));
    for (const datum of dates) {
      const nCat = byDatumCat.get(datum)?.length ?? 0;
      const nYaml = byDatumYaml.get(datum)?.length ?? 0;
      if (nCat === nYaml) continue;
      const sample =
        byDatumCat.get(datum)?.[0]?.vortragstitel ??
        byDatumYaml.get(datum)?.[0]?.titel ??
        "";
      console.log(
        problemLine(
          "COUNT MISMATCH",
          gaNorm,
          "—",
          datum,
          byDatumCat.get(datum)?.[0]?.ort ?? byDatumYaml.get(datum)?.[0]?.ort,
          sample,
          `on date: catalog=${nCat} yaml=${nYaml}`
        )
      );
    }
  }

  const missingInYaml: CatalogLecture[] = [];
  for (const c of catForGa) {
    const sameDate = byDatumYaml.get(c.datum) ?? [];
    if (sameDate.length === 0) {
      missingInYaml.push(c);
      console.log(
        problemLine("MISSING YAML", gaNorm, c.id, c.datum, c.ort, c.vortragstitel)
      );
    }
  }

  const artifacts: RefEntry[] = [];
  const enrichable: { yaml: RefEntry; catalog: CatalogLecture }[] = [];
  const missingGaInCatalog: { yaml: RefEntry; catalog: CatalogLecture }[] = [];
  const extraYaml: RefEntry[] = [];
  const missingInCatalog: RefEntry[] = [];
  const seenCatalogIds = new Set<string>();

  for (const y of yamlEntries) {
    const allMatches = byDatumAll.get(y.datum) ?? [];
    const withThisGa = allMatches.filter((c) => gaContains(c.ga, gaNorm));
    const withoutGa = allMatches.filter((c) => c.ga == null || String(c.ga).trim() === "");
    const withOtherGa = allMatches.filter(
      (c) => c.ga != null && String(c.ga).trim() !== "" && !gaContains(c.ga, gaNorm)
    );

    if (withThisGa.length > 0) {
      const preferred =
        pickCatalogMatch(withThisGa, y.ort) ??
        (withThisGa.length === 1 ? withThisGa[0]! : null);
      if (preferred && isJunkTitel(y.titel, y.ort, locations)) {
        enrichable.push({ yaml: y, catalog: preferred });
      }
      continue;
    }

    if (allMatches.length === 0) {
      if (isJunkTitel(y.titel, y.ort, locations)) {
        artifacts.push(y);
      } else {
        missingInCatalog.push(y);
        console.log(
          problemLine("MISSING SSOT", gaNorm, "—", y.datum, y.ort, y.titel)
        );
      }
      continue;
    }

    // Catalog has this date under other GA(s) only — YAML entry does not belong here
    if (withOtherGa.length > 0 && withoutGa.length === 0) {
      const other = pickCatalogMatch(withOtherGa, y.ort) ?? withOtherGa[0]!;
      extraYaml.push(y);
      console.log(
        problemLine(
          "EXTRA YAML",
          gaNorm,
          other.id,
          y.datum,
          y.ort || other.ort,
          y.titel || other.vortragstitel,
          `ssot ga=${other.ga}`
        )
      );
      continue;
    }

    // Catalog has date with no ga — SSOT needs ga:X
    const candidate = pickCatalogMatch(withoutGa, y.ort);
    if (withoutGa.length > 0 && candidate) {
      if (seenCatalogIds.has(candidate.id)) continue;
      seenCatalogIds.add(candidate.id);
      missingGaInCatalog.push({ yaml: y, catalog: candidate });
      console.log(
        problemLine(
          "WRONG GA SSOT",
          gaNorm,
          candidate.id,
          candidate.datum,
          candidate.ort,
          candidate.vortragstitel || y.titel,
          "ga=(none)"
        )
      );
      continue;
    }

    if (isJunkTitel(y.titel, y.ort, locations) || opts.removeArtifacts) {
      artifacts.push(y);
    }
  }

  const problemCount =
    (countMismatch ? 1 : 0) +
    missingInYaml.length +
    missingGaInCatalog.length +
    missingInCatalog.length +
    extraYaml.length;
  if (problemCount === 0) {
    console.log(`${colors.green}OK — counts match, no missing entries or wrong GA${colors.reset}`);
  } else {
    const parts = [
      countMismatch
        ? `count mismatch (catalog=${catForGa.length} yaml=${yamlEntries.length})`
        : null,
      missingInYaml.length ? `${missingInYaml.length} missing YAML` : null,
      extraYaml.length ? `${extraYaml.length} extra YAML` : null,
      missingInCatalog.length ? `${missingInCatalog.length} missing SSOT` : null,
      missingGaInCatalog.length
        ? `${missingGaInCatalog.length} wrong/missing ga in SSOT`
        : null,
    ].filter(Boolean);
    console.log(`${colors.red}${problemCount} problem(s): ${parts.join(", ")}${colors.reset}`);
  }
  if (enrichable.length || artifacts.length) {
    console.log(
      `${colors.gray}Also: ${enrichable.length} title enrich, ${artifacts.length} YAML artifacts${colors.reset}`
    );
  }

  let lines = catalogLines;

  if (opts.writeCatalog && missingGaInCatalog.length > 0) {
    let working = lines;
    const indexAfter = buildCatalogLineIndex(working);
    const insertTargets = missingGaInCatalog
      .map((p) => ({ p, entry: indexAfter.byId.get(String(p.catalog.id)) }))
      .filter((x): x is { p: (typeof missingGaInCatalog)[number]; entry: CatalogLineEntry } => !!x.entry)
      .filter(({ entry }) => !gaContains(entry.gaValue, gaNorm))
      .sort((a, b) => b.entry.lineEnd - a.entry.lineEnd);

    for (const { p, entry } of insertTargets) {
      // re-resolve after prior inserts
      const live = buildCatalogLineIndex(working).byId.get(String(p.catalog.id));
      if (!live || gaContains(live.gaValue, gaNorm)) continue;
      working = insertGaIntoEntry(working, live, gaNorm);
      console.log(
        `${colors.brightGreen}  catalog inserted ga:${gaNorm} on ${p.catalog.id}${colors.reset}`
      );
    }
    lines = working;
  } else if (!opts.write && !opts.writeCatalog) {
    // preview note below
  }

  if (!opts.write) {
    if (!opts.writeCatalog) {
      console.log(
        `${colors.gray}(preview — --write for YAML, --write-catalog for SSOT ga:)${colors.reset}`
      );
    }
  } else {
    let next: RefEntry[];

    if (opts.rebuild) {
      next = catForGa.map((c) => catalogToRefEntry(c, gaNorm));
    } else {
      const dropKeys = new Set(
        [...artifacts, ...extraYaml].map((a) => matchKey(a.datum, a.ort) + "|" + a.titel)
      );
      next = yamlEntries
        .filter((y) => !dropKeys.has(matchKey(y.datum, y.ort) + "|" + y.titel))
        .map((y) => {
          const hit = enrichable.find(
            (e) => e.yaml.datum === y.datum && e.yaml.titel === y.titel && e.yaml.ort === y.ort
          );
          if (!hit) return { ...y, ga: gaNorm };
          const enriched = catalogToRefEntry(hit.catalog, gaNorm, y.type || "vortrag");
          if (y.type && y.type !== "vortrag") enriched.type = y.type;
          return enriched;
        });

      for (const c of missingInYaml) {
        const same = next.some(
          (e) =>
            e.datum === c.datum &&
            (e.ort || "").toLowerCase() === (c.ort || "").toLowerCase()
        );
        if (same) continue;
        next.push(catalogToRefEntry(c, gaNorm));
      }

      next.sort(
        (a, b) =>
          parseDatumKey(a.datum) - parseDatumKey(b.datum) ||
          (a.ort || "").localeCompare(b.ort || "") ||
          a.titel.localeCompare(b.titel)
      );
    }

    writeRefFile(gaNorm, ref, next);
    console.log(
      `${colors.brightGreen}Wrote ${yamlBasename(gaNorm)} (${next.length} entries)${colors.reset}`
    );
  }

  return lines;
}

const HELP = `Sync reference/ga/GAXX.yaml with the SSOT lecture catalog (both directions).

Usage:
  tsx src/scripts/maintain-lecture-catalog/sync_ga_reference_from_catalog.ts [options]

Options:
  --help, -h           Show this help
  --ga GA              Single volume (e.g. 52, 68a, 277b)
  --range RANGE        Volumes (e.g. 51,52 or 51-55 or 68a-68d)
  --write              Apply changes to reference YAML
  --write-catalog      Set/append ga: X on matching SSOT catalog entries
  --rebuild            Replace YAML entries entirely from catalog (with --write)
  --keep-artifacts     Do not remove junk YAML entries missing from catalog

Reports:
  Catalog → YAML   lectures with ga:X missing from the reference file
  YAML → Catalog   dates in YAML with no ga:X / not in catalog at all
  COUNT MISMATCH   catalog entry count ≠ YAML entry count (must be equal)
  (YAML same-date duplicates vs catalog are auto-trimmed and written; not reported)
`;

function resolveVolumes(args: string[]): string[] {
  const ga = flagValue(args, "--ga");
  const range = flagValue(args, "--range");
  if (ga) return [normalizeGaId(ga)];
  if (range) {
    const set = parseRangeArg(range);
    if (!set) return [];
    return [...set].map(normalizeGaId).sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ""), 10);
      const nb = parseInt(b.replace(/\D/g, ""), 10);
      if (na !== nb) return na - nb;
      return a.localeCompare(b);
    });
  }
  return [];
}

function main(): void {
  const args = process.argv.slice(2);
  if (hasFlag(args, "--help", "-h") || args.length === 0) {
    console.log(HELP);
    return;
  }

  const volumes = resolveVolumes(args);
  if (volumes.length === 0) {
    console.error("Provide --ga or --range");
    process.exit(1);
  }

  const write = hasFlag(args, "--write");
  const writeCatalog = hasFlag(args, "--write-catalog");
  const rebuild = hasFlag(args, "--rebuild");
  const removeArtifacts = !hasFlag(args, "--keep-artifacts");

  if (!fs.existsSync(LECTURE_CATALOG_PATH)) {
    console.error(`Catalog not found: ${LECTURE_CATALOG_PATH}`);
    process.exit(1);
  }

  const catalog = loadCatalog();
  const locations = new Set(loadLocationsSorted());
  let catalogLines = loadLectureCatalogRaw().split("\n");
  const linesBefore = catalogLines.join("\n");

  for (const ga of volumes) {
    catalogLines = syncVolume(
      ga,
      catalog,
      locations,
      { write, writeCatalog, rebuild, removeArtifacts },
      catalogLines
    );
  }

  if (writeCatalog && catalogLines.join("\n") !== linesBefore) {
    writeLectureCatalogRaw(catalogLines.join("\n"));
    console.log(`\n${colors.brightGreen}Updated ${LECTURE_CATALOG_PATH}${colors.reset}`);
  }
}

main();
