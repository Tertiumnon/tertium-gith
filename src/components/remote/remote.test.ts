import { describe, expect, test } from "bun:test";
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cli = path.resolve(import.meta.dir, "../../cli.ts");
const git = (cwd: string, args: string[]): string => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};
const gith = (cwd: string, args: string[]): SpawnSyncReturns<string> =>
  spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
  });
const commit = (repo: string, name: string): void => {
  fs.writeFileSync(path.join(repo, name), name);
  git(repo, ["add", "--", name]);
  git(repo, ["commit", "-m", name]);
};
const fixture = (run: (repo: string) => void): void => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-remote-"));
  try {
    const repo = path.join(tmp, "repo");
    fs.mkdirSync(repo);
    git(tmp, ["init", "--bare", "remote.git"]);
    git(repo, ["init", "-b", "main"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test"]);
    commit(repo, "initial.txt");
    git(repo, ["remote", "add", "origin", "../remote.git"]);
    git(repo, ["push", "-u", "origin", "main"]);
    run(repo);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

const advanceOrigin = (repo: string, branch: string): void => {
  const other = path.join(repo, "..", `other-${branch}`);
  git(repo, ["clone", "--branch", branch, "../remote.git", other]);
  git(other, ["config", "user.email", "test@example.com"]);
  git(other, ["config", "user.name", "Test"]);
  commit(other, `${branch}-remote.txt`);
  git(other, ["push", "origin", branch]);
};

describe("remote", () => {
  test(
    "matching branch suffixes are distinct and untracked files survive a refused pull",
    () =>
      fixture((repo) => {
        git(repo, ["branch", "feature/work"]);
        git(repo, ["push", "origin", "feature/work"]);
        git(repo, ["switch", "-c", "work"]);
        expect(gith(repo, ["pull"]).stderr).toContain(
          "origin/work does not exist",
        );
        expect(gith(repo, ["push"]).status).toBe(0);
        expect(
          git(repo, ["ls-remote", "--heads", "origin", "refs/heads/work"]),
        ).not.toBe("");
        git(repo, ["switch", "main"]);
        advanceOrigin(repo, "main");
        fs.writeFileSync(path.join(repo, "main-remote.txt"), "keep me");
        const before = git(repo, ["rev-parse", "HEAD"]);
        expect(gith(repo, ["pull"]).status).toBe(1);
        expect(git(repo, ["rev-parse", "HEAD"])).toBe(before);
        expect(
          fs.readFileSync(path.join(repo, "main-remote.txt"), "utf8"),
        ).toBe("keep me");
      }),
    60_000,
  );

  test(
    "push publishes all local branches and sets tracking without prompts",
    () =>
      fixture((repo) => {
        git(repo, ["switch", "-c", "work"]);
        commit(repo, "work.txt");
        git(repo, ["branch", "second"]);
        const result = gith(repo, ["push", "--all-branches"]);
        expect(result.status).toBe(0);
        for (const branch of ["main", "work", "second"]) {
          expect(git(repo, ["rev-parse", `${branch}@{upstream}`])).toBe(
            git(repo, ["rev-parse", branch]),
          );
        }
        expect(result.stdout).toContain("Publishing work");
        expect(gith(repo, ["push"]).stdout).toContain("ahead 0, behind 0");
      }),
    60_000,
  );

  test(
    "push sends only the current branch by default and reports its commits",
    () =>
      fixture((repo) => {
        git(repo, ["branch", "unpublished"]);
        commit(repo, "local.txt");
        const result = gith(repo, ["push"]);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("ahead 1, behind 0");
        expect(
          git(repo, ["ls-remote", "--heads", "origin", "unpublished"]),
        ).toBe("");
        expect(git(repo, ["rev-parse", "origin/main"])).toBe(
          git(repo, ["rev-parse", "HEAD"]),
        );
      }),
    60_000,
  );

  test(
    "pull fast-forwards all local branches without switching",
    () =>
      fixture((repo) => {
        git(repo, ["branch", "work"]);
        git(repo, ["push", "origin", "work"]);
        advanceOrigin(repo, "main");
        advanceOrigin(repo, "work");
        const result = gith(repo, ["pull", "--all-branches"]);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("Pulled 1 commit(s) into main");
        expect(result.stdout).toContain("Pulled 1 commit(s) into work");
        expect(git(repo, ["branch", "--show-current"])).toBe("main");
        expect(fs.existsSync(path.join(repo, "main-remote.txt"))).toBe(true);
        expect(git(repo, ["show", "work:work-remote.txt"])).toBe(
          "work-remote.txt",
        );
      }),
    60_000,
  );

  test(
    "push and pull reject divergence and leave all branch tips unchanged",
    () =>
      fixture((repo) => {
        git(repo, ["branch", "aaa"]);
        git(repo, ["push", "origin", "aaa"]);
        advanceOrigin(repo, "aaa");
        advanceOrigin(repo, "main");
        commit(repo, "local.txt");
        const before = git(repo, ["show-ref", "--heads"]);
        const remote = git(repo, ["ls-remote", "--heads", "origin"]);
        for (const command of ["push", "pull"]) {
          const result = gith(repo, [command, "--all-branches"]);
          expect(result.status).toBe(1);
          expect(result.stderr).toContain(
            command === "push" ? "behind origin" : "diverged",
          );
          expect(git(repo, ["show-ref", "--heads"])).toBe(before);
          expect(git(repo, ["ls-remote", "--heads", "origin"])).toBe(remote);
        }
      }),
    60_000,
  );

  test(
    "behind push points to pull; pull preserves local-only commits",
    () =>
      fixture((repo) => {
        advanceOrigin(repo, "main");
        const result = gith(repo, ["push"]);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("run gith pull");
        expect(gith(repo, ["pull"]).status).toBe(0);
        expect(gith(repo, ["pull"]).stdout).toContain("already up to date");
        commit(repo, "local.txt");
        expect(gith(repo, ["pull"]).stdout).toContain(
          "publish 1 local commit(s)",
        );
      }),
    60_000,
  );

  test(
    "pull refuses dirty files and unpublished branches with actionable errors",
    () =>
      fixture((repo) => {
        fs.writeFileSync(path.join(repo, "initial.txt"), "dirty");
        expect(gith(repo, ["pull"]).stderr).toContain("gith stash");
        git(repo, ["restore", "initial.txt"]);
        git(repo, ["switch", "-c", "local"]);
        expect(gith(repo, ["pull", "--all-branches"]).stderr).toContain(
          "run gith push",
        );
      }),
    60_000,
  );

  test(
    "dry runs print actions and leave local and remote tips unchanged",
    () =>
      fixture((repo) => {
        git(repo, ["branch", "work"]);
        const before = git(repo, ["show-ref"]);
        for (const command of ["push", "pull"]) {
          const result = gith(repo, [command, "--all-branches", "--dry-run"]);
          expect(result.status).toBe(0);
          expect(result.stdout).toContain(
            command === "push" ? "git push --atomic" : "git merge --ff-only",
          );
          expect(git(repo, ["show-ref"])).toBe(before);
        }
        expect(git(repo, ["ls-remote", "--heads", "origin", "work"])).toBe("");
      }),
    60_000,
  );

  test(
    "unsupported flags, missing origin and detached HEAD fail without prompts",
    () =>
      fixture((repo) => {
        for (const command of ["push", "pull"]) {
          expect(gith(repo, [command, "--force"]).stderr).toContain("usage:");
        }
        git(repo, ["checkout", "--detach"]);
        for (const command of ["push", "pull"])
          expect(gith(repo, [command]).stderr).toContain("detached");
        git(repo, ["switch", "main"]);
        git(repo, ["remote", "remove", "origin"]);
        expect(gith(repo, ["push"]).status).toBe(1);
        expect(gith(repo, ["pull"]).status).toBe(1);
      }),
    60_000,
  );
});
