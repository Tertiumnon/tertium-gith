# Repository instructions

Read [`docs/RULES.md`](docs/RULES.md) before adding or changing a `gith` command, flag, or command-specific behavior. It records the command conventions, safety rules, and source references.

The source of truth for flag syntax is `src/components/args/args.constants.ts` and `src/components/args/args.ts`; command dispatch and help live in `src/cli.ts`. A globally recognized flag is not valid for a command unless that command explicitly allows it.

When command behavior changes, update the command tests, CLI help, [`README.md`](README.md), and [`docs/RULES.md`](docs/RULES.md) as needed. Keep each command's usage text consistent with its implementation.

Keep user-facing release notes in the matching `Highlights` section of `CHANGELOG.md`; do not create per-version release note files. When preparing a release, add a concise summary to the new changelog entry before publishing. The publish workflow also creates a GitHub Release with generated notes for each `v*` tag.
