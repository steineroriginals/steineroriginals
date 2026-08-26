# Plan 003 — Website: catalog browser with manuscript PDF viewer

**Status:** in progress 2026-08-26 (scaffold + browse modes + PDF.js shipped; Pages deploy pending)  
**Depends on:** [002-originals-upload-manuscripts-cloudflare.md](./002-originals-upload-manuscripts-cloudflare.md) (R2 keys in SSOT, `PUBLIC_R2_BASE_URL`, Cloudflare Pages)  
**Supersedes:** 001 §5.2 page list and 002 WP5 “scaffold with download links” — this plan defines the full first-ship UI.

**Goal:** Ship an interactive catalog browser under `src/website/` that lets users find lectures (search / cycles / years / locations) and read the selected original scan PDF in a full-width right pane. Hosted on **Cloudflare Pages**. UI chrome is localized (DE / EN / ES / FR); lecture metadata stays German as in the SSOT.

**Visual reference:** layout sketch (Hilma af Klint–style split pane) — adapt branding, copy, and decorative graphics to **steineroriginals**; keep the burgundy / cream / warm-tan palette from the sketch.

---

## 1. Why this plan

| Today | Target |
|-------|--------|
| `src/website/` empty; 002 only sketched Pages + links | Working SPA: browse → select → view PDF |
| No public UX for manuscripts | Right pane = in-browser PDF at full column width |
| 001 listed many static pages | One composition: header + left browse + right viewer |
| No i18n | UI strings in DE, EN, ES, FR |

---

## 2. Decisions (locked)

| § | Choice | Notes |
|---|--------|-------|
| **2.1 Hosting** | Cloudflare Pages | Same as 002; HTML/JS/CSS only |
| **2.2 Stack** | Vite + TypeScript SPA | Interactive filters + PDF.js; no Astro/Starlight |
| **2.3 Data at build** | Embed compact JSON indexes from SSOT + reference | No Railway API required for v1 |
| **2.4 PDFs** | R2 via `publicUrl(key)`; PDF.js in the right pane | Never ship PDFs through Pages |
| **2.5 Lecture text** | Untranslated | Titles, places, cycle names remain German |
| **2.6 Viewport** | Content width **1024–2048 px** | Centered; below 1024 scroll/min-width; above 2048 capped |
| **2.7 Branding** | steineroriginals assets | Logo, botanical strip, empty-state art — not the sketch’s Hilma branding |

### 2.1 Relation to 002

- Requires `manuscripts[].key` on lectures and a configured `PUBLIC_R2_BASE_URL`.
- Requires R2 CORS allowing the Pages origin (and localhost for dev) so PDF.js can fetch bytes.
- Lectures without `manuscripts` remain selectable; right pane shows an empty / “no scan” state.

### 2.2 Out of scope (v1)

- REST API–backed search (Railway).
- GA book PDFs (`GA_PDF_DIR`).
- User accounts, favorites, heart/counter icons from the sketch.
- Magnifying-glass or numeric counter in the banner (explicitly removed).
- Mobile-first layout below 1024 px (min-width + horizontal scroll is acceptable for v1).

---

## 3. Layout and visual system

### 3.1 Structure

```
┌──────────────────────────────── banner (burgundy) ────────────────────────────────┐
│  [logo] steineroriginals     SUCHE   ZYKLEN   JAHRE   ORTE      [lang]            │
└───────────────────────────────────────────────────────────────────────────────────┘
┌──────────────── left (~45–50%) ────────────────┬────── right (~50–55%) ───────────┐
│  mode-specific chrome (search / filters)       │  PDF viewer (full column width) │
│  result / list rows                            │  (or empty / no-scan state)     │
└────────────────────────────────────────────────┴─────────────────────────────────┘
```

