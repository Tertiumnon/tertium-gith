import { onlyOne, parseLimit } from "../args/args";
import type { Flags } from "../args/args.types";
import { createBranch } from "../flow/flow";
import { newestContainer } from "../flow/flow.utils";
import {
  assertBranchName,
  assertCleanTree,
  captureArgs,
  gitArgs,
  hasLocal,
  hasOnOrigin,
  isDetached,
} from "../git/git";
import { confirm, select } from "../prompt/prompt";
import { containerName, isContainer } from "../rules/rules";
import { DEFAULT_DAYS } from "./maintenance.constants";
import type { Option, Scope, Sides } from "./maintenance.types";
import {
  currentBranch,
  day,
  localBranches,
  noFlags,
  parsePositive,
  remoteBranches,
  requireBranch,
  sidesLabel,
} from "./maintenance.utils";

// gith switch -b <branch>: switches to the branch. If it exists neither here nor on origin,
// it is created first, the same way as gith create -b.
// gith switch -commit <sha>: detaches HEAD at that commit, after the tracked files are clean.
// On a detached HEAD, gith switch -b creates the branch at the current commit, so new commits
// stay on it.
export async function switchBranch(flags: Flags): Promise<void> {
  if (flags.size === 0) return switchPick();
  // --release and --hotfix go to the newest existing branch; -r <v> and -h <v> to that version.
  // They only switch: a branch that does not exist is an error, never created here.
  const kind = onlyOne(flags, ["release", "hotfix"]);
  if (kind !== undefined) {
    if (flags.size > 1)
      throw new Error(
        `usage: gith switch --${kind} | -${kind === "release" ? "r" : "h"} <version>`,
      );
    const version = flags.get(kind) ?? "";
    const name =
      version === "" ? newestContainer(kind) : containerName(kind, version);
    if (!hasLocal(name) && !hasOnOrigin(name)) {
      throw new Error(`'${name}' does not exist, locally or on origin.`);
    }
    gitArgs(["switch", "--", name]);
    return;
  }
  const commit = flags.get("commit");
  if (commit !== undefined) {
    if (flags.has("branch") || flags.size > 1)
      throw new Error("use only one of: -b, -commit.");
    switchToCommit(commit);
    return;
  }
  const branch = requireBranch(flags, "switch");
  if (!hasLocal(branch) && !hasOnOrigin(branch)) {
    createBranch(branch, isDetached() ? "HEAD" : undefined);
  }
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

// Reads `for-each-ref --format=%(refname)|%(committerdate:unix)` over local and origin branches.
export function branchTimes(output: string): Map<string, Sides> {
  const times = new Map<string, Sides>();
  for (const line of output.split("\n").filter(Boolean)) {
    const [ref = "", time = "0"] = line.split("|");
    const seconds = Number(time);
    if (ref.startsWith("refs/heads/")) {
      const name = ref.slice("refs/heads/".length);
      times.set(name, { ...times.get(name), local: seconds });
    } else if (
      ref.startsWith("refs/remotes/origin/") &&
      ref !== "refs/remotes/origin/HEAD"
    ) {
      const name = ref.slice("refs/remotes/origin/".length);
      times.set(name, { ...times.get(name), origin: seconds });
    }
  }
  return times;
}

// Branches untouched since the cutoff: no commit on any side newer than it. With the local
// scope only the local side counts. Containers and the checked-out branch are never offered.
export function staleOptions(
  times: Map<string, Sides>,
  scope: "pair" | "local",
  cutoff: number,
  current: string,
): Option[] {
  const options: Option[] = [];
  for (const [name, sides] of times) {
    if (isContainer(name) || name === current) continue;
    if (scope === "local" && sides.local === undefined) continue;
    const last =
      scope === "local"
        ? sides.local
        : Math.max(sides.local ?? 0, sides.origin ?? 0);
    if (last === undefined || last >= cutoff) continue;
    options.push({
      name,
      label: `${name}  (${sidesLabel(sides)}, last commit ${day(last)})`,
    });
  }
  return options.sort((x, y) => x.name.localeCompare(y.name));
}

// Local branches with no origin copy. Containers and the checked-out branch are never offered.
export function detachedOptions(
  times: Map<string, Sides>,
  current: string,
): Option[] {
  const options: Option[] = [];
  for (const [name, sides] of times) {
    if (sides.local === undefined || sides.origin !== undefined) continue;
    if (isContainer(name) || name === current) continue;
    options.push({ name, label: `${name}  (local only)` });
  }
  return options.sort((x, y) => x.name.localeCompare(y.name));
}

// gith remove -b <branch> [--local | --remote]: removes the branch here and on origin, or one side.
// gith remove --branch [--local | --remote]: lists the branches and asks which to remove.
export async function remove(flags: Flags): Promise<void> {
  const name = flags.get("branch");
  const side = onlyOne(flags, ["local", "remote"]);
  const scope: Scope = side ?? "pair";
  const obsoleteOn = flags.has("obsolete");
  const detachedOn = flags.has("detached");
  if (obsoleteOn && detachedOn)
    throw new Error("use only one of: --obsolete, --detached.");
  if (flags.has("days") && !obsoleteOn)
    throw new Error("-days only applies to --obsolete.");
  if (flags.has("all") && !detachedOn)
    throw new Error("--all only applies to --detached.");
  if (obsoleteOn || detachedOn) {
    const usage = detachedOn
      ? "usage: gith remove --detached [--all | -l <n>]"
      : "usage: gith remove --obsolete [--local] [-days <n>] [-l <n>]";
    if (
      name !== undefined ||
      (obsoleteOn && side === "remote") ||
      (detachedOn && side)
    )
      throw new Error(usage);
    if (detachedOn) return detached(flags);
    return obsolete(flags, side === "local" ? "local" : "pair");
  }
  if (name === undefined)
    throw new Error(
      "usage: gith remove -b <branch> [--local | --remote], or gith remove --branch to pick",
    );

  if (name) {
    if (flags.has("limit"))
      throw new Error("-limit only applies to listings: gith remove --branch.");
    assertBranchName(name);
    if (isContainer(name))
      throw new Error(`'${name}' is a container and cannot be removed.`);
    await removeBranches(scope, [name]);
    return;
  }
  requireTerminal();
  await removeBranches(scope, await pick(scope, parseLimit(flags)));
}

// gith sync: fetches every remote with tags, pruning deleted refs.
export function sync(flags: Flags): void {
  noFlags(flags, "sync");
  gitArgs(["fetch", "--all", "--tags", "--prune"]);
}

// gith reset: discards every uncommitted change on this branch, and removes untracked files and
// directories (ignored files are kept). Lists what it will discard, and asks first.
export async function reset(flags: Flags): Promise<void> {
  noFlags(flags, "reset");
  const changes = captureArgs(["status", "--short"])
    .split("\n")
    .filter(Boolean);
  const untracked = untrackedPaths();
  if (changes.length === 0 && untracked.length === 0) {
    console.log("Nothing to discard.");
    return;
  }
  console.log("Will discard:");
  for (const line of changes) console.log(`  ${line}`);
  for (const path of untracked) console.log(`  ?? ${path}`);
  if (!(await confirm("Discard all of this? It cannot be undone. [Y/n] "))) {
    console.log("Nothing discarded.");
    return;
  }
  gitArgs(["reset", "--hard"]);
  if (untracked.length > 0) gitArgs(["clean", "-fd"]);
}

// gith clean: removes untracked files and directories (ignored files are kept). Lists what it
// will remove, and asks first.
export async function clean(flags: Flags): Promise<void> {
  noFlags(flags, "clean");
  const untracked = untrackedPaths();
  if (untracked.length === 0) {
    console.log("No untracked files to remove.");
    return;
  }
  console.log("Will remove:");
  for (const path of untracked) console.log(`  ${path}`);
  if (
    !(await confirm(`Remove these ${untracked.length} untracked paths? [Y/n] `))
  ) {
    console.log("Nothing removed.");
    return;
  }
  gitArgs(["clean", "-fd"]);
}

// Lists the options (the first `limit`, or all) and reads which ones to remove.
const REMOVE_ACTION = {
  empty: "No branches to remove.",
  prompt: "Remove which?",
  multi: true,
};

// Lists the options and lets the user pick with the arrow keys. Returns the picked names.
async function choose(
  options: Option[],
  limit?: number,
  action = REMOVE_ACTION,
): Promise<string[]> {
  if (options.length === 0) {
    console.log(action.empty);
    return [];
  }
  const shown = limit === undefined ? options : options.slice(0, limit);
  if (shown.length < options.length) {
    console.log(
      `showing ${shown.length} of ${options.length}; -limit <n> shows more`,
    );
  }
  return select(action.prompt, shown, action.multi);
}

// gith switch: lists local and origin branches, and switches to the one picked.
function switchOptions(): Option[] {
  const local = localBranches();
  const origin = remoteBranches();
  const current = currentBranch();
  const names = [...new Set([...local, ...origin])].sort((a, b) =>
    a.localeCompare(b),
  );
  return names.map((name) => {
    const where =
      local.includes(name) && origin.includes(name)
        ? "local + origin"
        : local.includes(name)
          ? "local"
          : "origin";
    return {
      name,
      label: `${name}  (${where}${name === current ? ", current" : ""})`,
    };
  });
}

async function switchPick(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error(
      "pass a branch name with -b, e.g. gith switch -b <branch>; the list needs a terminal",
    );
  }
  const picked = await choose(switchOptions(), undefined, {
    empty: "No branches.",
    prompt: "Switch to which?",
    multi: false,
  });
  if (picked.length === 0) return;
  if (picked.length > 1)
    throw new Error("pick exactly one branch to switch to.");
  gitArgs(["switch", "--", picked[0] ?? ""]);
}

