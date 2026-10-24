# Manual install (MCP clients)

Every client below runs the same server:

```text
npx -y github:leandromedeirosfelix/collie-agent-kit
```

You need Node.js 20 or newer, and `npx` on the PATH your client starts from. After you edit a config, restart the client and ask the agent: *"Connect to Collie."* It shows a link and a code; sign in at [app.colliesr.com/connect](https://app.colliesr.com/connect) and type the code to approve.

Outside Claude Code you get the MCP server only: no skills, subagents, hooks or pane. The agent still loads Collie's instructions for each stage through the `collie_guide` tool.

## Claude Desktop

Open Settings › Developer › Edit Config. The file is:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "collie": {
      "command": "npx",
      "args": ["-y", "github:leandromedeirosfelix/collie-agent-kit"]
    }
  }
}
```

If the file already has `mcpServers`, add the `collie` entry inside it. Quit Claude Desktop completely and open it again. Logs: `~/Library/Logs/Claude` (macOS) or `%APPDATA%\Claude\logs` (Windows), file `mcp-server-collie.log`.

## Codex

Codex reads `~/.codex/config.toml`, shared by the CLI, the app and the IDE extension:

```toml
[mcp_servers.collie]
command = "npx"
args = ["-y", "github:leandromedeirosfelix/collie-agent-kit"]
startup_timeout_sec = 60
tool_timeout_sec = 300
```

Or from a terminal:

```text
codex mcp add collie -- npx -y github:leandromedeirosfelix/collie-agent-kit
```

`codex mcp add` uses Codex's default timeouts (10 s to start, 60 s per tool call). The first start downloads the kit and an analysis can take a few minutes, so set the two timeouts above in `config.toml`. `codex mcp list` shows configured servers.

## Gemini CLI

User settings: `~/.gemini/settings.json`. Project settings: `.gemini/settings.json`.

```json
{
  "mcpServers": {
    "collie": {
      "command": "npx",
      "args": ["-y", "github:leandromedeirosfelix/collie-agent-kit"]
    }
  }
}
```

Gemini CLI asks before each tool call unless you set `"trust": true`. Leave it off.

## Cursor

All projects: `~/.cursor/mcp.json`. One project: `.cursor/mcp.json` in the project root.

```json
{
  "mcpServers": {
    "collie": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:leandromedeirosfelix/collie-agent-kit"]
    }
  }
}
```

## Perplexity (Mac app)

Perplexity runs local MCP servers in its Mac app only.

1. Open **Plugins** in the sidebar and install the helper app **PerplexityXPC**.
2. **Plugins › Add custom › Simple**. Server name: `collie`. Command: `npx -y github:leandromedeirosfelix/collie-agent-kit`.
3. Save, open the connector under **Plugins › Installed** and wait until it shows *Running*.
4. On the Perplexity home page, turn on `collie` under **Sources**.

## Any other stdio client

| Field | Value |
|---|---|
| Command | `npx` |
| Arguments | `-y`, `github:leandromedeirosfelix/collie-agent-kit` |
| Transport | stdio |

## Windows

Some clients cannot start `npx` directly on Windows (it is a `.cmd` script). Wrap it in `cmd /c`:

```json
{
  "mcpServers": {
    "collie": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "github:leandromedeirosfelix/collie-agent-kit"]
    }
  }
}
```

The same change works in the TOML of Codex: `command = "cmd"` and `args = ["/c", "npx", "-y", "github:leandromedeirosfelix/collie-agent-kit"]`.

## Environment variables

Set them in the `env` block of your client's entry (`"env": { "MSR_TOKEN": "..." }` in JSON, a `[mcp_servers.collie.env]` table in Codex).

| Variable | Default | Use |
|---|---|---|
| `MSR_TOKEN` | none | A personal access token from Collie › Settings › AI agents (MCP). It replaces the code sign-in and wins over a saved connection. Keep it out of shared or committed config files. |
| `MSR_URL` | `https://app.colliesr.com` | The Collie address. Leave it unset. |
| `COLLIE_TOKEN_FILE` | see [security](security.md) | Where the code sign-in saves its token. |

## Teach the agent the workflow

Clients without plugins still get Collie's method: the agent calls `collie_guide` (name `collie-workflow`) before review work, as the server's instructions tell it to. To make that explicit, add one line to your client's project rules (`AGENTS.md` for Codex, `GEMINI.md` for Gemini CLI, `.cursor/rules` for Cursor):

```text
For Collie reviews, call collie_guide with name "collie-workflow" first and follow it.
```
