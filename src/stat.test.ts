import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { longestStreak, parseLog, periodRange, summarize, table } from "./stat";

const CLI = path.resolve(import.meta.dir, "cli.ts");

// Saturday 17 October 2026, local time.
const NOW = new Date(2026, 9, 17, 12);

describe("periodRange", () => {
  test("weeks start on Monday, months and years on the first day", () => {
    expect(periodRange("current-week", NOW).since).toBe(
      new Date(2026, 9, 12).toISOString(),
    );
    expect(periodRange("last-week", NOW)).toEqual({
      label: "last week",
      since: new Date(2026, 9, 5).toISOString(),
      until: new Date(2026, 9, 12).toISOString(),
    });
    expect(periodRange("current-month", NOW).since).toBe(
      new Date(2026, 9, 1).toISOString(),
    );
    expect(periodRange("last-month", NOW).since).toBe(
      new Date(2026, 8, 1).toISOString(),
    );
    expect(periodRange("last-year", NOW).until).toBe(
      new Date(2026, 0, 1).toISOString(),
    );
    expect(periodRange("overall", NOW)).toEqual({ label: "overall" });
  });
});

describe("parseLog and longestStreak", () => {
  test("reads commits and their file counts, and counts binary files as zero", () => {
    const output = [
      "\x1eabc1234\x1fAna\x1f2026-10-17T10:00:00+02:00\x1ffeat: add thing",
      "3\t1\tsrc/a.ts",
      "-\t-\timage.png",
      "",
      "\x1edef5678\x1fBen\x1f2026-10-16T23:30:00+02:00\x1ffix: small",
      "2\t0\tsrc/a.ts",
    ].join("\n");
    const commits = parseLog(output);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      hash: "abc1234",
      author: "Ana",
      added: 3,
      deleted: 1,
    });
    expect(commits[0]?.files).toEqual(["src/a.ts", "image.png"]);
    expect(commits[1]).toMatchObject({
      subject: "fix: small",
      added: 2,
      deleted: 0,
    });
  });

  test("the longest streak counts consecutive days, not commits", () => {
    const at = (day: number) => new Date(2026, 9, day, 9);
    expect(longestStreak([at(1), at(1), at(2), at(3), at(5)])).toBe(3);
    expect(longestStreak([at(1)])).toBe(1);
  });
});

describe("summarize and table", () => {
  const commits = parseLog(
    [
      "\x1e1111111\x1fAna\x1f2026-10-17T10:00:00+02:00\x1ffeat: big change",
      "100\t20\tsrc/a.ts",
      "\x1e2222222\x1fBen\x1f2026-10-16T23:30:00+02:00\x1ffix: tiny",
      "1\t1\tsrc/a.ts",
    ].join("\n"),
  );

  test("the summary names the biggest commit, top author and commit types", () => {
    const rows = summarize(commits);
    const value = (stat: string) => rows.find((row) => row.stat === stat);
    expect(value("Commits")?.value).toBe("2");
    expect(value("Top author")?.value).toBe("Ana");
    expect(value("Biggest commit")).toEqual({
      stat: "Biggest commit",
      value: "+100 -20",
      detail: "1111111 feat: big change (Ana)",
    });
    expect(value("Commit types")?.value).toBe("feat 1, fix 1");
    expect(summarize([])).toEqual([]);
  });

  test("the table is boxed, and every row has the same width", () => {
    const lines = table(summarize(commits)).split("\n");
    expect(lines[0]?.startsWith("┌")).toBe(true);
    expect(lines[lines.length - 1]?.startsWith("└")).toBe(true);
    expect(new Set(lines.map((line) => line.length)).size).toBe(1);
  });
});

describe("gith stat filters", () => {
  test("period switches are exclusive, -limit must be positive, and an empty period says so", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gith-stat-"));
    try {
      const repo = path.join(tmp, "repo");
      fs.mkdirSync(repo);
      spawnSync("git", ["init", "-b", "main"], { cwd: repo });
      spawnSync("git", ["config", "user.email", "test@example.com"], {
        cwd: repo,
      });
      spawnSync("git", ["config", "user.name", "Test"], { cwd: repo });
      fs.writeFileSync(path.join(repo, "a.txt"), "a");
      spawnSync("git", ["add", "."], { cwd: repo });
      spawnSync("git", ["commit", "-m", "initial"], { cwd: repo });

      const run = (args: string[]) =>
        spawnSync(process.execPath, [CLI, ...args], {
          cwd: repo,
          encoding: "utf8",
        });
      expect(run(["stat"]).stdout).toContain("gith stat, overall");
      expect(run(["stat", "--current-year", "--last-year"]).status).toBe(1);
      expect(run(["stat", "-limit", "0"]).status).toBe(1);
      expect(run(["stat", "--last-week"]).stdout).toContain(
        "No commits in last week.",
      );
      expect(run(["stat", "--current-year", "-limit", "1"]).stdout).toContain(
        "this year",
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
