import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve(import.meta.dir, "cli.ts");

function gith(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function branchExists(cwd: string, name: string): boolean {
  return git(cwd, ["branch", "--list", name]).stdout.trim() !== "";
}

function remoteBranchExists(cwd: string, name: string): boolean {
  return (
    git(cwd, ["ls-remote", "--heads", "origin", name]).stdout.trim() !== ""
  );
}

describe("gith switch, remove, sync, clean", () => {
  test("runs against a repository with an origin", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-"));
    const repo = path.join(tmp, "repo");
    const remote = path.join(tmp, "remote.git");
    try {
      fs.mkdirSync(repo);
      git(repo, ["init", "-b", "main"]);
      git(tmp, ["init", "--bare", remote]);
      git(repo, ["config", "user.email", "test@example.com"]);
      git(repo, ["config", "user.name", "Test"]);
      fs.writeFileSync(path.join(repo, "tracked.txt"), "tracked");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-m", "initial"]);
      git(repo, ["remote", "add", "origin", "../remote.git"]);
      git(repo, ["push", "-u", "origin", "main"]);

      // switch
      git(repo, ["branch", "feature"]);
      expect(gith(repo, ["switch", "-b", "feature"]).status).toBe(0);
      expect(git(repo, ["branch", "--show-current"]).stdout.trim()).toBe(
        "feature",
      );
      expect(gith(repo, ["switch", "--branch", "main"]).status).toBe(0);
      expect(gith(repo, ["switch", "-b", "bad..name"]).status).toBe(1);
      expect(gith(repo, ["switch"]).status).toBe(1);

      // remove: local only, then --remote, then --both, rm as alias
      git(repo, ["push", "origin", "feature"]);
      expect(gith(repo, ["remove", "-b", "feature", "--remote"]).status).toBe(
        0,
      );
      expect(branchExists(repo, "feature")).toBe(true);
      expect(remoteBranchExists(repo, "feature")).toBe(false);

      git(repo, ["push", "origin", "feature"]);
      expect(gith(repo, ["remove", "-b", "feature", "--both"]).status).toBe(0);
      expect(branchExists(repo, "feature")).toBe(false);
      expect(remoteBranchExists(repo, "feature")).toBe(false);

      git(repo, ["branch", "local-only"]);
      expect(gith(repo, ["rm", "-b", "local-only"]).status).toBe(0);
      expect(branchExists(repo, "local-only")).toBe(false);

      // containers and missing flags are refused
      expect(gith(repo, ["remove", "-b", "main"]).status).toBe(1);
      expect(gith(repo, ["remove", "--remote"]).status).toBe(1);
      expect(
        gith(repo, ["remove", "-b", "x", "--remote", "--both"]).status,
      ).toBe(1);

      // unmerged branches are refused by git branch -d
      git(repo, ["checkout", "-b", "unmerged"]);
      fs.writeFileSync(path.join(repo, "more.txt"), "x");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-m", "work"]);
      git(repo, ["checkout", "main"]);
      expect(gith(repo, ["remove", "-b", "unmerged"]).status).toBe(1);
      expect(branchExists(repo, "unmerged")).toBe(true);
      git(repo, ["branch", "-D", "unmerged"]);

      // sync takes no flags
      expect(gith(repo, ["sync"]).status).toBe(0);
      expect(gith(repo, ["sync", "-b", "x"]).status).toBe(1);

      // clean removes untracked files and directories
      fs.mkdirSync(path.join(repo, "untracked-dir"));
      fs.writeFileSync(path.join(repo, "untracked.txt"), "x");
      fs.writeFileSync(path.join(repo, "untracked-dir", "file.txt"), "x");
      expect(gith(repo, ["clean"]).status).toBe(0);
      expect(fs.existsSync(path.join(repo, "untracked.txt"))).toBe(false);
      expect(fs.existsSync(path.join(repo, "untracked-dir"))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
