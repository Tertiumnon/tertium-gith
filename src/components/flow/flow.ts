import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { onlyOne } from "../args/args";
import type { Flags } from "../args/args.types";
import { assertAllowedFlags } from "../args/args.utils";
import { changelog } from "../changelog/changelog";
import { parsePackageVersion } from "../changelog/changelog.utils";
import {
  assertCleanTree,
  assertSynced,
  capture,
  captureArgs,
  git,
  gitArgs,
  hasLocal,
  hasOnOrigin,
  isDryRun,
} from "../git/git";
import { confirm, select } from "../prompt/prompt";
import { containerName, isContainer, isTarget } from "../rules/rules";
import type { ContainerKind } from "../rules/rules.types";
import { parseSemver } from "../versions/versions";
import {
  containers,
  newestContainer,
  nextContainerVersion,
  open,
} from "./flow.utils";

// gith create -b <branch> | -r <version> | -h <version> | --release | --hotfix
// Creates the branch and pushes it, but never switches: the current branch stays checked out.
export function create(flags: Flags): void {
  assertAllowedFlags(flags, ["branch", "release", "hotfix"], "create");
  const kind = onlyOne(flags, ["branch", "release", "hotfix"]);
  if (!kind)
    throw new Error(
      "usage: gith create -b <branch> | -r <version> | -h <version> | --release | --hotfix",
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
// gith merge --main: merges this branch into main. Without flags, asks which branch to merge and
// which branch to merge it into.
// --release and --hotfix pick among matching branches; -r and -h select a version directly.
export async function merge(flags: Flags): Promise<void> {
  assertAllowedFlags(
    flags,
    [
      "develop",
      "main",
      "release",
      "hotfix",
      "current-release",
      "current-hotfix",
    ],
    "merge",
  );
  if (flags.size === 0) return mergePick();
  const kind = onlyOne(flags, [
    "develop",
    "main",
    "release",
    "hotfix",
    "current-release",
    "current-hotfix",
  ]);
  let target = "develop";
  if (kind === "develop") target = "develop";
  else if (kind === "main") target = "main";
  else if (kind === "current-release") target = newestContainer("release");
  else if (kind === "current-hotfix") target = newestContainer("hotfix");
  else if (kind) {
    const version = flags.get(kind) ?? "";
    const picked =
      version === "" ? await pickContainer(kind) : containerName(kind, version);
    if (picked === undefined) return;
    target = picked;
  }
  await mergeInto(target);
}

// The release or hotfix to merge into when no version is given: the only one, or the picked one.
// Undefined when the picker is cancelled.
async function pickContainer(kind: ContainerKind): Promise<string | undefined> {
  const names = containers(kind);
  if (names.length === 0)
    throw new Error(`no ${kind} branch exists, locally or on origin.`);
  if (names.length === 1) return names[0];
  if (!process.stdin.isTTY) {
    throw new Error(
      `several ${kind} branches exist; pass -${kind === "release" ? "r" : "h"} <version> instead; the list needs a terminal`,
    );
  }
  const [picked] = await select(
    `Merge into which ${kind}?`,
    names.map((name) => ({ name, label: name })),
    false,
  );
  return picked;
}

// The name of a work branch: develop--<goal> when it starts from develop, so its source shows in
// the name. From a commit (a detached HEAD) there is no source branch, so the goal is the name.
export function workBranchName(goal: string, from?: string): string {
  return from === undefined ? `develop--${goal}` : goal;
}

// Creates a work branch named by workBranchName, from origin/develop, and pushes it with upstream
// tracking. Leaves the current branch checked out. Returns the name it created.
// `from` is the commit to start from; by default the latest origin/develop.
export function createBranch(goal: string, from?: string): string {
  if (isContainer(goal))
    throw new Error(`'${goal}' is a container name; pick a goal.`);
  const name = workBranchName(goal, from);
  if (hasOnOrigin(name)) throw new Error(`'${name}' already exists on origin.`);
  if (from === undefined) {
    gitArgs(["fetch", "origin", "develop"]);
    gitArgs(["branch", name, "origin/develop"]);
  } else {
    gitArgs(["branch", name, from]);
  }
  gitArgs(["push", "-u", "origin", name]);
  return name;
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

// Makes package.json carry the branch version. Only a package.json can be set here; a project
// without one is bumped by hand.
function alignVersion(version: string): void {
  if (!existsSync("package.json")) return;
  const current = parsePackageVersion(readFileSync("package.json", "utf8"));
  if (current === version) return;
  if (isDryRun()) {
    console.log(
      `> npm version ${version} --no-git-tag-version --ignore-scripts`,
    );
  } else {
    execSync(`npm version ${version} --no-git-tag-version --ignore-scripts`, {
      stdio: "inherit",
    });
  }
  gitArgs(["add", "--", "package.json"]);
  gitArgs(["commit", "-m", version, "--", "package.json"]);
}

// Adds the release's changelog entry as its own commit, unless the file already has it.
function addChangelogEntry(version: string): void {
  if (!existsSync("package.json")) return;
  const file = "CHANGELOG.md";
  if (
    existsSync(file) &&
    readFileSync(file, "utf8").includes(`## ${version} - `)
  )
    return;
  changelog(new Map());
}

// gith finish --current-release | --current-hotfix: releases the newest release/* or hotfix/*.
// Makes its version match the branch name, adds its changelog entry, merges it into main, tags it,
// merges main into develop, and asks before deleting the branch.
export async function finish(flags: Flags): Promise<void> {
  const kind = onlyOne(flags, ["current-release", "current-hotfix"]);
  if (!kind || flags.size > 1)
    throw new Error("usage: gith finish --current-release | --current-hotfix");
  const containerKind = kind === "current-release" ? "release" : "hotfix";
  const branch = newestContainer(containerKind);
  const version = branch.slice(containerKind.length + 1);
  if (parseSemver(version) === undefined)
    throw new Error(`'${branch}' is not named with a version (X.Y.Z).`);
  assertCleanTree();

  gitArgs(["switch", "--", branch]);
  gitArgs(["pull", "--ff-only", "origin", branch]);
  alignVersion(version);
  addChangelogEntry(version);

  gitArgs(["switch", "--", "main"]);
  gitArgs(["pull", "--ff-only", "origin", "main"]);
  try {
    gitArgs(["merge", "--no-ff", branch, "-m", `Merge '${branch}' into main`]);
  } catch {
    gitArgs(["merge", "--abort"]);
    throw new Error(
      `merging '${branch}' into main conflicts; resolve it by hand, then retry.`,
    );
  }
  gitArgs(["tag", "-a", `v${version}`, "-m", `v${version}`]);
  gitArgs(["push", "origin", "main"]);
  gitArgs(["push", "origin", `v${version}`]);

  if (hasOnOrigin("develop")) {
    gitArgs(["switch", "--", "develop"]);
    gitArgs(["pull", "--ff-only", "origin", "develop"]);
    gitArgs(["merge", "--no-edit", "main"]);
    gitArgs(["push", "origin", "develop"]);
  }
  gitArgs(["switch", "--", "main"]);
  await deleteMergedBranch(branch);
}
