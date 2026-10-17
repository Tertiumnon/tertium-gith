# gith

Git helper: the branch flow from [git-convention](https://github.com/Tertiumnon/git-convention) (goal-named work branches, `release/*` and `hotfix/*` containers, merges that sync both sides with origin), plus everyday git commands: status, switch, update, undo, amend, squash, stash, remove, list, tree, sync, clean, reset, open, doctor and stat. Any command takes `--dry-run` to show the git commands it would run. No dependencies beyond git and [Bun](https://bun.com).

> **Very early state (0.1.0).** Commands and flags may change without notice, and the tool has only been run against throwaway test repositories. Check the result with `git log` and `git status` before you push.

## Install

`gith` runs on [Bun](https://bun.com) and needs git on the PATH. It is not on npm yet. From a clone of this repository, run `bun link` to put `gith` on your PATH.

## Usage

```bash
# Branch flow
gith create -b login-redirect       # work branch from develop, named by its goal; stays on the current branch
gith create -r 1.2.0                # release/1.2.0 from develop
gith create -h 1.2.1                # hotfix/1.2.1 from main
gith create --release               # release, version = minor after the latest tag
gith create --hotfix                # hotfix, version = patch after the latest tag
gith merge                          # this branch into develop
gith merge -r 1.2.0                 # this branch into release/1.2.0
gith merge -h 1.2.1                 # this branch into hotfix/1.2.1
gith release --patch                # npm version patch, published through main
gith release --minor                # npm version minor, from develop into main
gith release --major                # npm version major, from develop into main

# Everyday git
gith switch -b login-redirect       # switch to the branch, creating it from develop if it is missing
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
gith list --tags                    # the newest 5 tags with a LOCAL and ORIGIN column
gith list --tags -l 20              # the newest 20
gith list --commits                 # the last 5 commits on this branch
gith list --commits --graph         # the same, as a branch graph
gith list --commits -l 10           # the last 10 (-limit 10 works too)
gith status                         # branch vs origin, and staged, unstaged and untracked counts
gith stat                           # fun facts about this branch: biggest commit, busiest day, streaks...
gith stat --last-week -limit 50     # the same for last week, looking at no more than 50 commits
gith update                         # merge origin/develop into this work branch
gith undo                           # undo the last commit, keep its changes staged (not if pushed)
gith amend                          # fold staged changes into the last commit (not if pushed)
gith stash -n wip                   # stash changes, including untracked files, under a name
gith squash -limit 3 [-m "msg"]     # combine the last 3 commits into one (keeps the oldest message)
gith unstash                        # bring back the latest stash
gith list --stashes                 # the newest 5 stashes (-l for more)
gith tree                           # working trees of this repo: path, branch, HEAD (current marked *)
gith open                           # open origin in the browser
gith doctor                         # check the repo is ready for the branch flow
gith sync                           # fetch all remotes and tags, prune stale refs
gith clean                          # remove untracked files and directories
gith reset                          # discard uncommitted changes, then clean
gith help                           # full usage

# Add --verbose to any command to see the git commands it runs, including read-only ones.
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
| `--tags`, `--commits`, `--graph`, `--stashes` | switch | `list` |
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
- **`amend`** runs `git commit --amend --no-edit` to fold the staged changes into the last commit, keeping its message. It refuses with nothing staged. If HEAD is already on origin under this branch, it asks `Force-push ...? [Y/n]` first (Enter means yes; a no changes nothing). On yes it amends and runs `git push --force-with-lease origin <branch>`, which refuses if origin moved since your last fetch. The question needs a terminal, so a script cannot force-push by accident. If HEAD is on origin under another branch, it refuses.
- **`stash`** saves changes with `git stash push --include-untracked`. `-n` names the stash. It refuses when there is nothing to save.
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
