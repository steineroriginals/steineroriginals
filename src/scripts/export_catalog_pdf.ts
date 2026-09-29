#!/usr/bin/env node
/**
 * Export the lecture catalog (from 1900) as a printable overview PDF.
 *
 * Year sections start on a new page with a large year heading; months are
 * smaller section headings. Manuscript keys become relative links
 * `originals/<key>` (place the PDF next to the `originals/` folder).
 *
 * Usage:
 *   tsx src/scripts/export_catalog_pdf.ts \
 *     [--catalog /path/to/catalog.yaml] \
 *     [--out /path/to/catalog.pdf]
 *
 * Defaults: LECTURE_CATALOG_PATH / REPO_ROOT/rudolf-steiner-vortragskatalog.pdf
 * Env: CATALOG_PATH, OUT_PDF, CHROME_PATH
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { LECTURE_CATALOG_PATH, REPO_ROOT } from "../lib/paths.js";
import type { LectureCatalogFile, LectureEntry } from "../lib/types.js";

const MONTH_NAMES_DE = [
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

const DEFAULT_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

interface ParsedArgs {
  catalog: string;
  out: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  let catalog = process.env.CATALOG_PATH ?? LECTURE_CATALOG_PATH;
  let out =
    process.env.OUT_PDF ??
    path.join(REPO_ROOT, "rudolf-steiner-vortragskatalog.pdf");

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--catalog" && argv[i + 1]) {
      catalog = argv[++i]!;
    } else if (a === "--out" && argv[i + 1]) {
      out = argv[++i]!;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: export_catalog_pdf.ts [--catalog PATH] [--out PATH]"
      );
      process.exit(0);
    }
  }

  return { catalog, out };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseDatum(datum: string | undefined): {
  day: number;
  month: number;
  year: number;
} | null {
  if (!datum) return null;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(datum.trim());
  if (!m) return null;
  return {
    day: Number(m[1]),
    month: Number(m[2]),
    year: Number(m[3]),
  };
}

function yearOf(lecture: LectureEntry): number {
  const fromJahr = Number(lecture.jahr);
  if (Number.isFinite(fromJahr) && fromJahr > 0) return fromJahr;
  const d = parseDatum(lecture.datum);
  return d?.year ?? 0;
}

function monthOf(lecture: LectureEntry): number {
  const d = parseDatum(lecture.datum);
  return d?.month ?? 0;
}

function sortKey(lecture: LectureEntry): string {
  return String(lecture.id ?? lecture.datum ?? "");
}

function groupByYearThenMonth(
  lectures: LectureEntry[]
): Map<number, Map<number, LectureEntry[]>> {
  const byYear = new Map<number, Map<number, LectureEntry[]>>();
  for (const lecture of lectures) {
    const y = yearOf(lecture);
    const m = monthOf(lecture) || 1;
    let byMonth = byYear.get(y);
    if (!byMonth) {
      byMonth = new Map();
      byYear.set(y, byMonth);
    }
    let list = byMonth.get(m);
    if (!list) {
      list = [];
      byMonth.set(m, list);
    }
    list.push(lecture);
  }
  for (const byMonth of byYear.values()) {
    for (const list of byMonth.values()) {
      list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    }
  }
  return byYear;
}

function renderLecture(lecture: LectureEntry): string {
  const title =
    lecture.vortragstitel?.trim() ||
    lecture.anlass?.trim() ||
    "(ohne Titel)";
  const metaParts: string[] = [];
  if (lecture.datum) metaParts.push(escapeHtml(lecture.datum));
  if (lecture.ort) metaParts.push(escapeHtml(lecture.ort));
  if (lecture.ga != null && String(lecture.ga).trim() !== "") {
    metaParts.push(`GA ${escapeHtml(String(lecture.ga))}`);
  }

  const extras: string[] = [];
  if (lecture.reihe?.trim()) {
    extras.push(
      `<div class="extra"><span class="label">Reihe</span> ${escapeHtml(lecture.reihe.trim())}</div>`
    );
  }
  if (
    lecture.anlass?.trim() &&
    lecture.vortragstitel?.trim() &&
    lecture.anlass.trim() !== lecture.vortragstitel.trim()
  ) {
    extras.push(
      `<div class="extra"><span class="label">Anlass</span> ${escapeHtml(lecture.anlass.trim())}</div>`
    );
  }

  const manuscripts = lecture.manuscripts ?? [];
  const msHtml =
    manuscripts.length === 0
      ? ""
      : `<div class="manuscripts">${manuscripts
          .map((ms) => {
            const key = ms.key;
            const href = `originals/${encodeURIComponent(key).replace(/%2F/gi, "/")}`;
            return `<a class="ms" href="${href}">${escapeHtml(key)}</a>`;
          })
          .join("")}</div>`;

  return `<article class="lecture">
  <div class="meta">${metaParts.join('<span class="dot">·</span>')}</div>
  <h3 class="title">${escapeHtml(title)}</h3>
  ${extras.join("\n  ")}
  ${msHtml}
</article>`;
}

function buildHtml(
  grouped: Map<number, Map<number, LectureEntry[]>>,
  total: number,
  manuscriptCount: number
): string {
  const years = [...grouped.keys()].sort((a, b) => a - b);
  const yearMin = years[0] ?? 1900;
  const yearMax = years[years.length - 1] ?? 1900;

  const sections = years
    .map((year, yearIndex) => {
      const byMonth = grouped.get(year)!;
      const months = [...byMonth.keys()].sort((a, b) => a - b);
      const monthBlocks = months
        .map((month) => {
          const lectures = byMonth.get(month)!;
          const name =
            month >= 1 && month <= 12
              ? MONTH_NAMES_DE[month - 1]
              : `Monat ${month}`;
          return `<section class="month">
  <h2 class="month-title">${name}</h2>
  ${lectures.map(renderLecture).join("\n  ")}
</section>`;
        })
        .join("\n");

      return `<section class="year${yearIndex === 0 ? " year-first" : ""}">
  <header class="year-header">
    <p class="year-eyebrow">Jahr</p>
    <h1 class="year-number">${year}</h1>
  </header>
  ${monthBlocks}
</section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Rudolf Steiner — Vortragskatalog ${yearMin}–${yearMax}</title>
<style>
  @page {
    size: A4;
    margin: 16mm 16mm 18mm 16mm;
  }

  :root {
    --ink: #1a1814;
    --muted: #5c574e;
    --line: #d9d4c8;
    --paper: #fbfaf7;
    --link: #1f4d45;
    --link-bg: #e8f0ee;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
    font-size: 10.5pt;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .cover {
    min-height: 250mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 12mm 8mm;
    page-break-after: always;
  }

  .cover-kicker {
    font-size: 11pt;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0 0 18mm;
  }

  .cover-title {
    font-size: 42pt;
    font-weight: 600;
    line-height: 1.05;
    margin: 0 0 8mm;
    letter-spacing: -0.02em;
  }

  .cover-sub {
    font-size: 16pt;
    color: var(--muted);
    margin: 0 0 22mm;
    max-width: 28em;
  }

  .cover-stats {
    display: grid;
    grid-template-columns: repeat(3, max-content);
    gap: 10mm 14mm;
    border-top: 1px solid var(--line);
    padding-top: 8mm;
    font-variant-numeric: tabular-nums;
  }

  .stat-value {
    display: block;
    font-size: 22pt;
    font-weight: 600;
    line-height: 1.1;
  }

  .stat-label {
    display: block;
    margin-top: 2mm;
    font-size: 9pt;
    color: var(--muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .year {
    page-break-before: always;
  }

  .year-first {
    page-break-before: auto;
  }

  .year-header {
    margin: 0 0 10mm;
    padding-bottom: 6mm;
    border-bottom: 1.5px solid var(--ink);
  }

  .year-eyebrow {
    margin: 0 0 2mm;
    font-size: 9pt;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .year-number {
    margin: 0;
    font-size: 72pt;
    font-weight: 600;
    line-height: 0.95;
    letter-spacing: -0.03em;
  }

  .month {
    margin: 0 0 8mm;
  }

  .month-title {
    margin: 0 0 4mm;
    padding: 1.5mm 0;
    font-size: 13pt;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
    border-bottom: 1px solid var(--line);
    page-break-after: avoid;
  }

  .lecture {
    padding: 3.2mm 0;
    border-bottom: 1px solid var(--line);
    page-break-inside: avoid;
  }

  .lecture:last-child {
    border-bottom: none;
  }

  .meta {
    font-size: 9pt;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    margin: 0 0 1mm;
  }

  .dot {
    margin: 0 1.6mm;
    opacity: 0.55;
  }

  .title {
    margin: 0;
    font-size: 11pt;
    font-weight: 600;
    line-height: 1.3;
  }

  .extra {
    margin-top: 1.2mm;
    font-size: 9pt;
    color: var(--muted);
  }

  .label {
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 7.5pt;
    margin-right: 1.5mm;
  }

  .manuscripts {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5mm;
    margin-top: 2.2mm;
  }

  a.ms {
    display: inline-block;
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 7.5pt;
    line-height: 1.25;
    padding: 1.1mm 2mm;
    background: var(--link-bg);
    color: var(--link);
    border-radius: 2px;
    max-width: 100%;
    word-break: break-all;
  }
</style>
</head>
<body>
  <section class="cover">
    <p class="cover-kicker">Rudolf Steiner</p>
    <h1 class="cover-title">Vortragskatalog</h1>
    <p class="cover-sub">Übersicht der Vorträge ${yearMin}–${yearMax}. Manuskript-Links verweisen auf originals/&lt;key&gt; relativ zu diesem PDF.</p>
    <div class="cover-stats">
      <div><span class="stat-value">${total.toLocaleString("de-DE")}</span><span class="stat-label">Vorträge</span></div>
      <div><span class="stat-value">${years.length}</span><span class="stat-label">Jahre</span></div>
      <div><span class="stat-value">${manuscriptCount.toLocaleString("de-DE")}</span><span class="stat-label">Manuskripte</span></div>
    </div>
  </section>
  ${sections}
</body>
</html>`;
}

function findChrome(): string {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  if (fs.existsSync(DEFAULT_CHROME)) return DEFAULT_CHROME;
  throw new Error(
    "Google Chrome not found. Set CHROME_PATH to a Chromium-based browser."
  );
}

function printHtmlToPdf(htmlPath: string, outPdf: string): void {
  const chrome = findChrome();
  const absHtml = path.resolve(htmlPath);
  const absOut = path.resolve(outPdf);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });

  const result = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-pdf-header-footer",
      "--print-to-pdf-no-header",
      `--print-to-pdf=${absOut}`,
      `file://${absHtml}`,
    ],
    {
      encoding: "utf8",
      timeout: 300_000,
      maxBuffer: 20 * 1024 * 1024,
    }
  );

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `Chrome PDF export failed (exit ${result.status}): ${err || "unknown error"}`
    );
  }
  if (!fs.existsSync(absOut)) {
    throw new Error(`Chrome finished but PDF was not written: ${absOut}`);
  }
}

/**
 * Chrome print emits /URI actions. Acrobat treats those like web links and
 * often blocks file:// targets. Convert to /Launch with a relative filespec
 * `originals/<key>` (same byte length so the existing xref stays valid).
 *
 * Also normalizes any absolute file:///…/originals/… URIs back to relative.
 */
