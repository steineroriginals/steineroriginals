import fs from "node:fs";
import yaml from "js-yaml";
import { LECTURE_CATALOG_PATH } from "./paths.js";
import type { CatalogStats, LectureCatalogFile, LectureEntry } from "./types.js";

export function loadLectureCatalog(): LectureEntry[] {
  if (!fs.existsSync(LECTURE_CATALOG_PATH)) {
    throw new Error(`Lecture catalog not found: ${LECTURE_CATALOG_PATH}`);
  }
  const parsed = yaml.load(fs.readFileSync(LECTURE_CATALOG_PATH, "utf-8")) as
    | LectureCatalogFile
    | undefined;
  if (!parsed?.lectures || !Array.isArray(parsed.lectures)) {
    throw new Error(`Invalid lecture catalog format in ${LECTURE_CATALOG_PATH}`);
  }
  return parsed.lectures;
}

export function loadLectureCatalogRaw(): string {
  return fs.readFileSync(LECTURE_CATALOG_PATH, "utf-8");
}

export function writeLectureCatalogRaw(content: string): void {
  fs.writeFileSync(LECTURE_CATALOG_PATH, content, "utf-8");
}

export function computeCatalogStats(lectures: LectureEntry[]): CatalogStats {
  const locations = new Set<string>();
  const gaValues = new Set<string>();
  let withGa = 0;
  let withTitle = 0;
  let withZyklus = 0;
  let withReihe = 0;
  let withAnlass = 0;
  let minYear = Infinity;
  let maxYear = -Infinity;

  const ids = new Map<string, number>();

  for (const entry of lectures) {
    if (entry.id) {
      ids.set(String(entry.id), (ids.get(String(entry.id)) ?? 0) + 1);
    }
    if (entry.ort?.trim()) locations.add(entry.ort.trim());
    const gaRaw = entry.ga != null ? String(entry.ga).trim() : "";
    if (gaRaw) {
      withGa++;
      for (const part of gaRaw.split(",")) {
        const g = part.trim().toLowerCase();
        if (g) gaValues.add(g);
      }
    }
    if (entry.vortragstitel?.trim()) withTitle++;
    if (entry.zyklus != null && String(entry.zyklus).trim() !== "") withZyklus++;
    if (entry.reihe?.trim()) withReihe++;
    if (entry.anlass?.trim()) withAnlass++;
    const year = parseInt(String(entry.jahr ?? ""), 10);
    if (Number.isFinite(year)) {
      minYear = Math.min(minYear, year);
      maxYear = Math.max(maxYear, year);
    }
  }

  return {
    totalLectures: lectures.length,
    withGa,
    withoutGa: lectures.length - withGa,
    withTitle,
    emptyTitle: lectures.length - withTitle,
    withZyklus,
    withReihe,
    withAnlass,
    uniqueLocations: locations.size,
    uniqueGaValues: gaValues.size,
    yearRange:
      minYear <= maxYear ? { min: minYear, max: maxYear } : null,
  };
}

export function validateCatalog(lectures: LectureEntry[]): string[] {
  const errors: string[] = [];
  const ids = new Map<string, number>();

  for (let i = 0; i < lectures.length; i++) {
    const entry = lectures[i]!;
    const label = `lectures[${i}]`;

    if (!entry.id) {
      errors.push(`${label}: missing id`);
      continue;
    }
    const id = String(entry.id);
    ids.set(id, (ids.get(id) ?? 0) + 1);
  }

  for (const [id, count] of ids) {
    if (count > 1) errors.push(`Duplicate id: ${id} (${count} occurrences)`);
  }

  return errors;
}
