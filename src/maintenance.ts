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
import { confirm } from "./prompt";
import { isContainer } from "./rules";

// pair: the local branch and its origin copy together (the default). local or remote: one side only.
type Scope = "pair" | "local" | "remote";

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

// The newest commit time on each side of a branch, in unix seconds.
export interface Sides {
  local?: number;
  origin?: number;
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

function sidesLabel(sides: Sides): string {
  if (sides.local !== undefined && sides.origin !== undefined)
    return "local + origin";
  return sides.local !== undefined ? "local" : "origin";
}

function day(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
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

// Lists the options (the first `limit`, or all) and reads which ones to remove.
async function choose(options: Option[], limit?: number): Promise<string[]> {
  if (options.length === 0) {
    console.log("No branches to remove.");
    return [];
  }
  const shown = limit === undefined ? options : options.slice(0, limit);
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

function currentBranch(): string {
  return capture("rev-parse --abbrev-ref HEAD");
}

// Deletes the local branch (git branch -d refuses unmerged ones) and the origin branch.
// A pair removes whichever sides exist, so a branch that only lives here is still removed.
// Every removal prints what it will remove before running anything.
function removeBranches(scope: Scope, names: string[]): void {
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

const DEFAULT_DAYS = 90;

// A positive whole number from a value flag, or undefined when it is not given.
function parsePositive(flags: Flags, name: string): number | undefined {
  const raw = flags.get(name);
  if (raw === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(raw))
    throw new Error(`-${name} needs a positive whole number.`);
  return Number(raw);
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
  removeBranches(
    scope,
    shown.map((option) => option.name),
  );
}

// gith remove --detached: local branches with no origin copy, picked from a list.
async function detached(flags: Flags): Promise<void> {
  requireTerminal();
  gitArgs(["fetch", "--prune", "origin"]);
  const options = detachedOptions(readTimes(), currentBranch());
  removeBranches("local", await choose(options, parseLimit(flags)));
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
  if (obsoleteOn || detachedOn) {
    const usage = detachedOn
      ? "usage: gith remove --detached [-l <n>]"
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
    removeBranches(scope, [name]);
    return;
  }
  requireTerminal();
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
