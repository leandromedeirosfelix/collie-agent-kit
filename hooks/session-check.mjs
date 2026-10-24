#!/usr/bin/env node
// SessionStart: tell Claude whether the Collie server, token and R are usable, so it doesn't call tools blindly.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findRscript } from "./rscript.mjs";

const url = (process.env.MSR_URL || "https://app.colliesr.com").replace(/\/$/, "");
// Same cache the MCP server's collie_connect writes. Never printed.
const TOKEN_FILE =
  process.env.COLLIE_TOKEN_FILE ??
  (process.platform === "win32"
    ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "collie", "token.json")
    : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "collie", "token.json"));
function cachedToken() {
  try {
    const c = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
    return c.url === url ? c.token : "";
  } catch {
    return "";
  }
}
const token = process.env.MSR_TOKEN || cachedToken();
const NOT_CONNECTED =
  "Collie: not connected — when the user wants to work in Collie, call collie_connect; the user signs in and types the code it shows to approve. Don't bring it up otherwise.";
const say = (text) => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } }));

function rStatus() {
  const rscript = findRscript();
  const r = spawnSync(rscript, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 4000 });
  if (r.error || r.status !== 0)
    return "R: not found on this computer. Collie runs meta-analyses on its own R; local R is only used to syntax-check .R files (set MSR_RSCRIPT if R is installed elsewhere). Never install R packages without asking.";
  const version = `${r.stdout}${r.stderr}`.match(/version\s+([\d.]+)/i)?.[1] ?? "?";
  return `R ${version}: ${rscript}. Never install R packages without asking.`;
}

const rules = "AI suggests, humans decide — use ai_suggest / ai_extraction_put / rob_assess drafts, not screening_decide. Start with the collie-workflow skill.";

async function collieStatus() {
  if (!token) return NOT_CONNECTED;
  try {
    const r = await fetch(`${url}/api/auth/me`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) });
    if (r.status === 401 && !process.env.MSR_TOKEN) return NOT_CONNECTED; // saved connection was revoked
    if (!r.ok) return `Collie plugin: ${url} rejected MSR_TOKEN (HTTP ${r.status}) — unset it and use collie_connect, or create a new token in Collie › Settings › AI agents (MCP).`;
    const me = await r.json();
    return `Collie plugin: connected to ${url} as ${me.name}.`;
  } catch {
    return `Collie plugin: Collie is not reachable at ${url}${/127\.0\.0\.1|localhost/.test(url) ? " — is the Collie server running?" : " — check the internet connection"}.`;
  }
}

say([await collieStatus(), rStatus(), rules].join("\n"));
