# gf

Git-only branch flow for the conventions in [git-convention](https://github.com/Tertiumnon/git-convention): goal-named work branches, `release/*` and `hotfix/*` containers, and merges that sync both sides with origin. No dependencies beyond git and [Bun](https://bun.com).

> **Very early state (0.1.0).** Commands and flags may change without notice, and the tool has only been run against throwaway test repositories. Check the result with `git log` and `git status` before you push.

## Usage

```bash
gf create -b login-redirect       # work branch from develop, named by its goal
gf create -r 1.2.0                # release/1.2.0 from develop
gf create -h 1.2.1                # hotfix/1.2.1 from main
gf create --release               # release, version = minor after the latest tag
gf create --hotfix                # hotfix, version = patch after the latest tag
gf merge                          # this branch into develop
gf merge -r 1.2.0                 # this branch into release/1.2.0
gf merge -h 1.2.1                 # this branch into hotfix/1.2.1
gf release --patch                # npm version patch, published through main
gf release --minor                # npm version minor, from develop into main
gf release --major                # npm version major, from develop into main
gf help                           # full usage
```

The dashes decide how a flag takes its value:
- `-r <version>`, `-release <version>`, `-h <version>`, `-hotfix <version>`: an explicit version.
- `--release`, `--hotfix`: no value; the version is worked out from the tags.
- `-b <name>`, `-branch <name>`, `--branch <name>`: the branch name.
- `--patch` or `-patch`, and likewise `--minor` and `--major`.

Each command takes one of its flags; giving two is an error.

## What it does

- **`create -b`** checks the working tree is clean, updates `develop`, creates the branch, and pushes it with upstream tracking.
- **`create -r` / `create -h`** creates a container from its base (`develop` for release, `main` for hotfix), refusing names that already exist on origin.
- **With `--release` or `--hotfix` (no value)**, the version is worked out from the highest `vX.Y.Z` tag across local tags and origin: `-r` takes the next minor (`1.2.1` → `1.3.0`), `-h` takes the next patch (`1.2.1` → `1.2.2`). With no tags yet, the first release is `0.1.0` and the first hotfix `0.0.1`. The version is printed before the branch is created.
- **`merge`** pushes the work branch, merges the target into it first (so conflicts happen on the work branch and are aborted cleanly), then merges it into the target with `--no-ff`, pushes, and checks that both branches match origin.

Containers (`develop`, `main`, `release/*`, `hotfix/*`) can't be merged from, and only `develop`, `release/*` and `hotfix/*` can be merged into.

## `release`

Run as `gf release --patch`, `--minor` or `--major`.

- **`patch`** runs from `main`: bumps the version, pushes with tags, then rebases `develop` onto `main`. The push back to `develop` uses `--force-with-lease`, so it refuses to overwrite a `develop` that moved on origin.
- **`minor` and `major`** run from `develop`: bump the version, push with tags, merge `develop` into `main`, then bring `main` back to `develop`.

Both need a clean working tree and a `package.json` with a version, because they call `npm version`.

## Moved from @tertium/js

These git-flow features used to live in `scripts/` in [@tertium/js](https://github.com/Tertiumnon/tertium-js). They moved here because they are git workflow, not part of the shared JS library:

| Was in @tertium/js | Now in gf |
| --- | --- |
| `scripts/release/release.ts` (`release:patch`, `release:minor`, `release:major`) | `gf release --patch`, `--minor`, `--major` |
| `scripts/merge-branch/` (`merge:branch`, `merge:release`, `merge:hotfix`) | `gf merge`, `gf create -r`, `gf create -h` |
| `scripts/git/git.utils.ts` (shared git helpers) | `src/git.ts` |

Behaviour is the same where it was tested. Two intentional differences:
- `gf` uses goal-named work branches with no `feat/` or `fix/` prefix. Commit types belong in commit messages.
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

`.github/workflows/publish.yml` runs lint, typecheck and tests, then `npm publish --access public`, whenever a `v*` tag is pushed. It uses npm trusted publishing (OIDC), so no npm token is stored in the repo. Bump the version with `gf release` or `npm version`, which creates the tag.
