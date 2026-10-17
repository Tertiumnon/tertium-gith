import type { Flags } from "../args/args.types";
import { CHECKS } from "./doctor.constants";

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
