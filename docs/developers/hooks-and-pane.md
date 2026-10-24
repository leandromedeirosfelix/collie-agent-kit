# Hooks and the Collie pane

The Claude Code plugin adds four command hooks and one pane module, all declared in [`hooks/hooks.json`](../../hooks/hooks.json). Other clients do not run them.

## Command hooks

Each hook is a small Node.js script with no dependencies. Claude Code runs it, passes the event as JSON on stdin, and reads the decision from stdout.

| Hook | Event and matcher | Script | What it guards |
|---|---|---|---|
| Session check | `SessionStart` (`startup`, `resume`) | `session-check.mjs` | Tells the agent at the start of a session whether Collie is connected, whether local R is installed, and Collie's rule to suggest rather than decide. |
| Human decides | `PreToolUse` on `mcp__.*(collie\|msr).*__screening_decide` | `human-decides.mjs` | `screening_decide` records a real reviewer vote. The hook asks you before each one and points the agent at `ai_suggest`. |
| R install guard | `PreToolUse` on `Bash` | `guard-r-install.mjs` | Asks you before any shell command that installs R packages (`install.packages`, `remotes::install_*`, `devtools::install`, `pak`, `BiocManager::install`, `renv` install/restore/update, `R CMD INSTALL`). |
| R syntax check | `PostToolUse` on `Write\|Edit\|MultiEdit` | `check-r-syntax.mjs` | Parses each edited `.R` file with local R and reports syntax errors to the agent. Does nothing without R. |

Details:

- **Session check** reads the token the same way the server does (`MSR_TOKEN`, else the saved `token.json` for the same Collie address), makes one request to Collie with a 4 second timeout, and never prints the token. It adds one short context message; it never blocks the session.
- **Human decides** never blocks other tools. Its decision depends on `MSR_AGENT_DECISIONS`.
- **R install guard** only asks; it never runs or changes the command.
- **R syntax check** exits with code 2 on a parse error, which feeds the error back to the agent. `hooks/rscript.mjs` finds R: `MSR_RSCRIPT`, `MA_RSCRIPT` or `RSCRIPT_PATH`, then the newest R under `C:\Program Files\R` on Windows, then `Rscript` on the `PATH`.

### Settings

| Variable | Values | Effect |
|---|---|---|
| `MSR_AGENT_DECISIONS` | `ask` (default) | Ask before every `screening_decide`. |
| | `deny` | Block every `screening_decide`. |
| | `allow` | Let `screening_decide` through. Use it only when the agent signs in as its own, separate reviewer account. |
| `MSR_RSCRIPT` | Path to `Rscript` | The R used by the session check and the syntax check. |

Set them in the environment Claude Code starts from.

## The `/collie` pane

`hooks/live/index.tsx` is a Claude Code plugin module (listed under `modules` in `hooks.json`). It shows what your agent does in Collie and the state of the active review, and sets the status line, for example `Collie · <review> · screening 120/450`.

### Events it uses

| Event | What the module does |
|---|---|
| `session.start` | Registers the `/collie` command, starts a 45 second timer, and refreshes the status line once. |
| `command.run` (`collie`) | Opens the pane and refreshes it. |
| `tool.check` (Collie tools) | Allows the pane's own reads without a prompt, only when the call comes from this plugin and the tool is one of the five read-only tools below. Every other call goes through Claude Code's normal permission check. |
| `tool.call` (Collie tools) | Records the agent's call in the activity feed (`running`, then `ok`, `error` or `denied`), remembers its `review_id`, and schedules a refresh. It returns the call's result untouched. |
| `ui.render` (the pane) | Draws the header, connection, review stages, AI suggestions waiting, the last 15 calls, a Refresh button and a link to Collie. |

The module only watches. It never changes, delays or blocks the agent's calls; if the module itself fails, the call goes on as if it were not there. The command hook, not the pane, is what gates `screening_decide`.

### What it reads

The pane calls five read-only Collie tools through the same MCP server:

| Tool | For |
|---|---|
| `collie_connection_status` | Connected, not connected or unreachable |
| `review_list` | The newest open review, when the agent has not used one yet |
| `review_get` | Imported records, duplicates, screening counts and stage counts |
| `ai_suggestions_list` (status `pending`) | AI suggestions waiting for your decision |
| `checklist_get` | PRISMA items done and total |

The active review is the one your agent last passed as `review_id`, else your newest review that is not archived. Stages that blind mode hides from your account show as hidden.

### Refresh policy

| Trigger | Refresh |
|---|---|
| Session start | Once, shortly after start, for the status line |
| After the agent's Collie calls | Once, 1.5 seconds after a burst of calls ends |
| While the pane is placed | Every 45 seconds |
| `/collie` or the Refresh button | Immediately |

Automatic refreshes read Collie at most once every 10 seconds, and only one read runs at a time. A failed read keeps the last picture.

### Privacy

- The pane keeps counts, titles, tool names, call statuses and times only. It never keeps record contents, people's names, e-mail addresses or tokens. The state contract is [`types/index.d.ts`](../../types/index.d.ts).
- For an error it keeps only the first line, cut to 120 characters.
- The state lives in Claude Code on your computer. The pane sends nothing anywhere except its reads to Collie through the MCP server.

## Disable or customise

| Goal | How |
|---|---|
| Turn everything off | Disable or uninstall the plugin with `/plugin`. |
| Change the screening vote guard | Set `MSR_AGENT_DECISIONS` (above). |
| Ask before other Collie writes | Add permission rules in your Claude Code settings, for example `"permissions": { "ask": ["mcp__plugin_collie_collie__criteria_set", "mcp__plugin_collie_collie__grade_set"] }`. |
| Block a Collie tool | Add it to `permissions.deny` the same way. |
| Remove one hook or the pane, or change refresh timings | Fork the kit and edit `hooks/hooks.json` or the constants at the top of `hooks/live/index.tsx` (`FEED_MAX`, `MIN_GAP_MS`, `AFTER_CALL_MS`, `TICK_MS`). Load your copy with `claude --plugin-dir <path>` while you test it. |
| Rename calls in the activity feed | Edit the `WORDS` map in `hooks/live/format.ts`. Unlisted tools show their name in plain words. |

Hook and pane improvements are welcome as pull requests; see [CONTRIBUTING.md](../../CONTRIBUTING.md).
