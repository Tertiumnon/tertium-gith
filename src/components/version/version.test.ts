import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readVersion, versionText } from "./version";
import { MASCOT } from "./version.constants";

const CLI = path.resolve(import.meta.dir, "../../cli.ts");

describe("gith --version", () => {
  test("shows the mascot with the version from package.json", () => {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.resolve(import.meta.dir, "../../..", "package.json"),
        "utf8",
      ),
    ) as {
      version: string;
    };
    expect(readVersion()).toBe(pkg.version);
    const text = versionText();
    expect(text).toContain(`gith v${pkg.version}`);
    expect(text).toContain("( o o )");
    expect(text.split("\n").map((line) => line.slice(0, 16).trimEnd())).toEqual(
      MASCOT,
    );
    const run = spawnSync(process.execPath, [CLI, "--version"], {
      encoding: "utf8",
    });
    expect(run.status).toBe(0);
    expect(run.stdout.trimEnd()).toBe(text);
  });
});
