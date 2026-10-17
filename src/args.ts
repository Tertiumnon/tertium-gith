// Parses the flags of a gith command. Value flags consume the next token; switches stand alone.
export type Flags = Map<string, string>;

// How a flag takes its value, for single-dash (-x) and double-dash (--x) forms.
//   none     switch, stored as "true"
//   required takes a value, stored as given
//   auto     switch that means "pick it for me", stored as ""; takes no value
//   optional takes a value when one follows, otherwise stored as ""
interface Modes {
  single: "none" | "required" | "auto" | "optional";
  double: "none" | "required" | "auto" | "optional";
}

// Canonical flag names.
const SPECS = new Map<string, Modes>([
  ["branch", { single: "optional", double: "optional" }],
  ["release", { single: "required", double: "auto" }],
  ["hotfix", { single: "required", double: "auto" }],
  ["patch", { single: "none", double: "none" }],
  ["minor", { single: "none", double: "none" }],
  ["major", { single: "none", double: "none" }],
  ["hooks", { single: "none", double: "none" }],
  ["force", { single: "none", double: "none" }],
  ["remote", { single: "none", double: "none" }],
  ["both", { single: "none", double: "none" }],
  ["tags", { single: "none", double: "none" }],
  ["commits", { single: "none", double: "none" }],
  ["limit", { single: "required", double: "required" }],
]);

// Short forms, so `-b`, `-branch` and `--branch` mean the same flag.
const ALIASES = new Map<string, string>([
  ["b", "branch"],
  ["r", "release"],
  ["h", "hotfix"],
  ["l", "limit"],
]);

// Accepts one or two leading dashes. Returns the canonical name and the dash style.
function resolveFlag(
  token: string,
): { name: string; style: "single" | "double" } | undefined {
  const match = /^(--?)([a-z]+)$/.exec(token);
  if (!match) return undefined;
  const word = match[2] ?? "";
  const name = ALIASES.get(word) ?? word;
  if (!SPECS.has(name)) return undefined;
  return { name, style: match[1] === "--" ? "double" : "single" };
}

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = new Map();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] ?? "";
    const resolved = resolveFlag(token);
    if (!resolved) throw new Error(`unknown option '${token}'.`);
    const { name, style } = resolved;
    const mode = SPECS.get(name)?.[style] ?? "none";
    if (flags.has(name)) throw new Error(`'${name}' given more than once.`);
    const next = argv[i + 1];
    const hasNext = next !== undefined && !next.startsWith("-");

    if (mode === "none") {
      flags.set(name, "true");
    } else if (mode === "auto") {
      if (hasNext)
        throw new Error(
          `${token} takes no value. For an explicit version use -${name === "release" ? "r" : "h"} <version>.`,
        );
      flags.set(name, "");
    } else if (mode === "optional") {
      if (hasNext) {
        flags.set(name, next);
        i++;
      } else {
        flags.set(name, "");
      }
    } else {
      if (!hasNext) throw new Error(`${token} needs a value.`);
      flags.set(name, next);
      i++;
    }
  }
  return flags;
}

// The -limit value as a number, or undefined when it is not given.
export function parseLimit(flags: Flags): number | undefined {
  const raw = flags.get("limit");
  if (raw === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(raw))
    throw new Error("-limit needs a positive whole number.");
  return Number(raw);
}

// Returns the one flag from `names` that is present, or undefined if none is.
export function onlyOne<T extends string>(
  flags: Flags,
  names: readonly T[],
): T | undefined {
  const present = names.filter((name) => flags.has(name));
  if (present.length > 1) {
    throw new Error(
      `use only one of: ${names.map((n) => `--${n}`).join(", ")}.`,
    );
  }
  return present[0];
}
