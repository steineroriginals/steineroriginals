# Plan 002 — Upload originals, `manuscripts` in SSOT, Cloudflare Pages

**Status:** decided 2026-08-25 · Phase A in progress (lib + upload CLI landed; bucket/credentials pending)  
**Depends on:** [001-project-analysis-and-architecture.md](./001-project-analysis-and-architecture.md)  
**Sibling reference:** Uranos Archiv (`uranosarchiv`) — working R2 upload + public PDF URLs + static site deploy

**Goal:** Upload local `originals/*.pdf` to Cloudflare R2, attach each file’s **object key** to the matching lecture in `rudolf-steiner-ga-lecture-catalog.yaml` under `manuscripts`, and host the project website on **Cloudflare Pages**. Consumers compose public URLs as `PUBLIC_R2_BASE_URL + "/" + key`.

---

## 1. Why this plan

| Today | Target |
|-------|--------|
| ~9,014 PDFs (~53 GB) only local under `originals/` | Same files in Cloudflare R2 |
| Catalog has no scan links | Each lecture may have `manuscripts: [{ key: … }, …]` |
| `src/website/` empty; 001 said GitHub Pages | Static site on **Cloudflare Pages** |
| 001 decided **B2 + Cloudflare CDN** + generated `original-manifest.yaml` | **Cloudflare R2** + keys in the **SSOT** |

Uranos already proves the upload path: S3-compatible client → R2 bucket → `PUBLIC_R2_BASE_URL` + object key → browser-openable PDF. Steineroriginals reuses that pattern in **TypeScript** (`tsx`), not Uranos’ `.mjs` scripts.

---

## 2. Decisions (locked)

| § | Choice | Notes |
|---|--------|-------|
| **2.1 Storage** | **A — Cloudflare R2** | Separate bucket from Uranos; paid storage once over 10 GB free tier (~$0.80/mo at 53 GB); egress free |
| **2.2 SSOT field** | **`manuscripts` with `key`** | Portable if public hostname changes; site/API compose URLs |
| **2.3 Website** | **Cloudflare Pages** | Same account as R2; PDFs never go through Pages |

Do **not** put PDFs in git / LFS / Cloudflare Pages artifacts.

### 2.1 Object storage — Cloudflare R2

Rejected for now: Backblaze B2 + CDN (001), hybrid R2/B2.

### 2.2 `manuscripts` schema (SSOT)

001 kept file links only in generated `reference/original-manifest.yaml`. **Revised:** optional field on each lecture:

```yaml
  - id: 19011019
    uuid: …
    datum: 19.01.1901
    # …
    manuscripts:
      - key: originals/19011019_13pp_DSC04579_.pdf
      - key: originals/19011019_14pp_L1200522_.pdf
```

**Semantics:**
- Each item is an object with required `key` (R2 object key, no leading slash).
- Public URL at read time: `${PUBLIC_R2_BASE_URL}/${key}` (helper `publicUrl(key)` in `src/lib/r2.ts`).
- Absent or empty array = no linked original (yet).
- Multiple files per `id` are normal (~2,336 of ~3,668 filename-ids have >1 PDF; max observed 17).
- Sorted stably by `key` so diffs stay calm.
- Linker **full-replaces** `manuscripts` for an id from the current filename→key mapping (idempotent).

Keep generated `reference/original-manifest.yaml` as an audit twin (filename, size, key, optional resolved url) — not the primary consumer API.

Update when implementing: `AGENTS.md`, `README.md`, `src/lib/types.ts`, validate script.

### 2.3 Website — Cloudflare Pages

Pages serves **HTML/JS/CSS only**. PDF bytes always come from R2 via composed URLs. Build env must include `PUBLIC_R2_BASE_URL` (or bake it at build time).

---

## 3. Current inventory (facts)

| Metric | Value |
|--------|-------|
| Local PDFs | ~9,014 under `originals/` (~53 GB) |
| Filename pattern | `{id}_{pages}pp_{source}_….pdf` — e.g. `19011019_13pp_DSC04579_.pdf` |
| Unique id prefixes in filenames | ~3,668 (all parseable with `^\d{8}[a-g]?_`) |
| Catalog lectures | ~5,303 |
| Multi-file ids | ~2,336 |
| Website code | `src/website/` empty |
| Upload scripts | Not implemented yet |
| Uranos R2 usage | ~2.9 GB / 10 GB free — different bucket/account scale |

Expect: many catalog lectures **without** local PDFs; some PDFs whose id is missing from the catalog (already tracked in `reference/originals-ids-*.txt`). Upload can still store orphans; SSOT write only when `id` matches a lecture.

---

## 4. Architecture

