import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPreCommitHook } from "./hooks";

const CLI = path.resolve(import.meta.dir, "cli.ts");

function gith(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

describe("gith setup -hooks", () => {
  test("TypeScript projects always check lint and typecheck, test only when defined", () => {
    const hook = buildPreCommitHook({ scripts: {} }, "bun", true);
    expect(hook).toContain("bun run lint");
    expect(hook).toContain("bun run typecheck");
    expect(hook).not.toContain("bun run test");
  });

  test("writes the hook, points core.hooksPath at it, and adds prepare", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gith-hooks-"));
    try {
      spawnSync("git", ["init", "-b", "main"], { cwd: dir });
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ scripts: { test: "bun test" } }),
      );
      fs.writeFileSync(path.join(dir, "bun.lock"), "");

      expect(gith(dir, ["setup", "-hooks"]).status).toBe(0);

      expect(
        fs.readFileSync(path.join(dir, ".githooks", "pre-commit"), "utf8"),
      ).toContain("bun run test");
      expect(
        spawnSync("git", ["config", "core.hooksPath"], {
          cwd: dir,
          encoding: "utf8",
        }).stdout.trim(),
      ).toBe(".githooks");
      expect(
        JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"))
          .scripts.prepare,
      ).toBe("git config core.hooksPath .githooks");
      expect(gith(dir, ["setup", "-hooks"]).status).toBe(1);
      expect(gith(dir, ["setup", "-hooks", "--force"]).status).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("requires -hooks and rejects unknown options", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gith-hooks-args-"));
    try {
      expect(gith(dir, ["setup"]).status).toBe(1);
      expect(gith(dir, ["setup", "--force"]).status).toBe(1);
      expect(gith(dir, ["setup", "-hooks", "./app"]).status).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
