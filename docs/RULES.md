# Command design rules

These rules keep `gith` commands predictable, strict, and safe to combine. Follow them when adding or changing a command or flag.

## Flag syntax

- A single-dash flag always requires a value: `-limit 10`, `-r 1.2.0`, `-m "message"`.
- A double-dash flag never takes a value: `--graph`, `--release`, `--all`.
- Use a double-dash auto flag for a command-specific automatic choice. For example, `create --release` chooses the next release version, while `create -r 1.2.0` uses an explicit version. Bare `-r` is an error.
- Declare each flag and its kind in [`args.constants.ts`](../src/components/args/args.constants.ts). Keep aliases in the same registry. The parser in [`args.ts`](../src/components/args/args.ts) enforces the dash and value rules.
- Reject flags a command does not support before it reads or changes repository state. Use `assertAllowedFlags` for allowlists, `onlyOne` for mutually exclusive choices, and `noFlags` for commands without options.
- Validate required values and combinations at the command boundary. A flag accepted globally is not automatically valid for every command.

## Command behavior

- Give each command one clear job and a resource or action name users can remember. Keep `gith help`, the README, and error usage in sync with actual behavior.
- State defaults explicitly. A command with no arguments should have one documented behavior; use a picker only when the user must choose among multiple valid targets.
- `status` always includes all local branches and remote-tracking branches from every configured remote, alongside its working-tree summary. Label remote refs as last fetched; do not fetch or change repository state during status.
- Check for a terminal before opening an interactive picker or asking a question. `--yes` answers confirmation questions; it does not choose a branch from a picker.
- Make actions and their results clear. Report what was saved, pushed, pulled, or selected, and give a next step when the command stops.
- Honor `--dry-run` for changes: print the actions and do not perform them. Keep read-only checks and validation useful in dry runs.

## Git and safety

- Pass Git arguments as arrays through the shared helpers in [`git.ts`](../src/components/git/git.ts). Do not construct shell commands from user input.
- Treat the configured branch and `origin` behavior as part of the command contract. Document when a command uses the current branch, a named branch, or all local branches.
- Do not force-push by default. For remote updates, detect divergence and stop with a clear recovery step; use fast-forward-only pulls when the command promises a pull.
- Check working-tree cleanliness before commands that could overwrite tracked work. For commands that discard files or delete branches, show what will change and ask before proceeding; `--yes` is the explicit noninteractive confirmation.
- Preserve local work when a later remote action fails. For example, `save` commits locally and pushes only when the user passes `"--&push"`.
- `release` runs its Git branch flow without updating package versions by default. Version updates require both `--update-version` and an explicit ecosystem selector: currently `--npm`. Reject either flag alone before changing repository state. Do not infer the ecosystem from files in the repository. Future ecosystem selectors must define their tool and versioning behavior explicitly.

## Files and references

- Add command behavior to its component under `src/components/<command>/`; route it through [`src/cli.ts`](../src/cli.ts).
- Add or update behavior tests beside the command in `<command>.test.ts`. Cover accepted flags, rejected flags, defaults, and meaningful side effects.
- Update this rules document, [`README.md`](../README.md), and CLI help when command syntax or behavior changes.
- Flag definitions and parsing: [`args.constants.ts`](../src/components/args/args.constants.ts), [`args.types.ts`](../src/components/args/args.types.ts), [`args.ts`](../src/components/args/args.ts), [`args.utils.ts`](../src/components/args/args.utils.ts).
- Command dispatch and help: [`cli.ts`](../src/cli.ts).
- Git execution and dry-run behavior: [`git.ts`](../src/components/git/git.ts).
- Remote synchronization: [`remote.ts`](../src/components/remote/remote.ts) and [`remote.utils.ts`](../src/components/remote/remote.utils.ts).
- Interactive confirmations and pickers: [`prompt.ts`](../src/components/prompt/prompt.ts).
