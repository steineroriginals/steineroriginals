import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { GA_PDF_DIR } from "./paths.js";

export const GERMAN_MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

export function resolveGaPdfDir(): string {
  return GA_PDF_DIR.replace(/^~/, process.env.HOME ?? "");
}

/** Parse GA number from filename: "GA 051.pdf" -> "51", "GA 068a.pdf" -> "68a" */
export function gaNumberFromFilename(filename: string): string | null {
  const m = filename.match(/GA\s+0*(\d+)([a-z])?\.pdf$/i);
  if (!m) return null;
  const num = parseInt(m[1]!, 10);
  const suffix = m[2] ?? "";
  return suffix ? `${num}${suffix}` : String(num);
}

/** Parse --range "51,52" or "332-337" or "68a-68c" */
export function parseRangeArg(rangeStr: string | null | undefined): Set<string> | null {
  if (!rangeStr) return null;
  const result = new Set<string>();

  function parseGaPart(s: string) {
    const m = String(s).trim().match(/^(\d+)([a-z])?$/i);
    if (!m) return null;
    return { num: parseInt(m[1]!, 10), letter: m[2] ?? "" };
  }

  for (const part of rangeStr.split(",").map((s) => s.trim())) {
    const dash = part.indexOf("-");
    if (dash >= 0) {
      const startPart = parseGaPart(part.slice(0, dash));
      const endPart = parseGaPart(part.slice(dash + 1));
      if (!startPart || !endPart) continue;

      if (startPart.num === endPart.num) {
        if (startPart.letter && endPart.letter) {
          for (let c = startPart.letter.charCodeAt(0); c <= endPart.letter.charCodeAt(0); c++) {
            result.add(`${startPart.num}${String.fromCharCode(c)}`);
          }
        } else if (!startPart.letter && endPart.letter) {
          result.add(String(startPart.num));
          for (let c = 97; c <= endPart.letter.toLowerCase().charCodeAt(0); c++) {
            result.add(`${startPart.num}${String.fromCharCode(c)}`);
          }
        } else {
          result.add(String(startPart.num));
        }
      } else {
        for (let n = startPart.num; n <= endPart.num; n++) {
          result.add(String(n));
        }
      }
    } else {
      const p = parseGaPart(part);
      if (p) result.add(p.letter ? `${p.num}${p.letter}` : String(p.num));
    }
  }
  return result.size > 0 ? result : null;
}

export function extractPdfPages(pdfPath: string, fromPage: number, toPage: number): string {
  try {
    return execSync(`pdftotext -f ${fromPage} -l ${toPage} "${pdfPath}" - 2>/dev/null`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

export interface ListGaPdfsOptions {
  rangeSet?: Set<string> | null;
  minGaNum?: number;
}

export function listGaPdfFilenames(options: ListGaPdfsOptions = {}): string[] {
  const { rangeSet = null, minGaNum } = options;
  const dir = resolveGaPdfDir();
  if (!fs.existsSync(dir)) return [];

  let result = fs
    .readdirSync(dir)
    .filter((f) => /^GA\s+0*\d+[a-z]?\.pdf$/i.test(f))
    .sort((a, b) => {
      const gaA = gaNumberFromFilename(a);
      const gaB = gaNumberFromFilename(b);
      const numA = parseInt(String(gaA).replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(String(gaB).replace(/\D/g, ""), 10) || 0;
      if (numA !== numB) return numA - numB;
      return (gaA ?? "").localeCompare(gaB ?? "");
    });

  if (minGaNum != null) {
    result = result.filter((f) => {
      const n = gaNumberFromFilename(f);
      if (!n) return false;
      const num = parseInt(String(n).replace(/\D/g, ""), 10);
      return num >= minGaNum;
    });
  }

  if (rangeSet) {
    result = result.filter((f) => {
      const ga = gaNumberFromFilename(f);
      return ga && rangeSet.has(ga);
    });
  }

  return result;
}

export function gaPdfPath(filename: string): string {
  return path.join(resolveGaPdfDir(), filename);
}

export function compareGaNumbers(a: string, b: string): number {
  const numA = parseInt(String(a).replace(/\D/g, ""), 10) || 0;
  const numB = parseInt(String(b).replace(/\D/g, ""), 10) || 0;
  if (numA !== numB) return numA - numB;
  return a.localeCompare(b);
}
