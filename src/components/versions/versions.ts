import { SEMVER } from "./versions.constants";
import type { Bump, Semver } from "./versions.types";

// Accepts `1.2.3` and `v1.2.3`; anything else (e.g. `latest`, `release/1.0`) is not a version.
export function parseSemver(tag: string): Semver | undefined {
  const match = SEMVER.exec(tag.trim());
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// Negative when a is older than b, positive when newer, 0 when equal.
export function compare(a: Semver, b: Semver): number {
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Highest version among the tags, or undefined when there are none.
export function latestVersion(tags: string[]): Semver | undefined {
  let latest: Semver | undefined;
  for (const tag of tags) {
    const version = parseSemver(tag);
    if (version && (!latest || compare(version, latest) > 0)) latest = version;
  }
  return latest;
}

// Minor bumps the minor and resets the patch; patch bumps the patch.
// With no tags yet, counting starts from 0.0.0.
export function nextVersion(tags: string[], bump: Bump): string {
  const [major, minor, patch] = latestVersion(tags) ?? [0, 0, 0];
  return bump === "minor"
    ? `${major}.${minor + 1}.0`
    : `${major}.${minor}.${patch + 1}`;
}
