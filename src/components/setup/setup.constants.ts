import type { PackageManager } from "./setup.types";

export const HOOKS_DIR = ".githooks";
export const HOOK_FILE = `${HOOKS_DIR}/pre-commit`;
export const HOOKS_PATH_COMMAND = `git config core.hooksPath ${HOOKS_DIR}`;

// Lockfile name and the package manager it belongs to. The first match wins.
export const LOCKFILES: Array<[string, PackageManager]> = [
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

export const RUN_PREFIX: Record<PackageManager, string> = {
  bun: "bun run",
  pnpm: "pnpm run",
  yarn: "yarn",
  npm: "npm run",
};
