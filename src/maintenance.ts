import { createInterface } from "node:readline/promises";
import { type Flags, onlyOne, parseLimit } from "./args";
import { createBranch } from "./commands";
import {
  assertBranchName,
  capture,
  captureArgs,
  gitArgs,
  hasLocal,
  hasOnOrigin,
  isDryRun,
} from "./git";
import { isContainer } from "./rules";

type Scope = "local" | "remote" | "both";

export interface Option {
  name: string;
  label: string;
}

function noFlags(flags: Flags, command: string): void {
  if (flags.size > 0) throw new Error(`usage: gith ${command}`);
}

function requireBranch(flags: Flags, command: string): string {
  const branch = flags.get("branch");
  if (!branch) throw new Error(`usage: gith ${command} -b <branch>`);
  assertBranchName(branch);
  return branch;
}

// gith switch -b <branch>: switches to the branch. If it exists neither here nor on origin,
// it is created first, the same way as gith create -b.
export function switchBranch(flags: Flags): void {
  const branch = requireBranch(flags, "switch");
  if (!hasLocal(branch) && !hasOnOrigin(branch)) createBranch(branch);
  gitArgs(["switch", "--", branch]);
}

// Branches that can be offered for removal. Containers are never offered, and the
// checked-out branch is never offered for a local delete.
export function candidates(
  scope: Scope,
  local: string[],
  remote: string[],
  current: string,
): Option[] {
  const notContainer = (name: string) => !isContainer(name);
  const notCurrent = (name: string) => name !== current;
  if (scope === "remote") {
    return remote
      .filter(notContainer)
      .map((name) => ({ name, label: `${name}  (origin)` }));
  }
  if (scope === "local") {
    return local
      .filter((name) => notContainer(name) && notCurrent(name))
      .map((name) => ({ name, label: name }));
  }
  return local
    .filter(
      (name) => notContainer(name) && notCurrent(name) && remote.includes(name),
    )
    .map((name) => ({ name, label: `${name}  (local + origin)` }));
}

// Turns an answer like "1,3-4" into zero-based indexes. Duplicates are dropped.
export function parseSelection(answer: string, count: number): number[] {
  const indexes = new Set<number>();
  for (const part of answer
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    const from = Number(range ? range[1] : part);
    const to = Number(range ? range[2] : part);
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 1 ||
      to > count ||
      from > to
    ) {
      throw new Error(`'${part}' is not a choice from 1 to ${count}.`);
    }
    for (let n = from; n <= to; n++) indexes.add(n - 1);
  }
  return [...indexes];
}

function localBranches(): string[] {
  return captureArgs([
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
  ])
    .split("\n")
    .filter(Boolean);
}

function remoteBranches(): string[] {
  return captureArgs(["ls-remote", "--heads", "origin"])
    .split("\n")
    .filter(Boolean)
    .map((line) => (line.split("\t")[1] ?? "").replace(/^refs\/heads\//, ""));
}

// Local branches whose origin copy was deleted. After `fetch --prune`, git marks their
// upstream as [gone]. Containers and the checked-out branch are never offered.
export function obsoleteOf(forEachRef: string, current: string): Option[] {
  return forEachRef
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name = "", track = ""] = line.split("|");
      return { name, gone: track.includes("[gone]") };
    })
    .filter(({ name, gone }) => gone && name !== current && !isContainer(name))
    .map(({ name }) => ({ name, label: `${name}  (origin deleted)` }));
}

// Lists the options (the first `limit`, or all) and reads which ones to remove.
async function choose(options: Option[], limit?: number): Promise<string[]> {
  if (options.length === 0) {
    console.log("No branches to remove.");
    return [];
  }
  const shown = limit === undefined ? options : options.slice(0, limit);
  if (!process.stdin.isTTY) {
    throw new Error(
      "pass a branch name with -b, e.g. gith remove -b <branch>; the list needs a terminal",
    );
  }
  for (const [i, option] of shown.entries()) {
    console.log(`  ${i + 1}. ${option.label}`);
  }
  if (shown.length < options.length) {
    console.log(
      `showing ${shown.length} of ${options.length}; -limit <n> shows more`,
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      "Remove which? Numbers or ranges, e.g. 1,3-4 (empty cancels): ",
    );
    return parseSelection(answer, shown.length).map(
      (i) => shown[i]?.name ?? "",
    );
  } finally {
    rl.close();
  }
}

// Lists the candidates for a scope and reads which ones to remove.
function pick(scope: Scope, limit?: number): Promise<string[]> {
  const remote = scope === "local" ? [] : remoteBranches();
  return choose(
    candidates(scope, localBranches(), remote, currentBranch()),
    limit,
  );
}

function currentBranch(): string {
  return capture("rev-parse --abbrev-ref HEAD");
}

// Deletes the local branch (git branch -d refuses unmerged ones), the origin branch, or both.
function removeBranches(scope: Scope, names: string[]): void {
  for (const name of names) {
    if (scope !== "remote") gitArgs(["branch", "-d", "--", name]);
    if (scope !== "local") gitArgs(["push", "origin", "--delete", name]);
  }
}

// gith remove -b <branch> [--remote | --both]: removes that branch.
// gith remove -b [--remote | --both]: lists the branches and asks which to remove.
export async function remove(flags: Flags): Promise<void> {
  const name = flags.get("branch");
  const picked = onlyOne(flags, ["remote", "both"]);
  if (flags.has("obsolete")) {
    if (name !== undefined || picked)
      throw new Error("usage: gith remove --obsolete [-l <n>]");
    const forEachRef = captureArgs([
      "for-each-ref",
      "--format=%(refname:short)|%(upstream:track)",
      "refs/heads",
    ]);
    const options = obsoleteOf(forEachRef, currentBranch());
    removeBranches("local", await choose(options, parseLimit(flags)));
    return;
  }
  if (name === undefined)
    throw new Error("usage: gith remove -b [<branch>] [--remote | --both]");
  const scope: Scope = picked ?? "local";

  if (name) {
    if (flags.has("limit"))
      throw new Error(
        "-limit only applies to listings: gith remove -b with no name.",
      );
    assertBranchName(name);
    if (isContainer(name))
      throw new Error(`'${name}' is a container and cannot be removed.`);
    removeBranches(scope, [name]);
    return;
  }
  removeBranches(scope, await pick(scope, parseLimit(flags)));
}

// gith sync: fetches every remote with tags, pruning deleted refs.
export function sync(flags: Flags): void {
  noFlags(flags, "sync");
  gitArgs(["fetch", "--all", "--tags", "--prune"]);
}

// gith reset: discards uncommitted changes on this branch and removes untracked files
// and directories. Ignored files are kept. Nothing here can be undone.
export function reset(flags: Flags): void {
  noFlags(flags, "reset");
  if (isDryRun()) {
    console.log(captureArgs(["status", "--short"]) || "No changes to discard.");
  }
  gitArgs(["reset", "--hard"]);
  clean(flags);
}

// gith clean: removes untracked files and directories. Ignored files are kept.
export function clean(flags: Flags): void {
  noFlags(flags, "clean");
  if (isDryRun()) {
    console.log(
      captureArgs(["clean", "-nd"]) || "No untracked files to remove.",
    );
  }
  gitArgs(["clean", "-fd"]);
}
