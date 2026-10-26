import { onlyOne, parseLimit } from "../args/args";
import type { Flags } from "../args/args.types";
import { assertAllowedFlags } from "../args/args.utils";
import { captureArgs } from "../git/git";
import { DAYS, PERIODS } from "./stat.constants";
import type { Commit, Period, Range, Row } from "./stat.types";
import { count, dayKey, startOfWeek, top } from "./stat.utils";

// The commit range for a period, as git --since and --until dates.
export function periodRange(period: Period, now: Date): Range {
  const year = now.getFullYear();
  const month = now.getMonth();
  const week = startOfWeek(now);
  const iso = (date: Date) => date.toISOString();
  switch (period) {
    case "overall":
      return { label: "overall" };
    case "current-year":
      return { label: `this year (${year})`, since: iso(new Date(year, 0, 1)) };
    case "last-year":
      return {
        label: `last year (${year - 1})`,
        since: iso(new Date(year - 1, 0, 1)),
        until: iso(new Date(year, 0, 1)),
      };
    case "current-month":
      return { label: "this month", since: iso(new Date(year, month, 1)) };
    case "last-month":
      return {
        label: "last month",
        since: iso(new Date(year, month - 1, 1)),
        until: iso(new Date(year, month, 1)),
      };
    case "current-week":
      return { label: "this week", since: iso(week) };
    case "last-week":
      return {
        label: "last week",
        since: iso(
          new Date(week.getFullYear(), week.getMonth(), week.getDate() - 7),
        ),
        until: iso(week),
      };
  }
}

// Reads `git log --numstat` in the format used by stat. Each record starts with \x1e, then a
// header of hash, author, ISO date and subject separated by \x1f, then one line per file.
export function parseLog(output: string): Commit[] {
  return output
    .split("\x1e")
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const [header = "", ...lines] = record.trim().split("\n");
      const [hash = "", author = "", date = "", subject = ""] =
        header.split("\x1f");
      let added = 0;
      let deleted = 0;
      const files: string[] = [];
      for (const line of lines) {
        const [adds = "", dels = "", file = ""] = line.split("\t");
        if (file === "") continue;
        // Binary files show "-" instead of counts.
        added += Number(adds) || 0;
        deleted += Number(dels) || 0;
        files.push(file);
      }
      return {
        hash,
        author,
        date: new Date(date),
        subject,
        added,
        deleted,
        files,
      };
    });
}

// The longest run of consecutive calendar days with at least one commit.
export function longestStreak(dates: Date[]): number {
  const days = [...new Set(dates.map(dayKey))].sort();
  let best = 0;
  let run = 0;
  let previous = -Infinity;
  for (const key of days) {
    const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
    const ms = Date.UTC(y, m - 1, d) / 86400000;
    run = ms - previous === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = ms;
  }
  return best;
}

