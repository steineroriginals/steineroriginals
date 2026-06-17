import fs from "node:fs";
import yaml from "js-yaml";
import { GA_CATALOG_PATH } from "./paths.js";
import { compareGaNumbers } from "./ga-pdf.js";
import type { GaBand, GaCatalogFile } from "./types.js";

export function loadGaCatalog(): GaBand[] {
  if (!fs.existsSync(GA_CATALOG_PATH)) return [];
  const parsed = yaml.load(fs.readFileSync(GA_CATALOG_PATH, "utf-8")) as
    | GaCatalogFile
    | undefined;
  if (!parsed?.bands || !Array.isArray(parsed.bands)) return [];
  return parsed.bands;
}

export function loadGaCatalogSet(): Set<string> {
  return new Set(loadGaCatalog().map((b) => b.ga));
}

export function saveGaCatalog(bands: GaBand[]): void {
  const sorted = [...bands].sort((a, b) => compareGaNumbers(a.ga, b.ga));
  const content = yaml.dump({ bands: sorted }, { lineWidth: 120, noRefs: true });
  fs.writeFileSync(GA_CATALOG_PATH, content, "utf-8");
}

export function titleToSlug(title: string): string {
  return title
    .replace(/^Band\s+GA\s+\d+[a-z]?\s*/gi, "")
    .replace(/^RUDOLF\s+STEINER\s*/gi, "")
    .replace(/^Rudolf\s+Steiner\s*/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
