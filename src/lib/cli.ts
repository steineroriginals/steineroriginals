export const colors = {
  red: "\x1b[31m",
  brightRed: "\x1b[91m",
  green: "\x1b[32m",
  brightGreen: "\x1b[92m",
  yellow: "\x1b[33m",
  orange: "\x1b[38;5;208m",
  gray: "\x1b[90m",
  reset: "\x1b[0m",
} as const;

export function hasFlag(args: string[], ...flags: string[]): boolean {
  return flags.some((f) => args.includes(f));
}

export function flagValue(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx < 0 || idx + 1 >= args.length) return null;
  return args[idx + 1] ?? null;
}
