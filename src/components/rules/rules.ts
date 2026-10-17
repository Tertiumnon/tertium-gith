import { CONTAINER, TARGET } from "./rules.constants";
import type { ContainerKind } from "./rules.types";

export function isContainer(name: string): boolean {
  return CONTAINER.test(name);
}

export function isTarget(name: string): boolean {
  return TARGET.test(name);
}

// `gith create -r 1.2.0` -> release/1.2.0 (its base is develop).
// `gith create -h 1.2.1` -> hotfix/1.2.1 (its base is main).
export function containerName(kind: ContainerKind, version: string): string {
  return `${kind}/${version}`;
}

export function containerBase(kind: ContainerKind): string {
  return kind === "release" ? "develop" : "main";
}
