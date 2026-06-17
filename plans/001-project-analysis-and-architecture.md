# steineroriginals — Project Analysis and Architecture Plan

**Status:** 2026-06-17 (rev. 5)  
**Goal:** Standalone project for reference works and original documents around Rudolf Steiner's lectures.

**Project language:** All project artifacts — documentation, code comments, commit messages, API responses, UI copy — are written in **English**. Lecture metadata in the SSOT keeps its established German field names and content (`datum`, `ort`, `vortragstitel`, etc.).

---

## Center of the project: `rudolf-steiner-ga-lecture-catalog.yaml`

**This file is the Single Source of Truth (SSOT).** Everything else in the project — website, REST API, ragkeep, original manifest, statistics, exports — **builds on it** or enriches it. Nothing replaces it.

```
                    ┌──────────────────────────────────────────┐
                    │  rudolf-steiner-ga-lecture-catalog       │
                    │              .yaml                        │
                    │         5,164 lectures                    │
                    │         (repo root, versioned)            │
                    └─────────────────┬────────────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
         ▼                            ▼                            ▼
   ┌───────────┐              ┌───────────────┐            ┌─────────────┐
   │  Website  │              │   REST API    │            │   ragkeep   │
   │  (Static) │              │  (Railway)    │            │  (sibling)  │
   └───────────┘              └───────────────┘            └─────────────┘
         │                            │
         │         also reads         │
         ▼                            ▼
   reference/ga-catalog.yaml   reference/original-manifest.yaml
   (GA titles, derived)        (id → B2 files, generated)
         ▲                            ▲
         │                            │
   local GA PDFs               originals/ → B2 + Cloudflare
   (GA_PDF_DIR, never in repo)
```

**Rules:**
- Maintenance scripts **write** to the SSOT (with `--write`, review required).
- API and website **read** the SSOT — never a copy or a diverging database.
- `reference/` holds **derived** files; the SSOT remains the sole source of truth for lecture data.
- `ragkeep/lectures/rudolf-steiner-ga-lecture-catalog.yaml` is a **copy** — replace with sync long term, do not maintain in parallel.

---

## Decided

| Topic | Decision |
|-------|----------|
| **SSOT** | `rudolf-steiner-ga-lecture-catalog.yaml` at repo root — **central, immovable** |
| **GA PDFs** | **Always local** (`GA_PDF_DIR`). Never in any repo, LFS, or cloud storage. |
| **GA catalog** | `reference/ga-catalog.yaml` — **with maintenance scripts** from local GA PDFs |
| **Cycles** | `zyklus`/`reihe` in the SSOT; separate `zyklus.yaml` read-only reference only, not maintained |
| **Storage budget** | **~100 GB** for original scans (currently ~53 GB) |
| **Git** | SSOT + reference + code — **no LFS** for PDFs |
| **API hosting** | **Railway** (€5 credit) |
| **Original PDFs** | **Backblaze B2 + Cloudflare** (decided) |
| **Project language** | **English** for all project writing (see above) |
| **Scripts** | **TypeScript** only (`.ts`), run via `tsx` — no `.mjs`, no Python |

---

## 1. Current state

### 1.1 Directory structure

```
steineroriginals/
├── rudolf-steiner-ga-lecture-catalog.yaml   # ★ SSOT — 5,164 lectures, ~1.3 MB
├── reference/
│   ├── ga-catalog.yaml                           # GA volume → title (from local PDFs)
│   ├── lecture-catalog-cycles.yaml     # optional, read-only reference
│   └── lecture-catalog-locations.yaml  # location whitelist for validation
├── originals/                                    # 9,017 PDF scans, ~53 GB (local → B2)
├── plans/
└── src/
    ├── website/
    ├── restapi/
    └── scripts/
```

- **No git repository yet** — initialization pending.
- The YAML file is identical to the copy in `ragkeep/lectures/` (as of 2026-06-16).

### 1.2 GA PDFs (local only, never in repo)

| Source | Path | Size |
|--------|------|------|
| GA-Acrobat (180 dpi) | `/Users/michael/GA 180dpi/GA-Acrobat/GA` | 424 PDFs, ~11 GB |