- **Banner:** solid burgundy; logo + wordmark left; four nav items center/right; language switcher far right. No search icon, no heart, no counter.
- **Left:** light cream, optional vertical botanical strip on the far left edge.
- **Right:** warmer tan; PDF fills the pane edge-to-edge (toolbar may sit inside the pane, not as a floating overlay card on the page).
- **Texture:** subtle paper/noise; keep atmosphere, avoid purple/glow/dashboard chrome.

### 3.2 Tokens (approximate — refine from sketch / brand assets)

| Token | Role |
|-------|------|
| `--color-banner` | Burgundy header + primary buttons |
| `--color-left-bg` | Cream left column |
| `--color-right-bg` | Warm tan right column |
| `--color-label` | Muted bronze/gold for small labels |
| `--color-text` | Near-black body / headings |
| `--font-display` / `--font-ui` | Expressive serifs (not Inter/Roboto/system defaults) |

### 3.3 Width

- Root layout: `min-width: 1024px; max-width: 2048px; margin-inline: auto; width: 100%`.
- Two columns: CSS grid/flex; left ≈ 45–50%, right the remainder.
- Height: viewport-filling (`100dvh` minus banner); both columns scroll independently if needed.

---

## 4. Banner modes

Active mode is underlined (as in the sketch). Switching mode resets the left pane chrome but **keeps** the currently selected lecture/PDF until the user picks another row.

| Mode | Nav label (i18n keys) | Left pane behavior |
|------|----------------------|--------------------|
| **search** | `nav.search` — DE *Suche*, EN *Search*, ES *Búsqueda*, FR *Recherche* | Free-text search over date, place, title |
| **cycles** | `nav.cycles` — *Zyklen* / *Cycles* / *Ciclos* / *Cycles* | Filterable list of all cycles from `lecture-catalog-cycles.yaml` |
| **years** | `nav.years` — *Jahre* / *Years* / *Años* / *Années* | Year + month dropdowns → lecture list |
| **locations** | `nav.locations` — *Orte* / *Locations* / *Lugares* / *Lieux* | Location dropdown → lecture list |

Default mode on first load: **search**.

---

## 5. Left pane — mode details

All result rows share one pattern:

```
{datum}    {ort}    {vortragstitel}
```

One lecture per row. Click → select lecture → load PDF in the right pane. Selected row is visually marked.

### 5.1 Suche (Search)

1. Single text field + burgundy search button (magnifying glass **only** here, not in the banner).
2. Query matches against `datum`, `ort`, and `vortragstitel` (case-insensitive substring; normalize umlauts optionally).
3. Hits listed as rows under the field (virtualized if needed — catalog ≈ 5k entries).
4. Empty query → empty list or short hint (no dump of all lectures).

### 5.2 Zyklen (Cycles)

1. Search/filter field above the list (filters **cycle titles**, not lectures).
2. Source: `reference/lecture-catalog-cycles.yaml` (`zyklen[]` with `zyklus`, `titel`, `vorträge`).
3. Show all cycles (filtered); each row: cycle number + title (+ optional lecture count).
4. Selecting a cycle lists that cycle’s lectures from the SSOT (`entry.zyklus` matches). Lecture rows use the shared date/place/title pattern.
5. Drill-down UX: either replace the cycle list with lectures + “back”, or expand inline — prefer **replace with back** for a clean left column.

### 5.3 Jahre (Years)

1. **Year** dropdown: years present in the SSOT within **1888–1924** (derive from `jahr` / parsed `datum`; do not hard-code every year if some are empty — omit empty years or show them disabled).
2. **Month** dropdown: 01–12 (labels localized); optional “all months”.
3. Below: lectures for the selection, sorted by date ascending.
4. Changing year/month refreshes the list; clears selection only if the current lecture is no longer in the list.

### 5.4 Orte (Locations)

1. Dropdown populated from `reference/lecture-catalog-locations.yaml` (whitelist order or A–Z — prefer whitelist order as in the file).
2. Below: lectures with matching `ort`, sorted by date.
3. Only exact `ort` match against the whitelist value (same rule as catalog validation).