// Turns commits into the rows of the table. Pure, so it can be tested without git.
export function summarize(commits: Commit[]): Row[] {
  if (commits.length === 0) return [];
  const rows: Row[] = [];
  const add = (stat: string, value: string, detail = "") =>
    rows.push({ stat, value, detail });

  const authors = count(commits.map((c) => c.author));
  const topAuthor = top(authors);
  const oldest = commits.reduce((a, b) => (a.date <= b.date ? a : b));
  const newest = commits.reduce((a, b) => (a.date >= b.date ? a : b));
  const added = commits.reduce((sum, c) => sum + c.added, 0);
  const deleted = commits.reduce((sum, c) => sum + c.deleted, 0);

  add(
    "Commits",
    String(commits.length),
    `${dayKey(oldest.date)} to ${dayKey(newest.date)}`,
  );
  add("Authors", String(authors.size));
  if (topAuthor) add("Top author", topAuthor[0], `${topAuthor[1]} commits`);

  const biggest = commits.reduce((a, b) =>
    b.added + b.deleted > a.added + a.deleted ? b : a,
  );
  add(
    "Biggest commit",
    `+${biggest.added} -${biggest.deleted}`,
    `${biggest.hash.slice(0, 7)} ${biggest.subject} (${biggest.author})`,
  );
  add(
    "Average size",
    `${Math.round((added + deleted) / commits.length)} lines`,
    `per commit; +${added} -${deleted} in total`,
  );

  const files = count(commits.flatMap((c) => c.files));
  const topFile = top(files);
  add(
    "Files touched",
    String(files.size),
    topFile ? `most changed: ${topFile[0]} (${topFile[1]} commits)` : "",
  );

  const busiestDay = top(count(commits.map((c) => dayKey(c.date))));
  if (busiestDay) add("Busiest day", busiestDay[0], `${busiestDay[1]} commits`);
  const weekday = top(count(commits.map((c) => DAYS[c.date.getDay()] ?? "")));
  if (weekday) add("Busiest weekday", weekday[0], `${weekday[1]} commits`);
  const hour = top(
    count(commits.map((c) => String(c.date.getHours()).padStart(2, "0"))),
  );
  if (hour) add("Peak hour", `${hour[0]}:00`, `${hour[1]} commits`);

  const streak = longestStreak(commits.map((c) => c.date));
  add(
    "Longest streak",
    `${streak} ${streak === 1 ? "day" : "days"}`,
    "in a row with a commit",
  );
  const nightOwl = commits.filter(
    (c) => c.date.getHours() >= 22 || c.date.getHours() < 5,
  ).length;
  const weekend = commits.filter(
    (c) => c.date.getDay() === 0 || c.date.getDay() === 6,
  ).length;
  add("Night owl", `${nightOwl} commits`, "between 22:00 and 05:00");
  add("Weekend", `${weekend} commits`, "on Saturday or Sunday");

  const types = count(
    commits
      .map(
        (c) =>
          /^(\w+)(\([^)]*\))?!?:/.exec(c.subject)?.[1]?.toLowerCase() ?? "",
      )
      .filter(Boolean),
  );
  if (types.size > 0) {
    const list = [...types.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([type, n]) => `${type} ${n}`)
      .join(", ");
    add("Commit types", list, "from conventional prefixes");
  }
  return rows;
}

// Draws rows as a box table with a Stat, Value and Detail column.
export function table(rows: Row[]): string {
  const headers = ["Stat", "Value", "Detail"];
  const cells = rows.map((row) => [row.stat, row.value, row.detail]);
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...cells.map((cell) => cell[i]?.length ?? 0)),
  );
  const line = (values: string[]) =>
    `│ ${values.map((value, i) => value.padEnd(widths[i] ?? 0)).join(" │ ")} │`;
  const rule = (left: string, middle: string, right: string) =>
    `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`;
  return [
    rule("┌", "┬", "┐"),
    line(headers),
    rule("├", "┼", "┤"),
    ...cells.map(line),
    rule("└", "┴", "┘"),
  ].join("\n");
}

// gith stat [--current-year | --current-month | --current-week | --last-year | --last-month |
// --last-week | --overall] [-limit <n>]: fun facts about the current branch's history.
export function stat(flags: Flags): void {
  assertAllowedFlags(flags, [...PERIODS, "limit"], "stat");
  const period: Period = onlyOne(flags, PERIODS) ?? "overall";
  const limit = parseLimit(flags);
  const range = periodRange(period, new Date());
  const args = [
    "log",
    "--numstat",
    "--date=iso-strict",
    "--format=%x1e%H%x1f%an%x1f%aI%x1f%s",
  ];
  if (range.since) args.push(`--since=${range.since}`);
  if (range.until) args.push(`--until=${range.until}`);
  if (limit !== undefined) args.push(`-n${limit}`);
  const commits = parseLog(captureArgs(args));
  if (commits.length === 0) {
    console.log(
      `No commits ${range.label === "overall" ? "yet" : `in ${range.label}`}.`,
    );
    return;
  }
  console.log(
    `gith stat, ${range.label}${limit === undefined ? "" : `, last ${limit} commits`}`,
  );
  console.log(table(summarize(commits)));
}
