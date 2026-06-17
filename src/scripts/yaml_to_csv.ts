#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadLectureCatalog } from "../lib/catalog.js";
import { REPO_ROOT } from "../lib/paths.js";

const COLUMNS = ["id", "datum", "jahr", "ort", "vortragstitel", "anlass", "ga", "zyklus"] as const;

function escapeCsv(value: unknown): string {
  if (value == null || value === "") return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function main(): void {
  const outArg = process.argv[2];
  const csvPath =
    outArg ??
    path.join(REPO_ROOT, "reference", "rudolf-steiner-ga-lecture-catalog.csv");

  const lectures = loadLectureCatalog();
  const header = COLUMNS.join(",");
  const rows = lectures.map((e) =>
    COLUMNS.map((c) => escapeCsv(e[c as keyof typeof e])).join(",")
  );
  const csv = [header, ...rows].join("\n");
  fs.writeFileSync(csvPath, `\uFEFF${csv}`, "utf-8");
  console.log(`Wrote CSV: ${csvPath} (${lectures.length} rows)`);
}

main();
