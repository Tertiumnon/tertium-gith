import { execSync } from "node:child_process";
import { isDryRun } from "../git/git";
import type { ReleaseKind } from "./release.types";

export function npmVersion(kind: ReleaseKind): void {
  console.log(`> npm version ${kind}`);
  if (isDryRun()) return;
  execSync(`npm version ${kind}`, { stdio: "inherit" });
}
