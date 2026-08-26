import type { Messages } from "../i18n/de.js";
import type { LectureIndexEntry } from "../lib/catalog-index.js";
import { manuscriptLabel, manuscriptPublicUrl } from "../lib/pdf-url.js";

export function mountPdfViewer(
  root: HTMLElement,
  opts: {
    messages: Messages;
    lecture: LectureIndexEntry | null;
    manuscriptIndex: number;
    onManuscriptIndex: (index: number) => void;
  }
): void {
  const { messages, lecture, manuscriptIndex, onManuscriptIndex } = opts;
  root.innerHTML = "";
  root.className = "pane-right";

  if (!lecture) {
    root.appendChild(emptyState(messages.viewer.selectLecture));
    return;
  }

  if (!lecture.manuscripts.length) {
    root.appendChild(emptyState(messages.viewer.noManuscript));
    return;
  }

  const idx = Math.min(
    Math.max(0, manuscriptIndex),
    lecture.manuscripts.length - 1
  );
  const key = lecture.manuscripts[idx]!;
  const url = manuscriptPublicUrl(key);

  const toolbar = document.createElement("div");
  toolbar.className = "pdf-toolbar";

  if (lecture.manuscripts.length > 1) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", messages.viewer.scan);
    lecture.manuscripts.forEach((k, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = manuscriptLabel(k, i, messages.viewer.scan);
      if (i === idx) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () =>
      onManuscriptIndex(Number(select.value))
    );
    toolbar.appendChild(select);
  }

  const spacer = document.createElement("span");
  spacer.className = "spacer";

  const openLink = document.createElement("a");
  openLink.href = url;
  openLink.target = "_blank";
  openLink.rel = "noopener";
  openLink.textContent = messages.viewer.openOriginal;

  toolbar.append(spacer, openLink);

  const iframe = document.createElement("iframe");
  iframe.className = "pdf-iframe";
  iframe.title = lecture.vortragstitel || "PDF";
  iframe.src = url;

  root.append(toolbar, iframe);
}

function emptyState(message: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "pdf-empty";
  const img = document.createElement("img");
  img.src = "/assets/empty-state.jpg";
  img.alt = "";
  const p = document.createElement("p");
  p.textContent = message;
  wrap.append(img, p);
  return wrap;
}
