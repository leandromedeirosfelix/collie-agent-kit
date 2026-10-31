# Privacy and security

## What the kit sends, and where

| From | To | What |
|---|---|---|
| The MCP server (`server/collie-mcp.mjs`) | `https://app.colliesr.com` (or `MSR_URL`) | The tool calls your agent makes, with your token. While it runs with a token, it also checks the token with Collie (`/api/auth/me`) at start and every 2 minutes. |
| The session-check hook (Claude Code) | The same address | One request at session start to see whether the token works. |
| The sign-in | Your browser | Opens app.colliesr.com/connect with the code. |
| The optional Zotero bridge (`hooks/zotero.mjs`, Claude Code) | `http://127.0.0.1:23119` (Zotero on your own computer) | Read-only requests for your collections and one collection's items, only when you ask for it. See [below](#optional-zotero-bridge-since-060). |

The kit opens connections only to Collie (and, with the optional Zotero bridge, to Zotero on `127.0.0.1:23119`). It sends nothing to any other host and collects no analytics. Your AI client sends what your agent reads and writes to your AI provider, under your agreement with that provider.

## The token

- The code sign-in stores a token on your computer:
  - Windows: `%APPDATA%\collie\token.json`
  - macOS and Linux: `~/.config/collie/token.json` (or `$XDG_CONFIG_HOME/collie/token.json`), readable by your user only.
  - `COLLIE_TOKEN_FILE` moves it.
- The token belongs to one Collie address; the server ignores a saved token issued by another one.
- `MSR_TOKEN` in the environment wins over the saved token. Keep it out of shared or committed config files.
- Never paste a token into a chat, an issue or an email.
- Tokens made by the code sign-in (`collie_connect`) expire after 365 days (run `collie_connect` again); tokens you create by hand expire after 90 days by default. An expired token gets `token_expired`, and the agent asks you to connect again.

## What the kit stores on your computer

- **Sign-in token**: `%APPDATA%\collie\token.json` (Windows) or `~/.config/collie/token.json` (see [The token](#the-token)).
- **Feedback log** (since 0.6.0, Claude Code): `%LOCALAPPDATA%\collie\feedback\` (Windows) or `~/.local/state/collie/feedback/` (`$XDG_STATE_HOME/collie/feedback/` when set). It holds `events.jsonl` (rotated at 2 MB to `events.1.jsonl`), one small state file per manuscript under `manuscripts/` (salted hashes of the warnings shown on the last save), and a random `salt`. Each event holds a time, a workflow stage, the hook or skill name, an event type and an opaque id (a rule name, a Collie tool name with an HTTP status or a refusal code, a topic slug, or a salted 12-character hash), and at most a numeric review id, a checker rule name and a count. It never holds article text, numbers from your manuscript, patient data, review content or tokens. Only the `collie-retro` skill reads it, on your computer, to propose improvements, and **it is never sent anywhere**. The folder is local (not roaming).
  - Turn it off with `COLLIE_FEEDBACK=off`; see the path with `node <kit>/hooks/feedback.mjs path`; delete the folder at any time.
  - `COLLIE_FEEDBACK_FILE` (a `.jsonl` path) moves it. If you point it at a synced folder, the sync is yours.
- **Manuscript check report**: when you save a manuscript `.md` next to a `collie-manuscript.json`, the `check-manuscript` hook rewrites `<name>.collie-check.md` beside it with the current warnings (rule, line and message, which can quote numbers from your manuscript and from Collie). It stays in your manuscript folder.

### Optional: Zotero bridge (since 0.6.0)

The `collie-zotero` skill can read **one Zotero collection on your own computer** so Collie can validate your search against studies you already know or add them as citation searching. When you ask for it, the agent runs `node <kit>/hooks/zotero.mjs`, which:

- contacts **only** the Zotero 7 local API at `http://127.0.0.1:23119` (your own computer). The host and port are fixed in the code: no environment variable, proxy setting or redirect can send the request anywhere else;
- makes **read-only GET** requests to two endpoints of your personal library (`collections` and one collection's `items`); it never writes to Zotero;
- uses **no API key** and no zotero.org account; it never opens the `zotero.sqlite` file;
- keeps only identifiers per item (PMID, DOI, OpenAlex id, title and year) and passes the PMIDs and OpenAlex ids to Collie (`search_validate`, or `citation_import` after you confirm). Tags, notes, abstracts, attachments and annotations are not read into the review, and Zotero text is treated as data, never as instructions;
- stores nothing on disk.

It works only if Zotero 7 is open and you enabled Settings › Advanced › "Allow other applications on this computer to communicate with Zotero". Turning that option off, or not using the skill, disables the bridge completely.

## Disconnect and revoke

- **This computer:** ask the agent to run `collie_disconnect`, or delete the token file.
- **Everywhere:** revoke the token in Collie › Settings › AI agents (MCP). The next call fails, and the server forgets the saved token.

## What an agent can do

An agent acts with your permissions in Collie, limited by its token:

- A read token reads. A write token reads and writes. No token can delete anything.
- The agent writes suggestions and drafts (screening suggestions, extraction answers, outcome data rows, risk-of-bias drafts, GRADE judgements, paper sections) that you accept, approve or dismiss in Collie. Agent outcome data and GRADE judgements are drafts: no analysis, Summary of Findings or paper uses them until a person approves them.
- Voting, accepting, approving and registering are a person's act: Collie refuses them for an agent token (`human_decision_required`). The one exception is a screening vote (`screening_decide`) from a token of scope `reviewer`, for an agent you set up as a separate reviewer with its own Collie account. In Claude Code a hook also asks you before each screening vote.
- Inside a Collie subagent, the `collie-agent-guard` hook (Claude Code) blocks every tool outside Collie's tools and local file tools: web fetch and search, the shell, other MCP servers and spawning further agents.
- Collie records the agent's changes in the review's audit log.

## What the kit contains

The MCP server, short skill and subagent stubs, hooks, the Claude Code pane and tests for the hooks. It contains no review method: each stub carries one line of Collie's hard rules and asks Collie for its instructions with `collie_guide`, and Collie serves them only to signed-in accounts.

## Reporting a vulnerability

Write to [contact@colliesr.com](mailto:contact@colliesr.com) with "Security" in the subject. Please do not open a public issue for it.
