import type { Messages } from "../i18n/de.js";
import type { LectureIndexEntry } from "../lib/catalog-index.js";
import { searchLectures } from "../lib/catalog-index.js";
import { renderResultList } from "./ResultList.js";

export function mountSearchPanel(
  root: HTMLElement,
  opts: {
    messages: Messages;
    lectures: LectureIndexEntry[];
    selectedId: string | null;
    query: string;
    onQuery: (query: string) => void;
    onSelect: (lecture: LectureIndexEntry) => void;
  }
): void {
  const { messages, lectures, selectedId, query, onQuery, onSelect } = opts;
  root.innerHTML = "";

  const label = document.createElement("p");
  label.className = "pane-label";
  label.textContent = messages.search.label;

  const title = document.createElement("h1");
  title.className = "pane-title";
  title.textContent = messages.search.title;

  const chrome = document.createElement("div");
  chrome.className = "panel-chrome";

  const row = document.createElement("div");
  row.className = "search-row";

  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = messages.search.placeholder;
  input.autocomplete = "off";
  input.value = query;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", messages.nav.search);
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`;

  row.append(input, btn);
  chrome.appendChild(row);

  const listHost = document.createElement("div");
  listHost.style.flex = "1";
  listHost.style.minHeight = "0";
  listHost.style.display = "flex";
  listHost.style.flexDirection = "column";

  const runSearch = (persist = true): void => {
    const q = input.value.trim();
    if (persist) onQuery(q);
    listHost.innerHTML = "";
    if (!q) {
      const h = document.createElement("p");
      h.className = "hint";
      h.textContent = messages.search.hint;
      listHost.appendChild(h);
      return;
    }
    const hits = searchLectures(lectures, q);
    renderResultList(listHost, {
      lectures: hits,
      selectedId,
      emptyMessage: messages.search.noResults,
      onSelect,
    });
  };

  btn.addEventListener("click", () => runSearch(true));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch(true);
  });

  root.append(label, title, chrome, listHost);
  runSearch(false);
}
