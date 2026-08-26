import type { Messages } from "../i18n/de.js";
import type {
  CycleIndexEntry,
  LectureIndexEntry,
} from "../lib/catalog-index.js";
import { lecturesForCycle } from "../lib/catalog-index.js";
import { renderResultList } from "./ResultList.js";

export function mountCyclesPanel(
  root: HTMLElement,
  opts: {
    messages: Messages;
    cycles: CycleIndexEntry[];
    lectures: LectureIndexEntry[];
    selectedId: string | null;
    selectedCycle: string | null;
    onSelectCycle: (zyklus: string | null) => void;
    onSelectLecture: (lecture: LectureIndexEntry) => void;
  }
): void {
  const {
    messages,
    cycles,
    lectures,
    selectedId,
    selectedCycle,
    onSelectCycle,
    onSelectLecture,
  } = opts;
  root.innerHTML = "";

  const label = document.createElement("p");
  label.className = "pane-label";
  label.textContent = messages.cycles.label;

  const title = document.createElement("h1");
  title.className = "pane-title";
  title.textContent = messages.cycles.title;

  root.append(label, title);

  if (selectedCycle) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "back-link";
    back.textContent = messages.cycles.back;
    back.addEventListener("click", () => onSelectCycle(null));

    const listHost = document.createElement("div");
    listHost.style.flex = "1";
    listHost.style.minHeight = "0";
    listHost.style.display = "flex";
    listHost.style.flexDirection = "column";
    listHost.style.marginTop = "0.75rem";

    renderResultList(listHost, {
      lectures: lecturesForCycle(lectures, selectedCycle),
      selectedId,
      emptyMessage: messages.cycles.emptyLectures,
      onSelect: onSelectLecture,
    });

    root.append(back, listHost);
    return;
  }

  const chrome = document.createElement("div");
  chrome.className = "panel-chrome";
  const filter = document.createElement("input");
  filter.type = "search";
  filter.placeholder = messages.cycles.filterPlaceholder;
  filter.autocomplete = "off";
  chrome.appendChild(filter);

  const listHost = document.createElement("div");
  listHost.style.flex = "1";
  listHost.style.minHeight = "0";
  listHost.style.display = "flex";
  listHost.style.flexDirection = "column";

  const renderCycles = (): void => {
    const q = filter.value.trim().toLowerCase();
    const filtered = cycles.filter((c) => {
      if (!q) return true;
      return (
        c.zyklus.includes(q) ||
        c.titel.toLowerCase().includes(q)
      );
    });
    listHost.innerHTML = "";
    if (filtered.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-list";
      p.textContent = messages.cycles.empty;
      listHost.appendChild(p);
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "cycle-list";
    for (const c of filtered) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      const num = document.createElement("span");
      num.className = "cycle-num";
      num.textContent = c.zyklus;
      const t = document.createElement("span");
      t.className = "cycle-title";
      t.textContent =
        c.titel || `${messages.cycles.item} ${c.zyklus}`;
      t.title = t.textContent;
      const count = document.createElement("span");
      count.className = "cycle-count";
      count.textContent = `${c.vortraege} ${messages.cycles.lectures}`;
      btn.append(num, t, count);
      btn.addEventListener("click", () => onSelectCycle(c.zyklus));
      li.appendChild(btn);
      ul.appendChild(li);
    }
    listHost.appendChild(ul);
  };

  filter.addEventListener("input", renderCycles);
  renderCycles();
  root.append(chrome, listHost);
}
