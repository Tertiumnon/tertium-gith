import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Finds the package.json of gith by walking up from this file. It works from the source tree and
// from the built bin/gith.js alike.
function packageJsonPath(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = path.join(dir, "package.json");
    if (existsSync(candidate)) {
      const pkg = JSON.parse(readFileSync(candidate, "utf8")) as {
        name?: string;
      };
      if (pkg.name === "@tertium/gith") return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("gith package.json not found");
    dir = parent;
  }
}

// The version from package.json, so the printed version always matches the release.
export function readVersion(): string {
  const pkg = JSON.parse(readFileSync(packageJsonPath(), "utf8")) as {
    version?: string;
  };
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
