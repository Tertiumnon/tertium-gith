#!/usr/bin/env bun
import { exit } from "node:process";
import { onlyOne, parseFlags } from "./args";
import { create, merge } from "./commands";
import { doctor } from "./doctor";
import { isDryRun, setDryRun, setVerbose } from "./git";
import { amend, undo, update } from "./history";
import { list } from "./list";
import { clean, remove, reset, switchBranch, sync } from "./maintenance";
import { open } from "./open";
import { release } from "./release";
import { stash, unstash } from "./stash";
import { status } from "./status";
import { tree } from "./tree";

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
  gith remove -b [-l <n>]    list local branches and pick which to delete
  gith remove -b [<branch>] --remote   also delete on origin; no name lists origin branches
  gith remove -b [<branch>] --both     delete locally, then on origin; no name lists pairs
  gith rm                    alias of remove
  gith remove --obsolete [-l <n>]  pick local branches whose origin copy was deleted
  gith list --tags [-l <n>]  tags with a local and origin column (newest 5 by default)
  gith list --commits [--graph] [-l <n>]  newest commits on this branch (default 5)
  -limit <n> (-l, --limit) caps any listing: list, and the remove picker (default: all)
  gith status                show branch vs origin, and staged, unstaged and untracked counts
  gith update                merge origin/develop into this work branch
  gith undo                  undo the last commit, keep its changes staged (not if pushed)
  gith amend                 add staged changes to the last commit, keep its message (not if pushed)
  gith stash [-m <msg>]      stash changes, including untracked files
  gith unstash               bring back the latest stash
  gith open                  open this repository's origin in the browser
  gith doctor                check the repo is ready for the branch flow (exit 1 on failures)
  gith tree [-l <n>]         working trees of this repo: path, branch, HEAD (current marked *)
  gith sync                  fetch all remotes, tags, and prune stale refs
  gith clean                 remove untracked files and directories (keeps ignored)
  gith reset                 discard uncommitted changes and untracked files (hard reset + clean)
  gith help                  show this help
  --verbose (any command)    also print read-only git calls, such as rev-parse and ls-remote
  --dry-run (any command)    print the git commands that would run, without running them

Dashes decide how a flag takes its value:
  -r <v>, -release <v>, -h <v>, -hotfix <v>   explicit version
  --release, --hotfix                         auto version from the latest tag
  -b <name>, -branch <name>, --branch <name>  branch name
  --patch | -patch, --minor | -minor, --major | -major
  --remote, --both, --obsolete, --graph               switches; one dash works too (-remote)`;

// --verbose and --dry-run are global: they are removed here, so no command has to parse them.
const args = process.argv.slice(2).filter((arg) => {
  if (arg === "--verbose" || arg === "-verbose") setVerbose(true);
  else if (arg === "--dry-run" || arg === "-dry-run") setDryRun(true);
  else return true;
  return false;
});
const [command, ...rest] = args;
if (isDryRun()) console.log("dry run: nothing below is changed.");

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
    case "status":
      status(parseFlags(rest));
      break;
    case "update":
      update(parseFlags(rest));
      break;
    case "undo":
      undo(parseFlags(rest));
      break;
    case "amend":
      amend(parseFlags(rest));
      break;
    case "stash":
      stash(parseFlags(rest));
      break;
    case "unstash":
      unstash(parseFlags(rest));
      break;
    case "open":
      open(parseFlags(rest));
      break;
    case "doctor":
      if (!doctor(parseFlags(rest))) exit(1);
      break;
    case "tree":
      tree(parseFlags(rest));
      break;
    case "reset":
      reset(parseFlags(rest));
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
