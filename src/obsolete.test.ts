import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { obsoleteOf } from "./maintenance";

const CLI = path.resolve(import.meta.dir, "cli.ts");

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function gith(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

describe("obsoleteOf", () => {
  test("keeps branches whose upstream is gone, minus containers and the current branch", () => {
    const output = [
      "feature|[gone]",
      "main|",
      "develop|[gone]",
      "current|[gone]",
      "ahead-only|[ahead 1]",
      "",
    ].join("\n");
    expect(obsoleteOf(output, "current")).toEqual([
      { name: "feature", label: "feature  (origin deleted)" },
    ]);
  });
});

describe("remove --obsolete and list --commits --graph", () => {
  test("--obsolete needs a terminal to pick, reports none, and refuses a name", () => {
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
      git(repo, ["branch", "feature"]);
      git(repo, ["push", "-u", "origin", "feature"]);
      git(repo, ["push", "origin", "--delete", "feature"]);
      git(repo, ["fetch", "--prune"]);

      const picked = gith(repo, ["remove", "--obsolete"]);
      expect(picked.status).toBe(1);
      expect(picked.stderr).toContain("the list needs a terminal");
      expect(gith(repo, ["remove", "--obsolete", "-b", "feature"]).status).toBe(
        1,
      );

      git(repo, ["branch", "--unset-upstream", "feature"]);
      git(repo, ["branch", "other"]);
      expect(gith(repo, ["remove", "--obsolete"]).status).toBe(1); // needs a terminal, checked first

      expect(
        gith(repo, ["list", "--commits", "--graph", "-l", "1"]).stdout,
      ).toContain("*");
      expect(gith(repo, ["list", "--tags", "--graph"]).status).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
