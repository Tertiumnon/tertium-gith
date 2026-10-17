import type { Flags } from "./args";
import { assertClean, capture, captureArgs, gitArgs, isDryRun } from "./git";
import { isContainer } from "./rules";

function noFlags(flags: Flags, command: string): void {
  if (flags.size > 0) throw new Error(`usage: gith ${command}`);
}

// The checked-out branch name. Refuses detached HEAD.
function currentBranch(): string {
  const name = capture("rev-parse --abbrev-ref HEAD");
  if (name === "HEAD")
    throw new Error("HEAD is detached; check out a branch first.");
  return name;
}

// Undoing or amending a commit that origin already has would need a force-push.
function assertNotPushed(): void {
  if (captureArgs(["branch", "-r", "--contains", "HEAD"]) !== "") {
    throw new Error(
      "HEAD is already on origin; changing it would need a force-push.",
    );
  }
}

// gith update: merges origin/develop into this work branch, so it has the latest develop.
export function update(flags: Flags): void {
  noFlags(flags, "update");
  const branch = currentBranch();
  if (isContainer(branch))
    throw new Error(
      `'${branch}' is a container; update works on a work branch.`,
    );
  assertClean();
  gitArgs(["fetch", "origin", "develop"]);
  try {
    gitArgs(["merge", "origin/develop", "--no-edit"]);
  } catch {
    if (isDryRun()) return;
    gitArgs(["merge", "--abort"]);
    throw new Error(
      "merging origin/develop conflicts; the merge was aborted. Resolve it by hand, then retry.",
    );
  }
}

// gith undo: undoes the last commit and keeps its changes staged.
export function undo(flags: Flags): void {
  noFlags(flags, "undo");
  currentBranch();
  assertNotPushed();
  gitArgs(["reset", "--soft", "HEAD~1"]);
}

// gith amend: folds the staged changes into the last commit, keeping its message.
export function amend(flags: Flags): void {
  noFlags(flags, "amend");
  currentBranch();
  assertNotPushed();
  if (captureArgs(["diff", "--cached", "--name-only"]) === "") {
    throw new Error(
      "nothing staged; stage the changes to add to the last commit.",
    );
  }
  gitArgs(["commit", "--amend", "--no-edit"]);
}
