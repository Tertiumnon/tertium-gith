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
