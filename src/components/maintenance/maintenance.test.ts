import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  branchTimes,
  candidates,
  detachedOptions,
  parseSelection,
  staleOptions,
} from "./maintenance";

describe("maintenance", () => {
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
});

describe("remove-pairs", () => {
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

  function localExists(cwd: string, name: string): boolean {
    return git(cwd, ["branch", "--list", name]).stdout.trim() !== "";
  }

  function originExists(cwd: string, name: string): boolean {
    return (
      git(cwd, ["ls-remote", "--heads", "origin", name]).stdout.trim() !== ""
    );
  }

  describe("remove: a pair by default, one side with --local or --remote", () => {
    test("default removes both sides, --local and --remote remove one, a missing side is fine", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-pairs-"));
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

        git(repo, ["branch", "pair"]);
        git(repo, ["push", "-u", "origin", "pair"]);
        expect(
          gith(repo, ["remove", "-b", "pair", "--local", "--yes"]).status,
        ).toBe(0);
        expect(localExists(repo, "pair")).toBe(false);
        expect(originExists(repo, "pair")).toBe(true);

        git(repo, ["branch", "pair"]);
        expect(
          gith(repo, ["remove", "-b", "pair", "--remote", "--yes"]).status,
        ).toBe(0);
        expect(localExists(repo, "pair")).toBe(true);
        expect(originExists(repo, "pair")).toBe(false);

        expect(gith(repo, ["remove", "-b", "pair", "--yes"]).status).toBe(0);
        expect(localExists(repo, "pair")).toBe(false);
        expect(gith(repo, ["remove", "-b", "pair"]).status).toBe(1); // exists neither here nor on origin

        expect(
          gith(repo, ["remove", "-b", "pair", "--local", "--remote"]).status,
        ).toBe(1);
        expect(gith(repo, ["remove", "--branch", "--local"]).status).toBe(1); // needs a terminal
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);
  });
});

describe("obsolete", () => {
  const CLI = path.resolve(import.meta.dir, "../../cli.ts");
  const DAY = 86400;
  const NOW = 1_800_000_000;

  function git(cwd: string, args: string[], date?: number) {
    const env =
      date === undefined
        ? process.env
        : {
            ...process.env,
            GIT_COMMITTER_DATE: `${date} +0000`,
            GIT_AUTHOR_DATE: `${date} +0000`,
          };
    return spawnSync("git", args, { cwd, encoding: "utf8", env });
  }

  function gith(cwd: string, args: string[]) {
    return spawnSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: "utf8",
    });
  }

  function branchExists(cwd: string, name: string): boolean {
    return git(cwd, ["branch", "--list", name]).stdout.trim() !== "";
  }

  describe("branch ages", () => {
    const output = [
      "refs/heads/old-both|100",
      "refs/remotes/origin/old-both|200",
      "refs/heads/fresh|1000000000000",
      "refs/heads/old-local|50",
      "refs/remotes/origin/old-remote|60",
      "refs/remotes/origin/HEAD|1",
      "refs/heads/main|10",
      "refs/remotes/origin/main|10",
    ].join("\n");

    test("staleOptions keeps branches with no recent commit on any side", () => {
      const times = branchTimes(output);
      const names = staleOptions(times, "pair", NOW - 90 * DAY, "other").map(
        (o) => o.name,
      );
      expect(names).toEqual(["old-both", "old-local", "old-remote"]);
      expect(
        staleOptions(times, "pair", NOW - 90 * DAY, "other").find(
          (o) => o.name === "old-both",
        )?.label,
      ).toContain("old-both  (local + origin, last commit 1970-01-01)");
    });

    test("the local scope looks only at local branches; containers and the current branch are skipped", () => {
      const times = branchTimes(output);
      expect(
        staleOptions(times, "local", NOW - 90 * DAY, "old-local").map(
          (o) => o.name,
        ),
      ).toEqual(["old-both"]);
      expect(
        staleOptions(times, "pair", NOW - 90 * DAY, "old-both").map(
          (o) => o.name,
        ),
      ).not.toContain("old-both");
    });

    test("detachedOptions lists local branches with no origin copy", () => {
      const times = branchTimes(output);
      expect(detachedOptions(times, "other")).toEqual([
        { name: "fresh", label: "fresh  (local only)" },
        { name: "old-local", label: "old-local  (local only)" },
      ]);
    });
  });

  describe("remove --obsolete, --detached and list --commits --graph", () => {
    test("obsolete lists old branches, asks, and previews with --dry-run; flags are checked", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-obsolete-"));
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

        const longAgo = Math.floor(Date.now() / 1000) - 400 * DAY;
        git(repo, ["switch", "-c", "old"]);
        fs.writeFileSync(path.join(repo, "old.txt"), "old");
        git(repo, ["add", "."]);
        git(repo, ["commit", "-m", "old work"], longAgo);
        git(repo, ["push", "-u", "origin", "old"]);
        git(repo, ["switch", "main"]);
        git(repo, ["branch", "fresh"]);

        const picked = gith(repo, ["remove", "--obsolete"]);
        expect(picked.status).toBe(1); // the Y/n prompt needs a terminal
        expect(picked.stdout).toContain("old  (local + origin");
        expect(picked.stdout).not.toContain("fresh");
        expect(branchExists(repo, "old")).toBe(true);

        const dry = gith(repo, ["remove", "--obsolete", "--dry-run"]);
        expect(dry.status).toBe(0);
        expect(dry.stdout).toContain("> git branch -d -- old");
        expect(dry.stdout).toContain("> git push origin --delete old");
        expect(branchExists(repo, "old")).toBe(true);

        expect(gith(repo, ["remove", "--obsolete", "--remote"]).status).toBe(1);
        expect(gith(repo, ["remove", "--obsolete", "-days", "0"]).status).toBe(
          1,
        );
        expect(gith(repo, ["remove", "-days", "5"]).status).toBe(1);
        expect(gith(repo, ["remove", "--obsolete", "--detached"]).status).toBe(
          1,
        );

        expect(gith(repo, ["remove", "--detached"]).status).toBe(1); // needs a terminal
        expect(
          gith(repo, ["list", "--commits", "--graph", "-l", "1"]).stdout,
        ).toContain("*");
        expect(gith(repo, ["list", "--tags", "--graph"]).status).toBe(1);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);
  });
});

