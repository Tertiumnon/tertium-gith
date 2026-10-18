import { captureArgs, gitArgs, hasOnOrigin, listTags } from "../git/git";
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
export function open(kind: ContainerKind, version: string): void {
  const name = containerName(kind, version);
  if (hasOnOrigin(name)) throw new Error(`'${name}' already exists on origin.`);
  const base = containerBase(kind);
  gitArgs(["fetch", "origin", base]);
  gitArgs(["branch", name, `origin/${base}`]);
  gitArgs(["push", "-u", "origin", name]);
}
