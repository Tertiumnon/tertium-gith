import { type Flags, parseLimit } from "./args";
import { assertClean, capture, captureArgs, gitArgs, isDryRun } from "./git";
import { confirm } from "./prompt";
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

// Undoing a commit that origin already has would need a force-push.
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

// The commit origin has for this branch, or "" when origin has no such branch.
function remoteSha(branch: string): string {
  return (
    captureArgs(["ls-remote", "--heads", "origin", branch]).split("\t")[0] ?? ""
  );
}

// gith save: folds the staged changes into the last commit, keeping its message. It pushes only
// when origin already has this branch and its copy differs from the new commit: a plain push when
// the commit moves forward, or --force-with-lease after rewriting a pushed commit (asks first).
export async function save(flags: Flags): Promise<void> {
  noFlags(flags, "save");
  const branch = currentBranch();
  if (captureArgs(["diff", "--cached", "--name-only"]) === "") {
    throw new Error(
      "nothing staged; stage the changes to add to the last commit.",
    );
  }
  const pushed = captureArgs(["branch", "-r", "--contains", "HEAD"]) !== "";
  const remote = remoteSha(branch);
  if (pushed && remote === "") {
    throw new Error(
      "HEAD is already on origin under another branch; changing it would need a force-push.",
    );
  }
  if (pushed) {
    const yes = await confirm(
      `HEAD is already on origin/${branch}. Save it and force-push ${branch}? [Y/n] `,
    );
    if (!yes) {
      console.log("save cancelled; nothing changed.");
      return;
    }
  }
  gitArgs(["commit", "--amend", "--no-edit"]);
  if (remote === "") {
    console.log(`origin has no ${branch}; not pushed.`);
    return;
  }
  if (!isDryRun() && captureArgs(["rev-parse", "HEAD"]) === remote) {
    console.log("origin already has this commit; not pushed.");
    return;
  }
  if (pushed) gitArgs(["push", "--force-with-lease", "origin", branch]);
  else gitArgs(["push", "origin", branch]);
}

// gith squash -limit <n> [-m <message>]: combines the last n commits into one. Without -m the
// result keeps the oldest of them: its message and author.
export function squash(flags: Flags): void {
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
  assertClean();

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

  gitArgs(["reset", "--soft", `HEAD~${count}`]);
  if (message) gitArgs(["commit", "-m", message]);
  else gitArgs(["commit", "-C", oldest]);
}
