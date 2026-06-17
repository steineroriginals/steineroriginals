/** Single lecture entry in the SSOT (German field names preserved). */
export interface LectureEntry {
  id: string;
  uuid?: string;
  datum?: string;
  jahr?: string;
  ort?: string;
  vortragstitel?: string;
  anlass?: string;
  ga?: string;
  reihe?: string;
  zyklus?: number | string;
  ragkeep?: string;
}

export interface LectureCatalogFile {
  lectures: LectureEntry[];
}

export interface GaBand {
  ga: string;
  title: string;
  titleDisplay?: string;
  pdf: string;
}

export interface GaCatalogFile {
  bands: GaBand[];
}

export interface CatalogStats {
  totalLectures: number;
  withGa: number;
  withoutGa: number;
  withTitle: number;
  emptyTitle: number;
  withZyklus: number;
  withReihe: number;
  withAnlass: number;
  uniqueLocations: number;
  uniqueGaValues: number;
  yearRange: { min: number; max: number } | null;
}
