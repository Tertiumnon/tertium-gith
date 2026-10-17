import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setup } from "./setup";
import { buildPreCommitHook } from "./setup.utils";

const CLI = path.resolve(import.meta.dir, "../../cli.ts");

function gith(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

describe("setup", () => {
  test("TypeScript projects always check lint and typecheck, test only when defined", () => {
    const hook = buildPreCommitHook({ scripts: {} }, "bun", true);
    expect(hook).toContain("bun run lint");
    expect(hook).toContain("bun run typecheck");
    expect(hook).not.toContain("bun run test");
    expect(
      buildPreCommitHook({ scripts: { test: "bun test" } }, "npm", false),
    ).toContain("npm run test");
  });

  test("needs -n npm and rejects other setups and unknown flags", () => {
    expect(() => setup(new Map())).toThrow("usage: gith setup -n npm");
    expect(() => setup(new Map([["name", "yarn"]]))).toThrow(
      "only npm is supported",
    );
    expect(() =>
      setup(
        new Map([
          ["name", "npm"],
          ["limit", "3"],
        ]),
      ),
    ).toThrow("usage: gith setup -n npm");
  });

  test("writes the hook, sets core.hooksPath and prepare, refuses to overwrite without --force", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gith-setup-"));
    try {
      spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ scripts: { test: "bun test" } }),
      );
      fs.writeFileSync(path.join(dir, "bun.lock"), "");

      const first = gith(dir, ["setup", "-n", "npm"]);
      expect(first.status).toBe(0);
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

      const again = gith(dir, ["setup", "-n", "npm"]);
      expect(again.status).toBe(1);
      expect(again.stderr).toContain("already exists");
      expect(gith(dir, ["setup", "-n", "npm", "--force"]).status).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--dry-run writes nothing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gith-setup-dry-"));
    try {
      spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ scripts: {} }),
      );
      const result = gith(dir, ["setup", "-n", "npm", "--dry-run"]);
      expect(result.stdout).toContain("would write .githooks/pre-commit");
      expect(fs.existsSync(path.join(dir, ".githooks"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
