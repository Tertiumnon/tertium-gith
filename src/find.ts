import { type Flags, parseLimit } from "./args";
import { captureArgs } from "./git";

const DEFAULT_LIMIT = 5;

// gith find -commit <text> [-limit <n>]: the newest commits on this branch whose message contains
// the text. Case-insensitive, and the text is matched literally.
export function find(flags: Flags): void {
  const text = flags.get("commit");
  const extra = [...flags.keys()].filter(
    (key) => key !== "commit" && key !== "limit",
  );
  if (!text || extra.length > 0) {
    throw new Error('usage: gith find -commit "<text>" [-limit <n>]');
  }
  const limit = parseLimit(flags) ?? DEFAULT_LIMIT;
  const rows = captureArgs([
    "log",
    `-n${limit}`,
    "--fixed-strings",
    "--regexp-ignore-case",
    `--grep=${text}`,
    "--date=short",
    "--format=%h  %ad  %an  %s",
  ]);
  console.log(rows || `No commits match "${text}".`);
}