// The picker asks a question, so it needs a terminal. Checked before any listing.
function requireTerminal(): void {
  if (!process.stdin.isTTY) {
    throw new Error(
      "pass a branch name with -b, e.g. gith remove -b <branch>; the list needs a terminal",
    );
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

// Deletes the local branch (git branch -d refuses unmerged ones) and the origin branch.
// A pair removes whichever sides exist, so a branch that only lives here is still removed.
// Every removal prints what it will remove before running anything.
async function removeBranches(
  scope: Scope,
  names: string[],
  ask = true,
): Promise<void> {
  const plan = names.map((name) => {
    if (scope === "remote") return { name, local: false, origin: true };
    if (scope === "local") return { name, local: true, origin: false };
    const local = hasLocal(name);
    const origin = hasOnOrigin(name);
    if (!local && !origin) {
      throw new Error(`'${name}' exists neither locally nor on origin.`);
    }
    return { name, local, origin };
  });
  if (plan.length > 0) console.log("Will remove:");
  if (
    ask &&
    plan.length > 0 &&
    !(await confirm(
      plan.length === 1
        ? "Remove this branch? [Y/n] "
        : `Remove these ${plan.length} branches? [Y/n] `,
    ))
  ) {
    console.log("Nothing removed.");
    return;
  }
  for (const { name, local, origin } of plan) {
    const sides = [local && "local", origin && "origin"]
      .filter(Boolean)
      .join(" + ");
    console.log(`  ${name}  (${sides})`);
  }
  for (const { name, local, origin } of plan) {
    if (local) gitArgs(["branch", "-d", "--", name]);
    if (origin) gitArgs(["push", "origin", "--delete", name]);
  }
}

function readTimes(): Map<string, Sides> {
  return branchTimes(
    captureArgs([
      "for-each-ref",
      "--format=%(refname)|%(committerdate:unix)",
      "refs/heads",
      "refs/remotes/origin",
    ]),
  );
}

// gith remove --obsolete [--local]: branches untouched for -days (default 90) are listed,
// then removed on both sides, or here only with --local, after a Y/n prompt.
async function obsolete(flags: Flags, scope: "pair" | "local"): Promise<void> {
  gitArgs(["fetch", "--prune", "origin"]);
  const days = parsePositive(flags, "days") ?? DEFAULT_DAYS;
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const options = staleOptions(readTimes(), scope, cutoff, currentBranch());
  if (options.length === 0) {
    console.log(`No branches untouched for ${days} days.`);
    return;
  }
  const limit = parseLimit(flags);
  const shown = limit === undefined ? options : options.slice(0, limit);
  console.log(`Untouched for ${days} days or more:`);
  for (const [i, option] of shown.entries()) {
    console.log(`  ${i + 1}. ${option.label}`);
  }
  if (shown.length < options.length) {
    console.log(
      `showing ${shown.length} of ${options.length}; -limit <n> shows more`,
    );
  }
  const where = scope === "local" ? "here" : "here and on origin";
  const yes = await confirm(
    `Remove these ${shown.length} branches ${where}? [Y/n] `,
  );
  if (!yes) {
    console.log("Nothing removed.");
    return;
  }
  await removeBranches(
    scope,
    shown.map((option) => option.name),
    false,
  );
}

// gith remove --detached: local branches with no origin copy, picked from a list.
async function detached(flags: Flags): Promise<void> {
  gitArgs(["fetch", "--prune", "origin"]);
  const options = detachedOptions(readTimes(), currentBranch());
  if (flags.has("all")) {
    if (flags.has("limit")) throw new Error("use only one of: --all, -limit.");
    if (options.length === 0) {
      console.log("No detached branches to remove.");
      return;
    }
    // removeBranches lists every branch and asks Y/n once before anything is deleted.
    await removeBranches(
      "local",
      options.map((option) => option.name),
    );
    return;
  }
  requireTerminal();
  await removeBranches("local", await choose(options, parseLimit(flags)));
}

function switchToCommit(ref: string): void {
  let sha: string;
  try {
    sha = captureArgs(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  } catch {
    throw new Error(`'${ref}' is not a commit in this repository.`);
  }
  assertCleanTree();
  gitArgs(["switch", "--detach", sha]);
  console.log(
    `HEAD is detached at ${sha.slice(0, 7)}. To keep commits made here, run: gith switch -b <name>.`,
  );
}

// Untracked paths that clean would remove, as git reports them.
function untrackedPaths(): string[] {
  return captureArgs(["clean", "-nd"])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replace(/^Would remove /, ""));
}
