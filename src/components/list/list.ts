import { onlyOne, parseLimit } from "../args/args";
import type { Flags } from "../args/args.types";
import { captureArgs } from "../git/git";
import { compare, parseSemver } from "../versions/versions";
import { DEFAULT_LIMIT, GORLUM } from "./list.constants";
import type { TagPair } from "./list.types";
import { commits, yesNo } from "./list.utils";

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

// gith list --tags | --commits, showing the first -limit rows (default 5).
export function list(flags: Flags): void {
  const kind = onlyOne(flags, ["tags", "commits", "stashes", "pockets"]);
  if (!kind)
    throw new Error(
      "usage: gith list --tags | --commits [--graph] | --stashes | --pockets [-limit <n>]",
    );
  if (flags.has("graph") && kind !== "commits")
    throw new Error("--graph only applies to --commits.");
  const limit = parseLimit(flags) ?? DEFAULT_LIMIT;
  if (kind === "commits") commits(limit, flags.has("graph"));
  else if (kind === "stashes") stashes(limit, false);
  else if (kind === "pockets") stashes(limit, true);
  else tags(limit);
}

function localTags(): string[] {
  return captureArgs(["tag", "--list"]).split("\n").filter(Boolean);
}

// Newest first. Each row is the stash selector, its date, and git's description of it.
function stashes(limit: number, withGorlum: boolean): void {
  if (withGorlum) console.log(GORLUM.join("\n"));
  const rows = captureArgs([
    "stash",
    "list",
    "--date=short",
    "--format=%gd  %cd  %gs",
  ])
    .split("\n")
    .filter(Boolean);
  if (rows.length === 0) {
    console.log(withGorlum ? "There is nothing in my pockets!" : "No stashes.");
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

// Origin tag names from `ls-remote --tags`, which also lists peeled `name^{}` lines.
function originTags(): string[] {
  return captureArgs(["ls-remote", "--tags", "origin"])
    .split("\n")
    .filter(Boolean)
    .map((line) => (line.split("\t")[1] ?? "").replace(/^refs\/tags\//, ""))
    .filter((ref) => ref && !ref.endsWith("^{}"));
}
