// Pure branch rules, no git calls, so they can be tested without a repository.

// Containers collect work and are never worked on directly.
const CONTAINER = /^(develop|main|release\/.+|hotfix\/.+)$/;
// Branches a merge can land in.
const TARGET = /^(develop|release\/.+|hotfix\/.+)$/;

export type ContainerKind = "release" | "hotfix";

export function isContainer(name: string): boolean {
  return CONTAINER.test(name);
}

export function isTarget(name: string): boolean {
  return TARGET.test(name);
}

// `gf create -r 1.2.0` -> release/1.2.0 (its base is develop).
// `gf create -h 1.2.1` -> hotfix/1.2.1 (its base is main).
export function containerName(kind: ContainerKind, version: string): string {
  return `${kind}/${version}`;
}

export function containerBase(kind: ContainerKind): string {
  return kind === "release" ? "develop" : "main";
}
