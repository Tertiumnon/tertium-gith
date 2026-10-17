import { execSync } from "node:child_process";

export function git(args: string): void {
  console.log(`> git ${args}`);
  execSync(`git ${args}`, { stdio: "inherit" });
}

export function capture(args: string): string {
  return execSync(`git ${args}`, { encoding: "utf-8" }).trim();
}

export function hasOnOrigin(branch: string): boolean {
  return capture(`ls-remote --heads origin ${branch}`) !== "";
}

// Tags from local and origin. Remote lines look like `<sha>\trefs/tags/v1.2.3^{}`.
export function listTags(): string[] {
  const local = capture("tag --list").split("\n");
  const remote = capture("ls-remote --tags origin")
    .split("\n")
    .map((line) => line.split("\t")[1] ?? "")
    .map((ref) => ref.replace(/^refs\/tags\//, "").replace(/\^\{\}$/, ""));
  return [...local, ...remote].filter(Boolean);
}

export function assertClean(): void {
  if (capture("status --porcelain")) {
    throw new Error("uncommitted changes; commit or stash them first.");
  }
}

// Fetches origin and fails if any branch differs from its origin copy.
export function assertSynced(branches: string[]): void {
  git("fetch origin");
  for (const branch of branches) {
    if (
      capture(`rev-parse ${branch}`) !== capture(`rev-parse origin/${branch}`)
    ) {
      throw new Error(`'${branch}' is not in sync with origin/${branch}.`);
    }
  }
}
