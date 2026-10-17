import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseStatus } from "./status";

const CLI = path.resolve(import.meta.dir, "cli.ts");

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function gith(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

function commitFile(repo: string, name: string, message: string): void {
  fs.writeFileSync(path.join(repo, name), name);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", message]);
}

// A work repo with a bare origin that has main and develop, checked out on main.
function fixture(tmp: string): string {
  const repo = path.join(tmp, "repo");
  fs.mkdirSync(repo);
  git(tmp, ["init", "--bare", path.join(tmp, "remote.git")]);
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  commitFile(repo, "a.txt", "initial");
  git(repo, ["remote", "add", "origin", "../remote.git"]);
  git(repo, ["push", "-u", "origin", "main"]);
  git(repo, ["branch", "develop"]);
  git(repo, ["push", "-u", "origin", "develop"]);
  return repo;
}

describe("parseStatus", () => {
  test("counts staged, unstaged, untracked and reads ahead and behind", () => {
    const output = [
      "# branch.oid 1111",
      "# branch.head feature",
      "# branch.upstream origin/feature",
      "# branch.ab +2 -1",
      "1 M. N... 100644 100644 100644 a b staged.txt",
      "1 .M N... 100644 100644 100644 a b unstaged.txt",
      "1 MM N... 100644 100644 100644 a b both.txt",
      "? new.txt",
    ].join("\n");
    expect(parseStatus(output)).toEqual({
      branch: "feature",
      upstream: "origin/feature",
      ahead: 2,
      behind: 1,
      staged: 2,
      unstaged: 2,
      untracked: 1,
      conflicts: 0,
    });
  });
});

describe("status, stash, update, undo and amend", () => {
  test("status reports the branch and counts; stash and unstash round-trip", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-status-"));
    try {
      const repo = fixture(tmp);
      expect(gith(repo, ["status"]).stdout).toContain("working tree clean");

      fs.writeFileSync(path.join(repo, "a.txt"), "changed");
      fs.writeFileSync(path.join(repo, "new.txt"), "x");
      expect(gith(repo, ["status"]).stdout).toContain(
        "unstaged 1, untracked 1",
      );

      expect(gith(repo, ["stash", "-m", "wip"]).status).toBe(0);
      expect(gith(repo, ["status"]).stdout).toContain("working tree clean");
      expect(gith(repo, ["stash"]).status).toBe(1); // nothing left to stash
      expect(gith(repo, ["unstash"]).status).toBe(0);
      expect(fs.readFileSync(path.join(repo, "a.txt"), "utf8")).toBe("changed");
      expect(fs.existsSync(path.join(repo, "new.txt"))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  test("update merges origin/develop into a work branch, and refuses containers", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-update-"));
    try {
      const repo = fixture(tmp);
      git(repo, ["switch", "-c", "work"]);
      git(repo, ["switch", "develop"]);
      commitFile(repo, "from-develop.txt", "develop work");
      git(repo, ["push", "origin", "develop"]);
      git(repo, ["switch", "work"]);

      expect(gith(repo, ["update"]).status).toBe(0);
      expect(fs.existsSync(path.join(repo, "from-develop.txt"))).toBe(true);
      git(repo, ["switch", "develop"]);
      expect(gith(repo, ["update"]).status).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  test("undo keeps the changes staged, but refuses a commit already on origin", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-undo-"));
    try {
      const repo = fixture(tmp);
      git(repo, ["switch", "-c", "work"]);
      commitFile(repo, "local.txt", "local work");
      expect(gith(repo, ["undo"]).status).toBe(0);
      expect(git(repo, ["log", "-1", "--format=%s"]).stdout.trim()).toBe(
        "initial",
      );
      expect(git(repo, ["diff", "--cached", "--name-only"]).stdout.trim()).toBe(
        "local.txt",
      );

      git(repo, ["commit", "-m", "again"]);
      git(repo, ["push", "-u", "origin", "work"]);
      expect(gith(repo, ["undo"]).status).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  test("amend folds staged changes into the last commit and refuses when nothing is staged", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-amend-"));
    try {
      const repo = fixture(tmp);
      git(repo, ["switch", "-c", "work"]);
      commitFile(repo, "one.txt", "add one");
      const before = git(repo, ["rev-list", "--count", "HEAD"]).stdout.trim();

      expect(gith(repo, ["amend"]).status).toBe(1); // nothing staged
      fs.writeFileSync(path.join(repo, "one.txt"), "amended");
      git(repo, ["add", "one.txt"]);
      expect(gith(repo, ["amend"]).status).toBe(0);
      expect(git(repo, ["rev-list", "--count", "HEAD"]).stdout.trim()).toBe(
        before,
      );
      expect(git(repo, ["log", "-1", "--format=%s"]).stdout.trim()).toBe(
        "add one",
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
