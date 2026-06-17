#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { colors, flagValue, hasFlag } from "../../lib/cli.js";
import {
  extractPdfPages,
  gaNumberFromFilename,
  gaPdfPath,
  listGaPdfFilenames,
  parseRangeArg,
  resolveGaPdfDir,
} from "../../lib/ga-pdf.js";
import {
  loadGaCatalog,
  loadGaCatalogSet,
  saveGaCatalog,
  titleToSlug,
} from "../../lib/ga-catalog.js";
import { loadLocationSet } from "../../lib/locations.js";
import { GA_CATALOG_PATH } from "../../lib/paths.js";
import type { GaBand } from "../../lib/types.js";

const HELP = `Add missing GA volumes to reference/ga-catalog.yaml.

Scans local GA PDFs (GA_PDF_DIR), extracts book titles from the first 5 pages,
and writes missing bands to the catalog.

Requires: pdftotext (poppler)

Usage:
  tsx src/scripts/maintain-lecture-catalog/add_missing_ga_to_catalog.ts [options]

Options:
  --help, -h     Show this help
  --write        Write changes to ga-catalog.yaml (default: preview only)
  --range RANGE  Limit GA bands, e.g. 355,356 or 355-360 or 68a-68d

Environment:
  GA_PDF_DIR     Path to local GA PDF directory
`;

function looksLikeMetadata(line: string, locations: Set<string>): boolean {
  const t = line.trim();
  if (t.length < 3) return true;
  if (/^\d+\s*Vorträge?/i.test(t)) return true;
  if (/Vorträge?\s*$/i.test(t) && t.length < 50) return true;
  if (
    /^\d{1,2}\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+\d{4}/i.test(
      t
    )
  )
    return true;
  if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(t)) return true;
  if (/^\d+\s*Aufl\./i.test(t)) return true;
  if (/^\d+$/.test(t)) return true;
  const words = t.split(/[\s,]+/).filter((w) => w.length > 1);
  if (words.length >= 2 && words.every((w) => w.length < 20)) {
    if (words.every((w) => locations.has(w.toLowerCase()))) return true;
  }
  if (words.length === 1 && locations.has(words[0]!.toLowerCase())) return true;
  return false;
}

function extractTitleFromPdfText(text: string, locations: Set<string>): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let rudolfIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes("Rudolf Steiner")) {
      rudolfIdx = i;
      break;
    }
  }
  if (rudolfIdx < 0) return null;

  const titleParts: string[] = [];
  for (let i = rudolfIdx + 1; i < lines.length && titleParts.length < 5; i++) {
    const line = lines[i]!;
    if (!line) continue;
    if (looksLikeMetadata(line, locations)) break;
    if (line.length < 4) continue;
    titleParts.push(line);
  }
  if (titleParts.length === 0) return null;
  return titleParts.join(" ").trim();
}

function main(): void {
  const args = process.argv.slice(2);
  if (hasFlag(args, "--help", "-h")) {
    console.log(HELP);
    return;
  }

  const doWrite = hasFlag(args, "--write");
  const rangeSet = parseRangeArg(flagValue(args, "--range"));

  const gaDir = resolveGaPdfDir();
  if (!fs.existsSync(gaDir)) {
    console.error(`${colors.red}GA PDF directory not found: ${gaDir}${colors.reset}`);
    process.exit(1);
  }

  const existing = loadGaCatalog();
  const existingGas = loadGaCatalogSet();
  const locations = loadLocationSet();
  const allPdfs = listGaPdfFilenames({ rangeSet });
  const missingPdfs = allPdfs.filter((f) => {
    const ga = gaNumberFromFilename(f);
    return ga && !existingGas.has(ga);
  });

  if (missingPdfs.length === 0) {
    console.log(
      rangeSet
        ? `No missing GA bands in range ${[...rangeSet].sort().join(", ")}.`
        : `All ${allPdfs.length} GA PDFs are already in ${GA_CATALOG_PATH}.`
    );
    return;
  }

  console.log(
    `\n${missingPdfs.length} GA band(s) missing from catalog. Extracting titles from first 5 pages…\n`
  );

  const toAdd: GaBand[] = [];
  for (let idx = 0; idx < missingPdfs.length; idx++) {
    const filename = missingPdfs[idx]!;
    const gaNum = gaNumberFromFilename(filename);
    if (!gaNum) continue;

    const pdfPath = gaPdfPath(filename);
    const text = extractPdfPages(pdfPath, 1, 5);
    const rawTitle = extractTitleFromPdfText(text, locations);

    if (!rawTitle) {
      console.log(`${colors.yellow}GA ${gaNum}:${colors.reset} title not found`);
      continue;
    }

    toAdd.push({
      ga: gaNum,
      title: titleToSlug(rawTitle),
      titleDisplay: rawTitle,
      pdf: filename,
    });

    const pct =
      missingPdfs.length > 1
        ? Math.round(((idx + 1) / missingPdfs.length) * 100)
        : 100;
    process.stdout.write(
      `\r[${idx + 1}/${missingPdfs.length}] (${pct}%) GA ${gaNum}: ${rawTitle.slice(0, 50)}…    `
    );
  }
  console.log("\n");

  if (toAdd.length === 0) {
    console.log("No titles extracted.");
    return;
  }

  console.log(`${colors.brightGreen}Found ${toAdd.length} band(s):${colors.reset}\n`);
  for (const band of toAdd) {
    console.log(`${colors.gray}GA ${band.ga}:${colors.reset} ${band.titleDisplay ?? band.title}`);
  }

  if (doWrite) {
    saveGaCatalog([...existing, ...toAdd]);
    console.log(
      `\n${colors.brightGreen}Wrote ${toAdd.length} band(s) to ${GA_CATALOG_PATH}${colors.reset}`
    );
  } else {
    console.log(
      `\n${colors.yellow}Preview only — pass --write to update ${GA_CATALOG_PATH}${colors.reset}`
    );
  }
}

main();
