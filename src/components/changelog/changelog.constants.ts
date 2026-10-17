export const CHANGELOG_FILE_NAME = "CHANGELOG.md";
export const CHANGELOG_TITLE = "# Changelog";

// Guards against a stray version-bump commit (e.g. "2.9.0", from a previous `npm version` run)
// slipping into the generated entry as if it were a change.
export const SEMVER_ONLY_PATTERN = /^\d+\.\d+\.\d+$/;
