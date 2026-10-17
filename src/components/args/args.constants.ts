import type { Kind } from "./args.types";

export const SPECS = new Map<string, Kind>([
  ["branch", "auto"],
  ["release", "auto"],
  ["hotfix", "auto"],
  ["limit", "value"],
  ["message", "value"],
  ["name", "value"],
  ["commit", "value"],
  ["file", "value"],
  ["change", "value"],
  ["regex", "switch"],
  ["days", "value"],
  ["patch", "switch"],
  ["minor", "switch"],
  ["major", "switch"],
  ["remote", "switch"],
  ["local", "switch"],
  ["tags", "switch"],
  ["commits", "switch"],
  ["obsolete", "switch"],
  ["graph", "switch"],
  ["stashes", "switch"],
  ["current-release", "switch"],
  ["current-hotfix", "switch"],
  ["pockets", "switch"],
  ["detached", "switch"],
  ["overall", "switch"],
  ["current-year", "switch"],
  ["current-month", "switch"],
  ["current-week", "switch"],
  ["last-year", "switch"],
  ["last-month", "switch"],
  ["last-week", "switch"],
]);

// Short forms, so `-b` and `-branch` mean the same flag.
export const ALIASES = new Map<string, string>([
  ["b", "branch"],
  ["r", "release"],
  ["h", "hotfix"],
  ["l", "limit"],
  ["m", "message"],
  ["n", "name"],
]);

// How a flag is written in a message: value flags take one dash, switches and auto flags two.
export const SHORT: Record<string, string> = {
  branch: "-b",
  release: "-r",
  hotfix: "-h",
};
