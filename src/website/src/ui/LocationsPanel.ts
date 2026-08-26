import type { Messages } from "../i18n/de.js";
import type { LectureIndexEntry } from "../lib/catalog-index.js";
import { lecturesForLocation } from "../lib/catalog-index.js";
import { renderResultList } from "./ResultList.js";

export function mountLocationsPanel(
  root: HTMLElement,
  opts: {
    messages: Messages;
    locations: string[];
    lectures: LectureIndexEntry[];
    selectedId: string | null;
    location: string;
    onLocation: (ort: string) => void;
    onSelect: (lecture: LectureIndexEntry) => void;
  }
): void {
  const {
    messages,
    locations,
    lectures,
    selectedId,
    location,
    onLocation,
    onSelect,
  } = opts;
  root.innerHTML = "";

  const label = document.createElement("p");
  label.className = "pane-label";
  label.textContent = messages.locations.label;

  const title = document.createElement("h1");
  title.className = "pane-title";
  title.textContent = messages.locations.title;

  const chrome = document.createElement("div");
  chrome.className = "panel-chrome";

  const select = document.createElement("select");
  select.setAttribute("aria-label", messages.locations.title);
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = messages.locations.choose;
  select.appendChild(placeholder);
  for (const ort of locations) {
    const opt = document.createElement("option");
    opt.value = ort;
    opt.textContent = ort;
    if (ort === location) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => onLocation(select.value));
  chrome.appendChild(select);

  const listHost = document.createElement("div");
  listHost.style.flex = "1";
  listHost.style.minHeight = "0";
  listHost.style.display = "flex";
  listHost.style.flexDirection = "column";

  if (!location) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = messages.locations.choose;
    listHost.appendChild(hint);
  } else {
    renderResultList(listHost, {
      lectures: lecturesForLocation(lectures, location),
      selectedId,
      emptyMessage: messages.locations.empty,
      onSelect,
    });
  }

  root.append(label, title, chrome, listHost);
}
