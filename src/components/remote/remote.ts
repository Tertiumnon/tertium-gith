import type { Flags } from "../args/args.types";
import { assertCleanTree, gitArgs, hasOnOrigin, isDryRun } from "../git/git";
import { currentBranch } from "../history/history.utils";
import { compareOrigin, getBranches, updateBranch } from "./remote.utils";

export const push = (flags: Flags): void => {
  const branches = getBranches(flags, "push");
  for (const branch of branches) {
    if (isDryRun()) continue;
    if (!hasOnOrigin(branch)) {
      process.stdout.write(
        `Publishing ${branch} on origin and setting upstream tracking.\n`,
      );
      continue;
    }
    const { ahead, behind } = compareOrigin(branch);
    if (behind > 0)
      throw new Error(
        ahead > 0
          ? `${branch} has diverged; merge or rebase origin's changes, then run gith push. Nothing was pushed.`
          : `${branch} is behind origin; run gith pull before gith push. Nothing was pushed.`,
      );
    process.stdout.write(
      `Pushing ${ahead} commit(s) from ${branch}; ensuring upstream tracking.\n`,
    );
  }
  gitArgs([
    "push",
    ...(flags.has("all-branches") ? ["--atomic"] : []),
    "-u",
    "origin",
    ...branches.map((branch) => `refs/heads/${branch}:refs/heads/${branch}`),
  ]);
  if (!isDryRun())
    process.stdout.write(
      `Push complete: ${branches.length} branch(es) synced with origin.\n`,
    );
};

export const pull = (flags: Flags): void => {
  const branches = getBranches(flags, "pull");
  const current = currentBranch();
  assertCleanTree();
  const updates: { branch: string; behind: number }[] = [];
  for (const branch of branches) {
    if (isDryRun()) continue;
    if (!hasOnOrigin(branch))
      throw new Error(
        `origin/${branch} does not exist; run gith push to publish this branch first.`,
      );
    const { ahead, behind } = compareOrigin(branch);
    if (ahead > 0 && behind > 0)
      throw new Error(
        `${branch} has diverged; merge or rebase origin's changes explicitly. No commits were changed.`,
      );
    if (behind > 0) updates.push({ branch, behind });
    else
      process.stdout.write(
        ahead > 0
          ? `${branch}: no incoming commits; run gith push to publish ${ahead} local commit(s).\n`
          : `${branch}: already up to date.\n`,
      );
  }
  for (const { branch, behind } of isDryRun()
    ? branches.map((branch) => ({ branch, behind: 0 }))
    : updates) {
    updateBranch(branch, current);
    if (!isDryRun())
      process.stdout.write(`Pulled ${behind} commit(s) into ${branch}.\n`);
  }
};
