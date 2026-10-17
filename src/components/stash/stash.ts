import type { Flags } from "../args/args";
import { captureArgs, gitArgs } from "../git/git";

// gith stash [-n <name>]: saves uncommitted changes, including untracked files.
export function stash(flags: Flags): void {
  const name = flags.get("name");
  if (flags.size > (name === undefined ? 0 : 1))
    throw new Error("usage: gith stash [-n <name>]");
  if (captureArgs(["status", "--porcelain"]) === "")
    throw new Error("nothing to stash.");
  const args = ["stash", "push", "--include-untracked"];
  if (name) args.push("-m", name);
  gitArgs(args);
}

// gith unstash: brings back the latest stash and drops it. Conflicts leave it in the stash list.
export function unstash(flags: Flags): void {
  if (flags.size > 0) throw new Error("usage: gith unstash");
  gitArgs(["stash", "pop"]);
}
