import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("stash", () => {
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

  test("stash and unstash bring changes back, including untracked files", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-status-"));
    try {
      const repo = fixture(tmp);
      expect(gith(repo, ["status"]).stdout).toContain("working tree clean");

      fs.writeFileSync(path.join(repo, "a.txt"), "changed");
      fs.writeFileSync(path.join(repo, "new.txt"), "x");
      expect(gith(repo, ["status"]).stdout).toContain(
        "unstaged 1, untracked 1",
      );

      expect(gith(repo, ["stash", "-n", "wip"]).status).toBe(0);
      expect(gith(repo, ["status"]).stdout).toContain("working tree clean");
      expect(gith(repo, ["stash"]).status).toBe(1); // nothing left to stash
      expect(gith(repo, ["unstash"]).status).toBe(0);
      expect(fs.readFileSync(path.join(repo, "a.txt"), "utf8")).toBe("changed");
      expect(fs.existsSync(path.join(repo, "new.txt"))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

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
        expect(gith(repo, ["list", "--stashes"]).stdout).toContain(
          "No stashes.",
        );
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);
  });
});
