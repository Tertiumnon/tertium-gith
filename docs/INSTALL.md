# Install

Needs [Node.js](https://nodejs.org) 18 or newer and git on the PATH.

```bash
npm install -g @tertium/gith
gith --version
```

From a clone of this repository, build the CLI and link it: `bun install`, `bun run build`, `npm link`.

`bun install` also points git at `.githooks/`, so each commit runs `bun run typecheck`, `bun run format:check` and `bun run lint` first, and a failing check stops it. `bun run format` rewrites files to the formatter's style.
