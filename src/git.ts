import { execFileSync } from "node:child_process";

// Set by --verbose: also print the read-only git calls, which are silent otherwise.
let verbose = false;

export function setVerbose(on: boolean): void {
  verbose = on;
}

// Shows a git command the way it would be typed, quoting arguments that contain spaces.
function show(args: string[]): string {
  const shown = args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg));
  return `> git ${shown.join(" ")}`;
}

// Runs git and returns its trimmed output. Silent unless --verbose.
function run(args: string[]): string {
  if (verbose) console.log(show(args));
  return execFileSync("git", args, { encoding: "utf-8" }).trim();
}

// Action commands are always printed, so the user sees what changed.
function act(args: string[], options: { cwd?: string } = {}): void {
  console.log(show(args));
  execFileSync("git", args, { stdio: "inherit", ...options });
}

// A command line such as "fetch origin" with spaces between arguments. Branch names cannot
// contain spaces, so splitting is safe, and nothing goes through the shell.
export function git(args: string): void {
  act(args.split(" "));
}

// Runs git with an argument list, so branch names are never parsed by the shell.
export function gitArgs(args: string[], options: { cwd?: string } = {}): void {
  act(args, options);
}

// Like capture, with an argument list.
export function captureArgs(args: string[]): string {
  return run(args);
}

// True when the branch exists in this repository.
export function hasLocal(branch: string): boolean {
  return captureArgs(["branch", "--list", branch]) !== "";
}

// Throws unless `name` is a valid branch name for git.
export function assertBranchName(name: string): void {
  try {
    captureArgs(["check-ref-format", "--branch", name]);
  } catch {
    throw new Error(`'${name}' is not a valid branch name.`);
  }
}

// Runs a command line such as "ls-remote --heads origin" and returns its trimmed output.
export function capture(args: string): string {
  return run(args.split(" "));
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
