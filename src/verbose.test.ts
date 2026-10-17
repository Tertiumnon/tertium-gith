import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve(import.meta.dir, "cli.ts");

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function cli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

describe("--verbose", () => {
  test("prints every git command, including read-only ones, only when asked", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-verbose-"));
    try {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(repo);
      git(repo, ["init", "-b", "main"]);
      git(repo, ["config", "user.email", "test@example.com"]);
      git(repo, ["config", "user.name", "Test"]);
      fs.writeFileSync(path.join(repo, "a.txt"), "a");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-m", "initial"]);

      const quiet = cli(repo, ["list", "--commits", "-l", "1"]);
      expect(quiet.stdout).not.toContain("> git");

      const verbose = cli(repo, ["list", "--commits", "-l", "1", "--verbose"]);
      expect(verbose.status).toBe(0);
      expect(verbose.stdout).toContain("> git rev-parse --verify --quiet HEAD");
      expect(verbose.stdout).toContain(
        '> git log -n1 --date=short "--format=%h  %ad  %an  %s"',
      );
      expect(cli(repo, ["list", "--commits", "-verbose"]).stdout).toContain(
        "> git log -n5",
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
