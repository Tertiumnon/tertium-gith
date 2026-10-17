import { type Flags, parseLimit } from "../args/args";
import { captureArgs } from "../git/git";

const DEFAULT_LIMIT = 5;
const FILTERS = ["commit", "file", "change"];

// gith find|search [-commit <text>] [-file <pattern>] [-change <text>] [--regex] [-limit <n>]:
// the newest commits on this branch that match every filter given. -commit matches the message,
// -file the paths changed (with the matching paths listed), -change the diff: commits that add or
// remove the text (or match it as a regex with --regex).
export function find(flags: Flags): void {
  const message = flags.get("commit");
  const file = flags.get("file");
  const change = flags.get("change");
  const extra = [...flags.keys()].filter(
    (key) => key !== "limit" && key !== "regex" && !FILTERS.includes(key),
  );
  const usage =
    'usage: gith find -commit "<text>" | -file "<pattern>" | -change "<text>" [--regex] [-limit <n>]';
  if (
    (message === undefined && file === undefined && change === undefined) ||
    extra.length > 0
  ) {
    throw new Error(usage);
  }
  if (flags.has("regex") && change === undefined) {
    throw new Error("--regex only applies to -change.");
  }
  const limit = parseLimit(flags) ?? DEFAULT_LIMIT;

  const args = [
    "log",
    `-n${limit}`,
    "--date=short",
    "--format=%x1e%h  %ad  %an  %s",
  ];
  if (message !== undefined) {
    args.push("--fixed-strings", "--regexp-ignore-case", `--grep=${message}`);
  }
  if (change !== undefined) {
    // -S counts occurrences of the literal text; -G matches a regex against the diff.
    args.push(flags.has("regex") ? `-G${change}` : `-S${change}`);
  }
  if (file !== undefined) {
    // Restricts the log to the matching paths, and --name-only lists those paths per commit.
    args.push("--name-only", "--", file);
  }

  const records = captureArgs(args)
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean);
  if (records.length === 0) {
    console.log(
      `No commits match ${describe(message, file, change, flags.has("regex"))}.`,
    );
    return;
  }
  console.log(
    records
      .map((record) => {
        const [header = "", ...paths] = record.split("\n");
        return [
          header,
          ...paths.filter(Boolean).map((path) => `    ${path.trim()}`),
        ].join("\n");
      })
      .join("\n"),
  );
}

function describe(
  message?: string,
  file?: string,
  change?: string,
  regex = false,
): string {
  const parts: string[] = [];
  if (message !== undefined) parts.push(`message "${message}"`);
  if (file !== undefined) parts.push(`file "${file}"`);
  if (change !== undefined)
    parts.push(`${regex ? "regex" : "change"} "${change}"`);
  return parts.join(" and ");
}
