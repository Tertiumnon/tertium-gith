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

describe("gith doctor", () => {
  test("doctor fails without origin", () => {
    const noOrigin = fs.mkdtempSync(path.join(os.tmpdir(), "gith-doctor-"));
    try {
      git(noOrigin, ["init", "-b", "main"]);
      const result = gith(noOrigin, ["doctor"]);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("✖ origin is configured");
    } finally {
      fs.rmSync(noOrigin, { recursive: true, force: true });
    }
  }, 60_000);

  test("doctor passes when origin has main and develop", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-doctor-ok-"));
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
      const result = gith(repo, ["doctor"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("ready");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
