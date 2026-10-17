import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { candidates, parseSelection } from "./maintenance";

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
      expect(gith(repo, ["switch", "-b", "main"]).status).toBe(0);
      expect(gith(repo, ["switch", "-b", "bad..name"]).status).toBe(1);
      expect(gith(repo, ["switch"]).status).toBe(1);

      // remove: a pair by default, --local and --remote for one side, rm as alias
      git(repo, ["push", "origin", "feature"]);
      expect(
        gith(repo, ["remove", "-b", "feature", "--remote", "--yes"]).status,
      ).toBe(0);
      expect(branchExists(repo, "feature")).toBe(true);
      expect(remoteBranchExists(repo, "feature")).toBe(false);

      git(repo, ["push", "origin", "feature"]);
      expect(gith(repo, ["remove", "-b", "feature", "--yes"]).status).toBe(0);
      expect(branchExists(repo, "feature")).toBe(false);
      expect(remoteBranchExists(repo, "feature")).toBe(false);

      git(repo, ["branch", "local-only"]);
      expect(gith(repo, ["rm", "-b", "local-only", "--yes"]).status).toBe(0);
      expect(branchExists(repo, "local-only")).toBe(false);

      // containers and missing flags are refused
      expect(gith(repo, ["remove", "-b", "main"]).status).toBe(1);
      expect(gith(repo, ["remove", "--remote"]).status).toBe(1);
      expect(
        gith(repo, ["remove", "-b", "x", "--remote", "--local"]).status,
      ).toBe(1);
      expect(gith(repo, ["remove", "-b", "main", "-limit", "2"]).status).toBe(
        1,
      );

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
      expect(gith(repo, ["clean", "--yes"]).status).toBe(0);
      expect(fs.existsSync(path.join(repo, "untracked.txt"))).toBe(false);
      expect(fs.existsSync(path.join(repo, "untracked-dir"))).toBe(false);

      // reset discards staged and unstaged edits, and untracked files
      fs.writeFileSync(path.join(repo, "tracked.txt"), "edited");
      fs.writeFileSync(path.join(repo, "staged.txt"), "x");
      git(repo, ["add", "staged.txt"]);
      fs.writeFileSync(path.join(repo, "untracked.txt"), "x");
      expect(gith(repo, ["reset", "--yes"]).status).toBe(0);
      expect(fs.readFileSync(path.join(repo, "tracked.txt"), "utf8")).toBe(
        "tracked",
      );
      expect(fs.existsSync(path.join(repo, "staged.txt"))).toBe(false);
      expect(fs.existsSync(path.join(repo, "untracked.txt"))).toBe(false);
      expect(gith(repo, ["reset", "-b", "x"]).status).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("gith remove picker", () => {
  test("candidates: local skips containers and the current branch", () => {
    const local = ["main", "develop", "feature", "current"];
    expect(candidates("local", local, [], "current")).toEqual([
      { name: "feature", label: "feature" },
    ]);
  });

  test("candidates: remote lists origin branches without containers", () => {
    const remote = ["main", "release/1.0.0", "feature"];
    expect(candidates("remote", [], remote, "feature")).toEqual([
      { name: "feature", label: "feature  (origin)" },
    ]);
  });

  test("candidates: pair lists only branches that exist locally and on origin", () => {
    const local = ["develop", "pair", "local-only"];
    const remote = ["develop", "pair", "remote-only"];
    expect(candidates("pair", local, remote, "other")).toEqual([
      { name: "pair", label: "pair  (local + origin)" },
    ]);
  });

  test("parseSelection reads numbers and ranges, drops duplicates, rejects bad input", () => {
    expect(parseSelection("1,3-4", 5)).toEqual([0, 2, 3]);
    expect(parseSelection("2, 2", 3)).toEqual([1]);
    expect(parseSelection("", 3)).toEqual([]);
    expect(() => parseSelection("4", 3)).toThrow(
      "'4' is not a choice from 1 to 3.",
    );
    expect(() => parseSelection("2-1", 3)).toThrow();
    expect(() => parseSelection("x", 3)).toThrow();
  });

  test("without a terminal, the list is not shown and -b needs a name", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-pick-"));
    try {
      git(tmp, ["init", "-b", "main"]);
      git(tmp, ["config", "user.email", "test@example.com"]);
      git(tmp, ["config", "user.name", "Test"]);
      fs.writeFileSync(path.join(tmp, "a.txt"), "a");
      git(tmp, ["add", "."]);
      git(tmp, ["commit", "-m", "initial"]);
      git(tmp, ["branch", "feature"]);
      const result = gith(tmp, ["remove", "--branch"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("pass a branch name with -b");
      expect(branchExists(tmp, "feature")).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("--dry-run", () => {
  test("prints the git commands for a branch and does not run them", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-dry-"));
    try {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(repo);
      git(tmp, ["init", "--bare", path.join(tmp, "remote.git")]);
      git(repo, ["init", "-b", "main"]);
      git(repo, ["config", "user.email", "test@example.com"]);
      git(repo, ["config", "user.name", "Test"]);
      fs.writeFileSync(path.join(repo, "a.txt"), "a");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-m", "initial"]);
      git(repo, ["remote", "add", "origin", "../remote.git"]);
      git(repo, ["push", "-u", "origin", "main"]);
      git(repo, ["branch", "develop"]);
      git(repo, ["push", "-u", "origin", "develop"]);

      const result = gith(repo, ["create", "-b", "login", "--dry-run"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("dry run: nothing below is changed.");
      expect(result.stdout).toContain("> git branch login origin/develop");
      expect(result.stdout).toContain("> git push -u origin login");
      expect(branchExists(repo, "login")).toBe(false);
      expect(onOrigin(repo, "login")).toBe(false);

      fs.writeFileSync(path.join(repo, "untracked.txt"), "x");
      const clean = gith(repo, ["clean", "--dry-run"]);
      expect(clean.stdout).toContain("untracked.txt");
      expect(fs.existsSync(path.join(repo, "untracked.txt"))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});

function onOrigin(cwd: string, name: string): boolean {
  return (
    git(cwd, ["ls-remote", "--heads", "origin", name]).stdout.trim() !== ""
  );
}
