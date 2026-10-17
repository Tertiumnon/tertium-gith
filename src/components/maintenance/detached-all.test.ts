import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve(import.meta.dir, "../../cli.ts");

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function gith(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
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
      expect(git(repo, ["branch", "--list", "lonely-one"]).stdout.trim()).toBe(
        "",
      );
      expect(git(repo, ["branch", "--list", "lonely-two"]).stdout.trim()).toBe(
        "",
      );
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
