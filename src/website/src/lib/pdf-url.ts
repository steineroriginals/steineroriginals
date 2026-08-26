declare const __PUBLIC_R2_BASE_URL__: string;

/**
 * Compose public PDF URL from a manuscript key.
 * SSOT may store bare filenames; R2 objects live under originals/.
 */
export function manuscriptPublicUrl(key: string): string {
  const base = (__PUBLIC_R2_BASE_URL__ ?? "").replace(/\/$/, "");
  let normalized = key.replace(/^\//, "");
  if (!normalized.startsWith("originals/")) {
    normalized = `originals/${normalized}`;
  }
  if (!base) {
    console.warn("PUBLIC_R2_BASE_URL is empty — PDF URLs will be relative keys only.");
    return normalized;
  }
  return `${base}/${normalized}`;
}

export function manuscriptLabel(key: string, index: number, scanWord: string): string {
  const base = key.split("/").pop() ?? key;
  const stem = base.replace(/\.pdf$/i, "");
  if (stem.length <= 40) return stem;
  return `${scanWord} ${index + 1}`;
}
