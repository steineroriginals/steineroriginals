#!/usr/bin/env node
import { colors, hasFlag } from "../lib/cli.js";
import {
  computeCatalogStats,
  loadLectureCatalog,
} from "../lib/catalog.js";
import { loadLocationSet } from "../lib/locations.js";
import { LECTURE_CATALOG_PATH } from "../lib/paths.js";
import type { LectureEntry } from "../lib/types.js";

function validateCatalog(lectures: LectureEntry[]): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Map<string, number>();

  for (let i = 0; i < lectures.length; i++) {
    const entry = lectures[i]!;
    const label = `lectures[${i}]`;
    const id = entry.id ? String(entry.id) : `(no id)`;

    if (!entry.id) {
      errors.push(`${label}: missing id`);
      continue;
    }
    ids.set(id, (ids.get(id) ?? 0) + 1);

    if (!entry.uuid?.trim()) warnings.push(`${label} id=${id}: missing uuid`);
    if (!entry.datum?.trim()) warnings.push(`${label} id=${id}: missing datum`);
    if (!entry.jahr?.trim()) warnings.push(`${label} id=${id}: missing jahr`);
    if (!entry.ort?.trim()) warnings.push(`${label} id=${id}: missing ort`);

    if (entry.datum && !/^\d{2}\.\d{2}\.\d{4}$/.test(entry.datum.trim())) {
      warnings.push(`${label} id=${id}: non-standard datum "${entry.datum}"`);
    }
  }

  for (const [id, count] of ids) {
    if (count > 1) errors.push(`Duplicate id: ${id} (${count} occurrences)`);
  }

  const known = loadLocationSet();
  if (known.size > 0) {
    for (const entry of lectures) {
      const ort = entry.ort?.trim();
      if (!ort) continue;
      if (!known.has(ort.toLowerCase())) {
        warnings.push(
          `Unknown location "${ort}" (id=${entry.id}) — not in lecture-catalog-locations.yaml`
        );
      }
    }
  }

  return { errors, warnings };
}

function main(): void {
  const args = process.argv.slice(2);
  const statsOnly = hasFlag(args, "--stats");

  const lectures = loadLectureCatalog();
  const { errors, warnings } = validateCatalog(lectures);

  if (statsOnly) {
    console.log(JSON.stringify(computeCatalogStats(lectures), null, 2));
    return;
  }

  console.log(`Validating ${LECTURE_CATALOG_PATH}`);
  console.log(`Lectures: ${lectures.length}`);

  if (errors.length === 0) {
    console.log(`${colors.brightGreen}No errors.${colors.reset}`);
  } else {
    console.error(`${colors.red}${errors.length} error(s):${colors.reset}`);
    for (const e of errors) console.error(`  ${e}`);
  }

  if (warnings.length > 0) {
    console.log(`${colors.yellow}${warnings.length} warning(s):${colors.reset}`);
    const show = warnings.slice(0, 25);
    for (const w of show) console.log(`  ${w}`);
    if (warnings.length > 25) {
      console.log(`  … and ${warnings.length - 25} more`);
    }
  }

  const stats = computeCatalogStats(lectures);
  console.log("\nCoverage:");
  console.log(`  With GA:     ${stats.withGa} / ${stats.totalLectures}`);
  console.log(`  Without GA:  ${stats.withoutGa}`);
  console.log(`  With title:  ${stats.withTitle}`);
  console.log(`  With zyklus: ${stats.withZyklus}`);
  console.log(`  Locations:   ${stats.uniqueLocations}`);
  if (stats.yearRange) {
    console.log(`  Years:       ${stats.yearRange.min}–${stats.yearRange.max}`);
  }

  if (errors.length > 0) process.exit(1);
}

main();
