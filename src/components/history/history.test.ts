import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("history", () => {
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

  describe("update, undo and save", () => {
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
        expect(
          git(repo, ["diff", "--cached", "--name-only"]).stdout.trim(),
        ).toBe("local.txt");

        git(repo, ["commit", "-m", "again"]);
        git(repo, ["push", "-u", "origin", "work"]);
        expect(gith(repo, ["undo"]).status).toBe(1);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);

    test("save requires a nonempty message before staging or changing history", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-save-message-"));
      try {
        const repo = fixture(tmp);
        fs.writeFileSync(path.join(repo, "new.txt"), "new");
        const before = git(repo, ["status", "--porcelain"]).stdout;
        for (const args of [
          ["save"],
          ["save", "-m", " "],
          ["save", "-m", "x", "--force"],
        ]) {
          const result = gith(repo, args);
          expect(result.status).toBe(1);
          expect(result.stderr).toContain("usage: gith save -m");
          expect(result.stdout).not.toContain("[Y/n]");
          expect(git(repo, ["status", "--porcelain"]).stdout).toBe(before);
        }
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);

    test("save creates a new local commit without contacting origin, even with --yes", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-save-local-"));
      try {
        const repo = fixture(tmp);
        const previous = git(repo, ["rev-parse", "HEAD"]).stdout.trim();
        git(repo, ["remote", "remove", "origin"]);
        fs.writeFileSync(path.join(repo, "new.txt"), "new");
        const result = gith(repo, ["save", "-m", "new commit", "--yes"]);
        expect(result.status).toBe(0);
        expect(git(repo, ["rev-parse", "HEAD~1"]).stdout.trim()).toBe(previous);
        expect(git(repo, ["log", "-1", "--format=%s"]).stdout.trim()).toBe(
          "new commit",
        );
        expect(git(repo, ["status", "--porcelain"]).stdout.trim()).toBe("");
        expect(result.stdout).not.toContain("git push");
        expect(result.stdout).not.toContain("[Y/n]");
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);

    test("save keeps multiple unstaged files untouched unless --all is supplied", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-save-all-"));
      try {
        const repo = fixture(tmp);
        fs.writeFileSync(path.join(repo, "one.txt"), "one");
        fs.writeFileSync(path.join(repo, "two.txt"), "two");
        const result = gith(repo, ["save", "-m", "both"]);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("--all");
        expect(
          git(repo, ["diff", "--cached", "--name-only"]).stdout.trim(),
        ).toBe("");
        expect(gith(repo, ["save", "-m", "both", "--all"]).status).toBe(0);
        expect(
          git(repo, ["show", "--format=", "--name-only", "HEAD"]).stdout.trim(),
        ).toBe("one.txt\ntwo.txt");
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);

    test("save pushes only with the literal --&push flag and preserves the prior commit", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-save-push-"));
      try {
        const repo = fixture(tmp);
        const previous = git(repo, ["rev-parse", "HEAD"]).stdout.trim();
        fs.writeFileSync(path.join(repo, "new.txt"), "new");
        const result = gith(repo, ["save", "-m", "publish", "--&push"]);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("git push -u");
        expect(result.stdout).not.toContain("[Y/n]");
        expect(git(repo, ["rev-parse", "HEAD~1"]).stdout.trim()).toBe(previous);
        expect(git(repo, ["rev-parse", "origin/main"]).stdout).toBe(
          git(repo, ["rev-parse", "HEAD"]).stdout,
        );
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);

    test("save dry run shows staging, commit and optional push without changing files", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-save-dry-"));
      try {
        const repo = fixture(tmp);
        fs.writeFileSync(path.join(repo, "new.txt"), "new");
        const before = git(repo, ["status", "--porcelain"]).stdout;
        const result = gith(repo, [
          "save",
          "-m",
          "preview",
          "--&push",
          "--dry-run",
        ]);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("git add -A");
        expect(result.stdout).toContain("git commit -m preview");
        expect(result.stdout).toContain("git push -u");
        expect(git(repo, ["status", "--porcelain"]).stdout).toBe(before);
        expect(git(repo, ["rev-list", "--count", "HEAD"]).stdout.trim()).toBe(
          "1",
        );
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);

    test("a failed explicit push leaves the new commit saved locally", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-save-failed-"));
      try {
        const repo = fixture(tmp);
        git(repo, ["remote", "remove", "origin"]);
        fs.writeFileSync(path.join(repo, "new.txt"), "new");
        const result = gith(repo, ["save", "-m", "kept", "--&push"]);
        expect(result.status).toBe(1);
        expect(result.stdout).toContain("Saved locally.");
        expect(git(repo, ["log", "-1", "--format=%s"]).stdout.trim()).toBe(
          "kept",
        );
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);
  });
});

describe("squash", () => {
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
          gith(repo, ["squash", "-limit", "2", "-m", "combined", "--yes"])
            .status,
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
});
