#!/usr/bin/env node
import {
  loadLectureCatalogRaw,
  writeLectureCatalogRaw,
} from "../lib/catalog.js";
import { LECTURE_CATALOG_PATH } from "../lib/paths.js";

function main(): void {
  const content = loadLectureCatalogRaw();
  const lines = content.split("\n");

  const entries: { id: string; lines: string[] }[] = [];
  let current: { id: string; lines: string[] } | null = null;

  for (const line of lines) {
    const idMatch = line.match(/^\s+-\s+id:\s*(.+)$/);
    if (idMatch) {
      if (current) entries.push(current);
      current = { id: idMatch[1]!.trim(), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) entries.push(current);

  entries.sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true })
  );

  const header = lines[0] ?? "lectures:";
  const result = [header, ...entries.flatMap((e) => e.lines)].join("\n");
  writeLectureCatalogRaw(result);
  console.log(`Sorted ${entries.length} lectures by id ASC in ${LECTURE_CATALOG_PATH}`);
}

main();
