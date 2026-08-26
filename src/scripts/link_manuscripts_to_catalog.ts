#!/usr/bin/env node
/**
 * Link R2 originals keys into the SSOT as manuscripts: [{ key }, …].
 *
 * Usage:
 *   yarn link:manuscripts                 # dry-run from local originals/
 *   yarn link:manuscripts --write
 *   yarn link:manuscripts --from-report reference/upload-reports/….json --write
 *
 * Keys are always originals/<filename>.pdf (same as upload_originals_to_r2).
 * Full-replaces manuscripts for each matched lecture id (idempotent).
 */
import fs from "node:fs";
import path from "node:path";
import { dump } from "js-yaml";
import { colors, flagValue, hasFlag } from "../lib/cli.js";
import {
  loadLectureCatalog,
  loadLectureCatalogRaw,
  writeLectureCatalogRaw,
} from "../lib/catalog.js";
import {
  CATALOG_IDS_WITHOUT_ORIGINALS_PATH,
  LECTURE_CATALOG_PATH,
  ORIGINAL_MANIFEST_PATH,
  ORIGINALS_DIR,
  REPO_ROOT,
} from "../lib/paths.js";
import {
  originalsObjectKey,
  parseOriginalsLectureId,
} from "../lib/r2.js";
import type { ManuscriptRef } from "../lib/types.js";

interface FileRef {
  filename: string;
  key: string;
  lectureId: string | null;
}

interface ManifestEntry {
  id: string;
  files: Array<{ filename: string; key: string }>;
}

function printHelp(): void {
  console.log(`Link originals PDF keys into the lecture catalog (manuscripts).

Options:
  --write              Write SSOT + reference/original-manifest.yaml
  --from-local         Scan originals/ (default)
  --from-report <path> Use upload report JSON rows instead of local scan
  --dir <path>         Local originals directory (default: originals/)
  --help               Show this help

Dry-run is the default for the SSOT (no catalog write).
Always refreshes reference/catalog-ids-without-originals.txt (one id per line).
`);
}

async function listLocalPdfs(dir: string): Promise<FileRef[]> {
  const names = await fs.promises.readdir(dir);
  const refs: FileRef[] = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".pdf") || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const st = await fs.promises.stat(full);
    if (!st.isFile()) continue;
    refs.push({
      filename: name,
      key: originalsObjectKey(name),
      lectureId: parseOriginalsLectureId(name),
    });
  }
  refs.sort((a, b) => a.key.localeCompare(b.key));
  return refs;
}

