import type { Messages } from "../i18n/de.js";
import type { GaIndexEntry, LectureIndexEntry } from "../lib/catalog-index.js";
import { lecturesForGa } from "../lib/catalog-index.js";
import { renderResultList } from "./ResultList.js";

export function mountGaPanel(
  root: HTMLElement,
  opts: {
    messages: Messages;
    gas: GaIndexEntry[];
    lectures: LectureIndexEntry[];
    selectedId: string | null;
    selectedGa: string | null;
    onSelectGa: (ga: string | null) => void;
    onSelectLecture: (lecture: LectureIndexEntry) => void;
  }
): void {
  const {
    messages,
    gas,
    lectures,
    selectedId,
    selectedGa,
    onSelectGa,
    onSelectLecture,
  } = opts;
  root.innerHTML = "";

  const label = document.createElement("p");
  label.className = "pane-label";
  label.textContent = messages.ga.label;

  const title = document.createElement("h1");
  title.className = "pane-title";
  title.textContent = messages.ga.title;

  root.append(label, title);

  if (selectedGa) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "back-link";
    back.textContent = messages.ga.back;
    back.addEventListener("click", () => onSelectGa(null));

    const listHost = document.createElement("div");
    listHost.style.flex = "1";
    listHost.style.minHeight = "0";
    listHost.style.display = "flex";
    listHost.style.flexDirection = "column";
    listHost.style.marginTop = "0.75rem";

    renderResultList(listHost, {
      lectures: lecturesForGa(lectures, selectedGa),
      selectedId,
      emptyMessage: messages.ga.emptyLectures,
      onSelect: onSelectLecture,
    });

    root.append(back, listHost);
    return;
  }

  const chrome = document.createElement("div");
  chrome.className = "panel-chrome";
  const filter = document.createElement("input");
  filter.type = "search";
  filter.placeholder = messages.ga.filterPlaceholder;
  filter.autocomplete = "off";
  chrome.appendChild(filter);

  const listHost = document.createElement("div");
  listHost.style.flex = "1";
  listHost.style.minHeight = "0";
  listHost.style.display = "flex";
  listHost.style.flexDirection = "column";

  const renderGas = (): void => {
    const q = filter.value.trim().toLowerCase();
    const filtered = gas.filter((g) => {
      if (!q) return true;
      return g.ga.includes(q) || `ga ${g.ga}`.includes(q);
    });
    listHost.innerHTML = "";
    if (filtered.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-list";
      p.textContent = messages.ga.empty;
      listHost.appendChild(p);
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "cycle-list";
    for (const g of filtered) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      const num = document.createElement("span");
      num.className = "cycle-num";
      num.style.width = "3.5rem";
      num.textContent = `GA ${g.ga}`;
      const t = document.createElement("span");
      t.className = "cycle-title";
      t.textContent = "";
      const count = document.createElement("span");
      count.className = "cycle-count";
      count.textContent = `${g.vortraege} ${messages.ga.lectures}`;
      btn.append(num, t, count);
      btn.addEventListener("click", () => onSelectGa(g.ga));
      li.appendChild(btn);
      ul.appendChild(li);
    }
    listHost.appendChild(ul);
  };

  filter.addEventListener("input", renderGas);
  renderGas();
  root.append(chrome, listHost);
}
