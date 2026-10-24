# Privacy and security

## What the kit sends, and where

| From | To | What |
|---|---|---|
| The MCP server (`server/collie-mcp.mjs`) | `https://app.colliesr.com` (or `MSR_URL`) | The tool calls your agent makes, with your token. |
| The session-check hook (Claude Code) | The same address | One request at session start to see whether the token works. |
| The sign-in | Your browser | Opens app.colliesr.com/connect with the code. |

The kit sends nothing to any other host and collects no analytics. Your AI client sends what your agent reads and writes to your AI provider, under your agreement with that provider.

## The token

- The code sign-in stores a token on your computer:
  - Windows: `%APPDATA%\collie\token.json`
  - macOS and Linux: `~/.config/collie/token.json` (or `$XDG_CONFIG_HOME/collie/token.json`), readable by your user only.
  - `COLLIE_TOKEN_FILE` moves it.
- The token belongs to one Collie address; the server ignores a saved token issued by another one.
- `MSR_TOKEN` in the environment wins over the saved token. Keep it out of shared or committed config files.
- Never paste a token into a chat, an issue or an email.

## Disconnect and revoke

- **This computer:** ask the agent to run `collie_disconnect`, or delete the token file.
- **Everywhere:** revoke the token in Collie › Settings › AI agents (MCP). The next call fails, and the server forgets the saved token.

## What an agent can do

An agent acts with your permissions in Collie, limited by its token:

- A read token reads. A write token reads and writes. No token can delete anything.
- The agent writes suggestions and drafts (screening suggestions, extraction answers, risk-of-bias drafts) that you accept or dismiss in Collie.
- A screening vote (`screening_decide`) is a real reviewer vote. In Claude Code a hook asks you before each one. For a vote you want counted as a separate reviewer, sign the agent in as its own Collie account.
- Collie records the agent's changes in the review's audit log.

## What the kit contains

The MCP server, short skill and subagent stubs, hooks and the Claude Code pane. It contains no review method: each skill asks Collie for its instructions with `collie_guide`, and Collie serves them only to signed-in accounts.

## Reporting a vulnerability

Write to [contact@colliesr.com](mailto:contact@colliesr.com) with "Security" in the subject. Please do not open a public issue for it.
