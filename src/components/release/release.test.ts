import { describe, expect, test } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
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

describe("release", () => {
  test("npm version commits the changelog with the package bump", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-version-"));
    try {
      git(tmp, ["init", "-b", "main"]);
      git(tmp, ["config", "user.email", "test@example.com"]);
      git(tmp, ["config", "user.name", "Test"]);
      fs.writeFileSync(
        path.join(tmp, "package.json"),
        JSON.stringify({
          name: "gith-release-test",
          version: "0.1.0",
          scripts: {
            version: `bun run "${CLI}" changelog --no-commit && git add -- CHANGELOG.md`,
          },
        }),
      );
      git(tmp, ["add", "."]);
      git(tmp, ["commit", "-m", "initial"]);
      git(tmp, ["tag", "v0.1.0"]);

      execSync("npm version minor --tag-version-prefix=probe-", {
        cwd: tmp,
        stdio: "pipe",
      });

      const committed = git(tmp, [
        "show",
        "--format=",
        "--name-only",
        "HEAD",
      ]).stdout;
      expect(committed).toContain("CHANGELOG.md");
      expect(committed).toContain("package.json");
      expect(git(tmp, ["status", "--porcelain"]).stdout).toBe("");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  test("needs one kind, and refuses a tree with changes to tracked files", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-release-"));
    try {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(repo);
      git(repo, ["init", "-b", "main"]);
      git(repo, ["config", "user.email", "test@example.com"]);
      git(repo, ["config", "user.name", "Test"]);
      fs.writeFileSync(path.join(repo, "a.txt"), "a");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-m", "initial"]);

      expect(gith(repo, ["release"]).stderr).toContain(
        "usage: gith release --patch | --minor | --major",
      );
      expect(gith(repo, ["release", "--patch", "--local"]).stderr).toContain(
        "not supported by gith release",
      );

      fs.writeFileSync(path.join(repo, "a.txt"), "changed");
      const dirty = gith(repo, ["release", "--patch"]);
      expect(dirty.status).toBe(1);
      expect(dirty.stderr).toContain("uncommitted changes to tracked files");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
