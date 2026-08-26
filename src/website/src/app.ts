import type { Locale } from "./i18n/index.js";
import {
  persistLocale,
  resolveInitialLocale,
  t,
} from "./i18n/index.js";
import {
  loadCatalogIndex,
  type CatalogIndex,
  type LectureIndexEntry,
} from "./lib/catalog-index.js";
import { renderBanner, type BrowseMode } from "./ui/Banner.js";
import { mountCyclesPanel } from "./ui/CyclesPanel.js";
import { mountGaPanel } from "./ui/GaPanel.js";
import { mountLocationsPanel } from "./ui/LocationsPanel.js";
import { mountPdfViewer } from "./ui/PdfViewer.js";
import { mountSearchPanel } from "./ui/SearchPanel.js";
import { mountYearsPanel } from "./ui/YearsPanel.js";
import { openImpressumOverlay } from "./ui/Impressum.js";

export class App {
  private locale: Locale = resolveInitialLocale();
  private mode: BrowseMode = "search";
  private catalog: CatalogIndex | null = null;
  private selected: LectureIndexEntry | null = null;
  private manuscriptIndex = 0;
  private selectedGa: string | null = null;
  private selectedCycle: string | null = null;
  private year = "";
  private month = "";
  private location = "";
  private searchQuery = "";

  private bannerEl!: HTMLElement;
  private leftBodyEl!: HTMLElement;
  private rightEl!: HTMLElement;

  async start(root: HTMLElement): Promise<void> {
    persistLocale(this.locale);
    root.innerHTML = "";

    this.bannerEl = document.createElement("header");
    const shell = document.createElement("div");
    shell.className = "shell";

    const left = document.createElement("section");
    left.className = "pane-left";
    const botanical = document.createElement("div");
    botanical.className = "pane-left__botanical";
    botanical.setAttribute("aria-hidden", "true");
    this.leftBodyEl = document.createElement("div");
    this.leftBodyEl.className = "pane-left__body";
    left.append(botanical, this.leftBodyEl);

    this.rightEl = document.createElement("section");
    this.rightEl.className = "pane-right";

    shell.append(left, this.rightEl);
    root.append(this.bannerEl, shell, this.buildFooter());

    this.catalog = await loadCatalogIndex();
    this.year = this.catalog.years[0] ?? "";
    this.renderAll();
  }

  private buildFooter(): HTMLElement {
    const footer = document.createElement("footer");
    footer.className = "site-footer";
    const link = document.createElement("button");
    link.type = "button";
    link.className = "site-footer__link";
    link.textContent = this.messages().footer.impressum;
    link.addEventListener("click", () =>
      openImpressumOverlay(this.messages())
    );
    footer.appendChild(link);
    this.footerLinkEl = link;
    return footer;
  }

  private footerLinkEl: HTMLButtonElement | null = null;

  private messages() {
    return t(this.locale);
  }

  private renderAll(): void {
    this.renderBanner();
    this.renderLeft();
    void this.renderRight();
    if (this.footerLinkEl) {
      this.footerLinkEl.textContent = this.messages().footer.impressum;
    }
  }

  private renderBanner(): void {
    renderBanner(this.bannerEl, {
      messages: this.messages(),
      mode: this.mode,
      locale: this.locale,
      handlers: {
        onMode: (mode) => {
          this.mode = mode;
          this.selectedGa = null;
          this.selectedCycle = null;
          this.renderBanner();
          this.renderLeft();
        },
        onLocale: (locale) => {
          this.locale = locale;
          persistLocale(locale);
          this.renderAll();
        },
      },
    });
  }

  private selectLecture(lecture: LectureIndexEntry): void {
    this.selected = lecture;
    this.manuscriptIndex = 0;
    this.renderLeft();
    void this.renderRight();
  }

  private renderLeft(): void {
    if (!this.catalog) return;
    const messages = this.messages();
    const selectedId = this.selected?.id ?? null;

    switch (this.mode) {
      case "search":
        mountSearchPanel(this.leftBodyEl, {
          messages,
          lectures: this.catalog.lectures,
          selectedId,
          query: this.searchQuery,
          onQuery: (q) => {
            this.searchQuery = q;
          },
          onSelect: (l) => this.selectLecture(l),
        });
        break;
      case "ga":
        mountGaPanel(this.leftBodyEl, {
          messages,
          gas: this.catalog.gas,
          lectures: this.catalog.lectures,
          selectedId,
          selectedGa: this.selectedGa,
          onSelectGa: (ga) => {
            this.selectedGa = ga;
            this.renderLeft();
          },
          onSelectLecture: (l) => this.selectLecture(l),
        });
        break;
      case "cycles":
        mountCyclesPanel(this.leftBodyEl, {
          messages,
          cycles: this.catalog.cycles,
          lectures: this.catalog.lectures,
          selectedId,
          selectedCycle: this.selectedCycle,
          onSelectCycle: (zyklus) => {
            this.selectedCycle = zyklus;
            this.renderLeft();
          },
          onSelectLecture: (l) => this.selectLecture(l),
        });
        break;
      case "years":
        mountYearsPanel(this.leftBodyEl, {
          messages,
          years: this.catalog.years,
          lectures: this.catalog.lectures,
          selectedId,
          year: this.year,
          month: this.month,
          onYearMonth: (year, month) => {
            this.year = year;
            this.month = month;
            this.renderLeft();
          },
          onSelect: (l) => this.selectLecture(l),
        });
        break;
      case "locations":
        mountLocationsPanel(this.leftBodyEl, {
          messages,
          locations: this.catalog.locations,
          lectures: this.catalog.lectures,
          selectedId,
          location: this.location,
          onLocation: (ort) => {
            this.location = ort;
            this.renderLeft();
          },
          onSelect: (l) => this.selectLecture(l),
        });
        break;
    }
  }

  private async renderRight(): Promise<void> {
    mountPdfViewer(this.rightEl, {
      messages: this.messages(),
      lecture: this.selected,
      manuscriptIndex: this.manuscriptIndex,
      onManuscriptIndex: (index) => {
        this.manuscriptIndex = index;
        void this.renderRight();
      },
    });
  }
}
