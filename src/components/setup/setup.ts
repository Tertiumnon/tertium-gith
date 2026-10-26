import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { Flags } from "../args/args.types";
import { gitArgs, isDryRun } from "../git/git";
import { HOOK_FILE, HOOKS_DIR, HOOKS_PATH_COMMAND } from "./setup.constants";
import type { PackageJson } from "./setup.types";
import {
  buildPreCommitHook,
  detectPackageManager,
  isTypeScriptProject,
  withPrepareScript,
} from "./setup.utils";

const SETUP_USAGE = "usage: gith setup -n npm [--force]";

// gith setup -n npm [--force]: writes a shared pre-commit hook for an npm project and points
// core.hooksPath at it, so every clone runs the same checks. Adds a "prepare" script so that
// installing the project turns the hook on again.
export function setup(flags: Flags): void {
  const unknown = [...flags.keys()].filter(
    (key) => key !== "name" && key !== "force",
  );
  if (unknown.length > 0 || flags.get("name") === undefined) {
    throw new Error(SETUP_USAGE);
  }
  const target = flags.get("name");
  if (target !== "npm") {
    throw new Error(
      `unknown setup '${target}': only npm is supported. ${SETUP_USAGE}`,
    );
  }
  setupNpmHook({ force: flags.has("force") });
}

function setupNpmHook({ force }: { force: boolean }): void {
  const root = process.cwd();
  if (!existsSync(path.join(root, ".git"))) {
    throw new Error(
      "not a git repository root: run it in the folder that holds .git",
    );
  }
  const packagePath = path.join(root, "package.json");
  if (!existsSync(packagePath))
    throw new Error("no package.json in this folder");

  const hookPath = path.join(root, HOOK_FILE);
  if (existsSync(hookPath) && !force) {
    throw new Error(
      `${HOOK_FILE} already exists. Pass --force to overwrite it.`,
    );
  }

  const pkg: PackageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const manager = detectPackageManager(root);
  const typescript = isTypeScriptProject(root, pkg);
  const hook = buildPreCommitHook(pkg, manager, typescript);

  if (isDryRun()) {
    console.log(
      `dry run: would write ${HOOK_FILE} (package manager: ${manager})`,
    );
    return;
  }

  mkdirSync(path.join(root, HOOKS_DIR), { recursive: true });
  writeFileSync(hookPath, hook);
  try {
    chmodSync(hookPath, 0o755);
  } catch {
    // Windows has no POSIX mode bits; Git for Windows still runs the hook through its shebang.
  }
  gitArgs(["config", "core.hooksPath", HOOKS_DIR]);

  if (pkg.scripts?.prepare !== HOOKS_PATH_COMMAND) {
    writeFileSync(
      packagePath,
      `${JSON.stringify(withPrepareScript(pkg), null, 2)}\n`,
    );
    console.log(`✏️  Added "prepare" → "${HOOKS_PATH_COMMAND}" to package.json`);
  }
  console.log(
    `✅ Wrote ${HOOK_FILE} and set core.hooksPath (package manager: ${manager}${typescript ? ", TypeScript" : ""})`,
  );
}
