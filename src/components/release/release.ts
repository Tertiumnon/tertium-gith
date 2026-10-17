import { assertCleanTree, assertSynced, capture, git } from "../git/git";
import { KINDS } from "./release.constants";
import type { ReleaseKind } from "./release.types";
import { npmVersion } from "./release.utils";

// Publishes a version. Patch goes from main (hotfix-style), minor and major from develop.
export function release(kind: string | undefined): void {
  if (!kind || !KINDS.includes(kind))
    throw new Error("usage: gith release <patch|minor|major>");
  assertCleanTree();
  if (kind === "patch") {
    releasePatch();
  } else {
    releaseFromDevelop(kind as ReleaseKind);
  }
}

function releasePatch(): void {
  console.log("\n📋 Starting patch release from main...\n");
  git("checkout main");
  git("pull");
  npmVersion("patch");
  // Only the tags on the commits being pushed - `--tags` would push every local tag.
  git("push --follow-tags");
  git("checkout develop");
  git("pull");
  // develop gets main's version bump. The rebase rewrites any develop-only commits, so the
  // push needs --force-with-lease: it refuses if origin/develop moved since our last fetch.
  git("rebase main");
  git("push --force-with-lease");
  git("checkout main");
  assertSynced(["main", "develop"]);
  console.log("\n✅ Patch release complete!\n");
}

function releaseFromDevelop(kind: ReleaseKind): void {
  console.log(`\n📋 Starting ${kind} release from develop...\n`);
  const current = capture("rev-parse --abbrev-ref HEAD");
  if (current !== "develop")
    throw new Error(`must be on 'develop', currently on '${current}'.`);
  git("pull");
  npmVersion(kind);
  git("push --follow-tags");
  git("checkout main");
  git("pull");
  git("merge develop --no-edit");
  git("push");
  git("checkout develop");
  git("pull origin main");
  assertSynced(["main", "develop"]);
  console.log(`\n✅ ${kind} release complete!\n`);
}
