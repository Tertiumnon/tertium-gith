import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tagPairs } from "./list";

describe("list", () => {
  const CLI = path.resolve(import.meta.dir, "../../cli.ts");

  function git(cwd: string, args: string[]) {
    return spawnSync("git", args, { cwd, encoding: "utf8" });
  }

  describe("tagPairs", () => {
    test("marks each tag as local, origin, or both", () => {
      expect(tagPairs(["v1.0.0", "v1.1.0"], ["v1.1.0", "v2.0.0"])).toEqual([
        { name: "v2.0.0", local: false, origin: true },
        { name: "v1.1.0", local: true, origin: true },
        { name: "v1.0.0", local: true, origin: false },
      ]);
    });

    test("sorts versions numerically, newest first, and other tags after them", () => {
      const names = tagPairs(["v1.9.0", "nightly", "v1.10.0", "beta"], []).map(
        (pair) => pair.name,
      );
      expect(names).toEqual(["v1.10.0", "v1.9.0", "beta", "nightly"]);
    });
  });

  describe("gith list --tags", () => {
    test("shows tags on each side and requires --tags", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-list-"));
      try {
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

        // v1.0.0 on both sides, v1.1.0 local only, v2.0.0 origin only.
        git(repo, ["tag", "v1.0.0"]);
        git(repo, ["push", "origin", "v1.0.0"]);
        git(repo, ["tag", "v1.1.0"]);
        git(repo, ["tag", "v2.0.0"]);
        git(repo, ["push", "origin", "v2.0.0"]);
        git(repo, ["tag", "-d", "v2.0.0"]);

        const result = spawnSync(process.execPath, [CLI, "list", "--tags"], {
          cwd: repo,
          encoding: "utf8",
        });
        expect(result.status).toBe(0);
        expect(result.stdout).toBe(
          [
            "TAG     LOCAL  ORIGIN",
            "v2.0.0  no     yes",
            "v1.1.0  yes    no",
            "v1.0.0  yes    yes",
            "",
          ].join("\n"),
        );

        expect(
          spawnSync(process.execPath, [CLI, "list"], {
            cwd: repo,
            encoding: "utf8",
          }).status,
        ).toBe(1);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);
  });

  describe("gith list --commits", () => {
    function repoWithCommits(count: number): { tmp: string; repo: string } {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-commits-"));
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(repo);
      git(repo, ["init", "-b", "main"]);
      git(repo, ["config", "user.email", "test@example.com"]);
      git(repo, ["config", "user.name", "Test"]);
      for (let i = 1; i <= count; i++) {
        fs.writeFileSync(path.join(repo, `f${i}.txt`), `${i}`);
        git(repo, ["add", "."]);
        git(repo, ["commit", "-m", `commit ${i}`]);
      }
      return { tmp, repo };
    }

    function cli(cwd: string, args: string[]) {
      return spawnSync(process.execPath, [CLI, ...args], {
        cwd,
        encoding: "utf8",
      });
    }

    test("lists the newest commits, five by default, and -l/-limit cap the count", () => {
      const { tmp, repo } = repoWithCommits(7);
      try {
        const defaultList = cli(repo, ["list", "--commits"])
          .stdout.trim()
          .split("\n");
        expect(defaultList).toHaveLength(5);
        expect(defaultList[0]).toContain("commit 7");

        const two = cli(repo, ["list", "--commits", "-l", "2"])
          .stdout.trim()
          .split("\n");
        expect(two).toHaveLength(2);
        expect(two[1]).toContain("commit 6");

        expect(
          cli(repo, ["list", "--commits", "-limit", "1"])
            .stdout.trim()
            .split("\n"),
        ).toHaveLength(1);
        expect(
          cli(repo, ["list", "--commits", "-limit", "10"])
            .stdout.trim()
            .split("\n"),
        ).toHaveLength(7);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);

    test("graph shows merge lanes, refs and author dates without ANSI in pipes", () => {
      const { tmp, repo } = repoWithCommits(1);
      try {
        git(repo, ["switch", "-c", "feature"]);
        fs.writeFileSync(path.join(repo, "feature.txt"), "feature");
        git(repo, ["add", "."]);
        git(repo, ["commit", "-m", "feature work"]);
        git(repo, ["switch", "main"]);
        fs.writeFileSync(path.join(repo, "main.txt"), "main");
        git(repo, ["add", "."]);
        git(repo, ["commit", "-m", "main work"]);
        git(repo, ["merge", "--no-ff", "feature", "-m", "merge feature"]);
        git(repo, ["tag", "v1.0.0"]);
        git(repo, ["config", "color.ui", "always"]);
        const result = cli(repo, ["list", "--commits", "--graph", "-l", "4"]);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("╭─ COMMIT GRAPH");
        expect(result.stdout).toContain("main · branch history · limit 4");
        expect(result.stdout).toContain("HEAD -> main");
        expect(result.stdout).toContain("tag: v1.0.0");
        expect(result.stdout).toContain("feature work");
        expect(result.stdout).toContain("main work");
        expect(result.stdout).toContain("merge feature");
        expect(result.stdout).toContain("|\\");
        expect(result.stdout).toMatch(
          /└─ Test · \d{4}-\d{2}-\d{2} \d{2}:\d{2}/,
        );
        expect(result.stdout).not.toContain("\x1b[");
        const one = cli(repo, ["show", "--commits", "--graph", "-l", "1"]);
        expect(one.stdout).toContain("merge feature");
        expect(one.stdout).not.toContain("feature work");
        expect(one.stdout).not.toContain("main work");
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);

    test("rejects a bad limit and a limit with --tags; reports an empty repository", () => {
      const { tmp, repo } = repoWithCommits(1);
      try {
        expect(cli(repo, ["list", "--commits", "-l", "0"]).status).toBe(1);
        expect(cli(repo, ["list", "--commits", "-l", "x"]).status).toBe(1);
        expect(cli(repo, ["list", "--commits", "-l"]).status).toBe(1);
        expect(cli(repo, ["list", "--tags", "-l", "0"]).status).toBe(1);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }

      const empty = fs.mkdtempSync(path.join(os.tmpdir(), "gith-empty-"));
      try {
        git(empty, ["init", "-b", "main"]);
        expect(cli(empty, ["list", "--commits"]).stdout.trim()).toBe(
          "No commits.",
        );
      } finally {
        fs.rmSync(empty, { recursive: true, force: true });
      }
    }, 60_000);
  });

  describe("-limit on tags", () => {
    test("list --tags shows the newest five by default, and -limit changes that", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-tag-limit-"));
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
        for (let i = 1; i <= 7; i++) git(repo, ["tag", `v1.${i}.0`]);

        const run = (args: string[]) =>
          spawnSync(process.execPath, [CLI, ...args], {
            cwd: repo,
            encoding: "utf8",
          }).stdout;

        const five = run(["list", "--tags"]).trim().split("\n");
        expect(five).toHaveLength(7); // header, five rows, note
        expect(five[1]).toContain("v1.7.0");
        expect(five[five.length - 1]).toBe(
          "showing 5 of 7; -limit <n> shows more",
        );

        const two = run(["list", "--tags", "-limit", "2"]).trim().split("\n");
        expect(two).toHaveLength(4); // header, two rows, note
        expect(two[1]).toContain("v1.7.0");

        expect(
          run(["list", "--tags", "-l", "10"]).trim().split("\n"),
        ).toHaveLength(8);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);
  });
});

describe("show", () => {
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

  describe("gith show and --pockets", () => {
    test("show is list, and --pockets lists stashes with Gorlum", () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-show-"));
      try {
        const repo = path.join(tmp, "repo");
        fs.mkdirSync(repo);
        git(repo, ["init", "-b", "main"]);
        git(repo, ["config", "user.email", "test@example.com"]);
        git(repo, ["config", "user.name", "Test"]);
        fs.writeFileSync(path.join(repo, "a.txt"), "a");
        git(repo, ["add", "."]);
        git(repo, ["commit", "-m", "initial"]);
        fs.writeFileSync(path.join(repo, "a.txt"), "changed");
        expect(gith(repo, ["stash", "-n", "gold-ring"]).status).toBe(0);

        expect(gith(repo, ["show", "--commits", "-l", "1"]).stdout).toContain(
          "initial",
        );
        expect(gith(repo, ["show"]).status).toBe(1);

        const pockets = gith(repo, ["show", "--pockets"]);
        expect(pockets.status).toBe(0);
        expect(pockets.stdout).toContain("my precious pockets!");
        expect(pockets.stdout).toContain("gold-ring");
        expect(gith(repo, ["list", "--pockets", "--stashes"]).status).toBe(1);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }, 60_000);
  });
});

describe("show --pockets when empty", () => {
  test("says there is nothing in the pockets", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-pockets-"));
    try {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(repo);
      spawnSync("git", ["init", "-b", "main"], { cwd: repo });
      spawnSync("git", ["config", "user.email", "test@example.com"], {
        cwd: repo,
      });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: repo });
      fs.writeFileSync(path.join(repo, "a.txt"), "a");
      spawnSync("git", ["add", "."], { cwd: repo });
      spawnSync("git", ["commit", "-m", "initial"], { cwd: repo });
      const run = spawnSync(
        process.execPath,
        [path.resolve(import.meta.dir, "../../cli.ts"), "show", "--pockets"],
        { cwd: repo, encoding: "utf8" },
      );
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("There is nothing in my pockets!");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