Used only by **local maintenance scripts** (`GA_PDF_DIR`). Neither website nor API serves GA PDFs — the SSOT only stores the GA number as metadata.

### 1.3 Sibling project ragkeep

`ragkeep` consumes the lecture list for RAG, HTML, and agents.  
**Boundary:** `steineroriginals` = SSOT + original scans. `ragkeep` = processed texts.

---

## 2. Data model

### 2.1 SSOT: `rudolf-steiner-ga-lecture-catalog.yaml`

**Path:** repo root (not under `reference/`, not under `lectures/`).  
**5,164 entries** under `lectures:`. Fields:

| Field | Count | Meaning |
|-------|-------|---------|
| `id` | 5,164 | Primary key `YYYYMMDD` + optional `a/b/c` |
| `uuid` | 5,164 | Stable UUID |
| `datum`, `jahr`, `ort` | 5,164 | Date and location (German content) |
| `vortragstitel` | 5,163 | Title |
| `ga` | 4,820 | GA volume(s), comma-separated — references `ga-catalog.yaml` |
| `anlass` | 1,995 | Context / occasion |
| `reihe` | 1,786 | Series title (text) |
| `zyklus` | 449 | Cycle number |
| `ragkeep` | 40 | Reference to ragkeep HTML (remove long term) |

**What the SSOT is:** the authoritative list of all Rudolf Steiner lectures with metadata.  
**What the SSOT is not:** not a file index for PDFs, not a GA book-title catalog — those live in `reference/`.

**Consumers (all read this one file):**

| Consumer | Use |
|----------|-----|
| REST API | Full catalog, filters, search |
| Website | Lists, detail pages, statistics |
| `validate_catalog.ts` | Integrity checks |
| `yaml_to_csv.ts` | Export |
| `maintain-lecture-catalog/*` scripts | Write GA assignments |
| ragkeep (via sync) | RAG, HTML, agent mapping |

### 2.2 Reference files (derived, secondary to SSOT)

| File | Origin | Relationship to SSOT |
|------|--------|---------------------|
| `reference/ga-catalog.yaml` | local `GA_PDF_DIR` + maintenance script | provides **titles** for `ga` numbers in the SSOT |
| `reference/original-manifest.yaml` | generated from `originals/` + SSOT ids | links SSOT `id` → B2 files |
| `reference/lecture-catalog-locations.yaml` | curated | validates `ort` field in the SSOT |
| `reference/lecture-catalog-cycles.yaml` | read-only reference | optional, not maintained |
| `reference/liste.pdf` | external | cross-check SSOT via `verify_ga_against_liste.ts` |

### 2.3 `reference/ga-catalog.yaml`

Catalog of all GA volumes with book titles. Proposed format (from `ga_list.txt` logic):

```yaml
bands:
  - ga: "95"
    title: "Vor_dem_Tore_der_Theosophie"
    pdf: "GA 095.pdf"          # filename in GA_PDF_DIR, not in repo
  - ga: "68a"
    title: "…"
```

**Maintenance:** `add_missing_ga_to_catalog.ts` (ported) reads local GA PDFs, extracts title from page 3, writes missing volumes to `ga-catalog.yaml`.  
**Use:** API `/ga`, website GA overview, lecture detail enrichment (`ga` → title).

### 2.4 Original documents

- **9,017 PDFs**, **~53 GB** (growth to ~100 GB planned)
- Naming pattern: `{id}_{pages}pp_{source}_….pdf`
- **3,770 lecture id prefixes**, 2,301 with multiple files
- Link via generated `reference/original-manifest.yaml`, not hand-edited in the SSOT

---

## 3. Storage strategy

