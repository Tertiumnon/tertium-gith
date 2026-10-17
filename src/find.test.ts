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

describe("gith find|search -commit", () => {
  test("matches messages case-insensitively and literally, with -limit", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-find-"));
    try {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(repo);
      git(repo, ["init", "-b", "main"]);
      git(repo, ["config", "user.email", "test@example.com"]);
      git(repo, ["config", "user.name", "Test"]);
      for (const message of [
        "Fix login bug",
        "add stats",
        "fix: typo (a.b)",
        "docs: fix readme",
      ]) {
        fs.writeFileSync(path.join(repo, `${message.length}.txt`), message);
        git(repo, ["add", "."]);
        git(repo, ["commit", "-m", message]);
      }

      const all = gith(repo, ["find", "-commit", "FIX"]);
      expect(all.status).toBe(0);
      expect(all.stdout.trim().split("\n")).toHaveLength(3);
      expect(all.stdout).not.toContain("add stats");

      expect(
        gith(repo, ["search", "-commit", "fix", "-limit", "1"])
          .stdout.trim()
          .split("\n"),
      ).toHaveLength(1);
      expect(gith(repo, ["find", "-commit", "(a.b)"]).stdout).toContain(
        "fix: typo (a.b)",
      );
      expect(
        gith(repo, ["find", "-commit", "nothing-like-this"]).stdout,
      ).toContain('No commits match "nothing-like-this".');
      expect(gith(repo, ["find"]).status).toBe(1);
      expect(
        gith(repo, ["find", "-commit", "fix", "--commit", "x"]).status,
      ).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