function rewriteLinksToLaunchOriginals(pdfPath: string, originalsDir: string): number {
  let buf = fs.readFileSync(pdfPath);
  let count = 0;

  // 1) Absolute file:// → relative originals/ (length changes; only used if present)
  const absPrefix = Buffer.from(
    `/URI (file://${path.resolve(originalsDir).replace(/\\/g, "/")}/`
  );
  const relPrefix = Buffer.from("/URI (originals/");
  if (buf.includes(absPrefix)) {
    const parts: Buffer[] = [];
    let start = 0;
    let idx = buf.indexOf(absPrefix, start);
    while (idx !== -1) {
      parts.push(buf.subarray(start, idx));
      parts.push(relPrefix);
      start = idx + absPrefix.length;
      idx = buf.indexOf(absPrefix, start);
    }
    parts.push(buf.subarray(start));
    buf = Buffer.concat(parts);
  }

  // 2) /S /URI + /URI (  →  /S /Launch + /F(   (same length: 14 bytes)
  const from = Buffer.from("/S /URI\n/URI (");
  const to = Buffer.from("/S /Launch\n/F(");
  if (from.length !== to.length) {
    throw new Error("Launch rewrite pad mismatch");
  }

  const out = Buffer.from(buf);
  let pos = 0;
  while (true) {
    const idx = out.indexOf(from, pos);
    if (idx === -1) break;
    to.copy(out, idx);
    count += 1;
    pos = idx + to.length;
  }

  if (count > 0 || buf !== out) {
    fs.writeFileSync(pdfPath, out);
  }
  return count;
}