---

## 6. Right pane — PDF viewer

1. **Full column width** for the document surface (no inset card / floating square graphic from the sketch).
2. Resolve URL: `PUBLIC_R2_BASE_URL + "/" + manuscripts[i].key` (reuse `publicUrl` pattern from `src/lib/r2.ts`; bake base URL at build time for the browser).
3. **Multiple manuscripts:** if `manuscripts.length > 1`, show a compact file switcher (filename stem or “Scan 1…N”) above the viewer; default to first key (stable sort by `key`, same as 002).
4. **Viewer:** PDF.js (canvas or iframe fallback). Toolbar: prev/next page, page indicator, “open original” link. Mirror Uranos’ progressive enhancement: download link always available if JS/PDF.js fails.
5. **No manuscripts:** empty state with brand-appropriate illustration + short localized message.
6. **No selection:** same empty state, different copy (“Select a lecture…”).

CORS must allow the Pages domain; document this as a 002 prerequisite checklist item when enabling the viewer.

---

## 7. Internationalization

| Locale | Code | Default |
|--------|------|---------|
| German | `de` | Yes (first visit / no preference) |
| English | `en` | |
| Spanish | `es` | |
| French | `fr` | |

**Translated:** banner labels, mode chrome (placeholders, buttons, dropdown labels, empty states, viewer toolbar, language names).

**Not translated:** `vortragstitel`, `ort`, cycle `titel`, `datum` display as stored, GA titles if shown later.

**Mechanism:** lightweight message dictionaries (JSON/TS modules) + `localStorage` locale preference; URL query `?lang=` optional. No need for a heavy i18n framework in v1.

UI copy in message files is written for each locale; code comments and plan docs remain English per `AGENTS.md`.

---

## 8. Data pipeline (build time)

```
rudolf-steiner-ga-lecture-catalog.yaml  ──┐
reference/lecture-catalog-cycles.yaml   ──┼──► build script ──► src/website/public/data/*.json
reference/lecture-catalog-locations.yaml──┘
```

Suggested generated artifacts (compact, browser-friendly):

| File | Contents |
|------|----------|
| `lectures.json` | `{ id, datum, jahr, monat?, ort, vortragstitel, zyklus?, manuscripts: string[] }` |
| `cycles.json` | From cycles YAML (`zyklus`, `titel`, `vorträge`) |
| `locations.json` | Ordered location strings |
| `years.json` | Sorted years with data (optional; can derive client-side) |

Build steps:

1. `tsx` script under `src/scripts/` or `src/website/scripts/` reads SSOT via `src/lib/catalog.ts`.
2. Strip unused fields; keep manuscript **keys** only (URLs composed in the client with baked `PUBLIC_R2_BASE_URL`).
3. Vite build copies/embeds JSON; Cloudflare Pages env injects `PUBLIC_R2_BASE_URL`.

Do **not** load the full YAML in the browser.

---

## 9. Project layout

```
src/website/
├── index.html
├── package.json          # or workspace scripts from repo root
├── vite.config.ts
├── tsconfig.json
├── public/
│   ├── data/             # generated JSON (gitignored or CI-generated)
│   └── assets/           # logo, botanical strip, empty-state art
├── src/
│   ├── main.ts
│   ├── app.ts            # mode state, selection
│   ├── i18n/
│   │   ├── de.ts
│   │   ├── en.ts
│   │   ├── es.ts
│   │   └── fr.ts
│   ├── styles/
│   │   └── tokens.css
│   ├── ui/
│   │   ├── Banner.ts
│   │   ├── SearchPanel.ts
│   │   ├── CyclesPanel.ts
│   │   ├── YearsPanel.ts
│   │   ├── LocationsPanel.ts
│   │   ├── ResultList.ts
│   │   └── PdfViewer.ts
│   └── lib/
│       ├── catalog-index.ts
│       └── pdf-url.ts
└── dist/                 # Cloudflare Pages output
```

