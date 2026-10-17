import { type Flags, onlyOne } from "./args";
import {
  assertClean,
  assertSynced,
  capture,
  captureArgs,
  git,
  gitArgs,
  hasOnOrigin,
  listTags,
} from "./git";
import {
  type ContainerKind,
  containerBase,
  containerName,
  isContainer,
  isTarget,
} from "./rules";
import { compare, nextVersion, parseSemver, type Semver } from "./versions";

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

// The release/* or hotfix/* branch with the highest version, among the local branches and the
// ones on origin. Versions compare as numbers, so 1.10.0 is newer than 1.9.0.
function newestContainer(kind: ContainerKind): string {
  const prefix = `${kind}/`;
  const local = captureArgs([
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
  ]).split("\n");
  const origin = captureArgs(["ls-remote", "--heads", "origin"])
    .split("\n")
    .map((line) => (line.split("\t")[1] ?? "").replace(/^refs\/heads\//, ""));
  const candidates = new Set(
    [...local, ...origin].filter((name) => name.startsWith(prefix)),
  );
  let newest: { name: string; version: Semver } | undefined;
  for (const name of candidates) {
    const version = parseSemver(name.slice(prefix.length));
    if (version && (!newest || compare(version, newest.version) > 0))
      newest = { name, version };
  }
  if (!newest)
    throw new Error(`no ${kind} branch exists, locally or on origin.`);
  return newest.name;
}

// Creates a work branch named by its goal, from origin/develop, and pushes it with upstream
// tracking. Leaves the current branch checked out.
export function createBranch(goal: string): void {
  if (isContainer(goal))
    throw new Error(`'${goal}' is a container name; pick a goal.`);
  if (hasOnOrigin(goal)) throw new Error(`'${goal}' already exists on origin.`);
  gitArgs(["fetch", "origin", "develop"]);
  gitArgs(["branch", goal, "origin/develop"]);
  gitArgs(["push", "-u", "origin", goal]);
}

// Next version after the latest tag (local or origin): release bumps the minor,
// hotfix bumps the patch.
// Steps past versions whose container branch already exists on origin.
function nextContainerVersion(kind: ContainerKind): string {
  const bump = kind === "release" ? "minor" : "patch";
  const tags = listTags();
  let version = nextVersion(tags, bump);
  while (hasOnOrigin(containerName(kind, version))) {
    tags.push(version);
    version = nextVersion(tags, bump);
  }
  console.log(`Next ${kind} version from existing tags: ${version}`);
  return version;
}

// Creates release/<version> from develop, or hotfix/<version> from main, without switching.
function open(kind: ContainerKind, version: string): void {
  const name = containerName(kind, version);
  if (hasOnOrigin(name)) throw new Error(`'${name}' already exists on origin.`);
  const base = containerBase(kind);
  gitArgs(["fetch", "origin", base]);
  gitArgs(["branch", name, `origin/${base}`]);
  gitArgs(["push", "-u", "origin", name]);
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
  assertClean();

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
