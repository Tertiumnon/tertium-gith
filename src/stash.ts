import type { Flags } from "./args";
import { captureArgs, gitArgs } from "./git";

// gith stash [-m <message>]: saves uncommitted changes, including untracked files.
export function stash(flags: Flags): void {
  const message = flags.get("message");
  if (flags.size > (message === undefined ? 0 : 1))
    throw new Error("usage: gith stash [-m <message>]");
  if (captureArgs(["status", "--porcelain"]) === "")
    throw new Error("nothing to stash.");
  const args = ["stash", "push", "--include-untracked"];
  if (message) args.push("-m", message);
  gitArgs(args);
}

// gith unstash: brings back the latest stash and drops it. Conflicts leave it in the stash list.
export function unstash(flags: Flags): void {
  if (flags.size > 0) throw new Error("usage: gith unstash");
  gitArgs(["stash", "pop"]);
}
