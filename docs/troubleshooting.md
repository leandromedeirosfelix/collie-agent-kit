# Troubleshooting

## The agent says it is not connected

Ask it to connect to Collie. It calls `collie_connect` and shows a link and a code. Sign in at [app.colliesr.com/connect](https://app.colliesr.com/connect) and type the code. Opening the link is not enough: the approval needs the code.

## The code expired, or approval was denied

Ask the agent to run `collie_connect` again for a new code.

## It worked before and now says "no longer valid"

The token was revoked in Collie › Settings › AI agents (MCP), or it expired. The server forgets it by itself. Ask the agent to run `collie_connect` again.

If you set `MSR_TOKEN` yourself, the server keeps using it: create a new token and update the variable, or remove the variable and use the code sign-in.

## `token_read_only`

The token can only read. Use `collie_connect` (it issues a token that can write), or create a write token in Collie › Settings › AI agents (MCP).

## `token_cannot_delete`

Expected. No token can delete anything in Collie. Delete in the web app.

## Rate limits (`rate_limited`)

Collie asked the agent to slow down. The error says how many seconds to wait; the agent should wait, not retry in a loop.

## `npx` not found, or the server does not start

- Check `node --version` (20 or newer) and `npx --version` in a terminal.
- Restart the client after installing Node.js, so it sees the new PATH. Desktop apps on macOS may not see a PATH set only in your shell profile; use the full path to `npx` (`which npx`) as the command.
- On Windows, use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "github:leandromedeirosfelix/collie-agent-kit"]`.
- Run the command by hand to see the error: `npx -y github:leandromedeirosfelix/collie-agent-kit`. It waits silently for an MCP client; stop it with Ctrl+C.
- npm fetches `github:` packages with Git. If the error mentions `git`, install [Git](https://git-scm.com) and try again.

## The first start times out

The first run downloads the kit. Start it once by hand (above), or raise the client's startup timeout (Codex: `startup_timeout_sec = 60`).

## Long analyses time out

A meta-analysis can take a few minutes. Raise the client's tool timeout (Codex: `tool_timeout_sec = 300`). The server itself waits up to 4 minutes for Collie.

## "Collie is not reachable"

Check your internet connection and that [app.colliesr.com](https://app.colliesr.com) opens in a browser. If you set `MSR_URL`, remove it.

## Corporate proxy

Two programs need to get out:

- **npm / npx** downloads the kit from GitHub. Configure npm's proxy: `npm config set proxy http://proxy:port` and `npm config set https-proxy http://proxy:port`.
- **The Collie server** connects to `https://app.colliesr.com` with Node.js's built-in `fetch`, which does not read `HTTPS_PROXY` by default. Recent Node.js releases use it when `NODE_USE_ENV_PROXY=1` is also set; check the documentation of your Node.js version. Add both to the client's `env` block.

Your network must allow HTTPS to `github.com`, `codeload.github.com` and `app.colliesr.com`.

## An old version keeps running

- Claude Code: `/plugin marketplace update collie-agent-kit`, then restart.
- Other clients: npx keeps a cache. Run `npm cache clean --force`, then restart the client.

## The `/collie` pane shows no picture

The terminal draws the Collie mark only where it can show images (kitty, Ghostty, iTerm2 3.5+ in fullscreen rendering); elsewhere the header is text. Everything else in the pane is the same.

## Still stuck

Write to [contact@colliesr.com](mailto:contact@colliesr.com) with your client name and version, your OS, `node --version`, and the error text. Never send your token.
