import { CHANGELOG_TITLE, SEMVER_ONLY_PATTERN } from "./changelog.constants";
import type { ReleaseNotes } from "./changelog.types";

// `rawLog` is `git log --pretty=format:%s`: one subject per line. Drops blank lines and a stray
// bare version-number commit that is not a real change.
export function filterCommitSubjects(rawLog: string): string[] {
  if (!rawLog.trim()) return [];
  return rawLog
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !SEMVER_ONLY_PATTERN.test(line));
}

export function buildEntry(notes: ReleaseNotes): string {
  const bullets =
    notes.subjects.length > 0
      ? notes.subjects.map((subject) => `- ${subject}`).join("\n")
      : "- (no changes recorded)";
  return `## ${notes.version} - ${notes.date}\n\n${bullets}\n`;
}

// Prepends the entry right after the title, so entries read newest first. `existing` is null on
// the first run, when the file does not exist yet, and the title is created too.
export function mergeChangelogContent(
  existing: string | null,
  entry: string,
): string {
  const heading = `${CHANGELOG_TITLE}\n`;
  if (existing === null) return `${heading}\n${entry}\n`;
  const body = existing.startsWith(heading)
    ? existing.slice(heading.length).replace(/^\n+/, "")
    : existing;
  return `${heading}\n${entry}\n${body}`;
}

export function parsePackageVersion(rawPackageJson: string): string {
  const pkg = JSON.parse(rawPackageJson) as { version?: string };
  if (!pkg.version) throw new Error('No "version" field found in package.json');
  return pkg.version;
}

export function todayIso(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
