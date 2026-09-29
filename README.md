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

Cloudflare Pages settings:

| Setting | Value |
|---------|--------|
| Build command | `yarn build:website` |
| Build output directory | `src/website/dist` |
| Root directory | *(empty)* |
| `NODE_VERSION` | `22` |
| `YARN_VERSION` | `4.9.1` |
| `PUBLIC_R2_BASE_URL` | your R2 public base URL (no trailing slash) |

The repo uses Yarn 4 (`packageManager` + `.yarn/releases`). Do **not** set `YARN_VERSION=1.x`.

### Maintenance mode (take site offline)

Static placeholder at `src/website/maintenance/` — deploy to production with Wrangler (requires `wrangler login` once):

```bash
yarn deploy:website-maintenance
```

Restore the normal site: Cloudflare dashboard → **Workers & Pages** → **steineroriginals** → **Deployments** → previous production deployment → **Rollback to this deployment** (or push to `main` to trigger a fresh build).

## Layout

```
rudolf-steiner-ga-lecture-catalog.yaml   # SSOT
reference/                               # locations, cycles, manifests
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
