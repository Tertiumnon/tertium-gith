import { onlyOne } from "../args/args";
import type { Flags } from "../args/args.types";
import {
  assertCleanTree,
  assertSynced,
  capture,
  git,
  gitArgs,
  hasOnOrigin,
} from "../git/git";
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
export function merge(flags: Flags): void {
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
  mergeInto(target);
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
function mergeInto(target: string): void {
  if (!isTarget(target)) throw new Error(`'${target}' is not a valid target.`);
  const source = capture("rev-parse --abbrev-ref HEAD");
  if (isContainer(source))
    throw new Error(`'${source}' is a container and cannot be merged from.`);
  if (source === target)
    throw new Error(`already on '${target}', nothing to merge.`);
  if (!hasOnOrigin(target))
    throw new Error(`'${target}' does not exist on origin.`);
  assertCleanTree();

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
}
