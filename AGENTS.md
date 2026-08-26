# steineroriginals — Agent and contributor conventions

## Language

**All project writing is in English:**

- Documentation (`README.md`, `plans/`, comments in code)
- Script names, npm scripts, and CLI help text
- API route names, error messages, and OpenAPI descriptions
- Website UI copy (labels, buttons, empty states)
- Git commit messages and pull request descriptions
- New reference file names (e.g. `original-manifest.yaml`)

**All code is TypeScript:**

- Maintenance scripts: `src/scripts/**/*.ts`, run with `tsx`
- Shared library: `src/lib/` (paths, types, catalog loader)
- API and website: TypeScript under `src/restapi/`, `src/website/`
- No `.mjs`, `.js` CLI scripts, or Python in this repo

**Exception — lecture data in the SSOT:**  
`rudolf-steiner-ga-lecture-catalog.yaml` keeps its established schema and German content (`datum`, `ort`, `vortragstitel`, `anlass`, `reihe`, etc.). Do not translate lecture titles or metadata unless explicitly requested.

## Single source of truth

`rudolf-steiner-ga-lecture-catalog.yaml` at the **repo root** is the SSOT for all lectures.  
Everything else (API, website, ragkeep sync, manifests) reads from or derives from this file.

## Storage boundaries

| Content | Location |
|---------|----------|
| SSOT + reference YAML + code | GitHub (no LFS) |
| Original scan PDFs | Cloudflare R2 (`manuscripts[].key` in SSOT; see plan 002) |
| Website | Cloudflare Pages (`src/website/`; see plan 003) |
| GA PDFs | Local only (`GA_PDF_DIR`) — never in git or cloud |

## Key paths

```
rudolf-steiner-ga-lecture-catalog.yaml       # SSOT
reference/lecture-catalog-locations.yaml     # location whitelist
reference/lecture-catalog-cycles.yaml        # cycle titles (read-only)
reference/original-manifest.yaml             # id → R2 keys (generated audit twin)
src/lib/                                     # shared TypeScript (paths, catalog, types)
src/scripts/                                 # maintenance CLI (.ts, via tsx)
src/restapi/                                 # REST API (Railway)
src/website/                                 # Vite SPA → Cloudflare Pages (plan 003)
```

## Website

- `yarn build:website-data` — emit `src/website/public/data/*.json` from SSOT (gitignored)
- `yarn dev:website` / `yarn build:website` — needs `PUBLIC_R2_BASE_URL` in `.env`
- UI chrome: DE / EN / ES / FR; lecture metadata stays German
