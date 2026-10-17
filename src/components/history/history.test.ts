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

    test("save folds staged changes into the last commit and refuses when nothing is staged", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-save-"));
      try {
        const repo = fixture(tmp);
        git(repo, ["switch", "-c", "work"]);
        commitFile(repo, "one.txt", "add one");
        const before = git(repo, ["rev-list", "--count", "HEAD"]).stdout.trim();

        expect(gith(repo, ["save"]).status).toBe(1); // nothing staged
        fs.writeFileSync(path.join(repo, "one.txt"), "amended");
        git(repo, ["add", "one.txt"]);
        expect(gith(repo, ["save"]).status).toBe(0);
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
});

describe("save", () => {
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

  describe("save on a branch with no commits of its own", () => {
    test("never rewrites the base commit: asks for a message, refused without a terminal", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-save-fresh-"));
      try {
        const repo = fixture(tmp);
        git(repo, ["switch", "-c", "fresh", "main"]);
        const base = git(repo, ["rev-parse", "HEAD"]).stdout.trim();
        fs.writeFileSync(path.join(repo, "a.txt"), "changed");
        git(repo, ["add", "a.txt"]);
        const result = gith(repo, ["save"]);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("needs a terminal to ask");
        expect(git(repo, ["rev-parse", "HEAD"]).stdout.trim()).toBe(base);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);

    test("-m commits the staged changes as a new commit on top of the base", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-save-msg-"));
      try {
        const repo = fixture(tmp);
        git(repo, ["switch", "-c", "fresh", "main"]);
        const base = git(repo, ["rev-parse", "HEAD"]).stdout.trim();
        fs.writeFileSync(path.join(repo, "a.txt"), "changed");
        git(repo, ["add", "a.txt"]);
        expect(gith(repo, ["save", "-m", "first change"]).status).toBe(0);
        expect(git(repo, ["log", "-1", "--format=%s"]).stdout.trim()).toBe(
          "first change",
        );
        expect(git(repo, ["rev-parse", "HEAD^"]).stdout.trim()).toBe(base);
        expect(git(repo, ["rev-parse", "main"]).stdout.trim()).toBe(base);
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
