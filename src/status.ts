import type { Flags } from "./args";
import { captureArgs } from "./git";

export interface Status {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
}

// Reads `git status --porcelain=v2 --branch`. Each changed entry starts with "1" or "2" and
// has an XY code: X is the index (staged) column, Y the working-tree (unstaged) column.
export function parseStatus(output: string): Status {
  const status: Status = {
    branch: "",
    ahead: 0,
    behind: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicts: 0,
  };
  for (const line of output.split("\n")) {
    if (line.startsWith("# branch.head ")) {
      status.branch = line.slice("# branch.head ".length);
    } else if (line.startsWith("# branch.upstream ")) {
      status.upstream = line.slice("# branch.upstream ".length);
    } else if (line.startsWith("# branch.ab ")) {
      const [ahead = "+0", behind = "-0"] = line
        .slice("# branch.ab ".length)
        .split(" ");
      status.ahead = Number(ahead);
      status.behind = Math.abs(Number(behind));
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const code = line.split(" ")[1] ?? "..";
      if (code[0] !== ".") status.staged++;
      if (code[1] !== ".") status.unstaged++;
    } else if (line.startsWith("u ")) {
      status.conflicts++;
    } else if (line.startsWith("? ")) {
      status.untracked++;
    }
  }
  return status;
}

// gith status: the branch against origin, and counts of staged, unstaged and untracked files.
export function status(flags: Flags): void {
  if (flags.size > 0) throw new Error("usage: gith status");
  const info = parseStatus(
    captureArgs(["status", "--porcelain=v2", "--branch"]),
  );
  const against = info.upstream
    ? `${info.branch}  ->  ${info.upstream}  ahead ${info.ahead}, behind ${info.behind}`
    : `${info.branch}  (no upstream)`;
  console.log(against);
  const changed = info.staged + info.unstaged + info.untracked + info.conflicts;
  if (changed === 0) {
    console.log("working tree clean");
    return;
  }
  console.log(
    `staged ${info.staged}, unstaged ${info.unstaged}, untracked ${info.untracked}, conflicts ${info.conflicts}`,
  );
}
