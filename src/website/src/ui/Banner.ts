import type { Locale } from "../i18n/index.js";
import type { Messages } from "../i18n/de.js";
import { LOCALE_CODES } from "../i18n/index.js";

export type BrowseMode = "search" | "ga" | "cycles" | "years" | "locations";

export interface BannerHandlers {
  onMode: (mode: BrowseMode) => void;
  onLocale: (locale: Locale) => void;
}

export function renderBanner(
  root: HTMLElement,
  opts: {
    messages: Messages;
    mode: BrowseMode;
    locale: Locale;
    handlers: BannerHandlers;
  }
): void {
  const { messages, mode, locale, handlers } = opts;
  root.innerHTML = "";
  root.className = "banner";

  const brand = document.createElement("a");
  brand.className = "banner__brand";
  brand.href = "#";
  brand.addEventListener("click", (e) => {
    e.preventDefault();
    handlers.onMode("search");
  });

  const logo = document.createElement("img");
  logo.className = "banner__logo";
  logo.src = "/assets/logo-mark-light.svg";
  logo.alt = "";
  brand.appendChild(logo);

  const wordmark = document.createElement("span");
  wordmark.className = "banner__wordmark";
  wordmark.textContent = messages.brand;
  brand.appendChild(wordmark);
  root.appendChild(brand);

  const nav = document.createElement("ul");
  nav.className = "banner__nav";
  const items: Array<{ mode: BrowseMode; label: string }> = [
    { mode: "search", label: messages.nav.search },
    { mode: "ga", label: messages.nav.ga },
    { mode: "cycles", label: messages.nav.cycles },
    { mode: "years", label: messages.nav.years },
    { mode: "locations", label: messages.nav.locations },
  ];
  for (const item of items) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.label;
    if (item.mode === mode) btn.classList.add("is-active");
    btn.addEventListener("click", () => handlers.onMode(item.mode));
    li.appendChild(btn);
    nav.appendChild(li);
  }
  root.appendChild(nav);

  const langs = document.createElement("div");
  langs.className = "banner__langs";
  for (const code of LOCALE_CODES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = code;
    if (code === locale) btn.classList.add("is-active");
    btn.addEventListener("click", () => handlers.onLocale(code));
    langs.appendChild(btn);
  }
  root.appendChild(langs);
}