### 3.1 Layer split

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub (git, no LFS)                                       │
│  YAML (~1.3 MB) + reference/ + src/ + scripts               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Cloudflare (CDN) → Backblaze B2 (~53 GB → 100 GB)          │
│  originals/*.pdf — served via Cloudflare (free egress)        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Local (not versioned)                                      │
│  GA PDFs under GA_PDF_DIR — maintenance scripts only        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Railway (€5 credit)                                        │
│  REST API (Hono) — metadata, links to B2                    │
│  Optional: static website as second service                   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 B2 vs S3 vs Railway volume — cost comparison

For **~53 GB** originals (scaling to 100 GB in parentheses):

| | **Backblaze B2** | **AWS S3** (eu-central) | **Railway volume** |
|--|------------------|-------------------------|---------------------|
| **Storage/month** | ~$0.37 (100 GB: ~$0.70) | ~$1.22 (100 GB: ~$2.30) | ~$13 (100 GB: ~$25) |
| **Egress** | 3× storage free/month; then $0.01/GB; **free via Cloudflare** | $0.09/GB — expensive for PDF downloads | included, but storage kills budget |
| **API calls** | free (no PUT fees) | $0.005/1000 PUT | — |
| **Fits in €5?** | yes, with headroom | storage yes, egress risky | no |

**Conclusion: Backblaze B2** — standard for archive PDFs. S3 is 3–4× more expensive for storage and much more expensive for downloads. Railway volumes are unsuitable for 100 GB; the €5 credit fits a lean API container (~$3–5/month), not bulk storage.

**Estimated B2 costs:**
- 53 GB storage: **~$0.37/month**
- 100 GB storage: **~$0.70/month**
- 10 GB download/month: within 3× free allowance → **$0**
- With Cloudflare in front: egress effectively **always $0**

First 10 GB on B2 are free — enough for testing.

### 3.3 B2 + Cloudflare setup (decided)

1. B2 bucket `steineroriginals` (EU region if available)
2. Upload: `rclone sync originals/ b2:steineroriginals/originals/`
3. **Cloudflare** as CDN in front of B2 (Backblaze partner → **free egress**, caching)
4. Custom domain e.g. `originals.steineroriginals.example` → Cloudflare → B2
5. API/website link via `ORIGINALS_BASE_URL` (Cloudflare URL)
6. Railway env vars: `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET`, `ORIGINALS_BASE_URL`, `CLOUDFLARE_ZONE` (if needed)

### 3.4 `.gitignore`

```
originals/          # never commit — B2 only
.env
.env.local
node_modules/
dist/
```

No `.gitattributes` for LFS needed.

---

## 4. Script inventory from ragkeep

All scripts are **TypeScript** (`.ts`). Port from ragkeep `.mjs`/`.py` sources; do not add new JavaScript or Python files.

### 4.0 TypeScript layout

```
src/
├── lib/                              # shared by scripts, API, website
│   ├── paths.ts                      # REPO_ROOT, YAML_PATH, GA_CATALOG_PATH, …
│   ├── types.ts                      # LectureEntry, GaBand, …
│   └── catalog.ts                    # load SSOT, build indexes
├── scripts/
│   ├── maintain-lecture-catalog/
│   ├── validate_catalog.ts
│   └── …
├── restapi/
└── website/
```

- **Runtime:** [tsx](https://github.com/privatenumber/tsx) — no separate compile step for scripts/CLI.
- **API / website:** own `tsconfig` extends root; Vite/tsc as needed.
- **Shared code:** catalog loader and path constants live in `src/lib/` — scripts must not duplicate YAML parsing logic.

**`package.json` scripts** use `tsx`:

```json
{
  "scripts": {
    "validate": "tsx src/scripts/validate_catalog.ts",
    "stats": "tsx src/scripts/stats_catalog.ts"
  }
}
```

**System dependency:** `pdftotext` (poppler) for GA PDF maintenance — invoked from TypeScript via `child_process`.

### 4.1 Port — SSOT and reference maintenance

| Script | Writes to | Function |
|--------|-----------|----------|
| `maintain-lecture-catalog/add_ga_from_ga_pdf_toc.ts` | **SSOT** | GA from local PDF TOC → `ga` field |
| `maintain-lecture-catalog/suggest_ga_for_missing.ts` | — (preview) | GA suggestions for entries without `ga` |
| `maintain-lecture-catalog/add_missing_ga_to_catalog.ts` | **`ga-catalog.yaml`** | Missing GA volumes from local PDFs |
| `maintain-lecture-catalog/README.md` + `.blacklist` | — | docs |
| `verify_ga_against_liste.ts` | — (report) | SSOT vs `liste.pdf` |
| `sort_lectures_by_id.ts` | **SSOT** | sort by `id` |
| `yaml_to_csv.ts` | — (export) | SSOT → CSV |

**Path constants** (`src/lib/paths.ts`):

```typescript
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const LECTURE_CATALOG_PATH = path.join(REPO_ROOT, "rudolf-steiner-ga-lecture-catalog.yaml");
export const GA_CATALOG_PATH = path.join(REPO_ROOT, "reference", "ga-catalog.yaml");
export const GA_PDF_DIR =
  process.env.GA_PDF_DIR ?? path.join(process.env.HOME ?? "", "GA 180dpi", "GA-Acrobat", "GA");
```

`add_missing_ga_to_catalog.ts`: retarget from `ragprep/config/ga_list.txt` to `reference/ga-catalog.yaml`.

### 4.2 Do not port

| Script | Reason |
|--------|--------|
| `extract_zyklen_to_yaml.ts` | cycles in SSOT, separate YAML not maintained |
| `add_zyklus_from_handbuch.ts` | same |
| `build_static_site.ts`, RAG scripts, `sync_sources.ts` | ragkeep-specific |

### 4.3 Extract logic

| Module | Use |
|--------|-----|
| `static-site/lectures.ts` (ragkeep) | port to `src/lib/catalog.ts` — shared catalog loader |

### 4.4 New scripts

| Script | Purpose |
|--------|---------|
| `link_originals.ts` | build `reference/original-manifest.yaml` from filenames |
| `validate_catalog.ts` | schema, duplicate ids, location whitelist |
| `stats_catalog.ts` | coverage statistics |
| `upload_originals_to_b2.ts` | `rclone` / `@aws-sdk/client-s3` wrapper for B2 sync |
| `sync_to_ragkeep.ts` | optional: mirror YAML to ragkeep |

---

## 5. Planned components

### 5.1 REST API (`src/restapi/` on Railway)

**Stack:** TypeScript + Hono, Node 20.

**Endpoints:**

```
GET  /health
GET  /lectures              ?ort=&jahr=&ga=&zyklus=&q=&limit=&offset=   ← from SSOT
GET  /lectures/:id                                                      ← from SSOT
GET  /lectures/:id/originals   → manifest + Cloudflare/B2 URLs
GET  /ga                       → ga-catalog.yaml
GET  /ga/:band                 → volume metadata + lectures (SSOT filter)
GET  /locations
GET  /stats                    → SSOT coverage
```

On startup: load **SSOT** + `ga-catalog.yaml` + `original-manifest.yaml`, in-memory index. No database.

GA PDFs are **not** served — only metadata from `ga-catalog.yaml`. Original scans via Cloudflare/B2.

### 5.2 Website (`src/website/`)

**Stack:** Vite + TypeScript, static site.

**Pages (all from SSOT + reference):**
- Home / statistics (SSOT coverage)
- Lecture list (filterable: location, year, GA, cycle)
- Lecture detail (SSOT fields + GA title from catalog + original links via Cloudflare)
- GA overview (`ga-catalog.yaml` + lecture counts from SSOT)
- Optional: location overview

**Hosting:** GitHub Pages. Build reads **SSOT** + `ga-catalog.yaml`, produces JSON index.

### 5.3 Scripts (`src/scripts/`)

```json
{
  "scripts": {
    "validate": "tsx src/scripts/validate_catalog.ts",
    "stats": "tsx src/scripts/stats_catalog.ts",
    "sort": "tsx src/scripts/sort_lectures_by_id.ts",
    "export:csv": "tsx src/scripts/yaml_to_csv.ts",
    "link:originals": "tsx src/scripts/link_originals.ts",
    "upload:originals": "tsx src/scripts/upload_originals_to_b2.ts",
    "maintain:ga-suggest": "tsx src/scripts/maintain-lecture-catalog/suggest_ga_for_missing.ts",
    "maintain:ga-toc": "tsx src/scripts/maintain-lecture-catalog/add_ga_from_ga_pdf_toc.ts",
    "maintain:ga-catalog": "tsx src/scripts/maintain-lecture-catalog/add_missing_ga_to_catalog.ts"
  }
}
```

---

## 6. Target repository structure

```
steineroriginals/
├── .gitignore                  # originals/, .env
├── package.json
├── tsconfig.json
├── README.md
├── AGENTS.md                   # project conventions (English)
│
├── rudolf-steiner-ga-lecture-catalog.yaml   # ★ SSOT
│
├── reference/
│   ├── ga-catalog.yaml
│   ├── lecture-catalog-locations.yaml
│   ├── lecture-catalog-cycles.yaml   # optional
│   ├── original-manifest.yaml                  # generated
│   └── liste.pdf                               # optional
│
├── originals/                  # .gitignore — mirror on B2
│
├── src/
│   ├── lib/                    # shared types, paths, catalog loader
│   ├── scripts/                # maintenance CLI (.ts)
│   ├── restapi/                → deploy Railway
│   └── website/                → deploy GitHub Pages or Railway
│
└── plans/
```

**Not in repo:** `ga/`, GA PDFs, `.env` with B2 keys.

---

## 7. Integration with ragkeep

```
steineroriginals (GitHub)                    ragkeep
├── rudolf-steiner-ga-lecture-catalog    ──sync──▶  lectures/ (copy)
│   .yaml  ★ SSOT
├── reference/ga-catalog.yaml
├── Cloudflare → B2: originals     ◀──API──  (optional)
└── Railway: API (reads SSOT)
```

Sync via submodule, CI, or manual. Remove `ragkeep` field from YAML long term.

---

## 8. Tech stack

| Layer | Technology |
|-------|------------|
| SSOT | `rudolf-steiner-ga-lecture-catalog.yaml` |
| GA catalog | `reference/ga-catalog.yaml` |
| Original storage | **B2 + Cloudflare** |
| Maintenance scripts | **TypeScript** + `tsx`, `js-yaml`, `pdftotext` (local + `GA_PDF_DIR`) |
| Shared library | `src/lib/` — catalog loader, types, paths |
| API | Hono on **Railway** |
| Website | Vite static → GitHub Pages |
| CI | GitHub Actions (validate, stats) |
| Git | GitHub, **no LFS** |
| Language | **English** (project artifacts) |

---

## 9. Phased plan

### Phase 0 — Foundation
- [ ] Git repo, `.gitignore`, `package.json`, `tsconfig.json`, `README.md`, `AGENTS.md`
- [ ] `src/lib/` — paths, types, catalog loader
- [ ] Port maintenance scripts to TypeScript (incl. `ga-catalog.yaml` maintenance)
- [ ] Generate initial `reference/ga-catalog.yaml` from local GA PDFs
- [ ] `validate_catalog.ts` + `stats_catalog.ts`

### Phase 1 — Originals
- [ ] `link_originals.ts` → manifest
- [ ] Create B2 bucket, `upload_originals_to_b2.ts`
- [ ] Set up Cloudflare in front of B2

### Phase 2 — REST API (Railway)
- [ ] Catalog loader, endpoints
- [ ] Cloudflare URL generation
- [ ] Deploy on Railway, env vars

### Phase 3 — Website
- [ ] Static site with search/filter
- [ ] Deploy GitHub Pages

### Phase 4 — ragkeep integration
- [ ] YAML sync, eliminate duplicate maintenance

---

## 10. Open items

| Question | Recommendation |
|----------|----------------|
| B2 access | **Cloudflare CDN** in front of B2 (decided) |
| `ragkeep` field? | Remove; link in ragkeep by `id` |
| `reference/zyklus.yaml`? | Keep as-is, do not maintain |
| Copyright on originals? | Clarify before public B2 access |

---

## 11. Risks

1. **Railway €5 limit:** API fits; watch credit on traffic spikes.
2. **B2 is cheap** — main risk is choosing S3 or Railway volume by mistake.
3. **Duplicate ragkeep maintenance:** YAML drift until Phase 4.
4. **Original matching:** 9k files, 3.7k ids — document heuristics in manifest.

---

## 12. Next step

1. Initialize git repo (without `originals/`).
2. B2 account + test bucket (10 GB free).
3. Port Phase 0 scripts.

---

*Rev. 5: all scripts TypeScript (`tsx`); shared `src/lib/`; English file names.*
