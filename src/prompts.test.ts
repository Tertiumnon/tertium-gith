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

describe("destructive commands ask first", () => {
  test("without a terminal and without --yes, nothing is deleted or rewritten", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-prompts-"));
    try {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(repo);
      git(tmp, ["init", "--bare", path.join(tmp, "remote.git")]);
      git(repo, ["init", "-b", "main"]);
      git(repo, ["config", "user.email", "test@example.com"]);
      git(repo, ["config", "user.name", "Test"]);
      fs.writeFileSync(path.join(repo, "a.txt"), "a");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-m", "one"]);
      fs.writeFileSync(path.join(repo, "a.txt"), "b");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-m", "two"]);
      git(repo, ["remote", "add", "origin", "../remote.git"]);
      git(repo, ["push", "-u", "origin", "main"]);
      git(repo, ["branch", "keep"]);
      const head = git(repo, ["rev-parse", "HEAD"]).stdout.trim();

      expect(gith(repo, ["remove", "-b", "keep"]).stderr).toContain(
        "pass --yes to skip the question",
      );
      expect(git(repo, ["branch", "--list", "keep"]).stdout).toContain("keep");

      fs.writeFileSync(path.join(repo, "a.txt"), "edited");
      expect(gith(repo, ["reset"]).status).toBe(1);
      expect(fs.readFileSync(path.join(repo, "a.txt"), "utf8")).toBe("edited");

      fs.writeFileSync(path.join(repo, "untracked.txt"), "x");
      expect(gith(repo, ["clean"]).status).toBe(1);
      expect(fs.existsSync(path.join(repo, "untracked.txt"))).toBe(true);

      expect(gith(repo, ["squash", "-limit", "2"]).status).toBe(1);
      expect(git(repo, ["rev-parse", "HEAD"]).stdout.trim()).toBe(head);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