function main(): void {
  const { catalog, out } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(catalog)) {
    throw new Error(`Catalog not found: ${catalog}`);
  }

  console.log(`Loading ${catalog} …`);
  const raw = fs.readFileSync(catalog, "utf8");
  const data = yaml.load(raw) as LectureCatalogFile;
  const all = data.lectures ?? [];
  const lectures = all
    .filter((l) => yearOf(l) >= 1900)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const manuscriptCount = lectures.reduce(
    (n, l) => n + (l.manuscripts?.length ?? 0),
    0
  );
  const grouped = groupByYearThenMonth(lectures);
  const html = buildHtml(grouped, lectures.length, manuscriptCount);

  // Write HTML beside the PDF so relative originals/<key> links resolve correctly.
  const outDir = path.dirname(path.resolve(out));
  const htmlPath = path.join(
    outDir,
    `.${path.basename(out, path.extname(out))}.print.html`
  );

  fs.writeFileSync(htmlPath, html, "utf8");
  console.log(
    `Rendering ${lectures.length} lectures / ${manuscriptCount} manuscript links …`
  );
  printHtmlToPdf(htmlPath, out);
  const rewritten = rewriteLinksToLaunchOriginals(
    out,
    path.join(outDir, "originals")
  );
  if (rewritten > 0) {
    console.log(`Converted ${rewritten} links to Launch originals/<key>`);
  }

  // Keep a small footprint on the drive; HTML is only an intermediate.
  try {
    fs.unlinkSync(htmlPath);
  } catch {
    /* ignore */
  }

  const sizeMb = (fs.statSync(out).size / (1024 * 1024)).toFixed(2);
  console.log(`Wrote ${out} (${sizeMb} MB)`);
  console.log(`Place this PDF next to the originals/ folder so links resolve.`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
