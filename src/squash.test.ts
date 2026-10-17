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

function commitFile(repo: string, name: string, message: string): void {
  fs.writeFileSync(path.join(repo, name), name);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", message]);
}

// A work repo with origin, main and develop, on branch work with three local commits after main.
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
  git(repo, ["switch", "-c", "work"]);
  commitFile(repo, "one.txt", "first");
  commitFile(repo, "two.txt", "second");
  commitFile(repo, "three.txt", "third");
  return repo;
}

function subjects(repo: string): string[] {
  return git(repo, ["log", "--format=%s"]).stdout.trim().split("\n");
}

describe("stash -n and list --stashes", () => {
  test("names a stash and lists it", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-stash-name-"));
    try {
      const repo = fixture(tmp);
      fs.writeFileSync(path.join(repo, "a.txt"), "changed");
      expect(gith(repo, ["stash", "-n", "wip-login"]).status).toBe(0);
      expect(gith(repo, ["list", "--stashes"]).stdout).toContain("wip-login");
      expect(gith(repo, ["stash", "--name", "x", "-n", "y"]).status).toBe(1);
      expect(gith(repo, ["list", "--stashes", "-l", "0"]).status).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  test("reports when there are no stashes", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-stash-none-"));
    try {
      const repo = fixture(tmp);
      expect(gith(repo, ["list", "--stashes"]).stdout).toContain("No stashes.");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("squash", () => {
  test("combines the last commits, keeping the oldest message by default, or uses -m", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-squash-"));
    try {
      const repo = fixture(tmp);
      expect(gith(repo, ["squash", "-limit", "2", "--yes"]).status).toBe(0);
      expect(subjects(repo)).toEqual(["second", "first", "initial"]);
      expect(fs.existsSync(path.join(repo, "three.txt"))).toBe(true);
      expect(git(repo, ["status", "--porcelain"]).stdout.trim()).toBe("");

      expect(
        gith(repo, ["squash", "-limit", "2", "-m", "combined", "--yes"]).status,
      ).toBe(0);
      expect(subjects(repo)).toEqual(["combined", "initial"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  test("refuses fewer than 2, reaching the first commit, pushed commits, containers and a dirty tree", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-squash-refuse-"));
    try {
      const repo = fixture(tmp);
      expect(gith(repo, ["squash", "-limit", "1"]).status).toBe(1);
      expect(gith(repo, ["squash"]).status).toBe(1);
      expect(gith(repo, ["squash", "-limit", "4"]).status).toBe(1); // would reach initial
      expect(subjects(repo)).toEqual(["third", "second", "first", "initial"]);

      fs.writeFileSync(path.join(repo, "three.txt"), "edited");
      expect(gith(repo, ["squash", "-limit", "2", "--yes"]).status).toBe(1);
      git(repo, ["checkout", "--", "three.txt"]);

      git(repo, ["push", "-u", "origin", "work"]);
      expect(gith(repo, ["squash", "-limit", "2", "--yes"]).status).toBe(1);

      git(repo, ["switch", "main"]);
      expect(gith(repo, ["squash", "-limit", "2", "--yes"]).status).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
