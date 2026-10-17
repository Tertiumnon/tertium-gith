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
      ).toContain('No commits match message "nothing-like-this".');
      expect(gith(repo, ["find"]).status).toBe(1);
      expect(
        gith(repo, ["find", "-commit", "fix", "--commit", "x"]).status,
      ).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("gith find -file, -change and --regex", () => {
  test("file, change and their combinations, with the matching paths listed", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-find-file-"));
    try {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(path.join(repo, "src"), { recursive: true });
      git(repo, ["init", "-b", "main"]);
      git(repo, ["config", "user.email", "test@example.com"]);
      git(repo, ["config", "user.name", "Test"]);
      const commit = (file: string, text: string, message: string) => {
        fs.writeFileSync(path.join(repo, file), text);
        git(repo, ["add", "."]);
        git(repo, ["commit", "-m", message]);
      };
      commit("src/api.ts", "v1", "add api");
      commit("src/other.ts", "TODO: later", "add other");
      commit("src/api.ts", "v2", "fix: api timeout");
      commit("src/other.ts", "done", "remove todo");

      const byFile = gith(repo, ["find", "-file", "*api.ts"]);
      expect(byFile.status).toBe(0);
      expect(byFile.stdout).toContain("fix: api timeout");
      expect(byFile.stdout).toContain("    src/api.ts");
      expect(byFile.stdout).not.toContain("other.ts");
      expect(byFile.stdout).not.toContain("remove todo");

      expect(
        gith(repo, ["find", "-file", "*api.ts", "-limit", "1"]).stdout,
      ).toContain("fix: api timeout");

      const byChange = gith(repo, ["find", "-change", "TODO"]);
      expect(byChange.stdout).toContain("add other");
      expect(byChange.stdout).toContain("remove todo");
      expect(byChange.stdout).not.toContain("add api");

      const both = gith(repo, [
        "find",
        "-file",
        "*api.ts",
        "-commit",
        "timeout",
      ]);
      expect(both.stdout.trim().split("\n")[0]).toContain("fix: api timeout");
      expect(both.stdout).not.toContain("add api");

      expect(
        gith(repo, ["find", "-change", "T.*O", "--regex"]).stdout,
      ).toContain("add other");
      expect(gith(repo, ["find", "-change", "t.*o"]).stdout).toContain(
        "No commits match",
      );
      expect(gith(repo, ["find", "-file", "*nothing.ts"]).stdout).toContain(
        'No commits match file "*nothing.ts".',
      );
      expect(gith(repo, ["find", "--regex"]).status).toBe(1);
      expect(gith(repo, ["find", "-limit", "2"]).status).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
