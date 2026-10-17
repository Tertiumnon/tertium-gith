import type { Worktree } from "./tree.types";

export function flagsOf(worktree: Worktree): string {
  return [
    worktree.bare ? "bare" : "",
    worktree.locked ? "locked" : "",
    worktree.prunable ? "prunable" : "",
  ]
    .filter(Boolean)
    .join(", ");
}
