import { ALIASES, SHORT, SPECS } from "./args.constants";

// Accepts one or two leading dashes. Returns the canonical name and the dash style.
export function resolveFlag(
  token: string,
): { name: string; style: "single" | "double" } | undefined {
  const match = /^(--?)([a-z][a-z-]*|&push)$/.exec(token);
  if (!match) return undefined;
  const word = match[2] ?? "";
  const name = ALIASES.get(word) ?? word;
  if (!SPECS.has(name)) return undefined;
  return { name, style: match[1] === "--" ? "double" : "single" };
}

export function spelling(name: string): string {
  if (SPECS.get(name) === "value") return `-${name}`;
  return SHORT[name] ?? `--${name}`;
}
