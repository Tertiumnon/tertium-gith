import { parseLimit } from "../args/args";
import type { Flags } from "../args/args.types";
import { assertCleanTree, captureArgs, gitArgs, isDryRun } from "../git/git";
import { confirm } from "../prompt/prompt";
import { push } from "../remote/remote";
import { isContainer } from "../rules/rules";
import { assertNotPushed, currentBranch, noFlags } from "./history.utils";

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

export const save = (flags: Flags): void => {
  const message = flags.get("message");
  const extra = [...flags.keys()].filter(
    (key) => key !== "message" && key !== "all" && key !== "&push",
  );
  if (extra.length > 0 || message === undefined || message.trim() === "")
    throw new Error('usage: gith save -m <message> [--all] ["--&push"]');
  currentBranch();
  const unstaged = captureArgs(["add", "-A", "--dry-run"])
    .split("\n")
    .filter(Boolean);
  const stageAll = flags.has("all") || unstaged.length === 1;
  if (stageAll && unstaged.length > 0) {
    process.stdout.write(
      `Staging ${unstaged.length} unstaged change(s):\n${unstaged.join("\n")}\n`,
    );
  }
  if (stageAll) gitArgs(["add", "-A"]);
  if (
    captureArgs(["diff", "--cached", "--name-only"]) === "" &&
    !(isDryRun() && stageAll && unstaged.length > 0)
  ) {
    throw new Error(
      "nothing staged; stage the changes with git add, or use gith save -m <message> --all.",
    );
  }
  gitArgs(["commit", "-m", message]);
  process.stdout.write(
    isDryRun() ? "Would save locally.\n" : "Saved locally.\n",
  );
  if (flags.has("&push")) push(new Map());
};

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
