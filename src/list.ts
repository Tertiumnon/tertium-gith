import { type Flags, onlyOne } from "./args";
import { captureArgs } from "./git";
import { compare, parseSemver } from "./versions";

export interface TagPair {
  name: string;
  local: boolean;
  origin: boolean;
}

// Pairs local and origin tags by name. Version tags come newest first; other names follow, A to Z.
export function tagPairs(local: string[], origin: string[]): TagPair[] {
  const names = [...new Set([...local, ...origin])];
  return names
    .map((name) => ({
      name,
      local: local.includes(name),
      origin: origin.includes(name),
    }))
    .sort((a, b) => {
      const va = parseSemver(a.name);
      const vb = parseSemver(b.name);
      if (va && vb) return compare(vb, va);
      if (va) return -1;
      if (vb) return 1;
      return a.name.localeCompare(b.name);
    });
}

// Origin tag names from `ls-remote --tags`, which also lists peeled `name^{}` lines.
function originTags(): string[] {
  return captureArgs(["ls-remote", "--tags", "origin"])
    .split("\n")
    .filter(Boolean)
    .map((line) => (line.split("\t")[1] ?? "").replace(/^refs\/tags\//, ""))
    .filter((ref) => ref && !ref.endsWith("^{}"));
}

function localTags(): string[] {
  return captureArgs(["tag", "--list"]).split("\n").filter(Boolean);
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

// gith list --tags: one row per tag, showing whether it exists locally and on origin.
export function list(flags: Flags): void {
  const kind = onlyOne(flags, ["tags"]);
  if (!kind) throw new Error("usage: gith list --tags");
  const pairs = tagPairs(localTags(), originTags());
  if (pairs.length === 0) {
    console.log("No tags.");
    return;
  }
  const width = Math.max(
    "TAG".length,
    ...pairs.map((pair) => pair.name.length),
  );
  console.log(`${"TAG".padEnd(width)}  LOCAL  ORIGIN`);
  for (const pair of pairs) {
    console.log(
      `${pair.name.padEnd(width)}  ${yesNo(pair.local).padEnd(5)}  ${yesNo(pair.origin)}`,
    );
  }
}
