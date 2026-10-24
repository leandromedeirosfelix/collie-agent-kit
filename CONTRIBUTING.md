# Contributing

Thank you for helping improve the Collie agent kit. This page explains how to report problems and ideas, which pull requests we can accept, and how to set up the repository.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Report a problem or an idea

- **GitHub issues:** use the [bug report or feature request forms](https://github.com/leandromedeirosfelix/collie-agent-kit/issues/new/choose).
- **E-mail:** write to [contact@colliesr.com](mailto:contact@colliesr.com), for example about your Collie account or anything you would rather not post in public.
- **Security vulnerabilities:** never in a public issue. Follow [SECURITY.md](SECURITY.md).

In a bug report, include your client and its version, your OS, `node --version`, the kit version, and the error text. Never include a token, and do not paste review contents you are not allowed to share.

## What pull requests are welcome

| Area | Welcome |
|---|---|
| Documentation (`README.md`, `docs/`) | Yes: fixes, clearer steps, new client guides. |
| Client configurations | Yes: tested setups for MCP clients we do not cover yet. |
| Hooks and the `/collie` pane (`hooks/`, `types/`) | Yes: fixes and improvements. Keep hooks dependency-free and the pane read-only. |
| `scripts/` | Yes. |
| Skill and subagent stubs (`skills/`, `agents/`) | Please open an issue first. The stubs pair with method guides that Collie serves, so changes need to match the service. |
| The server bundle (`server/collie-mcp.mjs`) | Not accepted, see below. |

### Why server bundle changes are not accepted

`server/collie-mcp.mjs` is generated from Collie's private source code and published here as a build artifact. A change made directly to the bundle would be overwritten by the next build, and we cannot review it against the source it was built from. If you find a bug in the server or want a new tool, please open an issue or write to us: we fix it in the source and ship a new bundle.

## Development setup

You need:

- [Node.js](https://nodejs.org) 20 or newer
- [Claude Code](https://code.claude.com/docs), to validate and test the plugin
- Git

```text
git clone https://github.com/leandromedeirosfelix/collie-agent-kit.git
cd collie-agent-kit
```

There are no dependencies to install.

### Check the plugin

```text
claude plugin validate .
```

To try your changes in Claude Code without publishing them, start it with the local copy of the plugin:

```text
claude --plugin-dir .
```

### Run the server by hand

```text
node server/collie-mcp.mjs
```

It waits silently for an MCP client on stdin; stop it with Ctrl+C. To exercise tools interactively, connect any MCP client to it, as [integrating other clients](docs/developers/integrating-other-clients.md) describes.

### Regenerate the tools reference

[docs/developers/tools-reference.md](docs/developers/tools-reference.md) is generated from the server's `tools/list` answer. Never edit it by hand. After the bundle changes:

```text
node scripts/gen-tools-reference.mjs
```

To check that the page is up to date (for example in CI), run it with `--check`; it exits with code 1 when the page differs.

## Pull request checklist

1. Branch from `main` and keep the pull request focused on one change.
2. Write commit messages in the [Conventional Commits](https://www.conventionalcommits.org) style: `docs: ...`, `fix: ...`, `feat: ...`.
3. Run `claude plugin validate .` and `node scripts/gen-tools-reference.mjs --check`.
4. Check that relative links in changed Markdown files resolve.
5. Add a line to [CHANGELOG.md](CHANGELOG.md) for changes users will notice.
6. Never commit tokens, personal data or review contents.

The [pull request template](.github/pull_request_template.md) repeats this checklist.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE) of this repository.
