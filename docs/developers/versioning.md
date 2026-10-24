# Versioning

## Version numbers

The kit follows [Semantic Versioning](https://semver.org). One version number covers the whole kit and is kept the same in three files:

- `package.json` (`version`)
- `.claude-plugin/plugin.json` (`version`)
- `.claude-plugin/marketplace.json` (the `collie` plugin entry's `version`)

| Change | Bump | Examples |
|---|---|---|
| Fixes and documentation that do not change the tool surface | Patch (`0.4.0` → `0.4.1`) | Docs, client configs, hook fixes |
| New tools, parameters, skills, subagents or hooks | Minor (`0.4.x` → `0.5.0`) | A new MCP tool |
| A tool or parameter renamed or removed, or a changed meaning | Minor while the version is `0.x`, major from `1.0.0` | Renaming a tool |

While the major version is 0, check the [changelog](../../CHANGELOG.md) before updating code that calls tools by name.

The server reports its own version in the MCP `initialize` answer (`serverInfo.version`). It changes when a new server bundle ships, so in a documentation-only release it can be lower than the kit's version.

## Changelog

Every release has an entry in [CHANGELOG.md](../../CHANGELOG.md), newest first, that lists what changed for users and developers. Pull requests that change behaviour should add a line under the next version.

## Compatibility with the Collie service

The server is a client of the hosted Collie service at app.colliesr.com. Collie runs one version of the service for everyone.

- Use the latest kit. When the service needs a newer server, a new kit release ships it. Update as the [README](../../README.md#updating) describes.
- The method guides that skills and subagents load with `collie_guide` come from the service, so they stay current without a kit update.
- [tools-reference.md](tools-reference.md) is generated from the bundle in this repository, so it always matches the version you have checked out.

## Releases

1. Update the version in the three files above.
2. Add the `CHANGELOG.md` entry.
3. Regenerate the tools reference if the bundle changed: `node scripts/gen-tools-reference.mjs`.
4. Run `claude plugin validate .`.
5. Merge to `main`. Claude Code users get it with `/plugin marketplace update collie-agent-kit`; other clients get it the next time `npx` fetches the kit.
