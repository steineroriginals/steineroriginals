import type { Messages } from "../i18n/de.js";
import type { LectureIndexEntry } from "../lib/catalog-index.js";
import { lecturesForYearMonth } from "../lib/catalog-index.js";
import { renderResultList } from "./ResultList.js";

export function mountYearsPanel(
  root: HTMLElement,
  opts: {
    messages: Messages;
    years: string[];
    lectures: LectureIndexEntry[];
    selectedId: string | null;
    year: string;
    month: string;
    onYearMonth: (year: string, month: string) => void;
    onSelect: (lecture: LectureIndexEntry) => void;
  }
): void {
  const {
    messages,
    years,
    lectures,
    selectedId,
    year,
    month,
    onYearMonth,
    onSelect,
  } = opts;
  root.innerHTML = "";

  const label = document.createElement("p");
  label.className = "pane-label";
  label.textContent = messages.years.label;

  const title = document.createElement("h1");
  title.className = "pane-title";
  title.textContent = messages.years.title;

  const chrome = document.createElement("div");
  chrome.className = "panel-chrome";
  const row = document.createElement("div");
  row.className = "dropdown-row";

  const yearSelect = document.createElement("select");
  yearSelect.setAttribute("aria-label", messages.years.year);
  for (const y of years) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    if (y === year) opt.selected = true;
    yearSelect.appendChild(opt);
  }

  const monthSelect = document.createElement("select");
  monthSelect.setAttribute("aria-label", messages.years.month);
  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = messages.years.allMonths;
  monthSelect.appendChild(allOpt);
  for (let i = 1; i <= 12; i++) {
    const value = String(i).padStart(2, "0");
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = messages.months[i - 1]!;
    if (value === month) opt.selected = true;
    monthSelect.appendChild(opt);
  }

  const emit = (): void => onYearMonth(yearSelect.value, monthSelect.value);
  yearSelect.addEventListener("change", emit);
  monthSelect.addEventListener("change", emit);

  row.append(yearSelect, monthSelect);
  chrome.appendChild(row);

  const listHost = document.createElement("div");
  listHost.style.flex = "1";
  listHost.style.minHeight = "0";
  listHost.style.display = "flex";
  listHost.style.flexDirection = "column";

  const activeYear = year || years[0] || "";
  const filtered = activeYear
    ? lecturesForYearMonth(lectures, activeYear, month)
    : [];
  renderResultList(listHost, {
    lectures: filtered,
    selectedId,
    emptyMessage: messages.years.empty,
    onSelect,
  });

  root.append(label, title, chrome, listHost);
}
