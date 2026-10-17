import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseWorktrees } from "./tree";

const CLI = path.resolve(import.meta.dir, "../../cli.ts");

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

describe("parseWorktrees", () => {
  test("reads branch, detached, bare and locked worktrees", () => {
    const output = [
      "worktree /repo",
      "HEAD 1111111aaaa",
      "branch refs/heads/main",
      "",
      "worktree /repo-detached",
      "HEAD 2222222bbbb",
      "detached",
      "",
      "worktree /bare.git",
      "bare",
      "",
      "worktree /locked",
      "HEAD 3333333cccc",
      "branch refs/heads/feature/x",
      "locked busy",
      "",
    ].join("\n");
    expect(parseWorktrees(output)).toEqual([
      {
        path: "/repo",
        head: "1111111",
        branch: "main",
        bare: false,
        locked: false,
        prunable: false,
      },
      {
        path: "/repo-detached",
        head: "2222222",
        bare: false,
        locked: false,
        prunable: false,
      },
      {
        path: "/bare.git",
        head: "",
        bare: true,
        locked: false,
        prunable: false,
      },
      {
        path: "/locked",
        head: "3333333",
        branch: "feature/x",
        bare: false,
        locked: true,
        prunable: false,
      },
    ]);
  });
});

describe("gith tree", () => {
  test("lists every working tree and marks the current one", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-tree-"));
    try {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(repo);
      git(repo, ["init", "-b", "main"]);
      git(repo, ["config", "user.email", "test@example.com"]);
      git(repo, ["config", "user.name", "Test"]);
      fs.writeFileSync(path.join(repo, "a.txt"), "a");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-m", "initial"]);
      git(repo, ["worktree", "add", "-b", "side", path.join(tmp, "side")]);
      git(repo, ["worktree", "add", "--detach", path.join(tmp, "detached")]);

      const run = (args: string[]) =>
        spawnSync(process.execPath, [CLI, ...args], {
          cwd: repo,
          encoding: "utf8",
        });

      const all = run(["tree"]);
      expect(all.status).toBe(0);
      expect(all.stdout).toContain("* ");
      expect(all.stdout).toContain("side");
      expect(all.stdout).toContain("(detached)");
      expect(all.stdout.trim().split("\n")).toHaveLength(4); // header + three trees

      const one = run(["tree", "-limit", "1"]).stdout.trim().split("\n");
      expect(one).toHaveLength(3); // header, one tree, note
      expect(one[2]).toBe("showing 1 of 3; -limit <n> shows more");

      expect(run(["tree", "main"]).status).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
