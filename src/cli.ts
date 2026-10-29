import { exit } from "node:process";
import { onlyOne, parseFlags } from "./components/args/args";
import { assertAllowedFlags } from "./components/args/args.utils";
import { changelog } from "./components/changelog/changelog";
import { doctor } from "./components/doctor/doctor";
import { find } from "./components/find/find";
import { create, finish, merge } from "./components/flow/flow";
import { isDryRun, setDryRun, setVerbose } from "./components/git/git";
import { save, squash, undo, update } from "./components/history/history";
import { list } from "./components/list/list";
import {
  clean,
  remove,
  reset,
  switchBranch,
  sync,
  syncBranch,
} from "./components/maintenance/maintenance";
import { open } from "./components/open/open";
import { setAssumeYes } from "./components/prompt/prompt";
import { release } from "./components/release/release";
import { pull, push } from "./components/remote/remote";
import { setup } from "./components/setup/setup";
import { stash, unstash } from "./components/stash/stash";
import { stat } from "./components/stat/stat";
import { status } from "./components/status/status";
import { tree } from "./components/tree/tree";
import { versionText } from "./components/version/version";

const USAGE = `gith - git helper: branch flow and everyday git commands

Start and finish work
  gith create -b <branch>            work branch develop--<branch> from develop (no switch)
  gith create -r <version>           release/<version> from develop
  gith create -h <version>           hotfix/<version> from main
  gith create --release | --hotfix   next version from the latest tag
  gith switch                        list local and origin branches, and switch to the one picked
  gith switch -b <branch>            switch to a branch, creating develop--<branch> from develop if missing (on a detached HEAD: <branch> from that commit)
  gith switch -commit <sha>          detach HEAD at a commit, to look at it (tracked files must be clean)
  gith switch --release | --hotfix   switch to the newest release/* or hotfix/* (local or origin); -r <v> | -h <v> for one version
  gith update                        merge origin/develop into this work branch
  gith finish --current-release | --current-hotfix  release the newest release/* or hotfix/*: version, changelog, merge to main, tag, back to develop
  gith merge --develop               merge this branch into develop
  gith merge --main                  merge this branch into main
  gith merge                         pick the branch to merge, then the target (main, develop, release/*, hotfix/*)
  gith merge --release | --hotfix    merge into the only matching container, or pick one
  gith merge -r <v> | -h <v>         merge into release/<v> or hotfix/<v>
  gith merge --current-release       merge this branch into the newest release (local or origin)
  gith merge --current-hotfix        merge this branch into the newest hotfix (local or origin)
  gith release --patch | --minor | --major   sync release branches; add --update-version --npm to bump npm version

Fix history
  gith undo                          undo the last commit, keep its changes staged (not if pushed)
  gith save -m <msg> [--all] ["--&push"]  new commit without prompts; push only with "--&push"
  gith squash -limit <n> [-m <msg>]  combine the last n commits into one (keeps the oldest message)

Save and reset work
  gith stash [-n <name>]             stash changes, including untracked files
  gith unstash                       bring back the latest stash
  gith reset                         discard uncommitted changes and untracked files
  gith clean                         remove untracked files and directories (keeps ignored)

Clean up branches (every removal shows what it will remove first)
  gith remove -b <branch>            delete the branch here and on origin (either side may be missing)
  gith remove -b <branch> --local    delete only the local branch
  gith remove -b <branch> --remote   delete only the origin branch
  gith remove                        pick branches to delete from a list (here and on origin)
  gith remove --branch [-l <n>]      same list, for branch pairs (here and on origin)
  gith remove --branch --local       pick from local branches
  gith remove --branch --remote      pick from origin branches
  gith remove --obsolete [--local] [-days <n>]   remove branches untouched for 90 days, after Y/n
  gith remove --detached [-l <n>]    pick local branches that have no origin copy
  gith remove --detached --all       remove all of them, after listing them and a Y/n question
  gith rm                            alias of remove

Look at the repo
  gith status                        working-tree summary, all local and remote-tracking branches
  gith list --commits [--graph] [-l <n>]   newest commits on this branch; --graph adds colored lanes, refs, author/date (default 5)
  gith list --tags [-l <n>]          tags with a local and origin column (newest 5 by default)
  gith list --stashes [-l <n>]       stashes, newest first (default 5); --pockets shows them with Gorlum
  gith show ...                      same as gith list
  gith tree [-l <n>]                 working trees: path, branch, HEAD (current marked *)
  gith find|search [-commit <text>] [-file <pattern>] [-change <text>] [--regex] [-limit <n>]
                                     newest commits on this branch matching every filter (default 5)
  gith stat [--overall | --current-year | --current-month | --current-week | --last-year | --last-month | --last-week] [-limit <n>]
                                     fun facts about this branch: biggest commit, busiest day, streaks

Remote and health
  gith push [--all-branches]         push to origin, set tracking, report ahead/behind; never force
  gith pull [--all-branches]         fast-forward from origin; refuse diverged histories
  gith sync                          fetch all remotes and tags, prune stale refs, then sync this branch with origin both ways
  gith sync --develop | --main       the same for develop or main
  gith sync develop:develop          two-way sync of one branch with origin: fetch it when behind, push it when ahead, stop when diverged
  gith open                          open origin in the browser
  gith doctor                        check the repo is ready for the branch flow (exit 1 on failures)
  gith changelog [--dry-run]         add an entry for package.json's version to CHANGELOG.md (commits since the last tag)
  gith setup -n npm [--force]        write a shared pre-commit hook (lint, typecheck, test) for an npm project; --force overwrites it

Help
  gith help                          show this help
  gith --version                     show the version with the mascot
  --verbose                          (any command) also print read-only git calls
  --dry-run                          (any command) print the git commands that would run, without running them
  --yes                              (any command) answer yes to every question (for scripts)

Flags: every single-dash flag requires a value; double-dash flags never take one.
  -b -r -h -l -m -n -limit -message -name -branch -release -hotfix -commit -file -change -days   take values
  --patch --minor --major --local --remote --obsolete --detached --tags --commits --graph --stashes --pockets --branch --regex
  --develop --main --current-release --current-hotfix --all --&push --all-branches --no-commit --force
  --update-version --npm             release: opt in to an npm version bump (both required)
  --overall --current-year --current-month --current-week --last-year --last-month --last-week   switches
  --branch lists removable branches; --release / --hotfix choose a version or branch by command context
  -limit caps listings and stat (or -l); -days sets the age for remove --obsolete`;

