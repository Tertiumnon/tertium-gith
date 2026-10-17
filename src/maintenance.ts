import { createInterface } from "node:readline/promises";
import { type Flags, onlyOne } from "./args";
import { assertBranchName, capture, captureArgs, gitArgs } from "./git";
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

// gith switch -b <branch>
export function switchBranch(flags: Flags): void {
  gitArgs(["switch", "--", requireBranch(flags, "switch")]);
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

// Lists the candidates and reads which ones to remove.
async function pick(scope: Scope): Promise<string[]> {
  const remote = scope === "local" ? [] : remoteBranches();
  const options = candidates(
    scope,
    localBranches(),
    remote,
    capture("rev-parse --abbrev-ref HEAD"),
  );
  if (options.length === 0) {
    console.log("No branches to remove.");
    return [];
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      "pass a branch name with -b, e.g. gith remove -b <branch>; the list needs a terminal",
    );
  }
  for (const [i, option] of options.entries()) {
    console.log(`  ${i + 1}. ${option.label}`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      "Remove which? Numbers or ranges, e.g. 1,3-4 (empty cancels): ",
    );
    return parseSelection(answer, options.length).map(
      (i) => options[i]?.name ?? "",
    );
  } finally {
    rl.close();
  }
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
  if (name === undefined)
    throw new Error("usage: gith remove -b [<branch>] [--remote | --both]");
  const picked = onlyOne(flags, ["remote", "both"]);
  const scope: Scope = picked ?? "local";

  if (name) {
    assertBranchName(name);
    if (isContainer(name))
      throw new Error(`'${name}' is a container and cannot be removed.`);
    removeBranches(scope, [name]);
    return;
  }
  removeBranches(scope, await pick(scope));
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
  gitArgs(["reset", "--hard"]);
  gitArgs(["clean", "-fd"]);
}

// gith clean: removes untracked files and directories. Ignored files are kept.
export function clean(flags: Flags): void {
  noFlags(flags, "clean");
  gitArgs(["clean", "-fd"]);
}
