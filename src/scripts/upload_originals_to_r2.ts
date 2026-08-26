#!/usr/bin/env node
/**
 * Upload local originals/*.pdf to Cloudflare R2 (skip-if-exists by default).
 *
 * Usage:
 *   yarn upload:originals --limit 20
 *   yarn upload:originals --dry-run
 *   yarn upload:originals --force
 *   yarn upload:originals --concurrency 4 --dir originals
 *
 * Requires .env (see .env.example). Pilot: --limit 20, then open publicUrl(key).
 */
import fs from "node:fs";
import path from "node:path";
import { colors, flagValue, hasFlag } from "../lib/cli.js";
import { loadDotEnv } from "../lib/env.js";
import { ORIGINALS_DIR, REPO_ROOT } from "../lib/paths.js";
import {
  getPublicR2BaseUrl,
  getR2BucketName,
  originalsObjectKey,
  parseOriginalsLectureId,
  publicUrl,
  uploadPdf,
} from "../lib/r2.js";

type RowStatus = "uploaded" | "skipped-exists" | "failed" | "dry-run";

interface UploadRow {
  filename: string;
  key: string;
  lectureId: string | null;
  status: RowStatus;
  error?: string;
  url?: string;
}

async function listPdfFiles(dir: string): Promise<string[]> {
  const names = await fs.promises.readdir(dir);
  return names
    .filter((n) => n.toLowerCase().endsWith(".pdf") && !n.startsWith("."))
    .sort((a, b) => a.localeCompare(b));
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function printHelp(): void {
  console.log(`Upload originals PDFs to Cloudflare R2.

Options:
  --dir <path>         Local directory (default: originals/)
  --limit <n>          Upload only the first n files (sorted by name)
  --concurrency <n>    Parallel uploads (default: 4)
  --force              Overwrite existing R2 objects
  --dry-run            List keys/URLs without uploading
  --help               Show this help

Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
     R2_BUCKET_NAME, PUBLIC_R2_BASE_URL  (see .env.example)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (hasFlag(args, "--help", "-h")) {
    printHelp();
    return;
  }

  loadDotEnv();

  const dryRun = hasFlag(args, "--dry-run");
  const force = hasFlag(args, "--force");
  const dirArg = flagValue(args, "--dir");
  const dir = dirArg
    ? path.isAbsolute(dirArg)
      ? dirArg
      : path.join(REPO_ROOT, dirArg)
    : ORIGINALS_DIR;
  const limitRaw = flagValue(args, "--limit");
  const limit = limitRaw ? Number(limitRaw) : null;
  const concurrencyRaw = flagValue(args, "--concurrency");
  const concurrency = concurrencyRaw ? Number(concurrencyRaw) : 4;

  if (limit != null && (!Number.isFinite(limit) || limit < 1)) {
    console.error("--limit must be a positive number");
    process.exit(1);
  }
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    console.error("--concurrency must be a positive number");
    process.exit(1);
  }

  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  // Validate env early (PUBLIC_R2_BASE_URL needed for report URLs)
  const bucket = getR2BucketName();
  const baseUrl = getPublicR2BaseUrl();
  if (!dryRun) {
    // Touches credential check
    const { getR2Client } = await import("../lib/r2.js");
    getR2Client();
  }

  let files = await listPdfFiles(dir);
  const totalOnDisk = files.length;
  if (limit != null) files = files.slice(0, limit);

  console.log(`Dir:          ${dir}`);
  console.log(`PDFs on disk: ${totalOnDisk}`);
  console.log(`To process:   ${files.length}${limit != null ? ` (--limit ${limit})` : ""}`);
  console.log(`Bucket:       ${bucket}`);
  console.log(`Public base:  ${baseUrl}`);
  console.log(`Concurrency:  ${concurrency}`);
  console.log(`Mode:         ${dryRun ? "dry-run" : force ? "upload --force" : "upload (skip-if-exists)"}`);
  console.log("");

  const started = Date.now();
  let done = 0;

  const rows = await mapPool(files, dryRun ? 1 : concurrency, async (filename) => {
    const key = originalsObjectKey(filename);
    const lectureId = parseOriginalsLectureId(filename);
    const filePath = path.join(dir, filename);
    const row: UploadRow = {
      filename,
      key,
      lectureId,
      status: "dry-run",
      url: publicUrl(key),
    };

    try {
      if (dryRun) {
        row.status = "dry-run";
      } else {
        const result = await uploadPdf({ key, filePath, force });
        row.status = result.status;
      }
    } catch (err) {
      row.status = "failed";
      row.error = err instanceof Error ? err.message : String(err);
    }

    done++;
    const tag =
      row.status === "uploaded"
        ? `${colors.brightGreen}uploaded${colors.reset}`
        : row.status === "skipped-exists"
          ? `${colors.gray}skipped${colors.reset}`
          : row.status === "failed"
            ? `${colors.red}failed${colors.reset}`
            : `${colors.yellow}dry-run${colors.reset}`;
    console.log(`[${done}/${files.length}] ${tag}  ${filename}`);
    if (row.error) console.error(`    ${colors.red}${row.error}${colors.reset}`);
    return row;
  });

  const counts = {
    uploaded: rows.filter((r) => r.status === "uploaded").length,
    skipped: rows.filter((r) => r.status === "skipped-exists").length,
    failed: rows.filter((r) => r.status === "failed").length,
    dryRun: rows.filter((r) => r.status === "dry-run").length,
  };

  const reportDir = path.join(REPO_ROOT, "reference", "upload-reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportDir, `originals-r2-${stamp}.json`);
  const report = {
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    dir,
    bucket,
    publicBaseUrl: baseUrl,
    force,
    dryRun,
    concurrency,
    limit,
    totalOnDisk,
    processed: rows.length,
    counts,
    rows,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("");
  console.log(
    `Done in ${((Date.now() - started) / 1000).toFixed(1)}s — ` +
      `uploaded=${counts.uploaded} skipped=${counts.skipped} ` +
      `failed=${counts.failed} dry-run=${counts.dryRun}`
  );
  console.log(`Report: ${reportPath}`);

  if (rows.length > 0 && !dryRun && counts.uploaded + counts.skipped > 0) {
    const sample = rows.find((r) => r.status !== "failed");
    if (sample?.url) {
      console.log(`\nSpot-check URL:\n  ${sample.url}`);
    }
  }

  if (counts.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
