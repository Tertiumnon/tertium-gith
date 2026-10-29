# Development

```bash
bun install
bun run test        # unit tests
bun run lint        # biome check
bun run lint:fix    # biome check --write
bun run typecheck   # tsc --noEmit
```

## Publishing

The package ships one built file, `bin/gith.js`, which runs on Node. `npm pack --dry-run` lists what would be published. `prepublishOnly` runs lint, typecheck, the tests and the build before any publish. `.github/workflows/publish.yml` runs the same checks, then `npm publish --access public`, whenever a `v*` tag is pushed. It uses npm trusted publishing (OIDC), so no npm token is stored in the repo. Bump the version with `gith release --minor --update-version --npm` (or the explicit patch/major equivalent), or `npm version`. The `release:*` npm scripts already include both opt-in flags. Review the generated entry in `CHANGELOG.md` and add its user-facing summary under `Highlights` before publishing.
