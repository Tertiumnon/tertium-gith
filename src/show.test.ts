import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve(import.meta.dir, "cli.ts");

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function gith(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
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
