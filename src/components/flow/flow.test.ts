import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("create", () => {
  const CLI = path.resolve(import.meta.dir, "../../cli.ts");

  function gith(cwd: string, args: string[]) {
    return spawnSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: "utf8",
    });
  }

  function git(cwd: string, args: string[]) {
    return spawnSync("git", args, { cwd, encoding: "utf8" });
  }

  function current(cwd: string): string {
    return git(cwd, ["branch", "--show-current"]).stdout.trim();
  }

  function onOrigin(cwd: string, name: string): boolean {
    return (
      git(cwd, ["ls-remote", "--heads", "origin", name]).stdout.trim() !== ""
    );
  }

  // A repository with main and develop pushed to a bare origin. Returns the work repo path.
  function fixture(tmp: string): string {
    const repo = path.join(tmp, "repo");
    fs.mkdirSync(repo);
    git(repo, ["init", "-b", "main"]);
    git(tmp, ["init", "--bare", path.join(tmp, "remote.git")]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test"]);
    fs.writeFileSync(path.join(repo, "a.txt"), "a");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "initial"]);
    git(repo, ["remote", "add", "origin", "../remote.git"]);
    git(repo, ["push", "-u", "origin", "main"]);
    git(repo, ["branch", "develop"]);
    git(repo, ["push", "-u", "origin", "develop"]);
    return repo;
  }

  describe("gith create never switches; gith switch -b creates or switches", () => {
    test("create -b and create -r/-h leave the current branch checked out", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-create-"));
      try {
        const repo = fixture(tmp);
        expect(gith(repo, ["create", "-b", "login"]).status).toBe(0);
        expect(current(repo)).toBe("main");
        expect(onOrigin(repo, "develop--login")).toBe(true);

        expect(gith(repo, ["create", "-r", "1.0.0"]).status).toBe(0);
        expect(current(repo)).toBe("main");
        expect(onOrigin(repo, "release/1.0.0")).toBe(true);

        expect(gith(repo, ["create", "-h", "1.0.1"]).status).toBe(0);
        expect(current(repo)).toBe("main");
        expect(onOrigin(repo, "hotfix/1.0.1")).toBe(true);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);

    test("create -b refuses a name that already exists, and containers", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-create-err-"));
      try {
        const repo = fixture(tmp);
        expect(gith(repo, ["create", "-b", "login"]).status).toBe(0);
        expect(gith(repo, ["create", "-b", "login"]).status).toBe(1);
        expect(gith(repo, ["create", "-b", "develop"]).status).toBe(1);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);

    test("switch -b creates a missing branch and switches to it, or switches to an existing one", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-switch-"));
      try {
        const repo = fixture(tmp);
        expect(gith(repo, ["switch", "-b", "fresh"]).status).toBe(0);
        expect(current(repo)).toBe("develop--fresh");
        expect(onOrigin(repo, "develop--fresh")).toBe(true);

        expect(gith(repo, ["switch", "-b", "main"]).status).toBe(0);
        expect(current(repo)).toBe("main");

        expect(gith(repo, ["switch", "-b", "fresh"]).status).toBe(0);
        expect(current(repo)).toBe("develop--fresh");
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);
  });
});

describe("merge-current", () => {
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

  // origin with main and develop, release/1.9.0 and release/1.10.0 on origin, and a work branch.
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
    git(repo, ["branch", "develop"]);
    git(repo, ["push", "-u", "origin", "develop"]);
    for (const version of ["1.9.0", "1.10.0"]) {
      git(repo, ["branch", `release/${version}`, "develop"]);
      git(repo, ["push", "origin", `release/${version}`]);
    }
    git(repo, ["switch", "-c", "work", "develop"]);
    fs.writeFileSync(path.join(repo, "w.txt"), "w");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "work"]);
    return repo;
  }

  describe("merge --current-release and --current-hotfix", () => {
    test("picks the newest release by version, local or origin", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-merge-current-"));
      try {
        const repo = fixture(tmp);
        git(repo, ["branch", "release/1.11.0", "develop"]); // newest, but only here

        const local = gith(repo, ["merge", "--current-release"]);
        expect(local.status).toBe(1);
        expect(local.stderr).toContain(
          "'release/1.11.0' does not exist on origin.",
        );

        git(repo, ["branch", "-D", "release/1.11.0"]);
        const dry = gith(repo, ["merge", "--current-release", "--dry-run"]);
        expect(dry.status).toBe(0);
        expect(dry.stdout).toContain("> git checkout release/1.10.0");
        expect(dry.stdout).not.toContain("release/1.9.0");

        expect(gith(repo, ["merge", "--current-hotfix"]).status).toBe(1);
        expect(
          gith(repo, ["merge", "--current-release", "-r", "1.0.0"]).status,
        ).toBe(1);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);
  });
});

