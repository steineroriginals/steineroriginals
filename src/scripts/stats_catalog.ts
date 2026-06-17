#!/usr/bin/env node
import { computeCatalogStats, loadLectureCatalog } from "../lib/catalog.js";

function main(): void {
  const stats = computeCatalogStats(loadLectureCatalog());
  console.log(JSON.stringify(stats, null, 2));
}

main();
