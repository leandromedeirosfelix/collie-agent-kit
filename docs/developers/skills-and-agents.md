# Skills and subagents

The Claude Code plugin ships 17 skills and 8 subagents. They are short stubs: each one carries one line of Collie's hard rules and asks Collie for its full instructions with the `collie_guide` tool and follows them. The method lives in Collie, so it stays current without a plugin update, and the kit itself contains no review method.

## How a stub works

A skill stub (`skills/<name>/SKILL.md`):

```markdown
---
name: collie-statistics
description: Use when the user wants to pool studies or run a meta-analysis in Collie ...
---

# Statistics

Plans and runs the meta-analysis in R through Collie and interprets the results.

**Hard rules** (guide `collie-rules`, first in every `collie_guide` result) override everything: Collie tools only, for what they support; ...

Before doing anything, call the `collie_guide` tool with name `collie-statistics` and follow the returned guide exactly.
If it fails, tell the user to connect Collie (`collie_connect`) and retry.
```

1. Claude Code matches the request against the skill's `description` and loads the stub.
2. The agent calls `collie_guide` with `name: "collie-statistics"`.
3. Collie returns the guide as markdown, only for a signed-in account. Every guide starts with Collie's hard rules.
4. The agent follows the guide, using the Collie tools it names.

A subagent stub (`agents/<name>.md`) works the same way. Its frontmatter also sets the `model` and an allow-list of `tools`, so the subagent can only call the Collie tools its job needs. When a subagent's guide names a `collie-*` skill, the subagent fetches that guide too.

`collie_guide` accepts names that match `^collie-[a-z0-9-]{1,60}$` and serves Collie's own guides only. Outside Claude Code, an agent loads the same guides by calling `collie_guide` directly, as the server's instructions tell it to.

## Skills

| Skill | What it does |
|---|---|
| `collie-workflow` | Orchestrates a whole review: reads where it stands and routes each stage to the right skill or subagent. Start here. |
| `collie-question-viability` | Shapes the question (PICOTT), writes testable eligibility criteria and runs the viability gate. |
| `collie-protocol` | Drafts and saves the protocol in PROSPERO field order and records the registration number. Never submits to PROSPERO. |
| `collie-search-strategy` | Builds, validates against known studies, imports and ports the literature search. |
| `collie-ai-reviewer` | Screens title/abstract or full text against the review's criteria and writes suggestions, never decisions. |
| `collie-ai-extraction` | Drafts extraction answers with verbatim quotes, Table 1 and outcome data for human approval. Never imputes. |
| `collie-rob-grade` | Drafts risk-of-bias assessments and proposes GRADE certainty per outcome. |
| `collie-statistics` | Plans and runs the meta-analysis in Collie's R engine and interprets the results. |
| `collie-figures` | Produces publication figures: forest, funnel, risk-of-bias and PRISMA flow. |
| `collie-ask-data` | Answers questions across the review's articles, citing only the review's references. |
| `collie-manuscript` | Drafts manuscript sections and the PRISMA 2020 checklist from Collie data, with placeholders for anything missing. |
| `collie-manuscript-check` | Checks a manuscript drafted from Collie against Collie's own numbers, with the kit's local, offline checker (the `check-manuscript` hook). Fixes only from Collie data; never edits Collie. |
| `collie-evidence-transcript` | Builds a read-only, verbatim and page-cited evidence transcript of the review (Markdown, optional CSV of quote rows) for peer reviewers, supplements or audits. |
| `collie-submission` | Prepares the journal submission package, cover letter and responses to peer reviewers. |
| `collie-retro` | Proposes improvements to the Collie agent from counts only (the local feedback log, AI suggestion and extraction outcomes, the audit log), each for a human to approve. Never edits guides, hooks, skills or review data. |
| `collie-zotero` | Uses one collection of your local Zotero 7 library as known studies (`search_validate`) or as citation-searching candidates (`citation_import`). Read-only; Zotero on this computer only. |
| `collie-help` | Answers how-to questions about Collie from its help center. |

## Subagents

