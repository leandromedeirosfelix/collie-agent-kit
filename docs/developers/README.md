# Developer documentation

This section is for developers who want to understand how the Collie agent kit works, build on it, or connect it to their own tools. To install the kit and use it, start with the [main README](../../README.md).

## What the kit is

The kit has two parts:

- **The Collie MCP server**, `server/collie-mcp.mjs`: one bundled file that any stdio MCP client can run. It turns your agent's tool calls into requests to your Collie account.
- **The Claude Code plugin**: the same server plus skill and subagent stubs, command hooks and the live `/collie` pane.

The kit holds no review method and no review data. Collie serves its method guides to signed-in accounts, and your reviews stay in Collie.

## Pages

| Page | Read it to |
|---|---|
| [Architecture](architecture.md) | See how the server, the plugin layers and the Collie service fit together, what runs where, and how the kit keeps a human in charge. |
| [Authentication](authentication.md) | Understand the code sign-in, where the token lives, personal access tokens, token scopes and revoking. |
| [Tools reference](tools-reference.md) | Look up every MCP tool: description, parameters, and whether it reads or writes. Generated from the server. |
| [Skills and subagents](skills-and-agents.md) | See the 13 skills and 8 subagents, how their stubs load Collie's guides, and how to write your own. |
| [Hooks and the Collie pane](hooks-and-pane.md) | Learn what each Claude Code hook guards, how the pane reads Collie, and how to adjust them. |
| [Integrating other clients](integrating-other-clients.md) | Run the server from any stdio MCP client, or from your own TypeScript or Python code. |
| [Versioning](versioning.md) | Understand version numbers, the changelog, and compatibility with the Collie service. |

## Scope

These pages cover the kit and its MCP surface: the tools, their parameters and their answers. They do not describe the Collie service's internals. The Collie service and the method guides it serves through `collie_guide` are not part of the kit and are governed by Collie's [Terms of Use](https://colliesr.com/terms.html).

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for how to report issues, which pull requests are welcome, and the development setup. Report vulnerabilities privately, as [SECURITY.md](../../SECURITY.md) describes.
