import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildEntry,
  filterCommitSubjects,
  mergeChangelogContent,
  parsePackageVersion,
  todayIso,
} from "./changelog.utils";

const CLI = path.resolve(import.meta.dir, "../../cli.ts");

describe("changelog", () => {
  test("filterCommitSubjects keeps ordinary subjects in order", () => {
    expect(
      filterCommitSubjects("feat: add widget support\nfix: correct off-by-one"),
    ).toEqual(["feat: add widget support", "fix: correct off-by-one"]);
  });

  test("filterCommitSubjects drops a stray bare version-number commit and blank lines", () => {
    expect(filterCommitSubjects("feat: add widget support\n2.0.0\n\n")).toEqual(
      ["feat: add widget support"],
    );
  });

  test("filterCommitSubjects returns nothing for empty input", () => {
    expect(filterCommitSubjects("")).toEqual([]);
    expect(filterCommitSubjects("   \n  ")).toEqual([]);
  });

  test("buildEntry lists subjects as bullets under a version and date heading", () => {
    expect(
      buildEntry({
        version: "2.0.0",
        date: "2026-09-22",
        subjects: ["feat: add widget support", "fix: correct"],
      }),
    ).toBe(
      "## 2.0.0 - 2026-09-22\n\n- feat: add widget support\n- fix: correct\n",
    );
  });

  test("buildEntry falls back to a placeholder when there are no subjects", () => {
    expect(
      buildEntry({ version: "2.0.0", date: "2026-09-22", subjects: [] }),
    ).toBe("## 2.0.0 - 2026-09-22\n\n- (no changes recorded)\n");
  });

  test("mergeChangelogContent creates the title on the first run, and prepends later", () => {
    expect(
      mergeChangelogContent(null, "## 1.0.0 - 2026-01-01\n\n- init\n"),
    ).toBe("# Changelog\n\n## 1.0.0 - 2026-01-01\n\n- init\n\n");
    expect(
      mergeChangelogContent(
        "# Changelog\n\n## 1.0.0 - 2026-01-01\n\n- init\n",
        "## 2.0.0 - 2026-02-01\n\n- feat: add widget support\n",
      ),
    ).toBe(
      "# Changelog\n\n## 2.0.0 - 2026-02-01\n\n- feat: add widget support\n\n## 1.0.0 - 2026-01-01\n\n- init\n",
    );
  });

  test("parsePackageVersion reads the version and throws when it is missing", () => {
    expect(parsePackageVersion('{"name":"pkg","version":"1.2.3"}')).toBe(
      "1.2.3",
    );
    expect(() => parsePackageVersion('{"name":"pkg"}')).toThrow();
  });

  test("todayIso formats a date as YYYY-MM-DD", () => {
    expect(todayIso(new Date("2026-09-22T15:04:05Z"))).toBe("2026-09-22");
  });

  test("gith changelog previews, then writes the entry for commits since the last tag", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-changelog-"));
    try {
      const git = (args: string[]) =>
        spawnSync("git", args, { cwd: tmp, encoding: "utf8" });
      const gith = (args: string[]) =>
        spawnSync(process.execPath, [CLI, ...args], {
          cwd: tmp,
          encoding: "utf8",
        });
      git(["init", "-b", "main"]);
      git(["config", "user.email", "test@example.com"]);
      git(["config", "user.name", "Test"]);
      fs.writeFileSync(
        path.join(tmp, "package.json"),
        '{"name":"pkg","version":"0.1.0"}',
      );
      git(["add", "."]);
      git(["commit", "-m", "feat: first"]);
      git(["tag", "v0.1.0"]);
      fs.writeFileSync(path.join(tmp, "a.txt"), "a");
      git(["add", "."]);
      git(["commit", "-m", "fix: after the tag"]);
      fs.writeFileSync(
        path.join(tmp, "package.json"),
        '{"name":"pkg","version":"0.1.1"}',
      );

      const preview = gith(["changelog", "--dry-run"]);
      expect(preview.status).toBe(0);
      expect(preview.stdout).toContain("## 0.1.1 - ");
      expect(preview.stdout).toContain("- fix: after the tag");
      expect(preview.stdout).not.toContain("feat: first");
      expect(fs.existsSync(path.join(tmp, "CHANGELOG.md"))).toBe(false);

      expect(gith(["changelog"]).status).toBe(0);
      const written = fs.readFileSync(path.join(tmp, "CHANGELOG.md"), "utf8");
      expect(written.startsWith("# Changelog\n\n## 0.1.1 - ")).toBe(true);
      expect(written).toContain("- fix: after the tag");
      expect(gith(["changelog", "extra"]).status).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
