import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve(import.meta.dir, "cli.ts");

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function gith(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

describe("gith switch -commit", () => {
  test("detaches at a commit, refuses dirty tracked files, and branches from the detached commit", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-switch-commit-"));
    try {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(repo);
      git(tmp, ["init", "--bare", path.join(tmp, "remote.git")]);
      git(repo, ["init", "-b", "main"]);
      git(repo, ["config", "user.email", "test@example.com"]);
      git(repo, ["config", "user.name", "Test"]);
      for (const text of ["one", "two"]) {
        fs.writeFileSync(path.join(repo, "a.txt"), text);
        git(repo, ["add", "."]);
        git(repo, ["commit", "-m", text]);
      }
      git(repo, ["remote", "add", "origin", "../remote.git"]);
      git(repo, ["push", "-u", "origin", "main"]);
      const first = git(repo, ["rev-parse", "HEAD~1"]).stdout.trim();

      const dry = gith(repo, ["switch", "-commit", "HEAD~1", "--dry-run"]);
      expect(dry.stdout).toContain("> git switch --detach");
      expect(git(repo, ["symbolic-ref", "-q", "HEAD"]).status).toBe(0);

      fs.writeFileSync(path.join(repo, "untracked.txt"), "x");
      expect(gith(repo, ["switch", "-commit", "HEAD~1"]).status).toBe(0);
      expect(git(repo, ["rev-parse", "HEAD"]).stdout.trim()).toBe(first);
      expect(git(repo, ["symbolic-ref", "-q", "HEAD"]).status).not.toBe(0);

      fs.writeFileSync(path.join(repo, "a.txt"), "dirty");
      const dirty = gith(repo, ["switch", "-commit", "main"]);
      expect(dirty.status).toBe(1);
      expect(dirty.stderr).toContain("uncommitted changes to tracked files");
      expect(dirty.stderr).toContain("a.txt");
      git(repo, ["checkout", "--", "a.txt"]);

      expect(gith(repo, ["switch", "-commit", "no-such-commit"]).status).toBe(
        1,
      );
      expect(
        gith(repo, ["switch", "-commit", "HEAD~1", "-b", "x"]).status,
      ).toBe(1);

      expect(gith(repo, ["switch", "-b", "from-old"]).status).toBe(0);
      expect(git(repo, ["rev-parse", "HEAD"]).stdout.trim()).toBe(first);
      expect(git(repo, ["branch", "--show-current"]).stdout.trim()).toBe(
        "from-old",
      );
      expect(
        git(repo, ["ls-remote", "--heads", "origin", "from-old"]).stdout,
      ).toContain(first);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
