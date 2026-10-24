#!/usr/bin/env node
// Regenerates docs/developers/tools-reference.md from the bundled server's own tools/list answer. No dependencies.
// Usage: node scripts/gen-tools-reference.mjs           write the page
//        node scripts/gen-tools-reference.mjs --check   exit 1 if the page is out of date
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = join(ROOT, "server", "collie-mcp.mjs");
const OUT = join(ROOT, "docs", "developers", "tools-reference.md");
const TIMEOUT_MS = 20_000;

// Review stages in workflow order. A tool not listed here lands in "Other", so a new tool is never dropped.
const GROUPS = [
  ["Connection and setup", ["collie_connection_status", "collie_connect", "collie_disconnect", "collie_setup"]],
  [
    "Reviews, protocol and criteria",
    ["review_list", "review_get", "viability_check", "protocol_get", "protocol_set", "criteria_get", "criteria_set", "audit_log"],
  ],
  ["Search", ["search_build", "search_count", "search_validate", "search_import", "mesh_suggest"]],
  ["Explore and citations", ["explore_search", "citation_graph", "citation_import", "explore_ideas_get", "explore_idea_save"]],
  ["Duplicates", ["duplicates_list", "duplicates_suggest"]],
  [
    "Screening",
    [
      "records_search",
      "record_get",
      "screening_queue",
      "exclusion_reasons",
      "ai_status",
      "ai_suggest",
      "ai_suggestions_list",
      "ai_screen_run",
      "relevance_compute",
      "ask_data",
      "screening_decide",
    ],
  ],
  ["Full text", ["pdf_text"]],
  [
    "Data extraction",
    [
      "extraction_questions_get",
      "ai_extraction_put",
      "ai_extraction_table",
      "studies_list",
      "table1_get",
      "outcomes_list",
      "outcome_data_get",
      "outcome_data_put",
    ],
  ],
  ["Risk of bias", ["rob_tools", "rob_assess", "rob_summary", "rob_plots"]],
  ["Analysis", ["outcome_analyze", "analysis_run"]],
  ["GRADE", ["grade_get", "grade_set"]],
  ["PRISMA", ["checklist_get"]],
  ["Help and guides", ["collie_guide", "help_search"]],
];

/** Starts the bundled server over stdio, runs initialize + tools/list, and stops it. */
function listTools() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
    const fail = (error) => {
      clearTimeout(timer);
      child.kill();
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("the server did not answer tools/list in time")), TIMEOUT_MS);
    const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
    let buffer = "";
    let serverInfo = null;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          return fail(new Error(`the server wrote something that is not JSON-RPC: ${line.slice(0, 120)}`));
        }
        if (message.error) return fail(new Error(`the server answered an error: ${message.error.message}`));
        if (message.id === 1) {
          serverInfo = message.result.serverInfo;
          send({ method: "notifications/initialized" });
          send({ id: 2, method: "tools/list", params: {} });
        } else if (message.id === 2) {
          // shortcut: reads one tools/list page; follow nextCursor if the server ever paginates.
          if (message.result.nextCursor) return fail(new Error("tools/list is paginated: teach this script nextCursor"));
          clearTimeout(timer);
          child.kill();
          resolve({ serverInfo, tools: message.result.tools });
        }
      }
    });
    child.on("error", fail);
    child.on("exit", (code) => fail(new Error(`the server exited (code ${code}) before answering`))); // no-op once resolved
    send({
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "gen-tools-reference", version: "1.0.0" } },
    });
  });
}

const code = (value) => `\`${value}\``;
const cell = (text) => String(text).replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
const slug = (heading) =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, "")
    .replace(/ /g, "-");

/** Follows a local JSON pointer ($ref "#/properties/x"), which converters emit for a schema reused inside one tool. */
function deref(root, schema = {}) {
  if (typeof schema.$ref !== "string" || !schema.$ref.startsWith("#")) return schema;
  const target = schema.$ref
    .slice(1)
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((node, key) => node?.[key], root);
  const { $ref, ...rest } = schema;
  return { ...deref(root, target), ...rest };
}

function typeOf(root, raw) {
  const s = deref(root, raw);
  if (s.enum) return s.enum.map(code).join(" | ");
  if (s.const !== undefined) return code(s.const);
  const alternatives = s.anyOf ?? s.oneOf;
  if (alternatives) return alternatives.map((alt) => typeOf(root, alt)).join(" or ");
  return []
    .concat(s.type ?? "any")
    .map((type) => {
      if (type === "array") return `array of ${typeOf(root, s.items)}`;
      if (type === "object" && !s.properties && typeof s.additionalProperties === "object") {
        return `object of ${typeOf(root, s.additionalProperties)}`;
      }
      return type;
    })
    .join(" or ");
}

function limit(label, low, high) {
  const bits = [low !== undefined && `min ${low}`, high !== undefined && `max ${high}`].filter(Boolean);
  return bits.length ? `${label} ${bits.join(", ")}.` : null;
}

