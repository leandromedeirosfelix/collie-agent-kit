# Security policy

## Report a vulnerability

Please report vulnerabilities privately by e-mail to [contact@colliesr.com](mailto:contact@colliesr.com), with "Security" in the subject. Do not open a public issue, pull request or discussion for it.

Include:

- what you found and its impact;
- the steps to reproduce it, and the kit version (`package.json`), client, OS and `node --version`;
- whether you have shared it with anyone else.

Never send a real token or someone else's review data. If a token was exposed, revoke it first in Collie › Settings › AI agents (MCP).

We will confirm that we received your report, keep you informed while we work on it, and credit you when the fix ships if you wish. Please give us reasonable time to fix the issue before you disclose it.

## Scope

In scope, in this repository:

- the MCP server bundle (`server/collie-mcp.mjs`), including how it handles tokens, the code sign-in and requests to Collie;
- the Claude Code plugin: hooks (`hooks/*.mjs`), the `/collie` pane (`hooks/live/`), and the plugin and marketplace manifests;
- token storage on the user's computer;
- the scripts in `scripts/`.

Report to the same address, but note that these are governed by Collie's [Terms of Use](https://colliesr.com/terms.html), not by this repository:

- the Collie service (app.colliesr.com) and the method guides it serves.

Out of scope:

- vulnerabilities in AI clients, AI providers, Node.js, npm or other third-party software (report them to their maintainers);
- an agent following instructions that a user gave it;
- social engineering, physical attacks, and denial-of-service or load testing against Collie;
- findings that need a computer or account that is already compromised.

## How the kit is built to be safe

The security model is described in [docs/security.md](docs/security.md) and [docs/developers/architecture.md](docs/developers/architecture.md#human-in-the-loop): the kit talks only to the Collie address, stores the token readable by the user only (on macOS and Linux), and no token can delete anything in Collie.
