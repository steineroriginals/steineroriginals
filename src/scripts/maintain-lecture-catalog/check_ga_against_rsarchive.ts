#!/usr/bin/env node
/**
 * Compare rsarchive.org GA lecture lists against the SSOT catalog.
 *
 * For each GA number, fetches https://rsarchive.org/Lectures/GAxxx/,
 * extracts lecture dates from the volume table, and checks whether
 * matching entries exist in rudolf-steiner-ga-lecture-catalog.yaml.
 */

import { colors, flagValue, hasFlag } from "../../lib/cli.js";
import { loadLectureCatalog } from "../../lib/catalog.js";
import type { LectureEntry } from "../../lib/types.js";

const DEFAULT_GAS = [
  "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63",
  "64", "65", "66", "67", "68a", "68b", "68c", "68d", "69a", "69b", "69c", "69d",
  "69e", "70a", "70b", "71a", "71b", "72", "73", "73a", "74", "75", "76", "77a",
  "77b", "78", "79", "80a", "80b", "80c", "81", "82", "83", "84", "85", "87",
  "88", "89", "90a", "90b", "90c", "91", "92", "93", "93a", "94", "95", "96",
  "97", "98", "99", "100", "101", "102", "103", "104", "104a", "105", "106",
  "107", "108", "109", "110", "111", "112", "113", "114", "115", "116", "117",
  "117a", "118", "119", "120", "121", "122", "123", "124", "125", "126", "127",
  "128", "129", "130", "131", "132", "133", "134", "135", "136", "137", "138",
  "139", "140", "141", "142", "143", "144", "145", "146", "147", "148", "149",
  "150", "151", "152", "153", "154", "155", "156", "157", "157a", "158", "159",
  "161", "162", "163", "164", "165", "166", "167", "168", "169", "170", "171",
  "172", "173a", "173b", "173c", "174a", "174b", "175", "176", "177", "178",
  "179", "180", "181", "182", "183", "184", "185", "185a", "186", "187", "188",
  "189", "190", "191", "192", "193", "194", "195", "196", "197", "198", "199",
  "200", "201", "202", "203", "204", "205", "206", "207", "208", "209", "210",
  "211", "212", "213", "214", "215", "216", "217", "217a", "218", "219", "220",
  "221", "222", "223", "224", "225", "226", "227", "228", "229", "230", "231",
  "232", "233", "233a", "234", "235", "236", "237", "238", "239", "240", "243",
  "244", "245", "246", "250", "251", "252", "253", "254", "255b", "257", "258",
  "259", "260", "260a", "261", "262", "263", "264", "265", "265a", "266I",
  "266II", "266III", "267", "268", "269", "270", "271", "272", "273", "274",
  "275", "276", "277a", "277b", "277c", "277d", "278", "279", "280", "281",
  "282", "283", "284", "286", "287", "288", "289", "291", "291a", "292", "293",
  "294", "295", "296", "297", "297a", "298", "299", "300a", "300b", "300c",
  "301", "302", "302a", "303", "304", "304a", "305", "306", "307", "308", "309",
  "310", "311", "312", "313", "314", "315", "316", "317", "318", "319", "320",
  "321", "322", "323", "324", "324a", "325", "326", "327", "328", "329", "330",
  "331", "331a", "332a", "332b", "333", "334", "335", "336", "337a", "337b",
  "338", "339", "340", "341", "342", "343", "344", "345", "346", "347", "348",
  "349", "350", "351", "352", "353", "354",
] as const;

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

const HELP = `Compare rsarchive.org GA lecture lists against the SSOT catalog.

For each GA, fetches https://rsarchive.org/Lectures/GAxxx/, extracts lecture
dates from the volume table, and checks whether matching catalog entries exist
(matched by date + GA field).

Usage:
  tsx src/scripts/maintain-lecture-catalog/check_ga_against_rsarchive.ts [options]

Options:
  --help, -h       Show this help
  --ga LIST        Comma-separated GA numbers (default: built-in full list)
  --delay MS       Delay between HTTP requests (default: 400)
  --missing-only   Only print lectures missing from the catalog
  --json           Emit machine-readable JSON summary
  --verbose, -v    Print matched lectures as well
`;

