import { de, type Locale, type Messages } from "./de.js";
import { en } from "./en.js";
import { es } from "./es.js";
import { fr } from "./fr.js";

const LOCALES: Record<Locale, Messages> = { de, en, es, fr };
const STORAGE_KEY = "steineroriginals.lang";

export const LOCALE_CODES: Locale[] = ["de", "en", "es", "fr"];

export function isLocale(value: string): value is Locale {
  return value === "de" || value === "en" || value === "es" || value === "fr";
}

export function resolveInitialLocale(): Locale {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("lang");
  if (fromQuery && isLocale(fromQuery)) return fromQuery;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isLocale(stored)) return stored;
  } catch {
    /* ignore */
  }

  return "de";
}

export function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("lang", locale);
  window.history.replaceState({}, "", url);
  document.documentElement.lang = locale;
}

export function t(locale: Locale): Messages {
  return LOCALES[locale];
}
