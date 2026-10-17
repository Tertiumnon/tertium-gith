import { type Flags, onlyOne } from "./args";
import { assertBranchName, gitArgs } from "./git";
import { isContainer } from "./rules";

function requireBranch(flags: Flags, command: string): string {
  const branch = flags.get("branch");
  if (!branch) throw new Error(`usage: gith ${command} -b <branch>`);
  assertBranchName(branch);
  return branch;
}

function noFlags(flags: Flags, command: string): void {
  if (flags.size > 0) throw new Error(`usage: gith ${command}`);
}

// gith switch -b <branch>
export function switchBranch(flags: Flags): void {
  gitArgs(["switch", "--", requireBranch(flags, "switch")]);
}

// gith remove -b <branch> [--remote | --both]: `git branch -d` refuses unmerged branches.
export function remove(flags: Flags): void {
  const branch = requireBranch(flags, "remove");
  if (isContainer(branch))
    throw new Error(`'${branch}' is a container and cannot be removed.`);
  const scope = onlyOne(flags, ["remote", "both"]);
  if (scope !== "remote") gitArgs(["branch", "-d", "--", branch]);
  if (scope) gitArgs(["push", "origin", "--delete", branch]);
}

// gith sync: fetches every remote with tags, pruning deleted refs.
export function sync(flags: Flags): void {
  noFlags(flags, "sync");
  gitArgs(["fetch", "--all", "--tags", "--prune"]);
}

// gith clean: removes untracked files and directories. Ignored files are kept.
export function clean(flags: Flags): void {
  noFlags(flags, "clean");
  gitArgs(["clean", "-fd"]);
}
