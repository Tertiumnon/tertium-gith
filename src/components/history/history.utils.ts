import type { Flags } from "../args/args.types";
import { capture, captureArgs } from "../git/git";
import { ask } from "../prompt/prompt";

export function noFlags(flags: Flags, command: string): void {
  if (flags.size > 0) throw new Error(`usage: gith ${command}`);
}

// The checked-out branch name. Refuses detached HEAD.
export function currentBranch(): string {
  const name = capture("rev-parse --abbrev-ref HEAD");
  if (name === "HEAD")
    throw new Error("HEAD is detached; check out a branch first.");
  return name;
}

// Undoing a commit that origin already has would need a force-push.
export function assertNotPushed(): void {
  if (captureArgs(["branch", "-r", "--contains", "HEAD"]) !== "") {
    throw new Error(
      "HEAD is already on origin; changing it would need a force-push.",
    );
  }
}

// The commit origin has for this branch, or "" when origin has no such branch.
export function remoteSha(branch: string): string {
  return (
    captureArgs(["ls-remote", "--heads", "origin", branch]).split("\t")[0] ?? ""
  );
}

// Asks for a commit message. An empty answer is refused, so a commit never has no message.
export async function askMessage(): Promise<string> {
  const text = await ask("Commit message: ");
  if (text === "")
    throw new Error("a commit needs a message; nothing was committed.");
  return text;
}
