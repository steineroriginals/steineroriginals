# steineroriginals

Single source of truth for Rudolf Steiner’s GA lecture catalog, reference data, and original manuscript scans — with API, website, and maintenance tooling.

**Repository:** [github.com/steineroriginals/steineroriginals](https://github.com/steineroriginals/steineroriginals)

## SSOT

`rudolf-steiner-ga-lecture-catalog.yaml` at the repo root — 5,164 lectures. Everything else builds on this file.

## Quick start

```bash
npm install

# Validate catalog integrity
npm run validate

# Coverage statistics (JSON)
npm run stats

# Export CSV
npm run export:csv
```

## Maintenance scripts

Requires **Node.js 20+**, **pdftotext** (poppler), and local GA PDFs at `GA_PDF_DIR` (default: `~/GA 180dpi/GA-Acrobat/GA`).

```bash
# Preview GA catalog entries from local PDFs
npm run maintain:ga-catalog

# Write missing bands to reference/ga-catalog.yaml
npm run maintain:ga-catalog -- --write

# Suggest GA volumes for lectures without ga
npm run maintain:ga-suggest

# Add GA numbers from PDF table of contents (preview)
npm run maintain:ga-toc

# Apply TOC matches to SSOT
npm run maintain:ga-toc -- --write
```

See [`src/scripts/maintain-lecture-catalog/README.md`](src/scripts/maintain-lecture-catalog/README.md) for details.

## Website

Interactive catalog browser (`src/website/`) — search / cycles / years / locations, manuscript PDF viewer (PDF.js via R2). See `plans/003-website-catalog-browser.md`.

```bash
# Requires PUBLIC_R2_BASE_URL in .env (and R2 CORS for localhost / Pages)
yarn dev:website          # http://localhost:5173
yarn build:website        # → src/website/dist (Cloudflare Pages output)
```

Cloudflare Pages: build command `yarn build:website`, output directory `src/website/dist`, env `PUBLIC_R2_BASE_URL`.

## Layout

```
rudolf-steiner-ga-lecture-catalog.yaml   # SSOT
reference/                               # derived data (GA catalog, locations, cycles)
src/lib/                                 # shared TypeScript
src/scripts/                             # maintenance CLI
src/restapi/                             # REST API (planned)
src/website/                             # Vite SPA → Cloudflare Pages
originals/                               # scan PDFs (local only → R2, not in git)
```

## Storage

| Content | Where |
|---------|--------|
| YAML + code | GitHub |
| Original scans | Cloudflare R2 (upload: `yarn upload:originals`; see `plans/002-…`) |
| Website | Cloudflare Pages (`yarn build:website`) |
| GA PDFs | Local only (`GA_PDF_DIR`) |

Copy `.env.example` → `.env` and fill R2 credentials before uploading.

## Conventions

See [`AGENTS.md`](AGENTS.md). Project artifacts are in **English**; lecture metadata in the SSOT keeps German field names and content.
