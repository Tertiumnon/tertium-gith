// Parses the flags of a gith command. Value flags consume the next token; switches stand alone.
export type Flags = Map<string, string>;

// The flag convention, enforced here:
//   -name <value>   a single dash always waits for a value (-b and -branch are aliases)
//   --name          a double dash never takes a value
// Kinds:
//   value   -name <value> only; --name is an error
//   switch  --name only, stored as "true"; -name is an error
//   auto    -name <value> for an explicit value, or --name alone for an automatic choice,
//           stored as "" (for example --branch opens the picker, --release bumps from the tags)
type Kind = "value" | "switch" | "auto";

const SPECS = new Map<string, Kind>([
  ["branch", "auto"],
  ["release", "auto"],
  ["hotfix", "auto"],
  ["limit", "value"],
  ["message", "value"],
  ["name", "value"],
  ["days", "value"],
  ["patch", "switch"],
  ["minor", "switch"],
  ["major", "switch"],
  ["remote", "switch"],
  ["local", "switch"],
  ["tags", "switch"],
  ["commits", "switch"],
  ["obsolete", "switch"],
  ["graph", "switch"],
  ["stashes", "switch"],
  ["pockets", "switch"],
  ["detached", "switch"],
  ["overall", "switch"],
  ["current-year", "switch"],
  ["current-month", "switch"],
  ["current-week", "switch"],
  ["last-year", "switch"],
  ["last-month", "switch"],
  ["last-week", "switch"],
]);

// Short forms, so `-b` and `-branch` mean the same flag.
const ALIASES = new Map<string, string>([
  ["b", "branch"],
  ["r", "release"],
  ["h", "hotfix"],
  ["l", "limit"],
  ["m", "message"],
  ["n", "name"],
]);

// Accepts one or two leading dashes. Returns the canonical name and the dash style.
function resolveFlag(
  token: string,
): { name: string; style: "single" | "double" } | undefined {
  const match = /^(--?)([a-z][a-z-]*)$/.exec(token);
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
    const kind = SPECS.get(name) ?? "switch";
    if (flags.has(name)) throw new Error(`'${name}' given more than once.`);
    const next = argv[i + 1];
    const hasNext = next !== undefined && !next.startsWith("-");

    if (style === "single") {
      if (kind === "switch")
        throw new Error(`${token} is a switch; write --${name}.`);
      if (!hasNext) throw new Error(`${token} needs a value.`);
      flags.set(name, next);
      i++;
    } else if (kind === "switch") {
      flags.set(name, "true");
    } else if (kind === "value") {
      throw new Error(`${token} takes a value; write -${name} <value>.`);
    } else {
      if (hasNext)
        throw new Error(
          `${token} takes no value. For an explicit value use -${name} <value>.`,
        );
      flags.set(name, "");
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

// How a flag is written in a message: value flags take one dash, switches and auto flags two.
const SHORT: Record<string, string> = {
  branch: "-b",
  release: "-r",
  hotfix: "-h",
};
function spelling(name: string): string {
  if (SPECS.get(name) === "value") return `-${name}`;
  return SHORT[name] ?? `--${name}`;
}

// Returns the one flag from `names` that is present, or undefined if none is.
export function onlyOne<T extends string>(
  flags: Flags,
  names: readonly T[],
): T | undefined {
  const present = names.filter((name) => flags.has(name));
  if (present.length > 1) {
    throw new Error(`use only one of: ${names.map(spelling).join(", ")}.`);
  }
  return present[0];
}
