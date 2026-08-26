import type { Messages } from "../i18n/de.js";
import { impressumHtml } from "../legal/impressum.js";

export function openImpressumOverlay(messages: Messages): void {
  closeImpressumOverlay();

  const backdrop = document.createElement("div");
  backdrop.className = "legal-overlay";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-labelledby", "legal-overlay-title");

  const panel = document.createElement("div");
  panel.className = "legal-overlay__panel";

  const header = document.createElement("div");
  header.className = "legal-overlay__header";

  const title = document.createElement("h1");
  title.id = "legal-overlay-title";
  title.textContent = messages.footer.impressum;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "legal-overlay__close";
  close.textContent = messages.footer.close;
  close.addEventListener("click", () => closeImpressumOverlay());

  header.append(title, close);

  const body = document.createElement("div");
  body.className = "legal-overlay__body";
  body.innerHTML = impressumHtml();

  panel.append(header, body);
  backdrop.appendChild(panel);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeImpressumOverlay();
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") closeImpressumOverlay();
  };
  document.addEventListener("keydown", onKey);
  backdrop.dataset.keyHandler = "1";
  (backdrop as HTMLElement & { _onKey?: (e: KeyboardEvent) => void })._onKey =
    onKey;

  document.body.appendChild(backdrop);
  document.body.style.overflow = "hidden";
  close.focus();
}

export function closeImpressumOverlay(): void {
  const existing = document.querySelector(".legal-overlay");
  if (existing) {
    const onKey = (
      existing as HTMLElement & { _onKey?: (e: KeyboardEvent) => void }
    )._onKey;
    if (onKey) document.removeEventListener("keydown", onKey);
    existing.remove();
  }
  document.body.style.overflow = "";
}
