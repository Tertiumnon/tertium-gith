import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { branchTimes, detachedOptions, staleOptions } from "./maintenance";

const CLI = path.resolve(import.meta.dir, "cli.ts");
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
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
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
      expect(gith(repo, ["remove", "--obsolete", "-days", "0"]).status).toBe(1);
      expect(gith(repo, ["remove", "-days", "5"]).status).toBe(1);
      expect(gith(repo, ["remove", "--obsolete", "--detached"]).status).toBe(1);

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
