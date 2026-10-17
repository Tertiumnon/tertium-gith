import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve(import.meta.dir, "../../cli.ts");

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function gith(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

describe("release", () => {
  test("needs one kind, and refuses a tree with changes to tracked files", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-release-"));
    try {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(repo);
      git(repo, ["init", "-b", "main"]);
      git(repo, ["config", "user.email", "test@example.com"]);
      git(repo, ["config", "user.name", "Test"]);
      fs.writeFileSync(path.join(repo, "a.txt"), "a");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-m", "initial"]);

      expect(gith(repo, ["release"]).stderr).toContain(
        "usage: gith release --patch | --minor | --major",
      );

      fs.writeFileSync(path.join(repo, "a.txt"), "changed");
      const dirty = gith(repo, ["release", "--patch"]);
      expect(dirty.status).toBe(1);
      expect(dirty.stderr).toContain("uncommitted changes to tracked files");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
