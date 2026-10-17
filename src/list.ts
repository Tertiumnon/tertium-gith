import { type Flags, onlyOne, parseLimit } from "./args";
import { captureArgs } from "./git";
import { compare, parseSemver } from "./versions";

const DEFAULT_LIMIT = 5;

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

// gith list --tags | --commits, showing the first -limit rows (default 5).
export function list(flags: Flags): void {
  const kind = onlyOne(flags, ["tags", "commits"]);
  if (!kind)
    throw new Error("usage: gith list --tags | --commits [-limit <n>]");
  const limit = parseLimit(flags) ?? DEFAULT_LIMIT;
  if (kind === "commits") commits(limit);
  else tags(limit);
}

// Newest first, from the current branch.
function commits(limit: number): void {
  if (!hasHead()) {
    console.log("No commits.");
    return;
  }
  console.log(
    captureArgs([
      "log",
      `-n${limit}`,
      "--date=short",
      "--format=%h  %ad  %an  %s",
    ]),
  );
}

// False on a repository with no commits yet, where HEAD does not resolve.
function hasHead(): boolean {
  try {
    captureArgs(["rev-parse", "--verify", "--quiet", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

// One row per tag, newest version first, with whether it exists locally and on origin.
function tags(limit: number): void {
  const pairs = tagPairs(localTags(), originTags());
  if (pairs.length === 0) {
    console.log("No tags.");
    return;
  }
  const shown = pairs.slice(0, limit);
  const width = Math.max(
    "TAG".length,
    ...pairs.map((pair) => pair.name.length),
  );
  console.log(`${"TAG".padEnd(width)}  LOCAL  ORIGIN`);
  for (const pair of shown) {
    console.log(
      `${pair.name.padEnd(width)}  ${yesNo(pair.local).padEnd(5)}  ${yesNo(pair.origin)}`,
    );
  }
  if (shown.length < pairs.length) {
    console.log(
      `showing ${shown.length} of ${pairs.length}; -limit <n> shows more`,
    );
  }
}
