import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Flags } from "../args/args.types";
import { captureArgs, gitArgs, isDryRun } from "../git/git";
import { CHANGELOG_FILE_NAME } from "./changelog.constants";
import {
  buildEntry,
  filterCommitSubjects,
  mergeChangelogContent,
  parsePackageVersion,
  todayIso,
} from "./changelog.utils";

// The latest tag reachable from HEAD, or null before the first release.
function previousTag(): string | null {
  try {
    return captureArgs(["describe", "--tags", "--abbrev=0"]);
  } catch {
    return null;
  }
}

function commitSubjectsSince(tag: string | null): string[] {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  return filterCommitSubjects(
    captureArgs(["log", range, "--no-merges", "--pretty=format:%s"]),
  );
}

// gith changelog [--dry-run]: prepends an entry for the version in package.json to CHANGELOG.md,
// built from the commits since the last tag. Run it from the npm version script, so the file is
// staged together with the version bump:
//   "version": "gith changelog"
export function changelog(flags: Flags): void {
  const noCommit = flags.has("no-commit");
  if (flags.size > (noCommit ? 1 : 0))
    throw new Error("usage: gith changelog [--dry-run] [--no-commit]");
  const root = process.cwd();
  const version = parsePackageVersion(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const entry = buildEntry({
    version,
    date: todayIso(),
    subjects: commitSubjectsSince(previousTag()),
  });
  if (isDryRun()) {
    console.log(entry);
    console.log(`dry run: would update ${CHANGELOG_FILE_NAME}`);
    return;
  }
  const file = path.join(root, CHANGELOG_FILE_NAME);
  const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
  writeFileSync(file, mergeChangelogContent(existing, entry));
  console.log(`✅ ${CHANGELOG_FILE_NAME} updated for ${version}`);
  if (noCommit) return;
  // A commit of its own, with only CHANGELOG.md in it, so the version bump stays separate.
  gitArgs(["add", "--", CHANGELOG_FILE_NAME]);
  gitArgs([
    "commit",
    "-m",
    `docs(changelog): ${version}`,
    "--",
    CHANGELOG_FILE_NAME,
  ]);
}
