# gith

Git helper: the branch flow from [git-convention](https://github.com/Tertiumnon/git-convention) (goal-named work branches, `release/*` and `hotfix/*` containers, merges that sync both sides with origin), plus everyday git commands: switch, remove, sync, clean and a pre-commit hook setup. No dependencies beyond git and [Bun](https://bun.com).

> **Very early state (0.1.0).** Commands and flags may change without notice, and the tool has only been run against throwaway test repositories. Check the result with `git log` and `git status` before you push.

## Usage

```bash
gith create -b login-redirect       # work branch from develop, named by its goal
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
gith help                           # full usage

gith switch -b login-redirect       # switch to a branch
gith remove -b login-redirect       # delete a merged local branch (rm is an alias)
gith remove -b login-redirect --remote   # also delete it on origin
gith remove -b login-redirect --both     # delete locally, then on origin
gith sync                           # fetch all remotes and tags, prune stale refs
gith clean                          # remove untracked files and directories
gith setup -hooks [--force]         # write .githooks/pre-commit, set core.hooksPath
```

The dashes decide how a flag takes its value:
- `-r <version>`, `-release <version>`, `-h <version>`, `-hotfix <version>`: an explicit version.
- `--release`, `--hotfix`: no value; the version is worked out from the tags.
- `-b <name>`, `-branch <name>`, `--branch <name>`: the branch name.
- `--patch` or `-patch`, and likewise `--minor` and `--major`.

`--remote`, `--both` and the `-hooks`, `-force` switches work in both dash forms too.

Each command takes one of its flags; giving two is an error.

## Git commands

- **`switch -b`** switches to a branch.
- **`remove -b`** runs `git branch -d`, so git refuses to delete an unmerged branch. `--remote` deletes the branch on origin; `--both` deletes it locally first, then on origin. Containers (`develop`, `main`, `release/*`, `hotfix/*`) are refused.
- **`sync`** runs `git fetch --all --tags --prune`.
- **`clean`** runs `git clean -fd`. It permanently removes untracked files and directories, but keeps ignored files.
- **`setup -hooks`** writes `.githooks/pre-commit`, points `core.hooksPath` at it, and adds a `prepare` script so every clone gets the hook. The hook runs `lint`, `typecheck` (always for TypeScript projects) and `test` (only when defined), using the package manager from the lockfile. `--force` overwrites an existing hook.

## What it does

- **`create -b`** checks the working tree is clean, updates `develop`, creates the branch, and pushes it with upstream tracking.
- **`create -r` / `create -h`** creates a container from its base (`develop` for release, `main` for hotfix), refusing names that already exist on origin.
- **With `--release` or `--hotfix` (no value)**, the version is worked out from the highest `vX.Y.Z` tag across local tags and origin: `-r` takes the next minor (`1.2.1` → `1.3.0`), `-h` takes the next patch (`1.2.1` → `1.2.2`). With no tags yet, the first release is `0.1.0` and the first hotfix `0.0.1`. The version is printed before the branch is created.
- **`merge`** pushes the work branch, merges the target into it first (so conflicts happen on the work branch and are aborted cleanly), then merges it into the target with `--no-ff`, pushes, and checks that both branches match origin.

Containers (`develop`, `main`, `release/*`, `hotfix/*`) can't be merged from, and only `develop`, `release/*` and `hotfix/*` can be merged into.

## `release`

Run as `gith release --patch`, `--minor` or `--major`.

- **`patch`** runs from `main`: bumps the version, pushes with tags, then rebases `develop` onto `main`. The push back to `develop` uses `--force-with-lease`, so it refuses to overwrite a `develop` that moved on origin.
- **`minor` and `major`** run from `develop`: bump the version, push with tags, merge `develop` into `main`, then bring `main` back to `develop`.

Both need a clean working tree and a `package.json` with a version, because they call `npm version`.

## Moved from hlpr

The git commands from [@tertium/hlpr](https://github.com/Tertiumnon/tertium-hlpr) now live here:

| Was in hlpr | Now in gith |
| --- | --- |
| `hlpr git switch -branch <b>` | `gith switch -b <b>` |
| `hlpr git remove -branch <b>`, `rm -b` | `gith remove -b <b>`, `gith rm -b <b>` |
| `hlpr git rm <b> -remote` / `-both` | `gith remove -b <b> --remote` / `--both` |
| `hlpr git sync` | `gith sync` |
| `hlpr git clean` | `gith clean` |
| `hlpr git setup -hooks [--force]` | `gith setup -hooks [--force]` |
| `hlpr git create -b <b>` (branch without switching) | not moved: `gith create -b` is the flow command and starts from develop |

Branch names are passed to git as argument lists, so they are never parsed by the shell.

## Moved from @tertium/js

These git-flow features used to live in `scripts/` in [@tertium/js](https://github.com/Tertiumnon/tertium-js). They moved here because they are git workflow, not part of the shared JS library:

| Was in @tertium/js | Now in gith |
| --- | --- |
| `scripts/release/release.ts` (`release:patch`, `release:minor`, `release:major`) | `gith release --patch`, `--minor`, `--major` |
| `scripts/merge-branch/` (`merge:branch`, `merge:release`, `merge:hotfix`) | `gith merge`, `gith create -r`, `gith create -h` |
| `scripts/git/git.utils.ts` (shared git helpers) | `src/git.ts` |

Behaviour is the same where it was tested. Two intentional differences:
- `gith` uses goal-named work branches with no `feat/` or `fix/` prefix. Commit types belong in commit messages.
- A minor release merges `develop` into `main` with `--no-edit`, so it no longer waits for an editor.

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
