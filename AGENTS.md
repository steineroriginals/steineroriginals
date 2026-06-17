# steineroriginals — Agent and contributor conventions

## Language

**All project writing is in English:**

- Documentation (`README.md`, `plans/`, comments in code)
- Script names, npm scripts, and CLI help text
- API route names, error messages, and OpenAPI descriptions
- Website UI copy (labels, buttons, empty states)
- Git commit messages and pull request descriptions
- New reference file names (e.g. `ga-catalog.yaml`, `original-manifest.yaml`)

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
| Original scan PDFs | Backblaze B2 + Cloudflare |
| GA PDFs | Local only (`GA_PDF_DIR`) — never in git or cloud |

## Key paths

```
rudolf-steiner-ga-lecture-catalog.yaml       # SSOT
reference/lecture-catalog-locations.yaml     # location whitelist
reference/lecture-catalog-cycles.yaml        # cycle reference (read-only)
reference/ga-catalog.yaml                    # GA volume titles (derived)
reference/original-manifest.yaml             # id → B2 files (generated)
src/lib/                                     # shared TypeScript (paths, catalog, types)
src/scripts/                                 # maintenance CLI (.ts, via tsx)
src/restapi/                                 # REST API (Railway)
src/website/                                 # static site (GitHub Pages)
```
