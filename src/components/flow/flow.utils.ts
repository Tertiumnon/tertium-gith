import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parsePackageVersion } from "../changelog/changelog.utils";
import {
  assertBranchName,
  captureArgs,
  gitArgs,
  hasLocal,
  hasOnOrigin,
  isDryRun,
  listTags,
} from "../git/git";
import { containerBase, containerName } from "../rules/rules";
import type { ContainerKind } from "../rules/rules.types";
import { compare, nextVersion, parseSemver } from "../versions/versions";
import type { Semver } from "../versions/versions.types";

// Every release/* or hotfix/* branch with a version, among the local branches and the ones on
// origin, newest first. Versions compare as numbers, so 1.10.0 is newer than 1.9.0.
export function containers(kind: ContainerKind): string[] {
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
  const versioned: { name: string; version: Semver }[] = [];
  for (const name of candidates) {
    const version = parseSemver(name.slice(prefix.length));
    if (version) versioned.push({ name, version });
  }
  return versioned
    .sort((a, b) => compare(b.version, a.version))
    .map((item) => item.name);
}

// The newest release/* or hotfix/* branch (see containers).
export function newestContainer(kind: ContainerKind): string {
  const [newest] = containers(kind);
  if (!newest)
    throw new Error(`no ${kind} branch exists, locally or on origin.`);
  return newest;
}

// Next version after the latest tag (local or origin): release bumps the minor,
// hotfix bumps the patch.
// Steps past versions whose container branch already exists on origin.
export function nextContainerVersion(kind: ContainerKind): string {
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
export const open = (
  kind: ContainerKind,
  version: string,
  shouldUpdateVersion: boolean,
): void => {
  if (shouldUpdateVersion && !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(
      "npm version updates require a version in X.Y.Z format; use -r or -h with that version.",
    );
  const name = containerName(kind, version);
  assertBranchName(name);
  if (hasLocal(name)) throw new Error(`'${name}' already exists locally.`);
  if (hasOnOrigin(name)) throw new Error(`'${name}' already exists on origin.`);
  const base = containerBase(kind);
  gitArgs(["fetch", "origin", base]);
  const needsVersionUpdate =
    shouldUpdateVersion &&
    parsePackageVersion(
      captureArgs(["show", `origin/${base}:package.json`]),
    ) !== version;
  gitArgs(["branch", name, `origin/${base}`]);
  if (needsVersionUpdate) updateContainerVersion(name, version);
  gitArgs(["push", "-u", "origin", name]);
};

const updateContainerVersion = (name: string, version: string): void => {
  if (isDryRun()) {
    process.stdout.write(
      `> npm version ${version} --no-git-tag-version --ignore-scripts (temporary worktree for ${name})\n`,
    );
    return;
  }
  const cwd = mkdtempSync(path.join(tmpdir(), "gith-version-"));
  gitArgs(["worktree", "add", cwd, name]);
  const hasDependencies = existsSync("node_modules");
  if (hasDependencies)
    symlinkSync(
      realpathSync("node_modules"),
      path.join(cwd, "node_modules"),
      "junction",
    );
  try {
    commitContainerVersion(cwd, version);
  } finally {
    // Git's worktree cleanup can traverse Windows junctions and delete shared dependencies.
    if (hasDependencies) unlinkSync(path.join(cwd, "node_modules"));
  }
  gitArgs(["worktree", "remove", cwd]);
};

const commitContainerVersion = (cwd: string, version: string): void => {
  const result = spawnSync(
    "npm",
    ["version", version, "--no-git-tag-version", "--ignore-scripts"],
    {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `npm version failed; inspect the preserved worktree at ${cwd} and retry.`,
      { cause: result.error },
    );
  gitArgs(
    [
      "add",
      "--",
      ...["package.json", "package-lock.json", "npm-shrinkwrap.json"].filter(
        (file) => existsSync(path.join(cwd, file)),
      ),
    ],
    { cwd },
  );
  gitArgs(["commit", "-m", version], { cwd });
};
