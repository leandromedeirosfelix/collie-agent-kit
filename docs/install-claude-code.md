# Install in Claude Code

The Claude Code plugin bundles the Collie MCP server with skills, subagents, hooks and the live Collie pane. You need a Collie account (any plan, Free included) and Node.js 20 or newer.

## 1. Add the marketplace and install

In Claude Code:

```text
/plugin marketplace add leandromedeirosfelix/collie-agent-kit
/plugin install collie@collie-agent-kit
```

Restart Claude Code so the MCP server and hooks load.

## 2. Connect your Collie account

Ask the agent: *"Connect to Collie."*

1. The agent calls `collie_connect` and shows a link and a short code in one line. It may open the link in your browser.
2. Sign in at [app.colliesr.com/connect](https://app.colliesr.com/connect).
3. Type the code the agent showed you, then approve. A link alone never approves an agent: the code has to come from your own screen.
4. The agent checks with `collie_connection_status` and continues.

The token is saved on your computer, so you connect once per computer. Other Claude Code sessions pick it up.

Prefer a token you manage yourself? Create one in Collie › Settings › AI agents (MCP) and set `MSR_TOKEN` in the environment Claude Code starts from. It wins over the saved connection.

## 3. Open the Collie pane

Type `/collie`. The pane shows:

- the Collie header and whether you are connected;
- the active review (the one your agent last worked on, else your newest open review) with each stage: imported, duplicates, screening, full text, extraction, risk of bias, analysis, PRISMA, with progress bars where a stage has a total;
- AI suggestions waiting for your decision;
- your agent's last 15 Collie calls, each marked `ok`, `error`, `denied` or `running`;
- a link to app.colliesr.com.

The status line shows `Collie · <review> · screening 120/450`. The pane reads counts and titles only, refreshes after your agent's Collie calls and every 45 seconds while it is open, and never changes or blocks a call. On the desktop app it draws the Collie mark; in the terminal it draws the mark where the terminal can show images (kitty, Ghostty, iTerm2) and text elsewhere.

## 4. Start working

Ask *"Use collie-workflow: where is my review and what's next?"* The `collie-workflow` skill reads your review and routes each stage to the right skill or subagent.

## What the hooks do

| Hook | When | What |
|---|---|---|
| Session check | Session start | Tells the agent whether Collie is connected and whether R is installed locally. |
| Human decides | Before `screening_decide` | Asks you before the agent casts a real screening vote. Set `MSR_AGENT_DECISIONS=deny` to block these votes, or `allow` if the agent signs in as its own separate reviewer account. |
| R install guard | Before a shell command | Asks you before any command that installs R packages. |
| R syntax check | After the agent edits a `.R` file | Reports R syntax errors. Needs R on this computer (set `MSR_RSCRIPT` if `Rscript` is not found); does nothing without it. |

Collie runs meta-analyses on its own R. Local R is optional.

## Update and remove

```text
/plugin marketplace update collie-agent-kit
/plugin uninstall collie@collie-agent-kit
/plugin marketplace remove collie-agent-kit
```

Restart Claude Code after an update.
