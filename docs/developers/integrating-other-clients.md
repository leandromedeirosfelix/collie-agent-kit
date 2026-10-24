# Integrating other clients

The Collie MCP server is a standard stdio MCP server. Any MCP client can start it, and so can your own code through an MCP SDK.

For ready-made configs (Claude Desktop, Codex, Gemini CLI, Cursor, Perplexity), see [install-manual.md](../install-manual.md).

## The server contract

| Item | Value |
|---|---|
| Command | `npx -y github:leandromedeirosfelix/collie-agent-kit` (or `node server/collie-mcp.mjs` from a clone) |
| Transport | stdio |
| Requirements | Node.js 20 or newer; Git, for `npx` to fetch the `github:` package |
| Environment | `MSR_TOKEN` (optional personal access token), `MSR_URL` (optional, default `https://app.colliesr.com`), `COLLIE_TOKEN_FILE` (optional token path) |
| Capabilities | Tools, with MCP annotations, and server `instructions` |
| Tool results | One text block. Successful results hold JSON (or markdown, for `collie_guide` and protocol exports). Errors set `isError` and explain the next step in plain text. |

Things to get right in any client:

- **Pass the instructions to the model.** The server's `instructions` hold Collie's connection steps and hard rules. Most clients do this already.
- **Allow long tool calls.** An R analysis can take a few minutes; the server waits up to 4 minutes for Collie. Use a tool timeout of at least 300 seconds.
- **Allow a slow first start.** The first `npx` run downloads the kit. Use a startup timeout of about 60 seconds.
- **Show the connect message.** `collie_connect` returns a link and a code that the user must see to approve the agent.
- **Pass the environment you need.** SDK stdio transports start the server with a small set of inherited variables (such as `PATH`, `HOME` or `APPDATA`). Pass `MSR_TOKEN`, `MSR_URL`, `COLLIE_TOKEN_FILE` or `XDG_CONFIG_HOME` explicitly when you use them.

## From JavaScript or TypeScript

With the official TypeScript SDK, v1 (`npm install @modelcontextprotocol/sdk`). Save as `collie-demo.mjs` and run `node collie-demo.mjs`:

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "github:leandromedeirosfelix/collie-agent-kit"],
  // env: { MSR_TOKEN: process.env.MSR_TOKEN ?? "" }, // only when you use a personal access token
});
const client = new Client({ name: "my-collie-script", version: "1.0.0" });
await client.connect(transport); // starts the server

const text = (result) => result.content.find((block) => block.type === "text")?.text ?? "";

const status = JSON.parse(text(await client.callTool({ name: "collie_connection_status", arguments: {} })));
if (!status.connected) {
  console.log("Not connected. Set MSR_TOKEN, or connect once from an AI client with collie_connect.");
} else {
  const reviews = await client.callTool({ name: "review_list", arguments: {} });
  if (reviews.isError) throw new Error(text(reviews));
  for (const review of JSON.parse(text(reviews))) console.log(review.id, review.title);
}

await client.close(); // stops the server
```

Notes:

- The SDK starts the command with `cross-spawn`, so `npx` works on Windows too.
- The `env` you pass is added to the SDK's default inherited variables.
- When the user is not connected, `collie_connection_status` answers with `connected: false` and a `state`, as described in [authentication](authentication.md#connect-with-a-code).
- `client.listTools()` returns every tool with its input schema; the [tools reference](tools-reference.md) is generated from the same answer.

## From Python

With the official Python SDK, version 2 (`pip install mcp`):

```python
import json

import anyio
from mcp import Client, StdioServerParameters
from mcp.types import TextContent

server = StdioServerParameters(
    command="npx",
    args=["-y", "github:leandromedeirosfelix/collie-agent-kit"],
    # env={"MSR_TOKEN": "..."},  # only when you use a personal access token
)


def text(result) -> str:
    return next((block.text for block in result.content if isinstance(block, TextContent)), "")


async def main() -> None:
    async with Client(server) as client:  # starts the server; leaving the block stops it
        status = json.loads(text(await client.call_tool("collie_connection_status", {})))
        if not status["connected"]:
            print("Not connected. Set MSR_TOKEN, or connect once from an AI client with collie_connect.")
            return
        reviews = await client.call_tool("review_list", {})
        if reviews.is_error:
            raise RuntimeError(text(reviews))
        for review in json.loads(text(reviews)):
            print(review["id"], review["title"])


anyio.run(main)
```

Notes:

- The child process does not inherit your whole environment. Values in `env` are added to the SDK's small default set.
- With version 1 of the Python SDK (`mcp<2`), use `stdio_client` and `ClientSession` from that version's documentation instead of `Client`.

## Connecting from code

Scripts usually run without a person watching, so prefer one of these:

- **A personal access token** in `MSR_TOKEN`, created in Collie › Settings › AI agents (MCP). Use a read token when the script only reads, and keep the token in a secret store, not in code.
- **The saved connection.** Connect once from an AI client on the same computer with `collie_connect`; the script's server picks up the saved `token.json` for the same Collie address.

A script can also call `collie_connect` itself and show the returned `url` and `user_code` to a person, then wait with `collie_connection_status` and `wait_seconds` (up to 120). The person still has to type the code in Collie.

## Good citizenship

- Respect `rate_limited` errors and wait the number of seconds they give; do not retry in a loop.
- Follow Collie's rule **AI suggests, humans decide**: write suggestions and drafts (`ai_suggest`, `ai_extraction_put`, `duplicates_suggest`, `rob_assess`), not decisions. Call `screening_decide` only for an account set up as a separate reviewer.
- Load the method with `collie_guide` (for example `collie-workflow`) before automated review work.
