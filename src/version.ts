import { readFileSync } from "node:fs";
import path from "node:path";

// The version from package.json, so the printed version always matches the release.
export function readVersion(): string {
  const pkg = JSON.parse(
    readFileSync(path.join(import.meta.dir, "..", "package.json"), "utf8"),
  ) as { version?: string };
  return pkg.version ?? "unknown";
}

// The gith mascot: a creature with a branch growing out of its head. Each o is a commit.
const MASCOT = [
  "          o",
  "         /",
  "   o----o----o",
  "    \\   |   /",
  "     \\  |  /",
  "      (o_o)",
  "      /|_|\\",
  "       d b",
];

// gith --version: the mascot with the version and a git joke beside it.
export function versionText(): string {
  const version = readVersion();
  const side = ["", "", "", "", "", `gith v${version}`, "git happens.", ""];
  return MASCOT.map((line, i) =>
    `${line.padEnd(16)}${side[i] ?? ""}`.trimEnd(),
  ).join("\n");
}
