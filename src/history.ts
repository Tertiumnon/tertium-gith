import { type Flags, parseLimit } from "./args";
import {
  assertCleanTree,
  capture,
  captureArgs,
  gitArgs,
  isDryRun,
} from "./git";
import { ask, confirm } from "./prompt";
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

// The commit origin has for this branch, or "" when origin has no such branch.
function remoteSha(branch: string): string {
  return (
    captureArgs(["ls-remote", "--heads", "origin", branch]).split("\t")[0] ?? ""
  );
}

// gith save: with commits of its own, folds the staged changes into the last commit and keeps its
// message (-m replaces it). Without them, creates a new commit, asking for its message unless -m is
// given. It pushes only when origin already has this branch and its copy differs from the new
// commit: a plain push when the commit moves forward, or --force-with-lease after rewriting a pushed
// commit (asks first).
export async function save(flags: Flags): Promise<void> {
  const message = flags.get("message");
  const extra = [...flags.keys()].filter((key) => key !== "message");
  if (extra.length > 0) throw new Error("usage: gith save [-m <message>]");
  const branch = currentBranch();
  if (captureArgs(["diff", "--cached", "--name-only"]) === "") {
    throw new Error(
      "nothing staged; stage the changes to add to the last commit.",
    );
  }
  const owned = hasOwnCommit();
  const pushed = captureArgs(["branch", "-r", "--contains", "HEAD"]) !== "";
  const rewrite = owned && pushed;
  const remote = remoteSha(branch);
  if (rewrite && remote === "") {
    throw new Error(
      "HEAD is already on origin under another branch; changing it would need a force-push.",
    );
  }
  if (rewrite) {
    const yes = await confirm(
      `HEAD is already on origin/${branch}. Save it and force-push ${branch}? [Y/n] `,
    );
    if (!yes) {
      console.log("save cancelled; nothing changed.");
      return;
    }
  }
  if (owned) {
    gitArgs(
      message
        ? ["commit", "--amend", "-m", message]
        : ["commit", "--amend", "--no-edit"],
    );
  } else {
    const text = message ?? (await askMessage());
    gitArgs(["commit", "-m", text]);
  }
  if (remote === "") {
    console.log(`origin has no ${branch}; not pushed.`);
    return;
  }
  if (!isDryRun() && captureArgs(["rev-parse", "HEAD"]) === remote) {
    console.log("origin already has this commit; not pushed.");
    return;
  }
  if (rewrite) gitArgs(["push", "--force-with-lease", "origin", branch]);
  else gitArgs(["push", "origin", branch]);
}

// Asks for a commit message. An empty answer is refused, so a commit never has no message.
async function askMessage(): Promise<string> {
  const text = await ask("Commit message: ");
  if (text === "")
    throw new Error("a commit needs a message; nothing was committed.");
  return text;
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