function notes(root, raw) {
  const s = deref(root, raw);
  return [
    s.description,
    limit("Value", s.minimum, s.maximum),
    typeof s.exclusiveMinimum === "number" ? `Value above ${s.exclusiveMinimum}.` : null,
    limit("Length", s.minLength, s.maxLength),
    limit("Items", s.minItems, s.maxItems),
    s.pattern ? `Pattern ${code(s.pattern)}.` : null,
    s.default !== undefined ? `Default ${code(JSON.stringify(s.default))}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** One row per parameter; fields of object parameters (and of arrays of objects) follow as dotted rows. */
function rows(root, raw, prefix = "") {
  const schema = deref(root, raw);
  const required = schema.required ?? [];
  return Object.entries(schema.properties ?? {}).flatMap(([name, property]) => {
    const s = deref(root, property);
    const path = `${prefix}${name}`;
    const row = `| ${code(path)} | ${cell(typeOf(root, s))} | ${required.includes(name) ? "yes" : "no"} | ${cell(notes(root, s))} |`;
    const inner = s.type === "array" ? deref(root, s.items) : s;
    return inner?.properties ? [row, ...rows(root, inner, `${path}${s.type === "array" ? "[]" : ""}.`)] : [row];
  });
}

function access(annotations) {
  if (!annotations || typeof annotations.readOnlyHint !== "boolean") return "see description";
  const bits = [annotations.readOnlyHint ? "read" : "write"];
  if (!annotations.readOnlyHint && annotations.destructiveHint) bits.push("may replace");
  if (annotations.openWorldHint) bits.push("external");
  return bits.join(", ");
}

function renderTool(tool) {
  const schema = tool.inputSchema ?? {};
  const params = rows(schema, schema);
  const title = tool.title ?? tool.annotations?.title;
  return [
    `### ${code(tool.name)}`,
    "",
    `${title ? `**${title}** · ` : ""}Access: ${access(tool.annotations)}`,
    "",
    (tool.description ?? "").replace(/\s*\n\s*/g, " "),
    "",
    ...(params.length
      ? ["| Parameter | Type | Required | Notes |", "|---|---|---|---|", ...params]
      : ["No parameters."]),
    "",
  ];
}

function render({ serverInfo, tools }) {
  const grouped = new Set(GROUPS.flatMap(([, names]) => names));
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const other = tools.map((tool) => tool.name).filter((name) => !grouped.has(name)).sort();
  const sections = [...GROUPS, ["Other", other]]
    .map(([group, names]) => [group, names.filter((name) => byName.has(name)).map((name) => byName.get(name))])
    .filter(([, list]) => list.length);
  const version = serverInfo?.version ? ` ${serverInfo.version}` : "";
  return [
    "<!-- Generated by scripts/gen-tools-reference.mjs from server/collie-mcp.mjs. Do not edit by hand. -->",
    "",
    "# Tools reference",
    "",
    `The Collie MCP server (\`${serverInfo?.name ?? "collie"}\`${version}) exposes **${tools.length} tools**. This page is generated from the server's own \`tools/list\` answer, so it matches the bundle in this repository. Regenerate it with \`node scripts/gen-tools-reference.mjs\`.`,
    "",
    "**Access** comes from each tool's MCP annotations:",
    "",
    "- **read**: changes nothing in Collie (`readOnlyHint`).",
    "- **write**: saves something in Collie. **may replace**: calling it again replaces what it saved before (`destructiveHint`). No tool deletes anything in Collie.",
    "- **external**: reaches sources outside Collie, such as PubMed or OpenAlex (`openWorldHint`).",
    "",
    "A read token can only call tools that do not send data to Collie. Some read tools send a query (for example `search_count`, `explore_search`, `ask_data`) and answer `token_read_only` to a read token. See [authentication](authentication.md#token-scopes).",
    "",
    "Tool names here are the server's names. Clients add a prefix: in the Claude Code plugin, `review_get` is `mcp__plugin_collie_collie__review_get`.",
    "",
    "## Contents",
    "",
    "| Stage | Tools |",
    "|---|---|",
    ...sections.map(([group, list]) => `| [${group}](#${slug(group)}) | ${list.map((tool) => `[${code(tool.name)}](#${slug(tool.name)})`).join(", ")} |`),
    "",
    ...sections.flatMap(([group, list]) => [`## ${group}`, "", ...list.flatMap(renderTool)]),
  ].join("\n");
}

const page = render(await listTools());
if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
  if (current !== page) {
    console.error("docs/developers/tools-reference.md is out of date: run node scripts/gen-tools-reference.mjs");
    process.exit(1);
  }
  console.log("docs/developers/tools-reference.md is up to date.");
} else {
  writeFileSync(OUT, page);
  console.log(`Wrote docs/developers/tools-reference.md (${page.split("\n").length} lines).`);
}
