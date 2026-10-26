import { captureArgs } from "../git/git";
import { GRAPH_ARGS } from "./list.constants";

export function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

// Newest first, from the current branch.
export const commits = (limit: number, graph: boolean): void => {
  if (!hasHead()) {
    process.stdout.write("No commits.\n");
    return;
  }
  if (!graph) {
    process.stdout.write(
      `${captureArgs(["log", `-n${limit}`, "--date=short", "--format=%h  %ad  %an  %s"])}\n`,
    );
    return;
  }
  const { NO_COLOR: noColor, TERM: terminal } = process.env;
  const color =
    process.stdout.isTTY && noColor === undefined && terminal !== "dumb";
  const branch = captureArgs(["rev-parse", "--abbrev-ref", "HEAD"]);
  process.stdout.write(
    `\n╭─ COMMIT GRAPH ─────────────────────────────────────────\n│  ${branch} · branch history · limit ${limit}\n│\n`,
  );
  process.stdout.write(
    `${captureArgs([
      ...GRAPH_ARGS,
      `-n${limit}`,
      color ? "--color=always" : "--color=never",
    ])}\n`,
  );
  process.stdout.write(
    "╰─ * commit  ·  branches & tags in parentheses  ·  -l <n> shows more\n\n",
  );
};

// False on a repository with no commits yet, where HEAD does not resolve.
export function hasHead(): boolean {
  try {
    captureArgs(["rev-parse", "--verify", "--quiet", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}
