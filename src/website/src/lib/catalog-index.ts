export interface LectureIndexEntry {
  id: string;
  datum: string;
  jahr: string;
  monat: string;
  ort: string;
  vortragstitel: string;
  zyklus: string;
  ga: string;
  manuscripts: string[];
}

export interface CycleIndexEntry {
  zyklus: string;
  vortraege: number;
}

export interface GaIndexEntry {
  ga: string;
  vortraege: number;
}

export interface CatalogIndex {
  lectures: LectureIndexEntry[];
  gas: GaIndexEntry[];
  cycles: CycleIndexEntry[];
  locations: string[];
  years: string[];
}

function normalizeUmlauts(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss");
}

export function splitGaValues(ga: string): string[] {
  if (!ga.trim()) return [];
  return ga
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function searchLectures(
  lectures: LectureIndexEntry[],
  query: string
): LectureIndexEntry[] {
  const q = normalizeUmlauts(query.trim());
  if (!q) return [];
  return lectures.filter((e) => {
    const hay = normalizeUmlauts(
      `${e.datum} ${e.ort} ${e.vortragstitel} ${e.ga}`
    );
    return hay.includes(q);
  });
}

export function lecturesForGa(
  lectures: LectureIndexEntry[],
  ga: string
): LectureIndexEntry[] {
  const target = ga.trim().toLowerCase();
  return lectures
    .filter((e) => splitGaValues(e.ga).includes(target))
    .sort(compareByDate);
}

export function lecturesForCycle(
  lectures: LectureIndexEntry[],
  zyklus: string
): LectureIndexEntry[] {
  return lectures
    .filter((e) => e.zyklus === zyklus)
    .sort(compareByDate);
}

export function lecturesForYearMonth(
  lectures: LectureIndexEntry[],
  year: string,
  month: string
): LectureIndexEntry[] {
  return lectures
    .filter((e) => {
      if (e.jahr !== year) return false;
      if (month && e.monat !== month) return false;
      return true;
    })
    .sort(compareByDate);
}

export function lecturesForLocation(
  lectures: LectureIndexEntry[],
  ort: string
): LectureIndexEntry[] {
  return lectures.filter((e) => e.ort === ort).sort(compareByDate);
}

export function compareByDate(a: LectureIndexEntry, b: LectureIndexEntry): number {
  return a.id.localeCompare(b.id);
}

export async function loadCatalogIndex(): Promise<CatalogIndex> {
  const [lectures, gas, cycles, locations, years] = await Promise.all([
    fetch("/data/lectures.json").then((r) => {
      if (!r.ok) throw new Error("Failed to load lectures.json");
      return r.json() as Promise<LectureIndexEntry[]>;
    }),
    fetch("/data/gas.json").then((r) => {
      if (!r.ok) throw new Error("Failed to load gas.json");
      return r.json() as Promise<GaIndexEntry[]>;
    }),
    fetch("/data/cycles.json").then((r) => {
      if (!r.ok) throw new Error("Failed to load cycles.json");
      return r.json() as Promise<CycleIndexEntry[]>;
    }),
    fetch("/data/locations.json").then((r) => {
      if (!r.ok) throw new Error("Failed to load locations.json");
      return r.json() as Promise<string[]>;
    }),
    fetch("/data/years.json").then((r) => {
      if (!r.ok) throw new Error("Failed to load years.json");
      return r.json() as Promise<string[]>;
    }),
  ]);
  return { lectures, gas, cycles, locations, years };
}
