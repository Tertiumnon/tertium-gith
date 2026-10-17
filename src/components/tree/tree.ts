import { type Flags, parseLimit } from "../args/args";
import { captureArgs } from "../git/git";

export interface Worktree {
  path: string;
  head: string;
  branch?: string;
  bare: boolean;
  locked: boolean;
  prunable: boolean;
}

// Parses `git worktree list --porcelain`: one blank-line-separated block per worktree.
export function parseWorktrees(output: string): Worktree[] {
  return output
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const worktree: Worktree = {
        path: "",
        head: "",
        bare: false,
        locked: false,
        prunable: false,
      };
      for (const line of block.split("\n")) {
        const [key, ...rest] = line.split(" ");
        const value = rest.join(" ");
        if (key === "worktree") worktree.path = value;
        else if (key === "HEAD") worktree.head = value.slice(0, 7);
        else if (key === "branch")
          worktree.branch = value.replace(/^refs\/heads\//, "");
        else if (key === "bare") worktree.bare = true;
        else if (key === "locked") worktree.locked = true;
        else if (key === "prunable") worktree.prunable = true;
      }
      return worktree;
    });
}

function flagsOf(worktree: Worktree): string {
  return [
    worktree.bare ? "bare" : "",
    worktree.locked ? "locked" : "",
    worktree.prunable ? "prunable" : "",
  ]
    .filter(Boolean)
    .join(", ");
}

// gith tree: every working tree of this repository, with its branch and HEAD. The current one is marked *.
export function tree(flags: Flags): void {
  if (flags.size > 0 && !(flags.size === 1 && flags.has("limit")))
    throw new Error("usage: gith tree [-limit <n>]");
  const limit = parseLimit(flags);
  const current = captureArgs(["rev-parse", "--show-toplevel"]);
  const worktrees = parseWorktrees(
    captureArgs(["worktree", "list", "--porcelain"]),
  );
  const shown = limit === undefined ? worktrees : worktrees.slice(0, limit);

  const rows = shown.map((worktree) => ({
    mark: worktree.path === current ? "*" : " ",
    path: worktree.path,
    branch: worktree.bare ? "(bare)" : (worktree.branch ?? "(detached)"),
    head: worktree.bare ? "" : worktree.head,
    note: flagsOf(worktree),
  }));
  const width = Math.max("PATH".length, ...rows.map((row) => row.path.length));
  const branchWidth = Math.max(
    "BRANCH".length,
    ...rows.map((row) => row.branch.length),
  );
  console.log(
    `  ${"PATH".padEnd(width)}  ${"BRANCH".padEnd(branchWidth)}  HEAD`,
  );
  for (const row of rows) {
    const line = `${row.mark} ${row.path.padEnd(width)}  ${row.branch.padEnd(branchWidth)}  ${row.head}`;
    console.log(row.note ? `${line}  [${row.note}]` : line);
  }
  if (shown.length < worktrees.length) {
    console.log(
      `showing ${shown.length} of ${worktrees.length}; -limit <n> shows more`,
    );
  }
}
