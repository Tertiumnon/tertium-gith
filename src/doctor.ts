import type { Flags } from "./args";
import { captureArgs, hasOnOrigin } from "./git";

interface Check {
  name: string;
  run: () => { level: "ok" | "warn" | "fail"; detail: string };
}

function check(
  name: string,
  test: () => string | undefined,
  failure: "fail" | "warn" = "fail",
): Check {
  return {
    name,
    run: () => {
      try {
        const problem = test();
        return problem === undefined
          ? { level: "ok", detail: "" }
          : { level: failure, detail: problem };
      } catch (error) {
        return {
          level: failure,
          detail:
            error instanceof Error
              ? (error.message.split("\n")[0] ?? "")
              : String(error),
        };
      }
    },
  };
}

const CHECKS: Check[] = [
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

// gith doctor: checks that the repository is ready for the branch flow. Returns false when a check fails.
export function doctor(flags: Flags): boolean {
  if (flags.size > 0) throw new Error("usage: gith doctor");
  let ok = true;
  for (const item of CHECKS) {
    const { level, detail } = item.run();
    if (level === "fail") ok = false;
    const mark = level === "ok" ? "✔" : level === "warn" ? "!" : "✖";
    console.log(`${mark} ${item.name}${detail ? `: ${detail}` : ""}`);
  }
  console.log(ok ? "ready" : "not ready: fix the ✖ items above");
  return ok;
}