```
originals/*.pdf  (local, gitignored)
        │
        ▼
┌───────────────────────────────────────┐
│  upload_originals_to_r2.ts            │
│  - parse id from filename             │
│  - PutObject to R2 (skip-if-exists)   │
│  - report CSV / JSON                  │
└───────────────────┬───────────────────┘
                    │ key = originals/<filename>
                    ▼
┌───────────────────────────────────────┐
│  link_manuscripts_to_catalog.ts       │
│  - group keys by lecture id           │
│  - write manuscripts: [{ key }, …]    │
│  - dry-run / --write                  │
└───────────────────┬───────────────────┘
                    ▼
rudolf-steiner-ga-lecture-catalog.yaml   ★ SSOT
        │
        │  publicUrl(key) = PUBLIC_R2_BASE_URL + "/" + key
        ├──────────────► REST API (Railway)
        └──────────────► Website (Cloudflare Pages)
```

**R2 key layout:**

```
originals/{filename}.pdf
# e.g. originals/19011019_13pp_DSC04579_.pdf
```

Stable, mirrors local names. Optional later: `originals/{id}/{filename}`.

---

## 5. Schema and types

### 5.1 SSOT field

```yaml
manuscripts:
  - key: originals/<filename>.pdf
```

### 5.2 TypeScript (`src/lib/types.ts`)

```ts
export interface ManuscriptRef {
  key: string;
}

export interface LectureEntry {
  // …existing fields…
  manuscripts?: ManuscriptRef[];
}
```

### 5.3 Validation (`validate_catalog.ts`)

- Error if `manuscripts` item lacks `key` or `key` is empty.
- Warn if `key` does not start with `originals/` or does not end with `.pdf`.
- Error on duplicate `key` within one lecture.
- Stats: lectures with / without manuscripts; total key count.

---

## 6. Implementation work packages

### WP0 — Cloudflare account setup

1. Create R2 bucket `steineroriginals-pdfs` (**separate from** Uranos’ `uranosarchiv-pdfs`).
2. Enable **public access** via R2 public bucket URL **or** custom domain (e.g. `originals.steineroriginals.org`).
3. Create S3 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`).
4. Set **CORS** in the Cloudflare dashboard (Uranos lesson: S3 `PutBucketCors` often `AccessDenied` for limited tokens) so a future PDF.js viewer can `fetch` PDFs.
5. `.env.example` (never commit `.env`):

```bash
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=steineroriginals-pdfs
PUBLIC_R2_BASE_URL=https://pub-xxxxxxxx.r2.dev
```

6. Confirm billing / storage plan once uploads exceed 10 GB.

### WP1 — Shared R2 library (TypeScript)

Port Uranos `scripts/lib/r2-upload.mjs` → `src/lib/r2.ts`:

- `getR2Client()`, `objectExists(key)`, `uploadPdf({ key, filePath, force })`
- `publicUrl(key)` → `${PUBLIC_R2_BASE_URL}/${key}`
- Load `.env` (e.g. `dotenv` or small `loadDotEnv`)

### WP2 — Upload CLI

`src/scripts/upload_originals_to_r2.ts`

```text
yarn tsx src/scripts/upload_originals_to_r2.ts [--dir originals] [--limit N] [--force] [--dry-run]
```

- Scan `originals/**/*.pdf` (flat today).
- Key = `originals/<basename>`.
- Default: **skip if object exists** (resumable; ~53 GB will take hours).
- Concurrency cap (e.g. 4–8).
- Write report: `reference/upload-reports/originals-r2-<date>.json`.
- npm script: `"upload:originals": "tsx src/scripts/upload_originals_to_r2.ts"`

Pilot first: `--limit 20`, verify `publicUrl(key)` in browser, then full run.

### WP3 — Link manuscripts into SSOT

`src/scripts/link_manuscripts_to_catalog.ts`

```text
yarn tsx src/scripts/link_manuscripts_to_catalog.ts [--write] [--from-local] [--from-report path]
```

1. Parse each PDF basename → lecture `id` (`^(\d{8}[a-g]?)_`).
2. Build `id → [{ key }, …]` (sorted by key).
3. For each catalog lecture with matching id, set `manuscripts`.
4. Report orphans: PDF id not in catalog; catalog ids with zero PDFs.
5. `--write` updates the SSOT (prefer surgical edits or controlled dump to limit YAML noise).

Also regenerate `reference/original-manifest.yaml` for audits:

```yaml
entries:
  - id: "19011019"
    files:
      - filename: 19011019_13pp_DSC04579_.pdf
        key: originals/19011019_13pp_DSC04579_.pdf