// --verbose and --dry-run are global: they are removed here, so no command has to parse them.
const args = process.argv.slice(2).filter((arg) => {
  if (arg === "--verbose") setVerbose(true);
  else if (arg === "--dry-run") setDryRun(true);
  else if (arg === "--yes") setAssumeYes(true);
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
    case "finish":
      await finish(parseFlags(rest));
      break;
    case "merge":
      await merge(parseFlags(rest));
      break;
    case "switch":
      await switchBranch(parseFlags(rest));
      break;
    case "remove":
    case "rm":
      await remove(parseFlags(rest));
      break;
    case "sync":
      if (rest[0] !== undefined && !rest[0].startsWith("-")) syncBranch(rest);
      else sync(parseFlags(rest));
      break;
    case "clean":
      await clean(parseFlags(rest));
      break;
    case "list":
    case "show":
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
    case "save":
      save(parseFlags(rest));
      break;
    case "push":
      push(parseFlags(rest));
      break;
    case "pull":
      pull(parseFlags(rest));
      break;
    case "squash":
      await squash(parseFlags(rest));
      break;
    case "find":
    case "search":
      find(parseFlags(rest));
      break;
    case "stat":
      stat(parseFlags(rest));
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
    case "changelog":
      changelog(parseFlags(rest));
      break;
    case "setup":
      setup(parseFlags(rest));
      break;
    case "doctor":
      if (!doctor(parseFlags(rest))) exit(1);
      break;
    case "tree":
      tree(parseFlags(rest));
      break;
    case "reset":
      await reset(parseFlags(rest));
      break;
    case "release": {
      const flags = parseFlags(rest);
      assertAllowedFlags(
        flags,
        ["patch", "minor", "major", "update-version", "npm"],
        "release",
      );
      const kind = onlyOne(flags, ["patch", "minor", "major"]);
      if (!kind)
        throw new Error(
          "usage: gith release --patch | --minor | --major [--update-version --npm]",
        );
      release(kind, flags);
      break;
    }
    case "--version":
      console.log(versionText());
      break;
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
