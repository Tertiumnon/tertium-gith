import { captureArgs, hasOnOrigin } from "../git/git";
import type { Check } from "./doctor.types";
import { check } from "./doctor.utils";

export const CHECKS: Check[] = [
  check("git is installed", () => {
    captureArgs(["--version"]);
    return undefined;
  }),
  check("inside a git repository", () => {
    captureArgs(["rev-parse", "--is-inside-work-tree"]);
    return undefined;
  }),
  check("origin is configured", () => {
    captureArgs(["remote", "get-url", "origin"]);
    return undefined;
  }),
  check("origin is reachable", () => {
    captureArgs(["ls-remote", "--heads", "origin"]);
    return undefined;
  }),
  check("main exists on origin", () =>
    hasOnOrigin("main") ? undefined : "missing",
  ),
  check("develop exists on origin", () =>
    hasOnOrigin("develop")
      ? undefined
      : "missing: create it before work branches",
  ),
  check(
    "working tree is clean",
    () =>
      captureArgs(["status", "--porcelain"]) === ""
        ? undefined
        : "uncommitted changes",
    "warn",
  ),
];
