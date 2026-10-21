import { parseLimit } from "../args/args";
import type { Flags } from "../args/args.types";
import { assertCleanTree, captureArgs, gitArgs, isDryRun } from "../git/git";
import { confirm } from "../prompt/prompt";
import { isContainer } from "../rules/rules";
import {
  askMessage,
  assertNotPushed,
  currentBranch,
  noFlags,
  remoteSha,
} from "./history.utils";

// gith update: merges origin/develop into this work branch, so it has the latest develop.
export function update(flags: Flags): void {
  noFlags(flags, "update");
  const branch = currentBranch();
  if (isContainer(branch))
    throw new Error(
      `'${branch}' is a container; update works on a work branch.`,
    );
  assertCleanTree();
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
  assertCleanTree();
  assertNotPushed();
  gitArgs(["reset", "--soft", "HEAD~1"]);
}

// gith save: commits the staged changes locally and never pushes without asking. Unstaged changes are
// staged first (git add -A): one file silently, several after asking; --all stages without asking.
// With commits of its own, it asks to amend the previous commit: yes folds the changes into it (-m
// replaces its message), no creates a new commit, asking for its message unless -m is given. Then it
// asks to push, or to force-push when it amended a commit origin has.
export async function save(flags: Flags): Promise<void> {
  const message = flags.get("message");
  const extra = [...flags.keys()].filter(
    (key) => key !== "message" && key !== "all",
  );
  if (extra.length > 0)
    throw new Error("usage: gith save [-m <message>] [--all]");
  const branch = currentBranch();
  const unstaged = captureArgs(["add", "-A", "--dry-run"])
    .split("\n")
    .filter(Boolean);
  const stageAll =
    flags.has("all") ||
    unstaged.length === 1 ||
    (unstaged.length > 1 &&
      (await confirm(`Stage all ${unstaged.length} changes first? [Y/n] `)));
  if (stageAll && unstaged.length > 0) {
    console.log(`Staging ${unstaged.length} unstaged change(s):`);
    for (const line of unstaged) console.log(`  ${line}`);
  }
  if (stageAll) gitArgs(["add", "-A"]);
  if (captureArgs(["diff", "--cached", "--name-only"]) === "") {
    throw new Error("nothing staged; stage the changes to save.");
  }
  const previous = captureArgs(["rev-parse", "HEAD"]);
  const amend =
    hasOwnCommit() && (await confirm("Amend the previous commit? [Y/n] "));
  if (amend) {
    gitArgs(
      message
        ? ["commit", "--amend", "-m", message]
        : ["commit", "--amend", "--no-edit"],
    );
  } else {
    gitArgs(["commit", "-m", message ?? (await askMessage())]);
  }
  const rewrites = amend && remoteSha(branch) === previous;
  const question = rewrites
    ? `Force-push ${branch} to origin? [Y/n] `
    : `Push ${branch} to origin? [Y/n] `;
  if (!(await confirm(question))) {
    console.log("Saved locally; not pushed.");
    return;
  }
  if (rewrites) gitArgs(["push", "--force-with-lease", "origin", branch]);
  else gitArgs(["push", "-u", "origin", branch]);
}

// gith squash -limit <n> [-m <message>]: combines the last n commits into one. Without -m the
// result keeps the oldest of them: its message and author.
export async function squash(flags: Flags): Promise<void> {
  const count = parseLimit(flags);
  const message = flags.get("message");
  const extra = [...flags.keys()].filter(
    (key) => key !== "limit" && key !== "message",
  );
  if (count === undefined || extra.length > 0) {
    throw new Error("usage: gith squash -limit <n> [-m <message>]");
  }
  if (count < 2) throw new Error("-limit needs at least 2 commits to squash.");

  const branch = currentBranch();
  if (isContainer(branch))
    throw new Error(
      `'${branch}' is a container; squash works on a work branch.`,
    );
  assertCleanTree();

  const total = Number(captureArgs(["rev-list", "--count", "HEAD"]));
  if (count >= total) {
    throw new Error(
      `only ${total} commits on this branch; squashing ${count} would reach the first commit.`,
    );
  }
  const commits = captureArgs(["rev-list", `-n${count}`, "HEAD"]).split("\n");
  const oldest = commits[count - 1] ?? "";
  if (captureArgs(["rev-list", "--merges", `-n${count}`, "HEAD"]) !== "") {
    throw new Error("the commits include a merge; squashing would flatten it.");
  }
  if (captureArgs(["branch", "-r", "--contains", oldest]) !== "") {
    throw new Error(
      "these commits are already on origin; squashing them would need a force-push.",
    );
  }

  console.log("Will combine:");
  for (const line of captureArgs(["log", `-n${count}`, "--oneline"]).split(
    "\n",
  )) {
    console.log(`  ${line}`);
  }
  if (!(await confirm(`Combine these ${count} commits into one? [Y/n] `))) {
    console.log("Nothing changed.");
    return;
  }
  gitArgs(["reset", "--soft", `HEAD~${count}`]);
  if (message) gitArgs(["commit", "-m", message]);
  else gitArgs(["commit", "-C", oldest]);
}

// True when this branch has commits of its own: commits that origin's develop (or main) lacks.
// Without one, HEAD belongs to the base branch, so save must not rewrite it.
function hasOwnCommit(): boolean {
  for (const base of ["origin/develop", "origin/main"]) {
    try {
      return captureArgs(["rev-list", "--count", `${base}..HEAD`]) !== "0";
    } catch {
      // This base does not exist here; try the next one.
    }
  }
  return true;
}