describe("merge deletes the merged work branch, after a question", () => {
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
    git(repo, ["branch", "develop"]);
    git(repo, ["push", "-u", "origin", "develop"]);
    git(repo, ["branch", "release/1.0.0", "develop"]);
    git(repo, ["push", "-u", "origin", "release/1.0.0"]);
    git(repo, ["switch", "-c", "work", "develop"]);
    fs.writeFileSync(path.join(repo, "w.txt"), "w");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "work"]);
    git(repo, ["push", "-u", "origin", "work"]);
    return repo;
  }

  test("with --yes the work branch goes after the merge; without a terminal it is kept", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-merge-delete-"));
    try {
      const repo = fixture(tmp);
      const kept = gith(repo, ["merge", "-r", "1.0.0"]);
      expect(kept.status).toBe(0);
      expect(kept.stdout).toContain("kept");
      expect(git(repo, ["branch", "--list", "work"]).stdout).toContain("work");

      git(repo, ["switch", "work"]);
      const done = gith(repo, ["merge", "-r", "1.0.0", "--yes"]);
      expect(done.status).toBe(0);
      expect(git(repo, ["branch", "--list", "work"]).stdout.trim()).toBe("");
      expect(
        git(repo, ["ls-remote", "--heads", "origin", "work"]).stdout.trim(),
      ).toBe("");
      expect(git(repo, ["show", "release/1.0.0:w.txt"]).status).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("finish --current-release", () => {
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

  test("merges the newest release into main, tags it, merges main into develop, and removes the branch", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-finish-"));
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
      git(repo, ["branch", "release/1.0.0", "develop"]);
      git(repo, ["push", "-u", "origin", "release/1.0.0"]);
      git(repo, ["switch", "release/1.0.0"]);
      fs.writeFileSync(path.join(repo, "fix.txt"), "fix");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-m", "fix: thing"]);
      git(repo, ["push", "origin", "release/1.0.0"]);
      git(repo, ["switch", "main"]);

      expect(gith(repo, ["finish"]).status).toBe(1);
      const done = gith(repo, ["finish", "--current-release", "--yes"]);
      expect(done.status).toBe(0);
      expect(git(repo, ["show", "main:fix.txt"]).status).toBe(0);
      expect(
        git(repo, ["ls-remote", "--tags", "origin", "v1.0.0"]).stdout,
      ).toContain("v1.0.0");
      expect(
        git(repo, [
          "ls-remote",
          "--heads",
          "origin",
          "release/1.0.0",
        ]).stdout.trim(),
      ).toBe("");
      expect(
        git(repo, ["branch", "--list", "release/1.0.0"]).stdout.trim(),
      ).toBe("");
      expect(git(repo, ["show", "develop:fix.txt"]).status).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("merge --develop", () => {
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
  test("merges the current work branch into develop and removes it after a yes", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-merge-develop-"));
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
      git(repo, ["switch", "-c", "work", "develop"]);
      fs.writeFileSync(path.join(repo, "w.txt"), "w");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-m", "work"]);
      git(repo, ["push", "-u", "origin", "work"]);

      const done = gith(repo, ["merge", "--develop", "--yes"]);
      expect(done.status).toBe(0);
      expect(git(repo, ["show", "develop:w.txt"]).status).toBe(0);
      expect(git(repo, ["branch", "--list", "work"]).stdout.trim()).toBe("");
      expect(
        git(repo, ["ls-remote", "--heads", "origin", "work"]).stdout.trim(),
      ).toBe("");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
