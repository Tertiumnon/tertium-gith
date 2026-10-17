import { onlyOne } from "../args/args";
import type { Flags } from "../args/args.types";
import {
  assertCleanTree,
  assertSynced,
  capture,
  captureArgs,
  git,
  gitArgs,
  hasLocal,
  hasOnOrigin,
} from "../git/git";
import { confirm, select } from "../prompt/prompt";
import { containerName, isContainer, isTarget } from "../rules/rules";
import { newestContainer, nextContainerVersion, open } from "./flow.utils";

// gith create -b <branch> | -r [version] | -h [version]
// Creates the branch and pushes it, but never switches: the current branch stays checked out.
export function create(flags: Flags): void {
  const kind = onlyOne(flags, ["branch", "release", "hotfix"]);
  if (!kind)
    throw new Error(
      "usage: gith create -b <branch> | -r [version] | -h [version]",
    );
  const value = flags.get(kind) ?? "";
  if (kind === "branch") {
    if (!value) throw new Error("usage: gith create -b <branch>");
    createBranch(value);
    return;
  }
  open(kind, value || nextContainerVersion(kind));
}

// gith merge [-r <version> | -h <version>]: merges this branch into develop by default.
// Without flags, asks which branch to merge and which branch to merge it into.
export async function merge(flags: Flags): Promise<void> {
  if (flags.size === 0) return mergePick();
  const kind = onlyOne(flags, [
    "release",
    "hotfix",
    "current-release",
    "current-hotfix",
  ]);
  let target = "develop";
  if (kind === "current-release") target = newestContainer("release");
  else if (kind === "current-hotfix") target = newestContainer("hotfix");
  else if (kind) {
    const version = flags.get(kind) ?? "";
    if (!version) {
      throw new Error(
        `usage: gith merge -${kind === "release" ? "r" : "h"} <version>`,
      );
    }
    target = containerName(kind, version);
  }
  await mergeInto(target);
}

// Creates a work branch named by its goal, from origin/develop, and pushes it with upstream
// tracking. Leaves the current branch checked out.
// `from` is the commit to start from; by default the latest origin/develop.
export function createBranch(goal: string, from?: string): void {
  if (isContainer(goal))
    throw new Error(`'${goal}' is a container name; pick a goal.`);
  if (hasOnOrigin(goal)) throw new Error(`'${goal}' already exists on origin.`);
  if (from === undefined) {
    gitArgs(["fetch", "origin", "develop"]);
    gitArgs(["branch", goal, "origin/develop"]);
  } else {
    gitArgs(["branch", goal, from]);
  }
  gitArgs(["push", "-u", "origin", goal]);
}

// Merges the current work branch into the target branch.
async function mergeInto(target: string, from?: string): Promise<void> {
  if (!isTarget(target)) throw new Error(`'${target}' is not a valid target.`);
  const current = capture("rev-parse --abbrev-ref HEAD");
  const source = from ?? current;
  if (isContainer(source))
    throw new Error(`'${source}' is a container and cannot be merged from.`);
  if (source === target)
    throw new Error(`already on '${target}', nothing to merge.`);
  if (!hasOnOrigin(target))
    throw new Error(`'${target}' does not exist on origin.`);
  assertCleanTree();
  if (source !== current) gitArgs(["switch", "--", source]);

  if (hasOnOrigin(source)) git(`pull origin ${source}`);
  git(`push -u origin ${source}`);

  // Merge the target into the source first, so conflicts surface on the work branch.
  git(`checkout ${target}`);
  git("pull");
  git(`checkout ${source}`);
  try {
    gitArgs(["merge", target, "--no-edit"]);
  } catch {
    gitArgs(["merge", "--abort"]);
    throw new Error(
      `merging '${target}' into '${source}' conflicts; resolve on '${source}' and retry.`,
    );
  }
  git(`push origin ${source}`);

  git(`checkout ${target}`);
  git(`merge --no-ff ${source} --no-edit`);
  git(`push origin ${target}`);
  assertSynced([target, source]);
  console.log(
    `\n✅ '${source}' merged into '${target}', both in sync with origin.`,
  );
  await deleteMergedBranch(source);
}

// The work branch is no longer needed once it is merged. Asks first; without a terminal, or on
// a no, the branch is kept and the merge still stands.
async function deleteMergedBranch(source: string): Promise<void> {
  const local = hasLocal(source);
  const origin = hasOnOrigin(source);
  let yes: boolean;
  try {
    yes = await confirm(
      `Delete '${source}' here and on origin, it is merged? [Y/n] `,
    );
  } catch {
    yes = false;
  }
  if (!yes) {
    console.log(`'${source}' kept.`);
    return;
  }
  if (local) gitArgs(["branch", "-d", "--", source]);
  if (origin) gitArgs(["push", "origin", "--delete", source]);
}

// Lists the local work branches, then the develop, release and hotfix targets, and merges the
// picked branch into the picked target.
async function mergePick(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error(
      "pass -r <version> or -h <version> instead; the pickers need a terminal",
    );
  }
  const current = capture("rev-parse --abbrev-ref HEAD");
  const local = captureArgs([
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
  ])
    .split("\n")
    .filter(Boolean);
  const sources = local
    .filter((name) => !isContainer(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      label: name === current ? `${name}  (current)` : name,
    }));
  if (sources.length === 0) throw new Error("no work branch to merge.");
  const [source] = await select("Which branch to merge?", sources, false);
  if (source === undefined) return;
  const origin = captureArgs(["ls-remote", "--heads", "origin"])
    .split("\n")
    .map((line) => (line.split("\t")[1] ?? "").replace(/^refs\/heads\//, ""))
    .filter(Boolean);
  const targets = [...new Set([...local, ...origin])]
    .filter((name) => isTarget(name) && name !== source)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      label: local.includes(name) ? name : `${name}  (origin)`,
    }));
  if (targets.length === 0)
    throw new Error("no develop, release or hotfix branch to merge into.");
  const [target] = await select(
    `Merge '${source}' into which?`,
    targets,
    false,
  );
  if (target === undefined) return;
  await mergeInto(target, source);
}
