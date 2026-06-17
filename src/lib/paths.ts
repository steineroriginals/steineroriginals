import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (steineroriginals/) */
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** SSOT — lecture catalog */
export const LECTURE_CATALOG_PATH = path.join(
  REPO_ROOT,
  "rudolf-steiner-ga-lecture-catalog.yaml"
);

export const LECTURE_CATALOG_LOCATIONS_PATH = path.join(
  REPO_ROOT,
  "reference",
  "lecture-catalog-locations.yaml"
);

export const LECTURE_CATALOG_CYCLES_PATH = path.join(
  REPO_ROOT,
  "reference",
  "lecture-catalog-cycles.yaml"
);

export const GA_CATALOG_PATH = path.join(REPO_ROOT, "reference", "ga-catalog.yaml");

export const ORIGINAL_MANIFEST_PATH = path.join(
  REPO_ROOT,
  "reference",
  "original-manifest.yaml"
);

export const ORIGINALS_DIR = path.join(REPO_ROOT, "originals");

/** Local GA PDFs — never in repo */
export const GA_PDF_DIR =
  process.env.GA_PDF_DIR ??
  path.join(process.env.HOME ?? "", "GA 180dpi", "GA-Acrobat", "GA");