| Subagent | Model | What it does | Writes to Collie with |
|---|---|---|---|
| `collie-methodologist` | opus | Question, criteria, protocol and the viability verdict. | `protocol_set` |
| `collie-search-strategist` | sonnet | Builds, debugs, validates and ports the search. | None (read and search tools only) |
| `collie-screener` | sonnet | Screens undecided records and writes AI suggestions with justifications. | `ai_suggest`, `ai_screen_run`, `relevance_compute` |
| `collie-extractor` | sonnet | Extracts question answers, Table 1 and arm-level outcome data with sources. | `ai_extraction_put`, `outcome_data_put` |
| `collie-rob-assessor` | sonnet | Drafts risk-of-bias assessments and a GRADE proposal. | `rob_assess`, `rob_plots` |
| `collie-biostatistician` | opus | Chooses the model, runs analyses (including network meta-analyses) in R and writes the results text. | `outcome_analyze`, `analysis_run`, `nma_analyze`, `nma_run` |
| `collie-manuscript-writer` | sonnet | Drafts manuscript sections strictly from Collie data. | `paper_section_put` (drafts), `outcome_analyze` (and local files) |
| `collie-peer-reviewer` | opus | A read-only pre-submission audit: PRISMA compliance, number consistency, statistical red flags. | None |

The exact tool list of each subagent is in its frontmatter in [`agents/`](../../agents/). No subagent can call `screening_decide`. In Claude Code the `collie-agent-guard` hook also blocks, inside any `collie-*` subagent, every tool outside Collie's tools and local file tools (see [Hooks](hooks-and-pane.md)).

## Write your own

Your own skills and subagents can use the Collie tools next to the ones in the plugin. Put them where Claude Code finds them:

| Kind | Personal | One project |
|---|---|---|
| Skill | `~/.claude/skills/<name>/SKILL.md` | `.claude/skills/<name>/SKILL.md` |
| Subagent | `~/.claude/agents/<name>.md` | `.claude/agents/<name>.md` |

Avoid the `collie-` prefix for your own names, so they never shadow or get confused with Collie's.

### Tool names

Claude Code names MCP tools `mcp__<server>__<tool>`. For a server that comes from a plugin, the server part includes the plugin:

| How the server is installed | Name of `review_get` |
|---|---|
| The `collie` plugin | `mcp__plugin_collie_collie__review_get` |
| Added by hand as a server named `collie` | `mcp__collie__review_get` |

Run `/mcp` in Claude Code to see the names in your setup. Other clients name tools in their own way; check your client's documentation. The tool names after the prefix are listed in the [tools reference](tools-reference.md).

### Example skill

`.claude/skills/screening-digest/SKILL.md`:

```markdown
---
name: screening-digest
description: Use when the user asks where screening stands in a Collie review, how many AI suggestions are waiting, or what to screen next.
---

# Screening digest

1. Call `collie_connection_status`. If it is not connected, ask whether to connect, and call `collie_connect` only if the user says yes.
2. Call `review_list` and pick the review the user names (ask if unsure).
3. Call `review_get` for screening progress and `ai_suggestions_list` with status `pending`.
4. Reply in five lines or fewer: decided / total, include, maybe, exclude, AI suggestions waiting.

Read only. Never call `screening_decide`, `ai_suggest` or any other tool that writes.
```

### Example subagent

`.claude/agents/duplicate-checker.md`:

```markdown
---
name: duplicate-checker
description: Reviews the unresolved duplicate groups of a Collie review and writes one verdict per group for the human to apply in Collie › Duplicates. Use after an import, before screening.
model: sonnet
tools: mcp__plugin_collie_collie__collie_guide, mcp__plugin_collie_collie__duplicates_list, mcp__plugin_collie_collie__record_get, mcp__plugin_collie_collie__duplicates_suggest
---

You check duplicate groups in a Collie review.

1. Call `collie_guide` with name `collie-workflow` and follow its hard rules.
2. Call `duplicates_list` for the review. For each group, compare the records with `record_get` when the signals do not settle it.
3. Write one verdict per group with `duplicates_suggest`: `duplicate` (with `keep_id`), `not_duplicate` or `unsure`, and a one or two sentence reason.
4. Never resolve a group yourself. Report how many verdicts you wrote and which groups were `unsure`.
```

Tips:

- Keep `tools` to what the job needs. Leave out write tools for a read-only helper.
- Point the agent at a Collie guide (`collie-workflow` carries the hard rules) instead of restating Collie's method.
- Prefer suggestion tools (`ai_suggest`, `ai_extraction_put`, `duplicates_suggest`, `rob_assess`) over tools that record decisions.