```

### WP4 — Docs / conventions

- Update `AGENTS.md`: Original scans → **Cloudflare R2**; SSOT field `manuscripts` with `key`; website → **Cloudflare Pages**.
- Update `README.md` Storage + scripts.
- Supersede 001 Phase 1 (B2 / GitHub Pages) with this plan’s decisions.
- Document copyright / access policy before making the bucket world-readable.

### WP5 — Cloudflare Pages for the website

1. Scaffold `src/website/` (Vite or Astro — catalog browser; lighter Vite+TS may suffice).
2. Build reads SSOT (+ `ga-catalog.yaml`); lecture detail resolves `manuscripts[].key` via `PUBLIC_R2_BASE_URL` into download links (PDF.js later — CORS required).
3. Connect repo to **Cloudflare Pages**:
   - Build: e.g. `npm run build:website`
   - Output: e.g. `src/website/dist` or `dist/website`
   - Env: **`PUBLIC_R2_BASE_URL` required** (keys alone are not clickable)
4. Custom domain when ready.
5. Optional: validate catalog in GitHub Actions; Pages builds from `main` or `wrangler pages deploy`.

**Do not** upload the 53 GB originals through Pages.

### WP6 — API (optional follow-on)

Railway API returns `manuscripts` keys from the SSOT and may also expose resolved `url` using `PUBLIC_R2_BASE_URL` (env on Railway). No upload credentials needed at runtime for public reads.

---

## 7. Mapping rules (filename → catalog)

| Case | Action |
|------|--------|
| Filename id = catalog `id` | Attach `{ key }` entries to that lecture |
| Filename id after recent renames (bare→lettered) | Re-run linker after ID convention fixes; rename local files if they still use old ids |
| PDF id not in catalog | List in report; do **not** invent catalog rows in the upload script |
| Catalog id with no PDF | Leave `manuscripts` absent |
| Soft / ambiguous matches | Manual; see `reference/originals-ids-soft-matches.txt` |

**Filename drift:** Prefer **rename files to match SSOT ids** once, then upload.

---

## 8. Operational runbook (happy path)

1. Configure `.env` (WP0).
2. Pilot upload 20 files; open one `publicUrl(key)` in the browser.
3. Full `upload:originals` (overnight OK; resumable).
4. Dry-run `link_manuscripts_to_catalog.ts`; review orphan counts.
5. `--write` → commit SSOT (+ manifest/report summaries if useful).
6. Scaffold website; set `PUBLIC_R2_BASE_URL` on Cloudflare Pages; verify lecture page links.
7. Set CORS before enabling in-browser PDF viewing.

---

## 9. Risks and remaining open questions

| Topic | Note |
|-------|------|
| **R2 free tier** | 10 GB ≪ 53 GB — enable pay-as-you-go before bulk upload |
| **Copyright / access** | Confirm originals may be public before public bucket |
| **SSOT size** | ~9k keys × ~60 chars ≈ well under 1 MB extra — fine |
| **YAML rewrite noise** | Full dump may reshuffle ordering — decide dump options or surgical updates |
| **Private bucket + signed URLs** | Only if public R2 is not allowed |
| **Uranos vs steineroriginals buckets** | Keep **separate** buckets and credentials |

---

## 10. Success criteria

- [ ] All intended local PDFs uploaded to R2 (skip-if-exists clean re-run).
- [ ] Spot-check: `PUBLIC_R2_BASE_URL` + `manuscripts[].key` opens the correct PDF.
- [ ] SSOT lectures that have scans expose a non-empty `manuscripts` array of `{ key }` objects.
- [ ] `validate_catalog` / stats report manuscript coverage.
- [ ] Website on Cloudflare Pages lists/links manuscripts (keys resolved with base URL).
- [ ] `AGENTS.md` / README reflect R2 + key-based `manuscripts` + Cloudflare Pages.

---

## 11. Suggested phase order

| Phase | Work | Outcome |
|-------|------|---------|
| **A** | WP0 + WP1 + pilot WP2 | Credentials + 20 PDFs live |
| **B** | Full WP2 + WP3 + WP4 | Catalog has `manuscripts`; docs updated |
| **C** | WP5 | Cloudflare Pages site with resolved links |
| **D** | WP6 + PDF.js viewer | API + optional in-browser reading |

---

## 12. Relation to Uranos (reuse checklist)

| Uranos | Steineroriginals |
|--------|------------------|
| `scripts/lib/r2-upload.mjs` | `src/lib/r2.ts` |
| `.env` R2_* + `PUBLIC_R2_BASE_URL` | same names |
| Dashboard CORS | same |
| Content stores `r2Key`; site builds URL | SSOT stores `manuscripts[].key`; site/API builds URL |
| GitHub Pages | **Cloudflare Pages** |
| One `.md` per document | One catalog lecture; many PDFs → one `manuscripts` array |

---

## 13. Non-goals (this plan)

- Uploading GA book PDFs (remain local `GA_PDF_DIR` only).
- Merging multi-file scans into one PDF per lecture — optional later; first ship 1:1 file→key.
- Replacing the lecture catalog with a Markdown CMS.
- Putting binaries in Cloudflare Pages or git.
- Storing full HTTPS URLs in the SSOT (keys only; §2.2).
