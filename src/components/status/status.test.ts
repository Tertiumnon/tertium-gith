import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseStatus } from "./status";

describe("status", () => {
  const CLI = path.resolve(import.meta.dir, "../../cli.ts");

  function git(cwd: string, args: string[]) {
    return spawnSync("git", args, { cwd, encoding: "utf8" });
  }

  function gith(cwd: string, args: string[]) {
    return spawnSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: "utf8",
    });
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

  test("status reports a clean tree, then the counts of changed files", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-status-"));
    try {
      const repo = fixture(tmp);
      git(repo, ["branch", "local-only"]);
      git(repo, ["push", "origin", "main:remote-only"]);
      git(repo, ["remote", "add", "upstream", "../remote.git"]);
      git(repo, ["fetch", "upstream"]);
      const clean = gith(repo, ["status"]);
      expect(clean.status).toBe(0);
      expect(clean.stdout).toContain("working tree clean");
      const [summary, local, remote] = clean.stdout.split(
        /\n(?:Local branches \(\* current, \+ other worktree\)|Remote branches \(last fetched\)):\n/,
      );
      expect(summary).toContain("main  ->  origin/main");
      expect(local).toContain("* main");
      expect(local).toContain("develop");
      expect(local).toContain("local-only");
      expect(local).not.toContain("remote-only");
      for (const branch of [
        "origin/main",
        "origin/develop",
        "origin/remote-only",
        "upstream/main",
        "upstream/develop",
        "upstream/remote-only",
      ])
        expect(remote).toContain(branch);

      fs.writeFileSync(path.join(repo, "a.txt"), "changed");
      fs.writeFileSync(path.join(repo, "new.txt"), "x");
      const dirty = gith(repo, ["status"]).stdout;
      expect(dirty).toContain("unstaged 1, untracked 1");
      expect(dirty).toContain("local-only");
      expect(dirty).toContain("origin/remote-only");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  test("status shows empty branch lists in a new repository without remotes", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-status-empty-"));
    try {
      git(tmp, ["init", "-b", "main"]);
      const result = gith(tmp, ["status"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("main  (no upstream)");
      expect(result.stdout).toContain(
        "Local branches (* current, + other worktree):\n  (none)",
      );
      expect(result.stdout).toContain(
        "Remote branches (last fetched):\n  (none)",
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
