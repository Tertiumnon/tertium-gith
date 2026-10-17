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
  const kind = onlyOne(flags, ["tags", "commits", "stashes"]);
  if (!kind)
    throw new Error(
      "usage: gith list --tags | --commits [--graph] | --stashes [-limit <n>]",
    );
  if (flags.has("graph") && kind !== "commits")
    throw new Error("--graph only applies to --commits.");
  const limit = parseLimit(flags) ?? DEFAULT_LIMIT;
  if (kind === "commits") commits(limit, flags.has("graph"));
  else if (kind === "stashes") stashes(limit);
  else tags(limit);
}

// Newest first. Each row is the stash selector, its date, and git's description of it.
function stashes(limit: number): void {
  const rows = captureArgs([
    "stash",
    "list",
    "--date=short",
    "--format=%gd  %cd  %gs",
  ])
    .split("\n")
    .filter(Boolean);
  if (rows.length === 0) {
    console.log("No stashes.");
    return;
  }
  const shown = rows.slice(0, limit);
  console.log(shown.join("\n"));
  if (shown.length < rows.length) {
    console.log(
      `showing ${shown.length} of ${rows.length}; -limit <n> shows more`,
    );
  }
}

// Newest first, from the current branch.
function commits(limit: number, graph: boolean): void {
  if (!hasHead()) {
    console.log("No commits.");
    return;
  }
  const shape = graph
    ? ["--graph", "--oneline", "--decorate"]
    : ["--date=short", "--format=%h  %ad  %an  %s"];
  console.log(captureArgs(["log", `-n${limit}`, ...shape]));
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