function loadFromReport(reportPath: string): FileRef[] {
  const abs = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(REPO_ROOT, reportPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Report not found: ${abs}`);
  }
  const report = JSON.parse(fs.readFileSync(abs, "utf-8")) as {
    rows?: Array<{
      filename?: string;
      key?: string;
      lectureId?: string | null;
      status?: string;
    }>;
  };
  if (!Array.isArray(report.rows)) {
    throw new Error(`Invalid report (missing rows): ${abs}`);
  }
  const refs: FileRef[] = [];
  for (const row of report.rows) {
    if (row.status === "failed") continue;
    const filename = row.filename?.trim();
    if (!filename) continue;
    const key = row.key?.trim() || originalsObjectKey(filename);
    refs.push({
      filename,
      key,
      lectureId:
        row.lectureId != null && row.lectureId !== ""
          ? String(row.lectureId).toLowerCase()
          : parseOriginalsLectureId(filename),
    });
  }
  refs.sort((a, b) => a.key.localeCompare(b.key));
  return refs;
}

/** Group keys by lecture id (sorted keys). Skip unparseable filenames. */
function groupByLectureId(refs: FileRef[]): {
  byId: Map<string, ManuscriptRef[]>;
  unparseable: FileRef[];
} {
  const byId = new Map<string, ManuscriptRef[]>();
  const unparseable: FileRef[] = [];
  for (const ref of refs) {
    if (!ref.lectureId) {
      unparseable.push(ref);
      continue;
    }
    const id = ref.lectureId;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id)!.push({ key: ref.key });
  }
  for (const [id, keys] of byId) {
    keys.sort((a, b) => a.key.localeCompare(b.key));
    // Deduplicate keys
    const seen = new Set<string>();
    byId.set(
      id,
      keys.filter((k) => {
        if (seen.has(k.key)) return false;
        seen.add(k.key);
        return true;
      })
    );
  }
  return { byId, unparseable };
}

function stripManuscriptsBlock(entryLines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < entryLines.length) {
    const line = entryLines[i]!;
    if (/^\s{4}manuscripts:\s*$/.test(line)) {
      i++;
      while (i < entryLines.length) {
        const next = entryLines[i]!;
        if (/^\s{6}-\s+key:/.test(next)) {
          i++;
          continue;
        }
        // allow blank lines inside manuscripts
        if (next.trim() === "" && i + 1 < entryLines.length) {
          const peek = entryLines[i + 1]!;
          if (/^\s{6}-\s+key:/.test(peek)) {
            i++;
            continue;
          }
        }
        break;
      }
      continue;
    }
    out.push(line);
    i++;
  }
  while (out.length > 0 && out[out.length - 1]!.trim() === "") out.pop();
  return out;
}

function manuscriptsBlockLines(keys: ManuscriptRef[]): string[] {
  return [
    "    manuscripts:",
    ...keys.map((k) => `      - key: ${k.key}`),
  ];
}

function keysEqual(
  a: ManuscriptRef[] | undefined,
  b: ManuscriptRef[]
): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.key !== b[i]!.key) return false;
  }
  return true;
}

function buildManifest(
  byId: Map<string, ManuscriptRef[]>,
  refs: FileRef[]
): ManifestEntry[] {
  const filenameByKey = new Map(refs.map((r) => [r.key, r.filename]));
  const ids = [...byId.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  return ids.map((id) => ({
    id,
    files: (byId.get(id) ?? []).map((m) => ({
      filename: filenameByKey.get(m.key) ?? path.basename(m.key),
      key: m.key,
    })),
  }));
}

function writeManifest(entries: ManifestEntry[]): void {
  const content =
    dump(
      { entries },
      {
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
      }
    ) + "\n";
  fs.writeFileSync(ORIGINAL_MANIFEST_PATH, content, "utf-8");
}

function applyToCatalogText(
  raw: string,
  byId: Map<string, ManuscriptRef[]>
): {
  text: string;
  updated: number;
  unchanged: number;
  cleared: number;
} {
  const lines = raw.split("\n");
  const header: string[] = [];
  const entries: { id: string; lines: string[] }[] = [];
  let current: { id: string; lines: string[] } | null = null;
  let pastHeader = false;

  for (const line of lines) {
    const idMatch = line.match(/^\s+-\s+id:\s*(.+)$/);
    if (idMatch) {
      pastHeader = true;
      if (current) entries.push(current);
      current = { id: idMatch[1]!.trim(), lines: [line] };
    } else if (!pastHeader) {
      header.push(line);
    } else if (current) {
      current.lines.push(line);
    } else {
      header.push(line);
    }
  }
  if (current) entries.push(current);

  let updated = 0;
  let unchanged = 0;
  let cleared = 0;

  const outEntries = entries.map((entry) => {
    const id = String(entry.id);
    const idNorm = id.toLowerCase();
    const wanted = byId.get(idNorm) ?? byId.get(id);
    const stripped = stripManuscriptsBlock(entry.lines);
    const hadManuscripts = stripped.length !== entry.lines.length;

    if (wanted && wanted.length > 0) {
      const existing = extractManuscriptKeys(entry.lines);
      if (keysEqual(existing, wanted)) {
        unchanged++;
        return entry.lines;
      }
      updated++;
      return [...stripped, ...manuscriptsBlockLines(wanted)];
    }

    if (hadManuscripts) {
      // No local/report keys for this id — remove stale manuscripts
      cleared++;
      return stripped;
    }
    return entry.lines;
  });

  // Preserve final newline behavior of source
  const body = outEntries.flatMap((e) => e);
  let text = [...header, ...body].join("\n");
  if (raw.endsWith("\n") && !text.endsWith("\n")) text += "\n";
  return { text, updated, unchanged, cleared };
}

function extractManuscriptKeys(entryLines: string[]): ManuscriptRef[] | undefined {
  const keys: ManuscriptRef[] = [];
  let inBlock = false;
  for (const line of entryLines) {
    if (/^\s{4}manuscripts:\s*$/.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      const m = line.match(/^\s{6}-\s+key:\s*(.+)$/);
      if (m) {
        keys.push({ key: m[1]!.trim().replace(/^["']|["']$/g, "") });
        continue;
      }
      if (line.trim() === "") continue;
      break;
    }
  }
  return keys.length > 0 ? keys : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (hasFlag(args, "--help", "-h")) {
    printHelp();
    return;
  }

  const write = hasFlag(args, "--write");
  const fromReport = flagValue(args, "--from-report");
  const dirArg = flagValue(args, "--dir");
  const dir = dirArg
    ? path.isAbsolute(dirArg)
      ? dirArg
      : path.join(REPO_ROOT, dirArg)
    : ORIGINALS_DIR;

  let refs: FileRef[];
  let sourceLabel: string;
  if (fromReport) {
    refs = loadFromReport(fromReport);
    sourceLabel = `report ${fromReport}`;
  } else {
    if (!fs.existsSync(dir)) {
      console.error(`Directory not found: ${dir}`);
      process.exit(1);
    }
    refs = await listLocalPdfs(dir);
    sourceLabel = `local ${dir}`;
  }

  const { byId, unparseable } = groupByLectureId(refs);
  const lectures = loadLectureCatalog();
  const catalogIds = new Set(lectures.map((l) => String(l.id).toLowerCase()));

  const matchedIds: string[] = [];
  const orphanPdfIds: string[] = [];
  let matchedKeyCount = 0;

  for (const [id, keys] of byId) {
    if (catalogIds.has(id)) {
      matchedIds.push(id);
      matchedKeyCount += keys.length;
    } else {
      orphanPdfIds.push(id);
    }
  }
  matchedIds.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  orphanPdfIds.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const catalogWithoutPdf = lectures
    .map((l) => String(l.id))
    .filter((id) => !byId.has(id.toLowerCase()));

  console.log(`Source:              ${sourceLabel}`);
  console.log(`PDF files:           ${refs.length}`);
  console.log(`Parseable id groups: ${byId.size}`);
  console.log(`Unparseable files:   ${unparseable.length}`);
  console.log(`Catalog lectures:    ${lectures.length}`);
  console.log(
    `Matched lectures:    ${matchedIds.length} (${matchedKeyCount} keys)`
  );
  console.log(`Orphan PDF ids:      ${orphanPdfIds.length} (not in catalog)`);
  console.log(`Catalog without PDF: ${catalogWithoutPdf.length}`);
  console.log("");

  // Always refresh the long list on disk (too many for the console)
  const withoutPdfSorted = [...catalogWithoutPdf].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  fs.writeFileSync(
    CATALOG_IDS_WITHOUT_ORIGINALS_PATH,
    withoutPdfSorted.join("\n") + (withoutPdfSorted.length ? "\n" : ""),
    "utf-8"
  );
  console.log(
    `Wrote ${withoutPdfSorted.length} catalog ids without PDF → ${CATALOG_IDS_WITHOUT_ORIGINALS_PATH}`
  );
  console.log("");

  if (unparseable.length > 0) {
    console.log(`${colors.yellow}Unparseable filenames (first 10):${colors.reset}`);
    for (const r of unparseable.slice(0, 10)) {
      console.log(`  ${r.filename}`);
    }
    console.log("");
  }
  if (orphanPdfIds.length > 0) {
    console.log(`${colors.yellow}Orphan PDF ids (first 15):${colors.reset}`);
    for (const id of orphanPdfIds.slice(0, 15)) {
      const n = byId.get(id)?.length ?? 0;
      console.log(`  ${id}  (${n} file${n === 1 ? "" : "s"})`);
    }
    if (orphanPdfIds.length > 15) {
      console.log(`  … and ${orphanPdfIds.length - 15} more`);
    }
    console.log("");
  }

  // Only attach keys for ids that exist in the catalog
  const attachable = new Map<string, ManuscriptRef[]>();
  for (const id of matchedIds) {
    attachable.set(id, byId.get(id)!);
  }

  const raw = loadLectureCatalogRaw();
  const { text, updated, unchanged, cleared } = applyToCatalogText(
    raw,
    attachable
  );

  console.log(`SSOT changes:`);
  console.log(`  updated:   ${updated}`);
  console.log(`  unchanged: ${unchanged}`);
  console.log(`  cleared:   ${cleared}`);

  const manifestEntries = buildManifest(attachable, refs);
  console.log(`Manifest entries:    ${manifestEntries.length}`);

  if (!write) {
    console.log(
      `\n${colors.yellow}Dry-run — no files written. Pass --write to update SSOT + manifest.${colors.reset}`
    );
    return;
  }

  writeLectureCatalogRaw(text);
  writeManifest(manifestEntries);
  console.log(`\n${colors.brightGreen}Wrote${colors.reset} ${LECTURE_CATALOG_PATH}`);
  console.log(`${colors.brightGreen}Wrote${colors.reset} ${ORIGINAL_MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
