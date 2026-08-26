import type { LectureIndexEntry } from "../lib/catalog-index.js";

export function renderResultList(
  container: HTMLElement,
  opts: {
    lectures: LectureIndexEntry[];
    selectedId: string | null;
    emptyMessage: string;
    onSelect: (lecture: LectureIndexEntry) => void;
  }
): void {
  container.innerHTML = "";
  const { lectures, selectedId, emptyMessage, onSelect } = opts;

  if (lectures.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-list";
    p.textContent = emptyMessage;
    container.appendChild(p);
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "result-list";

  for (const lecture of lectures) {
    const li = document.createElement("li");
    const hasPdf = lecture.manuscripts.length > 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row";
    if (!hasPdf) {
      btn.classList.add("is-disabled");
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
    }
    if (lecture.id === selectedId) btn.classList.add("is-selected");

    const datum = document.createElement("span");
    datum.className = "row__datum";
    datum.textContent = lecture.datum || "—";

    const ort = document.createElement("span");
    ort.className = "row__ort";
    ort.textContent = lecture.ort || "—";

    const title = document.createElement("span");
    title.className = "row__title";
    title.textContent = lecture.vortragstitel || "—";
    title.title = lecture.vortragstitel || "";

    btn.append(datum, ort, title);
    if (hasPdf) {
      btn.addEventListener("click", () => onSelect(lecture));
    }
    li.appendChild(btn);
    ul.appendChild(li);
  }

  container.appendChild(ul);
}
