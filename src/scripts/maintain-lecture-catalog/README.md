# Lecture catalog maintenance scripts

Scripts for maintaining `rudolf-steiner-ga-lecture-catalog.yaml` and `reference/ga-catalog.yaml`.

## Prerequisites

- Node.js 20+
- `pdftotext` (poppler)
- GA PDFs in `GA_PDF_DIR` (default: `~/GA 180dpi/GA-Acrobat/GA`)

## Scripts

### `add_ga_from_ga_pdf_toc.ts`

Adds missing GA numbers to the SSOT by parsing GA PDF tables of contents.

1. Scans GA PDFs from band 051
2. Finds the page titled “Inhalt” or “Inhaltsverzeichnis” (first 15 pages)
3. Extracts lecture dates from the TOC
4. Matches dates to catalog entries
5. Without `--write`: preview only
6. With `--write`: writes GA numbers to the SSOT

**Options:** `--write`, `--range` (e.g. `51,52,53`, `332-337`, `68a-68c`)

**Blacklist:** UUIDs in `add_ga_from_ga_pdf_toc.blacklist` are skipped.

### `suggest_ga_for_missing.ts`

Suggests GA volumes for entries without a `ga` field by scanning the first 60 pages of GA PDFs.

**Options:** `--range`

### `add_missing_ga_to_catalog.ts`

Adds missing GA bands to `reference/ga-catalog.yaml` by extracting book titles from the first 5 pages of local GA PDFs.

**Options:** `--write`, `--range`

### `extract_ga_reference_yaml.ts`

Builds `reference/ga/GAXX.yaml` lecture indexes from GA PDF tables of contents (same schema as GA277).

**Options:** `--write`, `--range`, `--missing` (all local PDFs without YAML, excludes `*o.pdf` and `*t.pdf`), `--list-missing`

### `sync_ga_reference_from_catalog.ts`

Compares / syncs `reference/ga/GAXX.yaml` with SSOT entries (both directions).

**Catalog → YAML**
- Lectures with `ga: X` missing from the reference file
- Entry-count mismatch (catalog vs YAML must be equal; reports per-date imbalances)
- YAML duplicates on the same date (more rows than the catalog) are trimmed and written immediately (not reported as problems)
- `--write`: add / enrich / remove artifacts
- `--rebuild --write`: replace YAML entries from catalog

**YAML → Catalog**
- YAML dates in catalog but without `ga: X` (or only other GA)
- YAML dates absent from the catalog entirely
- `--write-catalog`: set or append `ga: X` on matching SSOT entries

**Options:** `--ga`, `--range`, `--write`, `--write-catalog`, `--rebuild`, `--keep-artifacts`

## Usage

```bash
npm run maintain:ga-suggest
npm run maintain:ga-toc
npm run maintain:ga-toc -- --write --range 68a-68c
npm run maintain:ga-catalog
npm run maintain:ga-catalog -- --write
npm run maintain:ga-reference -- --write --range 68a-68d
npm run maintain:ga-sync -- --ga 52
npm run maintain:ga-sync -- --ga 52 --write
npm run maintain:ga-sync -- --ga 52 --write-catalog
npm run maintain:ga-sync -- --range 51-55 --write --write-catalog
```

## Environment

- `GA_PDF_DIR` — path to local GA PDF directory
