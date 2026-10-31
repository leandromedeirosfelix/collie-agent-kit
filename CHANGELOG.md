# Changelog

## 0.6.0 — manuscript check, evidence transcript, local feedback log and Zotero bridge

Includes the 0.5.x changes, which were never published on their own.

- New skills (13 → 17): `collie-evidence-transcript` (a read-only, verbatim and page-cited transcript of a review's evidence), `collie-manuscript-check` (checks a manuscript against Collie's own numbers), `collie-retro` (proposes improvements to the agent from counts, for a human to approve) and `collie-zotero` (one local Zotero 7 collection as known studies or citation-searching candidates).
- New hooks (4 → 7):
  - `collie-agent-guard`: inside a Collie subagent, blocks every tool outside Collie's tools and local file tools (web, shell, other MCP servers, further agents), so text from articles cannot steer a subagent elsewhere.
  - `check-manuscript`: warn-only check of a `.md` manuscript next to `collie-manuscript.json` on every save (open `[[MISSING]]` placeholders, numbers that differ from Collie, references, AI-use and CRediT declarations, causal wording, claims the CI or GRADE does not support, unreported statistical methods). Writes `<name>.collie-check.md` beside the manuscript for `collie-peer-reviewer`.
  - `collie-tool-error`: counts Collie tool calls and errors in the local feedback log.
- Local feedback log (`hooks/feedback.mjs`): opaque ids and counts only, on your computer, never sent anywhere; read by `collie-retro`. Turn it off with `COLLIE_FEEDBACK=off`. See [security.md](docs/security.md#what-the-kit-stores-on-your-computer).
- Zotero bridge (`hooks/zotero.mjs`): read-only GET requests to the Zotero 7 local API on `127.0.0.1:23119`, identifiers only, no API key. It is the only connection the kit opens besides Collie.
- Every skill and subagent stub now carries one line of Collie's hard rules before loading its guide with `collie_guide`.
- Subagent tool lists: `collie-biostatistician` gains `nma_analyze`, `nma_run`, `nma_get`; `collie-manuscript-writer` gains `paper_get`, `paper_section_put`, `nma_get`; `collie-peer-reviewer` gains `nma_get`; `collie-screener` no longer has `criteria_set`.
- MCP server (reports `collie` 0.5.0): new tools `credits_status`, `nma_analyze`, `nma_run`, `nma_get`, `paper_get` and `paper_section_put` (55 → 61). No tool renamed or removed. While it runs with a token, the server checks the token with Collie at start and every 2 minutes.
- Collie's governance, as the server now explains it to agents:
  - Voting, accepting, approving and registering are a person's act: an agent token gets `human_decision_required`. A screening vote (`screening_decide`) is accepted only from a token of scope `reviewer`.
  - An agent's outcome data rows and GRADE judgements are drafts: no analysis, Summary of Findings or paper uses them until a person approves them. An approved paper section is never overwritten (`section_approved`).
  - Tokens expire: 365 days for the code sign-in, 90 days by default for tokens made by hand. An expired token gets `token_expired` and the agent asks you to connect again.
- `tests/node/`: dependency-free tests for the feedback log, the manuscript checks and the Zotero bridge (`node --test "tests/node/*.test.mjs"`).
- Docs: security, architecture, hooks and skills pages updated; tools reference regenerated.

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
