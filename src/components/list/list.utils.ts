import { captureArgs } from "../git/git";

export function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

// Newest first, from the current branch.
export function commits(limit: number, graph: boolean): void {
  if (!hasHead()) {
    console.log("No commits.");
    return;
  }
  const shape = graph
    ? ["--graph", "--oneline", "--decorate"]
    : ["--date=short", "--format=%h  %ad  %an  %s"];
  console.log(captureArgs(["log", `-n${limit}`, ...shape]));
}

// False on a repository with no commits yet, where HEAD does not resolve.
export function hasHead(): boolean {
  try {
    captureArgs(["rev-parse", "--verify", "--quiet", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}
