import type { Flags } from "../args/args.types";
import { captureArgs, gitArgs } from "../git/git";
import { currentBranch } from "../history/history.utils";

export const getBranches = (flags: Flags, command: string): string[] => {
  if ([...flags.keys()].some((key) => key !== "all-branches"))
    throw new Error(`usage: gith ${command} [--all-branches]`);
  if (!flags.has("all-branches")) return [currentBranch()];
  const branches = captureArgs([
    "for-each-ref",
    "--format=%(refname:strip=2)",
    "refs/heads/",
  ]);
  if (branches === "")
    throw new Error(
      "No local branches; create a branch and commit before syncing.",
    );
  return branches.split("\n");
};

export const compareOrigin = (
  branch: string,
): { ahead: number; behind: number } => {
  gitArgs(["fetch", "--no-tags", "origin", `refs/heads/${branch}`]);
  const counts = captureArgs([
    "rev-list",
    "--left-right",
    "--count",
    `refs/heads/${branch}...FETCH_HEAD`,
  ]);
  if (!/^\d+\s+\d+$/.test(counts))
    throw new Error(
      "Cannot compare commits with origin; check the repository with git fsck.",
    );
  const parts = counts.split(/\s+/);
  const ahead = Number(parts[0]);
  const behind = Number(parts[1]);
  process.stdout.write(
    `${branch} -> origin/${branch}: ahead ${ahead}, behind ${behind}.\n`,
  );
  return { ahead, behind };
};

export const updateBranch = (branch: string, current: string): void => {
  // Fetch again so FETCH_HEAD always belongs to the branch being updated.
  if (branch === current) {
    gitArgs(["fetch", "--no-tags", "origin", `refs/heads/${branch}`]);
    gitArgs(["merge", "--ff-only", "FETCH_HEAD"]);
  } else {
    gitArgs([
      "fetch",
      "--no-tags",
      "origin",
      `refs/heads/${branch}:refs/heads/${branch}`,
    ]);
  }
};