Root `package.json` scripts (illustrative):

```json
{
  "build:website-data": "tsx src/website/scripts/build-catalog-index.ts",
  "dev:website": "npm run build:website-data && vite --config src/website/vite.config.ts",
  "build:website": "npm run build:website-data && vite build --config src/website/vite.config.ts"
}
```

---

## 10. Work packages

### WP0 — Prerequisites (002)

- [ ] Pilot manuscripts in R2; `PUBLIC_R2_BASE_URL` known.
- [ ] CORS on the bucket for Pages + `http://localhost:*`.
- [ ] Enough catalog rows with `manuscripts` for manual QA.

### WP1 — Scaffold

- [ ] Vite + TS under `src/website/`.
- [ ] Layout shell: banner + split columns + width constraints + tokens.
- [ ] Placeholder brand assets (logo mark, botanical strip, empty-state graphic).
- [ ] Language switcher wired to message dictionaries.

### WP2 — Catalog index build

- [ ] Script emits `lectures.json`, `cycles.json`, `locations.json`.
- [ ] Client loaders + types aligned with `LectureEntry` subset.
- [ ] CI / Pages build runs index generation before Vite.

### WP3 — Browse modes

- [ ] Suche: query + result rows.
- [ ] Zyklen: filter cycles → lectures for selected `zyklus`.
- [ ] Jahre: year + month dropdowns → lectures.
- [ ] Orte: location dropdown → lectures.
- [ ] Shared selection state → right pane.

### WP4 — PDF viewer

- [ ] PDF.js integration; full-width pane.
- [ ] Multi-manuscript switcher.
- [ ] Empty / no-scan states.
- [ ] Verify CORS in production.

### WP5 — Deploy

- [ ] Cloudflare Pages project: build `npm run build:website`, output `src/website/dist` (or agreed path).
- [ ] Env: `PUBLIC_R2_BASE_URL`.
- [ ] Custom domain when ready.
- [ ] Update `README.md` / `AGENTS.md` with website runbook (English).

---

## 11. Success criteria

- [ ] At 1024–2048 px, layout matches the agreed composition (banner + left browse + right PDF).
- [ ] Banner shows only **Suche / Zyklen / Jahre / Orte** (+ logo + language); no lupe/counter in the banner.
- [ ] Each mode behaves as in §5; rows show datum, ort, titel.
- [ ] Selecting a lecture with manuscripts shows the PDF full-width in the right pane.
- [ ] UI chrome switches correctly across DE / EN / ES / FR; lecture text remains German.
- [ ] Site builds statically and deploys on Cloudflare Pages without embedding PDF binaries.

---

## 12. Risks and open points

| Topic | Note |
|-------|------|
| **Index size** | ~5k lectures × short fields ≈ fine as one JSON; virtualize long lists if scroll jank appears |
| **Month parsing** | SSOT `datum` is German-style (`19.01.1901`); parse consistently for Jahr/Monat filters |
| **Cycle gaps** | Some `zyklus` values in SSOT may lack a row in cycles YAML — show lectures under “unknown cycle” or hide; decide in WP3 |
| **Copyright** | Public R2 + in-browser viewing needs the same access policy sign-off as 002 |
| **Fonts** | Self-host licensed/open serifs; avoid default system stacks |

---

## 13. Suggested phase order

| Phase | Work | Outcome |
|-------|------|---------|
| **A** | WP0 + WP1 | Visual shell + i18n chrome |
| **B** | WP2 + WP3 | All four browse modes working against local/generated JSON |
| **C** | WP4 | PDF.js right pane against R2 |
| **D** | WP5 | Cloudflare Pages live |

---

## 14. Non-goals

- Translating lecture or cycle titles.
- Serving GA edition PDFs.
- Banner utilities from the sketch (search icon, heart, counters).
- Replacing the SSOT or introducing a runtime database for v1.
