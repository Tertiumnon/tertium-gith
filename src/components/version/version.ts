import { readFileSync } from "node:fs";
import { MASCOT } from "./version.constants";
import { packageJsonPath } from "./version.utils";

// The version from package.json, so the printed version always matches the release.
export function readVersion(): string {
  const pkg = JSON.parse(readFileSync(packageJsonPath(), "utf8")) as {
    version?: string;
  };
  return pkg.version ?? "unknown";
}

// gith --version: the mascot with the version and a git joke beside it.
export function versionText(): string {
  const version = readVersion();
  const side = [
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    `gith v${version}`,
    "git happens.",
  ];
  return MASCOT.map((line, i) =>
    `${line.padEnd(16)}${side[i] ?? ""}`.trimEnd(),
  ).join("\n");
}
