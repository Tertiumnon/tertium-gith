# gith

```
          o
         /
   o----o----o
    \   |   /
     \  |  /
      (o_o)     gith v0.1.0
      /|_|\     git happens.
       d b
```

Git helper: the branch flow from [git-convention](https://github.com/Tertiumnon/git-convention) (goal-named work branches, `release/*` and `hotfix/*` containers, merges that sync both sides with origin), plus everyday git commands: status, switch, update, undo, save, squash, stash, remove, list, tree, sync, clean, reset, open, doctor and stat. Any command takes `--dry-run` to show the git commands it would run. No dependencies beyond git and [Bun](https://bun.com).

> **Very early state (0.1.0).** Commands and flags may change without notice, and the tool has only been run against throwaway test repositories. Check the result with `git log` and `git status` before you push.

## Install

`gith` runs on [Bun](https://bun.com) and needs git on the PATH. It is not on npm yet. From a clone of this repository, run `bun link` to put `gith` on your PATH.

## Usage

```bash
# Start and finish work
gith create -b login-redirect       # work branch from develop, named by its goal; stays on the current branch
gith create -r 1.2.0                # release/1.2.0 from develop
gith create -h 1.2.1                # hotfix/1.2.1 from main
gith create --release               # release, version = minor after the latest tag
gith create --hotfix                # hotfix, version = patch after the latest tag
gith switch -b login-redirect       # switch to the branch, creating it from develop if it is missing
gith update                         # merge origin/develop into this work branch
gith merge                          # this branch into develop
gith merge -r 1.2.0                 # this branch into release/1.2.0
gith merge -h 1.2.1                 # this branch into hotfix/1.2.1
gith merge --current-release        # this branch into the newest release/* (local or origin)
gith merge --current-hotfix         # this branch into the newest hotfix/* (local or origin)
gith release --patch                # npm version patch, published through main
gith release --minor                # npm version minor, from develop into main
gith release --major                # npm version major, from develop into main

# Fix history
gith undo                           # undo the last commit, keep its changes staged (not if pushed)
gith save [-m "msg"]                # fold staged changes into the last commit, or make a new commit with them if the branch has none yet (asks for a message); pushes if origin differs
gith squash -limit 3 [-m "msg"]     # combine the last 3 commits into one (keeps the oldest message)

# Save and reset work
gith stash -n wip                   # stash changes, including untracked files, under a name
gith unstash                        # bring back the latest stash
gith reset                          # discard uncommitted changes, then clean
gith clean                          # remove untracked files and directories

# Clean up branches (every removal shows what it will remove first)
gith remove -b login-redirect       # delete the branch here and on origin (rm is an alias)
gith remove -b login-redirect --local    # delete only the local branch
gith remove -b login-redirect --remote   # delete only the origin branch
gith remove --branch                # list branch pairs (here and on origin) and pick which to delete
gith remove --branch -l 10          # only the first 10 in the list
gith remove --branch --local        # list local branches and pick
gith remove --branch --remote       # list origin branches and pick
gith remove --obsolete              # remove branches untouched for 90 days, on both sides, after Y/n
gith remove --obsolete --local      # the same, here only
gith remove --obsolete -days 30     # untouched for 30 days instead
gith remove --detached              # pick local branches that have no origin copy

# Look at the repo
gith status                         # branch vs origin, and staged, unstaged and untracked counts
gith list --commits                 # the last 5 commits on this branch
gith list --commits --graph         # the same, as a branch graph
gith list --commits -l 10           # the last 10 (-limit 10 works too)
gith list --tags                    # the newest 5 tags with a LOCAL and ORIGIN column
gith list --tags -l 20              # the newest 20
gith list --stashes                 # the newest 5 stashes (-l for more)
gith show --pockets                 # the same, with Gorlum: my precious pockets!
gith find -commit "login" -limit 10  # commits whose message mentions login (search is the same; default 5)
gith search -file "*api.ts" -limit 3 # commits that changed a matching file, with the files listed
gith find -change "TODO"           # commits that added or removed the text in their diff
gith find -file "*api.ts" -commit fix # filters combine: fixes that touched api.ts
gith tree                           # working trees of this repo: path, branch, HEAD (current marked *)
gith stat                           # fun facts about this branch: biggest commit, busiest day, streaks...
gith stat --last-week -limit 50     # the same for last week, looking at no more than 50 commits

# Remote and health
gith sync                           # fetch all remotes and tags, prune stale refs
gith open                           # open origin in the browser
gith doctor                         # check the repo is ready for the branch flow

# Help
gith help                           # full usage
gith --version                      # the version, with the mascot

# Any command: add --verbose to see the git commands it runs, including read-only ones.
gith list --tags --verbose
```

## Flags

One rule applies to every command: **a single dash always takes a value, and a double dash never does.** So `-limit 10` is right, and `--limit 10` and `-remote` are errors that name the right spelling.

| Flag | Kind | Used by |
| --- | --- | --- |
| `-b <name>`, `-branch <name>` | value | `create`, `switch`, `remove` |
| `--branch` | alone: open the picker | `remove` |
| `-r <version>`, `-release <version>` | value | `create`, `merge` |
| `--release` | alone: version from the latest tag | `create` |
| `--current-release`, `--current-hotfix` | switch: merge into the newest release or hotfix | `merge` |
| `-h <version>`, `-hotfix <version>` | value | `create`, `merge` |
| `--hotfix` | alone: version from the latest tag | `create` |
| `-limit <n>` | value | `squash`: how many commits to combine |
| `-m <msg>`, `-message <msg>` | value | `squash` |
| `-n <name>`, `-name <name>` | value | `stash` |
| `-l <n>`, `-limit <n>` | value, positive whole number | every listing: `list`, `tree`, the picker |
| `--patch`, `--minor`, `--major` | switch | `release` |
| `--overall`, `--current-year`, `--current-month`, `--current-week`, `--last-year`, `--last-month`, `--last-week` | switch, one at a time | `stat` |
| `--local`, `--remote` | switch | `remove` (both sides when neither is given) |
| `--obsolete`, `--detached` | switch | `remove` |
| `-days <n>` | value | `remove --obsolete` |
| `--tags`, `--commits`, `--graph`, `--stashes`, `--pockets` | switch | `list` (also `show`) |
| `--verbose` | switch | every command |
| `--dry-run` | switch | every command |

Commands that choose between flags (for example `create -b`, `-r` and `-h`, or `list --tags` and `--commits`) accept only one of them. `-limit` caps listings and `stat`, and on `squash` it sets how many commits to combine. `-message` only applies to `squash`.

`--verbose` and `--dry-run` can go anywhere on the line:
- `--dry-run` prints each git command that would change something, and runs none of them. Read-only checks still run, so a refusal (for example, "HEAD is already on origin") appears in a dry run too. `clean` and `reset` also list the files they would remove or discard.
- `--verbose` also prints the read-only git calls, such as `rev-parse` and `ls-remote`. Action commands always print the git commands they run, such as `> git push -u origin login`. Commands run git directly, without a shell, so branch names are never parsed by it.

## Git commands

- **`switch -b`** switches to a branch. If the branch exists neither locally nor on origin, it is created first, the same way as `create -b`, and then checked out.
- **`remove -b <branch>`** removes the branch on both sides: the local branch first (with `git branch -d`, so git refuses to delete an unmerged branch), then the origin branch. A side that does not exist is skipped, so a branch that lives only here is still removed. A name that exists in neither place is an error. `--local` touches only this clone; `--remote` touches only origin. Containers (`develop`, `main`, `release/*`, `hotfix/*`) are refused.
- **`remove --branch`** with no name lists the branches and asks which to remove. By default it lists branch pairs, meaning branches that exist both here and on origin. `--local` lists local branches and `--remote` lists origin branches. Each choice is removed on the same sides as above. `-limit <n>` shows only the first `n` (all by default), and the picker numbers only those. Answer with numbers or ranges, such as `1,3-4`; an empty answer cancels. The list needs a terminal, and that is checked before anything is listed. The checked-out branch and containers are never listed. Choosing items is the confirmation, so nothing else is asked. If a delete fails (for example, an unmerged branch), the removal stops there and earlier picks stay deleted.
- **`status`** prints the branch and how far it is ahead of or behind its origin branch, then counts staged, unstaged, untracked and conflicting files. It changes nothing.
- **`update`** fetches `origin/develop` and merges it into the current work branch. It needs a clean working tree and refuses containers. If the merge conflicts, it aborts the merge and says so. It does not push.
- **`undo`** runs `git reset --soft HEAD~1`: the last commit is removed and its changes stay staged. It refuses when HEAD is already on origin, because undoing a pushed commit needs a force-push.
- **`save`** saves the staged changes. If the branch has commits of its own (commits origin's `develop`, or `main`, lacks), it folds them into the last commit with `git commit --amend --no-edit`, keeping its message. `-m` replaces the message. If the branch has no commits of its own, it never touches the base commit: it creates a new commit, asking for its message (an empty answer is refused, and `-m` skips the question). It refuses with nothing staged. It pushes only when origin already has this branch and its copy differs from the new commit: a plain `git push origin <branch>` when the commit only moves forward, or, when a pushed commit was rewritten, a `Save it and force-push ...? [Y/n]` question (Enter means yes; a no changes nothing) followed by `git push --force-with-lease origin <branch>`, which refuses if origin moved since your last fetch. If origin has no such branch, the save stays local. The questions need a terminal, so a script cannot force-push or commit by accident.
- **`stash`** saves changes with `git stash push --include-untracked`. `-n` names the stash. It refuses when there is nothing to save.
- **`find`** (also `search`) lists the newest commits on this branch that match every filter given:
  - `-commit <text>` matches the commit message, ignoring case, and the text is literal.
  - `-file <pattern>` matches the paths changed by the commit, using git's pattern rules (`*api.ts` matches `src/api.ts`). Each commit lists the matching files it changed.
  - `-change <text>` matches commits whose diff adds or removes the text (`git log -S`). With `--regex`, it matches a regular expression against the diff (`git log -G`).
  - `-limit <n>` sets how many to show (default 5). The filters combine with AND.
- **`show`** is a synonym for `list`: `gith show --tags` and `gith list --tags` do the same. `--pockets` is a fun name for `--stashes`, and it prints a Gorlum figure above the list.
- **`list --stashes`** shows the stashes, newest first, with their date and description. Like the other listings, it shows 5 by default, and `-limit` changes that.
- **`squash -limit <n>`** combines the last `n` commits on the current work branch into one, using `reset --soft` and a single commit. Without `-m` the result keeps the oldest of the combined commits, its message and author. It refuses when `n` is below 2, when `n` would reach the first commit, when a merge is among them, when any of them is already on origin, on a container, or with a dirty working tree.
- **`stat`** reads the history of the current branch and prints a table of facts: commit count, top author, the biggest commit (lines added and removed), average size, the most changed file, the busiest day, weekday and hour, the longest streak of days with a commit, night owl and weekend commits, and the conventional commit types. The period is one switch: `--overall` (the default), `--current-year`, `--current-month`, `--current-week` (weeks start on Monday), or the matching `--last-` switch for the previous year, month or week. `-limit <n>` looks only at the last `n` commits. Stat changes nothing.
- **`unstash`** runs `git stash pop`. If it conflicts, git keeps the stash in the list.
- **`remove --obsolete`** fetches and prunes origin, then lists the branches untouched for `-days` (default 90): no commit newer than the cutoff on either side. Each line shows the sides and the last commit date, and the command asks `Remove these N branches here and on origin? [Y/n]`. Enter means yes. `--local` looks at and removes only local branches. `-limit` shows only the first `n`, and the prompt covers only those. `main`, `develop`, `release/*` and `hotfix/*` are never removed, and neither is the checked-out branch. Each branch is deleted locally first (`git branch -d`), so a branch that git does not see as merged stops the run before its origin copy is touched.
- **`remove --detached`** fetches and prunes origin, then lists local branches that have no origin copy and lets you pick from them, the same as `remove --branch --local` but for branches with no origin copy only.
- **Every removal shows what it will remove** before deleting anything, including the direct `remove -b` form. The picker and the prompt both show it first.
- **`open`** opens origin in the browser, turning an `ssh` or `https` remote into a web address. GitHub and GitLab style addresses work.
- **`doctor`** checks git, a repository, origin, its reachability, `main` and `develop` on origin, and a clean working tree. It exits 1 if a required check fails, and only warns about the tree.
- **`sync`** runs `git fetch --all --tags --prune`.
- **`tree`** lists the working trees of the repository (`git worktree list`): each path, its branch or `(detached)`, and its short HEAD. The current one is marked `*`, and bare, locked or prunable trees are noted. `-limit <n>` caps the rows; all are shown by default.
- **`list --tags`** shows every tag once, with yes/no columns for local and origin, so you can see which tags are unpushed or missing locally. Version tags are listed newest first, and only the first 5 are shown by default. `-limit <n>` (or `-l <n>`) changes that and adds a note when rows are left out.
- **`list --commits`** shows the newest commits on the current branch, one per line: short hash, date, author and subject. With `--graph` it draws the branch graph instead. It shows 5 by default; `-l <n>` (or `-limit <n>`) changes that and must be a positive whole number. `-limit` only applies to listings. `gith list` with no flag prints usage.
- **`clean`** runs `git clean -fd`. It permanently removes untracked files and directories, but keeps ignored files.
- **`reset`** runs `git reset --hard` (discards staged and unstaged edits on this branch), then `git clean -fd`. It cannot be undone, so commit or stash first. It does not move the branch to origin.

## What it does

- **`create -b`** creates the branch from `origin/develop`, pushes it with upstream tracking, and leaves the current branch checked out. It does not touch the working tree, so it works with uncommitted changes.
- **`create -r` / `create -h`** creates a container from its base (`develop` for release, `main` for hotfix), refusing names that already exist on origin. Like `create -b`, it does not switch.
- **With `--release` or `--hotfix` (no value)**, the version is worked out from the highest `vX.Y.Z` tag across local tags and origin: `-r` takes the next minor (`1.2.1` → `1.3.0`), `-h` takes the next patch (`1.2.1` → `1.2.2`). With no tags yet, the first release is `0.1.0` and the first hotfix `0.0.1`. The version is printed before the branch is created.
- **`merge --current-release`** and **`--current-hotfix`** pick the newest `release/*` or `hotfix/*` branch by version (numbers compare as numbers, so `1.10.0` beats `1.9.0`), checking both local branches and origin, and merge into it. The target must exist on origin, because the merge pushes it; a newest branch that only exists here stops the command with a message.
- **`merge`** pushes the work branch, merges the target into it first (so conflicts happen on the work branch and are aborted cleanly), then merges it into the target with `--no-ff`, pushes, and checks that both branches match origin.

Containers (`develop`, `main`, `release/*`, `hotfix/*`) can't be merged from, and only `develop`, `release/*` and `hotfix/*` can be merged into.

## `release`

Run as `gith release --patch`, `--minor` or `--major`.

- **`patch`** runs from `main`: bumps the version, pushes with tags, then rebases `develop` onto `main`. The push back to `develop` uses `--force-with-lease`, so it refuses to overwrite a `develop` that moved on origin.
- **`minor` and `major`** run from `develop`: bump the version, push with tags, merge `develop` into `main`, then bring `main` back to `develop`.

Both need a clean working tree and a `package.json` with a version, because they call `npm version`.

## Errors

Each failure exits with code 1 and a message. Conflicts leave you on the work branch with the merge aborted, so you can resolve and retry.

## Development

```bash
bun install
bun run test        # unit tests
bun run lint        # biome check
bun run lint:fix    # biome check --write
bun run typecheck   # tsc --noEmit
```

## Publishing

`.github/workflows/publish.yml` runs lint, typecheck and tests, then `npm publish --access public`, whenever a `v*` tag is pushed. It uses npm trusted publishing (OIDC), so no npm token is stored in the repo. Bump the version with `gith release` or `npm version`, which creates the tag.
