import { SPECS } from "./args.constants";
import type { Flags } from "./args.types";
import { resolveFlag, spelling } from "./args.utils";

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
      if (hasNext) {
        flags.set(name, next);
        i++;
      } else {
        throw new Error(`${token} needs a value.`);
      }
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
