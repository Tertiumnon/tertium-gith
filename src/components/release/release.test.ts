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
  test.each([
    { kind: "minor", update: true, version: "0.2.0" },
    { kind: "minor", update: false, version: "0.1.0" },
    { kind: "major", update: true, version: "1.0.0" },
    { kind: "major", update: false, version: "0.1.0" },
    { kind: "patch", update: true, version: "0.1.1" },
    { kind: "patch", update: false, version: "0.1.0" },
  ])(
    "$kind release with update=$update syncs branches and keeps version $version",
    ({ kind, update, version }) => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-release-sync-"));
      try {
        const repo = path.join(tmp, "repo");
        const remote = path.join(tmp, "remote.git");
        fs.mkdirSync(repo);
        git(tmp, ["init", "--bare", remote]);
        git(repo, ["init", "-b", "main"]);
        git(repo, ["config", "user.email", "test@example.com"]);
        git(repo, ["config", "user.name", "Test"]);
        fs.writeFileSync(
          path.join(repo, "package.json"),
          JSON.stringify({
            name: "gith-release-test",
            version: "0.1.0",
            scripts: {
              version: `bun run "${CLI}" changelog --no-commit && git add -- CHANGELOG.md`,
            },
          }),
        );
        fs.writeFileSync(path.join(repo, "CHANGELOG.md"), "# Changelog\n");
        git(repo, ["add", "."]);
        git(repo, ["commit", "-m", "initial"]);
        git(repo, ["tag", "v0.1.0"]);
        git(repo, ["remote", "add", "origin", remote]);
        git(repo, ["push", "-u", "origin", "main"]);
        git(repo, ["switch", "-c", "develop"]);
        git(repo, ["push", "-u", "origin", "develop"]);

        const options = update ? ["--update-version", "--npm"] : [];
        const preview = gith(repo, [
          "release",
          `--${kind}`,
          ...options,
          "--dry-run",
        ]);
        expect(preview.status).toBe(0);
        expect(preview.stdout.includes("> npm version")).toBe(update);
        expect(git(repo, ["tag", "--list"]).stdout.trim()).toBe("v0.1.0");
        const result = gith(repo, ["release", `--${kind}`, ...options]);
        const main = git(repo, [
          "ls-remote",
          "origin",
          "refs/heads/main",
        ]).stdout.split("\t")[0];
        const develop = git(repo, [
          "ls-remote",
          "origin",
          "refs/heads/develop",
        ]).stdout.split("\t")[0];

        expect(result.status).toBe(0);
        expect(main).toBe(develop);
        expect(
          JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"))
            .version,
        ).toBe(version);
        expect(
          git(repo, ["tag", "--list"]).stdout.trim().split("\n"),
        ).toHaveLength(update ? 2 : 1);
        expect(
          fs
            .readFileSync(path.join(repo, "CHANGELOG.md"), "utf8")
            .includes(`## ${version}`),
        ).toBe(update);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
    60_000,
  );

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
      for (const flag of ["--update-version", "--npm"]) {
        const invalid = gith(repo, ["release", "--patch", flag]);
        expect(invalid.status).toBe(1);
        expect(invalid.stderr).toContain(
          "require both --update-version and --npm",
        );
        expect(invalid.stdout).not.toContain("> git checkout");
      }

      fs.writeFileSync(path.join(repo, "a.txt"), "changed");
      const dirty = gith(repo, ["release", "--patch"]);
      expect(dirty.status).toBe(1);
      expect(dirty.stderr).toContain("uncommitted changes to tracked files");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
