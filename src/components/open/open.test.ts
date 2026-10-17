import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { webUrl } from "./open";

const CLI = path.resolve(import.meta.dir, "../../cli.ts");

function git(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function gith(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

describe("webUrl", () => {
  test("turns ssh and https origins into the web address", () => {
    expect(webUrl("git@github.com:Tertiumnon/tertium-gith.git")).toBe(
      "https://github.com/Tertiumnon/tertium-gith",
    );
    expect(webUrl("ssh://git@gitlab.com/team/app.git")).toBe(
      "https://gitlab.com/team/app",
    );
    expect(webUrl("https://github.com/team/app.git\n")).toBe(
      "https://github.com/team/app",
    );
    expect(() => webUrl("../remote.git")).toThrow("not a web address");
  });
});

describe("gith open", () => {
  test("open --dry-run prints the browser command for origin", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-open-"));
    try {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(repo);
      git(repo, ["init", "-b", "main"]);
      git(repo, ["remote", "add", "origin", "git@github.com:team/app.git"]);
      const opened = gith(repo, ["open", "--dry-run"]);
      expect(opened.status).toBe(0);
      expect(opened.stdout).toContain("https://github.com/team/app");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