interface ArchiveLecture {
  no: string;
  title: string;
  bookTitle: string;
  dateRaw: string;
  /** YYYYMMDD when parseable */
  dateId: string | null;
  city: string;
  href: string | null;
}

interface GaCheckResult {
  ga: string;
  url: string;
  ok: boolean;
  error?: string;
  archiveCount: number;
  catalogCount: number;
  matched: ArchiveLecture[];
  missing: ArchiveLecture[];
  unparseable: ArchiveLecture[];
  /** Catalog entries tagged with this GA whose date is not on the archive page */
  catalogOnly: LectureEntry[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Normalize user/list GA token for catalog matching: 266I → 266/1, 68A → 68a */
function normalizeGaForCatalog(ga: string): string {
  const trimmed = ga.trim();
  const roman = trimmed.match(/^(\d+)(I{1,3}|IV|V)$/i);
  if (roman) {
    const map: Record<string, string> = {
      i: "1",
      ii: "2",
      iii: "3",
      iv: "4",
      v: "5",
    };
    return `${roman[1]}/${map[roman[2]!.toLowerCase()] ?? roman[2]}`;
  }
  return trimmed.toLowerCase();
}

/** Build rsarchive path segment: 51 → GA051, 68a → GA068a, 266I → GA266I */
function rsarchiveGaPath(ga: string): string {
  const m = ga.trim().match(/^(\d+)([a-zA-Z]*)$/);
  if (!m) return `GA${ga}`;
  const num = m[1]!.padStart(3, "0");
  const suffix = m[2] ?? "";
  // Roman-numeral volumes keep uppercase I/II/III; letter volumes are lowercase.
  const isRoman = /^(I{1,3}|IV|V)$/i.test(suffix) && suffix.length > 0;
  const suffixOut = isRoman ? suffix.toUpperCase() : suffix.toLowerCase();
  return `GA${num}${suffixOut}`;
}

function parseArchiveDate(raw: string, href: string | null): string | null {
  const cleaned = raw.replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();

  const full = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (full) {
    const month = MONTHS[full[2]!.toLowerCase()];
    if (month) {
      return `${full[3]}${month}${full[1]!.padStart(2, "0")}`;
    }
  }

  // Incomplete cell dates ("- - Apr 1905", "1904", "?") — fall back to href only.
  if (href) {
    const fromHref = href.match(/(?:^|\/)(\d{8})[a-zA-Z]?\d*\.html/i);
    if (fromHref) return fromHref[1]!;
  }

  return null;
}

function datumToDateId(datum: string | undefined): string | null {
  if (!datum) return null;
  const m = datum.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}${m[2]!.padStart(2, "0")}${m[1]!.padStart(2, "0")}`;
}

function entryDateId(entry: LectureEntry): string | null {
  const fromDatum = datumToDateId(entry.datum);
  if (fromDatum) return fromDatum;
  const id = String(entry.id ?? "");
  const m = id.match(/^(\d{8})/);
  return m ? m[1]! : null;
}

function parseGaTable(html: string): ArchiveLecture[] {
  if (/Page Not Found/i.test(html) && !/<table[^>]*class="gaTable"/i.test(html)) {
    return [];
  }

  const tableMatch = html.match(
    /<table[^>]*class="gaTable"[^>]*>([\s\S]*?)<\/table>/i
  );
  if (!tableMatch) return [];

  const body = tableMatch[1]!;
  const cellRe =
    /<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/gi;

  const lectures: ArchiveLecture[] = [];
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(body)) !== null) {
    const noHtml = match[1]!;
    const titleHtml = match[2]!;
    const bookHtml = match[3]!;
    const dateHtml = match[4]!;
    const cityHtml = match[5]!;

    const no = stripTags(noHtml).replace(/\.$/, "").trim();
    if (!/^\d+$/.test(no)) continue;

    const hrefMatch = titleHtml.match(/href="([^"]+)"/i);
    const href = hrefMatch ? hrefMatch[1]! : null;
    const title = stripTags(titleHtml).trim();
    const bookTitle = stripTags(bookHtml).trim();
    const dateRaw = stripTags(dateHtml).trim();
    const city = stripTags(cityHtml).trim();

    lectures.push({
      no,
      title,
      bookTitle,
      dateRaw,
      dateId: parseArchiveDate(dateRaw, href),
      city,
      href,
    });
  }

  return lectures;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchGaPage(ga: string): Promise<{ url: string; html: string }> {
  const pathSeg = rsarchiveGaPath(ga);
  const url = `https://rsarchive.org/Lectures/${pathSeg}/`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "steineroriginals-catalog-check/1.0 (local maintenance)",
      Accept: "text/html",
    },
    redirect: "follow",
  });
  const html = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  if (/Page Not Found/i.test(html) && !/<table[^>]*class="gaTable"/i.test(html)) {
    throw new Error(`Page not found: ${url}`);
  }
  return { url, html };
}

