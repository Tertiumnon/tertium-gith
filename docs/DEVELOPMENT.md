# Development

```bash
bun install
bun run test        # unit tests
bun run lint        # biome check
bun run lint:fix    # biome check --write
bun run typecheck   # tsc --noEmit
```

## Publishing

The package ships one built file, `bin/gith.js`, which runs on Node. `npm pack --dry-run` lists what would be published. `prepublishOnly` runs lint, typecheck, the tests and the build before any publish. `.github/workflows/publish.yml` runs the same checks, then `npm publish --access public`, whenever a `v*` tag is pushed. It uses npm trusted publishing (OIDC), so no npm token is stored in the repo. Bump the version with `gith release` or `npm version`, which creates the tag.
