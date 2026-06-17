import fs from "node:fs";
import { LECTURE_CATALOG_LOCATIONS_PATH } from "./paths.js";

/** Load location names, longest first (for prefix matching). */
export function loadLocationsSorted(): string[] {
  if (!fs.existsSync(LECTURE_CATALOG_LOCATIONS_PATH)) return [];
  return fs
    .readFileSync(LECTURE_CATALOG_LOCATIONS_PATH, "utf-8")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"))
    .sort((a, b) => b.length - a.length);
}

/** Load locations as lowercase set (for metadata filtering). */
export function loadLocationSet(): Set<string> {
  if (!fs.existsSync(LECTURE_CATALOG_LOCATIONS_PATH)) return new Set();
  return new Set(
    fs
      .readFileSync(LECTURE_CATALOG_LOCATIONS_PATH, "utf-8")
      .split("\n")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s && !s.startsWith("#"))
  );
}
