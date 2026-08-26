/** R2 object key for an original scan PDF (no leading slash). */
export interface ManuscriptRef {
  key: string;
}

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
  /** Original scan PDFs in Cloudflare R2 (`originals/<filename>.pdf`). */
  manuscripts?: ManuscriptRef[];
}

export interface LectureCatalogFile {
  lectures: LectureEntry[];
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
  withManuscripts: number;
  withoutManuscripts: number;
  manuscriptKeyCount: number;
  uniqueLocations: number;
  uniqueGaValues: number;
  yearRange: { min: number; max: number } | null;
}
