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

// A work repo on branch work with one commit, pushed to origin.
function fixture(tmp: string): string {
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
  git(repo, ["switch", "-c", "work"]);
  fs.writeFileSync(path.join(repo, "b.txt"), "b");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "work"]);
  git(repo, ["push", "-u", "origin", "work"]);
  return repo;
}

describe("save on a pushed commit", () => {
  test("refuses without a terminal to confirm, and changes nothing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-save-push-"));
    try {
      const repo = fixture(tmp);
      fs.writeFileSync(path.join(repo, "b.txt"), "changed");
      git(repo, ["add", "b.txt"]);
      const before = git(repo, ["rev-parse", "HEAD"]).stdout.trim();
      const result = gith(repo, ["save"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("needs a terminal to confirm");
      expect(git(repo, ["rev-parse", "HEAD"]).stdout.trim()).toBe(before);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  test("dry run shows the save and the force-push, and does neither", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-save-dry-"));
    try {
      const repo = fixture(tmp);
      fs.writeFileSync(path.join(repo, "b.txt"), "changed");
      git(repo, ["add", "b.txt"]);
      const before = git(repo, ["rev-parse", "HEAD"]).stdout.trim();
      const result = gith(repo, ["save", "--dry-run"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "would ask: HEAD is already on origin/work",
      );
      expect(result.stdout).toContain(
        "> git push --force-with-lease origin work",
      );
      expect(git(repo, ["rev-parse", "HEAD"]).stdout.trim()).toBe(before);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("save pushes only when origin has the branch and differs", () => {
  test("a local commit ahead of origin is pushed as a plain fast-forward", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-save-ahead-"));
    try {
      const repo = fixture(tmp);
      fs.writeFileSync(path.join(repo, "c.txt"), "c");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-m", "local only"]);
      fs.writeFileSync(path.join(repo, "c.txt"), "changed");
      git(repo, ["add", "c.txt"]);
      expect(gith(repo, ["save"]).status).toBe(0);
      const head = git(repo, ["rev-parse", "HEAD"]).stdout.trim();
      expect(
        git(repo, ["ls-remote", "--heads", "origin", "work"]).stdout,
      ).toContain(head);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  test("a branch origin does not have is saved locally, and nothing is pushed", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-save-solo-"));
    try {
      const repo = fixture(tmp);
      git(repo, ["switch", "-c", "solo"]);
      fs.writeFileSync(path.join(repo, "s.txt"), "s");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-m", "solo work"]);
      fs.writeFileSync(path.join(repo, "s.txt"), "changed");
      git(repo, ["add", "s.txt"]);
      const result = gith(repo, ["save"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("origin has no solo; not pushed.");
      expect(
        git(repo, ["ls-remote", "--heads", "origin", "solo"]).stdout.trim(),
      ).toBe("");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
