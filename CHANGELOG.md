# Changelog

## 0.4.1 — MIT licence and developer docs

- The kit is now open source under the MIT License. The Collie service and the method guides it serves remain governed by Collie's Terms of Use.
- Developer documentation in `docs/developers/`: architecture, authentication, tools reference, skills and subagents, hooks and the Collie pane, integrating other clients, versioning.
- `scripts/gen-tools-reference.mjs` regenerates the tools reference from the server's `tools/list` (`--check` reports when it is out of date).
- `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue forms and a pull request template.
- No change to the MCP server, skills, subagents or hooks.

## 0.4.0 — first public release

- Collie MCP server as a single file (`server/collie-mcp.mjs`, Node.js 20+, no dependencies to install), runnable with `npx -y github:leandromedeirosfelix/collie-agent-kit`.
- Sign-in with a one-time code approved at app.colliesr.com/connect. No token to copy.
- Claude Code plugin and marketplace: 13 skills, 8 subagents, 4 command hooks and the live Collie pane (`/collie`).