function indexCatalogByGa(lectures: LectureEntry[]): Map<string, LectureEntry[]> {
  const map = new Map<string, LectureEntry[]>();
  for (const entry of lectures) {
    const raw = entry.ga != null ? String(entry.ga).trim() : "";
    if (!raw) continue;
    for (const part of raw.split(",")) {
      const g = part.trim().toLowerCase();
      if (!g) continue;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(entry);
    }
  }
  return map;
}

function checkGa(
  ga: string,
  archiveLectures: ArchiveLecture[],
  catalogByGa: Map<string, LectureEntry[]>,
  url: string
): GaCheckResult {
  const catalogGa = normalizeGaForCatalog(ga);
  const catalogEntries = catalogByGa.get(catalogGa.toLowerCase()) ?? [];
  const catalogByDate = new Map<string, LectureEntry[]>();
  for (const entry of catalogEntries) {
    const dateId = entryDateId(entry);
    if (!dateId) continue;
    if (!catalogByDate.has(dateId)) catalogByDate.set(dateId, []);
    catalogByDate.get(dateId)!.push(entry);
  }

  const matched: ArchiveLecture[] = [];
  const missing: ArchiveLecture[] = [];
  const unparseable: ArchiveLecture[] = [];
  const usedCatalogIds = new Set<string>();

  for (const lecture of archiveLectures) {
    if (!lecture.dateId) {
      unparseable.push(lecture);
      continue;
    }
    const hits = catalogByDate.get(lecture.dateId) ?? [];
    if (hits.length > 0) {
      matched.push(lecture);
      for (const h of hits) usedCatalogIds.add(String(h.id));
    } else {
      missing.push(lecture);
    }
  }

  const catalogOnly = catalogEntries.filter(
    (e) => !usedCatalogIds.has(String(e.id))
  );

  return {
    ga,
    url,
    ok: true,
    archiveCount: archiveLectures.length,
    catalogCount: catalogEntries.length,
    matched,
    missing,
    unparseable,
    catalogOnly,
  };
}

