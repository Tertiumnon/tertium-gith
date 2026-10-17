#!/usr/bin/env bun
import { exit } from "node:process";
import { onlyOne, parseFlags } from "./args";
import { create, merge } from "./commands";
import { setup } from "./hooks";
import { list } from "./list";
import { clean, remove, reset, switchBranch, sync } from "./maintenance";
import { release } from "./release";

const USAGE = `gith - git helper: branch flow and everyday git commands

Usage:
  gith create -b <branch>      work branch from develop, named by its goal (no switch)
  gith create -r <version>     release/<version> from develop
  gith create --release        release, version = minor after the latest tag (local or origin)
  gith create -h <version>     hotfix/<version> from main
  gith create --hotfix         hotfix, version = patch after the latest tag (local or origin)
  gith merge                   merge this branch into develop
  gith merge -r <version>      merge this branch into release/<version>
  gith merge -h <version>      merge this branch into hotfix/<version>
  gith release --patch         bump the patch version, publish through main
  gith release --minor         bump the minor version, from develop into main
  gith release --major         bump the major version, from develop into main
  gith switch -b <branch>    switch to a branch, creating it from develop if missing
  gith remove -b <branch>    delete a merged local branch (git branch -d)
  gith remove -b             list local branches and pick which to delete
  gith remove -b [<branch>] --remote   also delete on origin; no name lists origin branches
  gith remove -b [<branch>] --both     delete locally, then on origin; no name lists pairs
  gith rm                    alias of remove
  gith list --tags           list tags with a local and origin column
  gith list --commits [-l <n>]  newest commits on this branch (default 5)
  gith sync                  fetch all remotes, tags, and prune stale refs
  gith clean                 remove untracked files and directories (keeps ignored)
  gith reset                 discard uncommitted changes and untracked files (hard reset + clean)
  gith setup --hooks [--force]  write .githooks/pre-commit and set core.hooksPath
  gith help                  show this help

Dashes decide how a flag takes its value:
  -r <v>, -release <v>, -h <v>, -hotfix <v>   explicit version
  --release, --hotfix                         auto version from the latest tag
  -b <name>, -branch <name>, --branch <name>  branch name
  --patch | -patch, --minor | -minor, --major | -major
  --hooks, --force, --remote, --both                  switches; one dash works too (-hooks)`;

const [command, ...rest] = process.argv.slice(2);

try {
  switch (command) {
    case "create":
      create(parseFlags(rest));
      break;
    case "merge":
      merge(parseFlags(rest));
      break;
    case "switch":
      switchBranch(parseFlags(rest));
      break;
    case "remove":
    case "rm":
      await remove(parseFlags(rest));
      break;
    case "sync":
      sync(parseFlags(rest));
      break;
    case "clean":
      clean(parseFlags(rest));
      break;
    case "list":
      list(parseFlags(rest));
      break;
    case "reset":
      reset(parseFlags(rest));
      break;
    case "setup":
      setup(parseFlags(rest));
      break;
    case "release": {
      const flags = parseFlags(rest);
      const kind = onlyOne(flags, ["patch", "minor", "major"]);
      if (!kind)
        throw new Error("usage: gith release --patch | --minor | --major");
      release(kind);
      break;
    }
    case undefined:
    case "help":
    case "--help":
      console.log(USAGE);
      break;
    default:
      console.error(`Unknown command '${command}'.\n\n${USAGE}`);
      exit(1);
  }
} catch (error) {
  console.error(`❌ ${error instanceof Error ? error.message : error}`);
  exit(1);
}