describe("prompts", () => {
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

  describe("destructive commands ask first", () => {
    test("without a terminal and without --yes, nothing is deleted or rewritten", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-prompts-"));
      try {
        const repo = path.join(tmp, "repo");
        fs.mkdirSync(repo);
        git(tmp, ["init", "--bare", path.join(tmp, "remote.git")]);
        git(repo, ["init", "-b", "main"]);
        git(repo, ["config", "user.email", "test@example.com"]);
        git(repo, ["config", "user.name", "Test"]);
        fs.writeFileSync(path.join(repo, "a.txt"), "a");
        git(repo, ["add", "."]);
        git(repo, ["commit", "-m", "one"]);
        fs.writeFileSync(path.join(repo, "a.txt"), "b");
        git(repo, ["add", "."]);
        git(repo, ["commit", "-m", "two"]);
        git(repo, ["remote", "add", "origin", "../remote.git"]);
        git(repo, ["push", "-u", "origin", "main"]);
        git(repo, ["branch", "keep"]);
        const head = git(repo, ["rev-parse", "HEAD"]).stdout.trim();

        expect(gith(repo, ["remove", "-b", "keep"]).stderr).toContain(
          "pass --yes to skip the question",
        );
        expect(git(repo, ["branch", "--list", "keep"]).stdout).toContain(
          "keep",
        );

        fs.writeFileSync(path.join(repo, "a.txt"), "edited");
        expect(gith(repo, ["reset"]).status).toBe(1);
        expect(fs.readFileSync(path.join(repo, "a.txt"), "utf8")).toBe(
          "edited",
        );

        fs.writeFileSync(path.join(repo, "untracked.txt"), "x");
        expect(gith(repo, ["clean"]).status).toBe(1);
        expect(fs.existsSync(path.join(repo, "untracked.txt"))).toBe(true);

        expect(gith(repo, ["squash", "-limit", "2"]).status).toBe(1);
        expect(git(repo, ["rev-parse", "HEAD"]).stdout.trim()).toBe(head);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);
  });
});

describe("switch-commit", () => {
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

  describe("gith switch -commit", () => {
    test("detaches at a commit, refuses dirty tracked files, and branches from the detached commit", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-switch-commit-"));
      try {
        const repo = path.join(tmp, "repo");
        fs.mkdirSync(repo);
        git(tmp, ["init", "--bare", path.join(tmp, "remote.git")]);
        git(repo, ["init", "-b", "main"]);
        git(repo, ["config", "user.email", "test@example.com"]);
        git(repo, ["config", "user.name", "Test"]);
        for (const text of ["one", "two"]) {
          fs.writeFileSync(path.join(repo, "a.txt"), text);
          git(repo, ["add", "."]);
          git(repo, ["commit", "-m", text]);
        }
        git(repo, ["remote", "add", "origin", "../remote.git"]);
        git(repo, ["push", "-u", "origin", "main"]);
        const first = git(repo, ["rev-parse", "HEAD~1"]).stdout.trim();

        const dry = gith(repo, ["switch", "-commit", "HEAD~1", "--dry-run"]);
        expect(dry.stdout).toContain("> git switch --detach");
        expect(git(repo, ["symbolic-ref", "-q", "HEAD"]).status).toBe(0);

        fs.writeFileSync(path.join(repo, "untracked.txt"), "x");
        expect(gith(repo, ["switch", "-commit", "HEAD~1"]).status).toBe(0);
        expect(git(repo, ["rev-parse", "HEAD"]).stdout.trim()).toBe(first);
        expect(git(repo, ["symbolic-ref", "-q", "HEAD"]).status).not.toBe(0);

        fs.writeFileSync(path.join(repo, "a.txt"), "dirty");
        const dirty = gith(repo, ["switch", "-commit", "main"]);
        expect(dirty.status).toBe(1);
        expect(dirty.stderr).toContain("uncommitted changes to tracked files");
        expect(dirty.stderr).toContain("a.txt");
        git(repo, ["checkout", "--", "a.txt"]);

        expect(gith(repo, ["switch", "-commit", "no-such-commit"]).status).toBe(
          1,
        );
        expect(
          gith(repo, ["switch", "-commit", "HEAD~1", "-b", "x"]).status,
        ).toBe(1);

        expect(gith(repo, ["switch", "-b", "from-old"]).status).toBe(0);
        expect(git(repo, ["rev-parse", "HEAD"]).stdout.trim()).toBe(first);
        expect(git(repo, ["branch", "--show-current"]).stdout.trim()).toBe(
          "from-old",
        );
        expect(
          git(repo, ["ls-remote", "--heads", "origin", "from-old"]).stdout,
        ).toContain(first);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);
  });
});

describe("remove --detached --all (test)", () => {
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

  describe("remove --detached --all", () => {
    test("lists the local-only branches, asks once, and keeps branches that have an origin copy", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-detached-all-"));
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
        git(repo, ["branch", "lonely-one"]);
        git(repo, ["branch", "lonely-two"]);
        git(repo, ["branch", "shared"]);
        git(repo, ["push", "-u", "origin", "shared"]);

        const dry = gith(repo, ["remove", "--detached", "--all", "--dry-run"]);
        expect(dry.status).toBe(0);
        expect(dry.stdout).toContain("lonely-one");
        expect(dry.stdout).toContain("lonely-two");
        expect(dry.stdout).not.toContain("shared");
        expect(dry.stdout).toContain("> git branch -d -- lonely-one");

        const refused = gith(repo, ["remove", "--detached", "--all"]);
        expect(refused.status).toBe(1);
        expect(git(repo, ["branch", "--list", "lonely-one"]).stdout).toContain(
          "lonely-one",
        );

        const done = gith(repo, ["remove", "--detached", "--all", "--yes"]);
        expect(done.status).toBe(0);
        expect(
          git(repo, ["branch", "--list", "lonely-one"]).stdout.trim(),
        ).toBe("");
        expect(
          git(repo, ["branch", "--list", "lonely-two"]).stdout.trim(),
        ).toBe("");
        expect(git(repo, ["branch", "--list", "shared"]).stdout).toContain(
          "shared",
        );

        expect(
          gith(repo, ["remove", "--detached", "--all", "-l", "1"]).status,
        ).toBe(1);
        expect(gith(repo, ["remove", "--branch", "--all"]).status).toBe(1);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);
  });
});

describe("switch --release and --hotfix", () => {
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

  test("switches to the newest release on origin, to a named version, and refuses a missing hotfix", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-switch-release-"));
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
      for (const version of ["1.9.0", "1.10.0"]) {
        git(repo, ["branch", `release/${version}`, "develop"]);
        git(repo, ["push", "origin", `release/${version}`]);
      }

      expect(gith(repo, ["switch", "--release"]).status).toBe(0);
      expect(git(repo, ["branch", "--show-current"]).stdout.trim()).toBe(
        "release/1.10.0",
      );

      expect(gith(repo, ["switch", "-r", "1.9.0"]).status).toBe(0);
      expect(git(repo, ["branch", "--show-current"]).stdout.trim()).toBe(
        "release/1.9.0",
      );

      expect(gith(repo, ["switch", "-r", "9.9.9"]).status).toBe(1);
      expect(gith(repo, ["switch", "--hotfix"]).status).toBe(1);
      expect(gith(repo, ["switch", "--release", "-b", "x"]).status).toBe(1);
      const picker = gith(repo, ["switch"]);
      expect(picker.status).toBe(1);
      expect(picker.stderr).toContain("the list needs a terminal");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