function parseGaList(raw: string | null): string[] {
  if (!raw) return [...DEFAULT_GAS];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function printResult(
  result: GaCheckResult,
  opts: { missingOnly: boolean; verbose: boolean }
): void {
  const { c, reset } = {
    c: colors,
    reset: colors.reset,
  };

  if (!result.ok) {
    console.log(`${c.red}GA ${result.ga}${reset}  ${result.error}`);
    return;
  }

  const missN = result.missing.length;
  const unN = result.unparseable.length;
  const statusColor =
    missN > 0 || unN > 0 ? c.yellow : c.green;

  if (opts.missingOnly && missN === 0 && unN === 0) return;

  console.log(
    `${statusColor}GA ${result.ga}${reset}  archive=${result.archiveCount}  catalog=${result.catalogCount}  ` +
      `matched=${result.matched.length}  missing=${missN}  unparseable=${unN}  catalog-only=${result.catalogOnly.length}`
  );
  console.log(`  ${c.gray}${result.url}${reset}`);

  for (const m of result.missing) {
    console.log(
      `  ${c.red}missing${reset}  #${m.no}  ${m.dateRaw || "?"}  ${m.city}  ${m.title}`
    );
  }
  for (const u of result.unparseable) {
    console.log(
      `  ${c.orange}unparseable date${reset}  #${u.no}  ${u.dateRaw || "?"}  ${u.city}  ${u.title}`
    );
  }
  if (opts.verbose) {
    for (const m of result.matched) {
      console.log(
        `  ${c.green}matched${reset}  #${m.no}  ${m.dateRaw}  ${m.city}  ${m.title}`
      );
    }
    for (const e of result.catalogOnly) {
      console.log(
        `  ${c.gray}catalog-only${reset}  id=${e.id}  ${e.datum ?? "?"}  ${e.ort ?? "?"}  ${e.vortragstitel ?? ""}`
      );
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (hasFlag(args, "--help", "-h")) {
    console.log(HELP);
    process.exit(0);
  }

  const gas = parseGaList(flagValue(args, "--ga"));
  const delayMs = Number(flagValue(args, "--delay") ?? "400");
  const missingOnly = hasFlag(args, "--missing-only");
  const asJson = hasFlag(args, "--json");
  const verbose = hasFlag(args, "--verbose", "-v");

  const catalog = loadLectureCatalog();
  const catalogByGa = indexCatalogByGa(catalog);

  const results: GaCheckResult[] = [];

  for (let i = 0; i < gas.length; i++) {
    const ga = gas[i]!;
    if (i > 0 && delayMs > 0) await sleep(delayMs);

    process.stderr.write(
      `${colors.gray}[${i + 1}/${gas.length}] GA ${ga}…${colors.reset}\n`
    );

    try {
      const { url, html } = await fetchGaPage(ga);
      const archiveLectures = parseGaTable(html);
      results.push(checkGa(ga, archiveLectures, catalogByGa, url));
    } catch (err) {
      results.push({
        ga,
        url: `https://rsarchive.org/Lectures/${rsarchiveGaPath(ga)}/`,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        archiveCount: 0,
        catalogCount: (catalogByGa.get(normalizeGaForCatalog(ga).toLowerCase()) ?? [])
          .length,
        matched: [],
        missing: [],
        unparseable: [],
        catalogOnly: [],
      });
    }
  }

  if (asJson) {
    const payload = results.map((r) => ({
      ga: r.ga,
      url: r.url,
      ok: r.ok,
      error: r.error,
      archiveCount: r.archiveCount,
      catalogCount: r.catalogCount,
      matchedCount: r.matched.length,
      missingCount: r.missing.length,
      unparseableCount: r.unparseable.length,
      catalogOnlyCount: r.catalogOnly.length,
      missing: r.missing.map((m) => ({
        no: m.no,
        date: m.dateRaw,
        dateId: m.dateId,
        city: m.city,
        title: m.title,
        href: m.href,
      })),
      unparseable: r.unparseable.map((m) => ({
        no: m.no,
        date: m.dateRaw,
        city: m.city,
        title: m.title,
        href: m.href,
      })),
    }));
    console.log(JSON.stringify(payload, null, 2));
  } else {
    for (const r of results) {
      printResult(r, { missingOnly, verbose });
    }

    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    const missingTotal = ok.reduce((n, r) => n + r.missing.length, 0);
    const matchedTotal = ok.reduce((n, r) => n + r.matched.length, 0);
    const unparseableTotal = ok.reduce((n, r) => n + r.unparseable.length, 0);
    const gasWithMissing = ok.filter((r) => r.missing.length > 0).length;

    console.log("");
    console.log(
      `${colors.brightGreen}Summary${colors.reset}: ${ok.length} GA pages ok, ${failed.length} failed, ` +
        `${matchedTotal} matched, ${missingTotal} missing, ${unparseableTotal} unparseable dates, ` +
        `${gasWithMissing} GAs with gaps`
    );
  }

  const hasGaps =
    results.some((r) => !r.ok) ||
    results.some((r) => r.missing.length > 0 || r.unparseable.length > 0);
  process.exit(hasGaps ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
