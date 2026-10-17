import type { Flags } from "../args/args.types";
import { assertBranchName, capture, captureArgs } from "../git/git";
import type { Sides } from "./maintenance.types";

export function noFlags(flags: Flags, command: string): void {
  if (flags.size > 0) throw new Error(`usage: gith ${command}`);
}

export function requireBranch(flags: Flags, command: string): string {
  const branch = flags.get("branch");
  if (!branch) throw new Error(`usage: gith ${command} -b <branch>`);
  assertBranchName(branch);
  return branch;
}

export function localBranches(): string[] {
  return captureArgs([
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
  ])
    .split("\n")
    .filter(Boolean);
}

export function remoteBranches(): string[] {
  return captureArgs(["ls-remote", "--heads", "origin"])
    .split("\n")
    .filter(Boolean)
    .map((line) => (line.split("\t")[1] ?? "").replace(/^refs\/heads\//, ""));
}

export function sidesLabel(sides: Sides): string {
  if (sides.local !== undefined && sides.origin !== undefined)
    return "local + origin";
  return sides.local !== undefined ? "local" : "origin";
}

export function day(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

export function currentBranch(): string {
  return capture("rev-parse --abbrev-ref HEAD");
}

// A positive whole number from a value flag, or undefined when it is not given.
export function parsePositive(flags: Flags, name: string): number | undefined {
  const raw = flags.get(name);
  if (raw === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(raw))
    throw new Error(`-${name} needs a positive whole number.`);
  return Number(raw);
}
