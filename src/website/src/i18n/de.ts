export type Locale = "de" | "en" | "es" | "fr";

export interface Messages {
  brand: string;
  nav: {
    search: string;
    ga: string;
    cycles: string;
    years: string;
    locations: string;
  };
  search: {
    label: string;
    title: string;
    placeholder: string;
    hint: string;
    noResults: string;
  };
  ga: {
    label: string;
    title: string;
    filterPlaceholder: string;
    back: string;
    lectures: string;
    empty: string;
    emptyLectures: string;
  };
  cycles: {
    label: string;
    title: string;
    filterPlaceholder: string;
    back: string;
    item: string;
    lectures: string;
    empty: string;
    emptyLectures: string;
  };
  years: {
    label: string;
    title: string;
    year: string;
    month: string;
    allMonths: string;
    empty: string;
  };
  locations: {
    label: string;
    title: string;
    choose: string;
    empty: string;
  };
  months: string[];
  viewer: {
    selectLecture: string;
    noManuscript: string;
    page: string;
    of: string;
    openOriginal: string;
    download: string;
    prev: string;
    next: string;
    scan: string;
    loadError: string;
  };
  footer: {
    impressum: string;
    close: string;
  };
}

export const de: Messages = {
  brand: "steineroriginals",
  nav: {
    search: "Suche",
    ga: "GA",
    cycles: "Zyklen",
    years: "Jahre",
    locations: "Orte",
  },
  search: {
    label: "Katalog",
    title: "Vorträge durchsuchen",
    placeholder: "Datum, Ort oder Titel…",
    hint: "Suchbegriff eingeben und Treffer erscheinen darunter.",
    noResults: "Keine Treffer.",
  },
  ga: {
    label: "Gesamtausgabe",
    title: "Nach GA-Band",
    filterPlaceholder: "GA-Nummer filtern…",
    back: "← Alle GA-Bände",
    lectures: "Vorträge",
    empty: "Keine GA-Bände gefunden.",
    emptyLectures: "Keine Vorträge in diesem Band.",
  },
  cycles: {
    label: "Zyklen",
    title: "Vortragszyklen",
    filterPlaceholder: "Zyklus filtern…",
    back: "← Alle Zyklen",
    item: "Zyklus",
    lectures: "Vorträge",
    empty: "Keine Zyklen gefunden.",
    emptyLectures: "Keine Vorträge in diesem Zyklus.",
  },
  years: {
    label: "Jahre",
    title: "Nach Jahr und Monat",
    year: "Jahr",
    month: "Monat",
    allMonths: "Alle Monate",
    empty: "Keine Vorträge in diesem Zeitraum.",
  },
  locations: {
    label: "Orte",
    title: "Nach Ort",
    choose: "Ort wählen…",
    empty: "Keine Vorträge an diesem Ort.",
  },
  months: [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ],
  viewer: {
    selectLecture: "Wählen Sie einen Vortrag, um das Manuskript zu lesen.",
    noManuscript: "Für diesen Vortrag liegt noch kein Originalscan vor.",
    page: "Seite",
    of: "von",
    openOriginal: "Original öffnen",
    download: "PDF herunterladen",
    prev: "Vorherige Seite",
    next: "Nächste Seite",
    scan: "Scan",
    loadError: "PDF konnte nicht geladen werden.",
  },
  footer: {
    impressum: "Impressum",
    close: "Schließen",
  },
};
