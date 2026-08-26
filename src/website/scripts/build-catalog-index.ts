/**
 * Build compact JSON indexes for the website from the SSOT.
 * GA and cycle lists are derived from lecture `ga` / `zyklus` fields.
 *
 * Usage: yarn build:website-data
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { loadLectureCatalog } from "../../lib/catalog.js";
import { compareGaNumbers } from "../../lib/ga-pdf.js";
import {
  LECTURE_CATALOG_CYCLES_PATH,
  LECTURE_CATALOG_LOCATIONS_PATH,
} from "../../lib/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "public", "data");

const YEAR_MIN = 1888;
const YEAR_MAX = 1924;

export interface LectureIndexEntry {
  id: string;
  datum: string;
  jahr: string;
  monat: string;
  ort: string;
  vortragstitel: string;
  zyklus: string;
  ga: string;
  manuscripts: string[];
}

export interface CycleIndexEntry {
  zyklus: string;
  titel: string;
  vortraege: number;
}

export interface GaIndexEntry {
  ga: string;
  vortraege: number;
}

function parseMonat(datum: string | undefined): string {
  if (!datum) return "";
  const m = datum.trim().match(/^\d{1,2}\.(\d{1,2})\.\d{4}/);
  if (!m) return "";
  return String(m[1]).padStart(2, "0");
}

function parseJahr(
  jahr: string | undefined,
  datum: string | undefined
): string {
  const fromField = jahr?.trim();
  if (fromField && /^\d{4}$/.test(fromField)) return fromField;
  if (!datum) return "";
  const m = datum.trim().match(/(\d{4})\s*$/);
  return m?.[1] ?? "";
}

/** Split SSOT `ga` (may be comma-separated) into normalized tokens. */
export function splitGaValues(ga: string | undefined): string[] {
  if (!ga?.trim()) return [];
  return ga
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function loadLocationsWhitelist(): string[] {
  if (!fs.existsSync(LECTURE_CATALOG_LOCATIONS_PATH)) return [];
  return fs
    .readFileSync(LECTURE_CATALOG_LOCATIONS_PATH, "utf-8")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
}

/** Optional titles from reference YAML (list itself still comes from SSOT). */
function loadCycleTitles(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(LECTURE_CATALOG_CYCLES_PATH)) return map;
  const parsed = load(
    fs.readFileSync(LECTURE_CATALOG_CYCLES_PATH, "utf-8")
  ) as
    | {
        zyklen?: Array<{ zyklus: number | string; titel?: string }>;
      }
    | undefined;
  for (const c of parsed?.zyklen ?? []) {
    const key = String(c.zyklus);
    if (c.titel?.trim()) map.set(key, c.titel.trim());
  }
  return map;
}

function main(): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const lectures = loadLectureCatalog();
  const index: LectureIndexEntry[] = lectures.map((e) => {
    const keys = (e.manuscripts ?? [])
      .map((m) => m.key?.trim())
      .filter((k): k is string => Boolean(k))
      .sort((a, b) => a.localeCompare(b));
    return {
      id: String(e.id),
      datum: e.datum?.trim() ?? "",
      jahr: parseJahr(e.jahr, e.datum),
      monat: parseMonat(e.datum),
      ort: e.ort?.trim() ?? "",
      vortragstitel: e.vortragstitel?.trim() ?? "",
      zyklus:
        e.zyklus != null && String(e.zyklus).trim() !== ""
          ? String(e.zyklus).trim()
          : "",
      ga: e.ga != null ? String(e.ga).trim() : "",
      manuscripts: keys,
    };
  });

  const gaCounts = new Map<string, number>();
  const zyklusCounts = new Map<string, number>();

  for (const e of index) {
    for (const g of splitGaValues(e.ga)) {
      gaCounts.set(g, (gaCounts.get(g) ?? 0) + 1);
    }
    if (e.zyklus) {
      zyklusCounts.set(e.zyklus, (zyklusCounts.get(e.zyklus) ?? 0) + 1);
    }
  }

  const cycleTitles = loadCycleTitles();

  const gas: GaIndexEntry[] = [...gaCounts.entries()]
    .map(([ga, vortraege]) => ({ ga, vortraege }))
    .sort((a, b) => compareGaNumbers(a.ga, b.ga));

  const cycles: CycleIndexEntry[] = [...zyklusCounts.entries()]
    .map(([zyklus, vortraege]) => ({
      zyklus,
      titel: cycleTitles.get(zyklus) ?? "",
      vortraege,
    }))
    .sort((a, b) => {
      const na = Number(a.zyklus);
      const nb = Number(b.zyklus);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
        return na - nb;
      }
      return a.zyklus.localeCompare(b.zyklus);
    });

  const years = [
    ...new Set(
      index
        .map((e) => e.jahr)
        .filter((y) => {
          const n = Number(y);
          return Number.isFinite(n) && n >= YEAR_MIN && n <= YEAR_MAX;
        })
    ),
  ].sort((a, b) => Number(b) - Number(a));

  const locations = loadLocationsWhitelist();

  fs.writeFileSync(
    path.join(OUT_DIR, "lectures.json"),
    JSON.stringify(index),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "gas.json"),
    JSON.stringify(gas),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "cycles.json"),
    JSON.stringify(cycles),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "locations.json"),
    JSON.stringify(locations),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "years.json"),
    JSON.stringify(years),
    "utf-8"
  );

  console.log(
    `Wrote website data → ${OUT_DIR}\n` +
      `  lectures: ${index.length}\n` +
      `  gas: ${gas.length}\n` +
      `  cycles: ${cycles.length}\n` +
      `  locations: ${locations.length}\n` +
      `  years: ${years.length} (${years[0] ?? "—"}–${years[years.length - 1] ?? "—"})`
  );
}

main();
