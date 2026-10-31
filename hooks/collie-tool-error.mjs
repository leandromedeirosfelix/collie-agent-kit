#!/usr/bin/env node
// PostToolUse / PostToolUseFailure on Collie's MCP tools: counts calls and errors in the local feedback log (feedback.mjs)
// for the "tool errors per 100 calls" metric. Stores the tool name, the stage and an HTTP status at most — never the
// arguments, the result or the error message. Prints nothing and always exits 0.
import { record } from "./feedback.mjs";

/** hooks.json matcher for this hook (kept equal by a test). */
export const MATCHER = "mcp__.*(collie|msr).*__.*";

const STAGE = [
  [/^(protocol|criteria|viability|explore|mesh)_/, "protocol"],
  [/^(search|citation)_/, "search"],
  [/^duplicates_/, "dedup"],
  [/^(ai_extraction|extraction|outcome_data)_|^table1_get$/, "extraction"],
  [/^rob_/, "rob"],
  [/^(outcome_analyze|analysis_run|nma_)/, "analysis"],
  [/^grade_/, "grade"],
  [/^checklist_/, "prisma"],
  [/^paper_/, "manuscript"],
];

export function stageOf(tool, input) {
  if (/^(screening_|ai_screen_run|ai_suggest)/.test(tool)) {
    return input?.phase === "full_text" || input?.stage === "full_text" ? "screening-ft" : "screening-ta";
  }
  return STAGE.find(([re]) => re.test(tool))?.[1] ?? "other";
}

const text = (r) =>
  typeof r === "string" ? r : Array.isArray(r) ? r.map(text).join(" ") : Array.isArray(r?.content) ? text(r.content) : (r?.text ?? "");

/** The feedback events for one hook input: always a tool_call, plus a tool_error when the call failed. */
export function events(input) {
  const full = typeof input?.tool_name === "string" ? input.tool_name : "";
  if (!new RegExp(`^(?:${MATCHER})$`).test(full)) return [];
  const tool = full.split("__").pop();
  const stage = stageOf(tool, input.tool_input);
  const out = [{ type: "tool_call", source: "collie-mcp", ref: tool, stage }];
  const failed = input.hook_event_name === "PostToolUseFailure" || input.tool_response?.isError === true;
  if (failed) {
    // Only a status labelled as such: "Only 450 articles matched" must not become http-450 (or put a number in the log).
    const body = text(input.error ?? input.tool_response);
    // Governance refusals are Collie working as designed, not tool failures: counted apart (code only, never the message).
    const refusal = /\b(human_decision_required|agent_drafts_only|reviewer_phase_forbidden|token_expired)\b/.exec(body)?.[1];
    const status = /\b(?:HTTP|status(?: code)?)[ :=]*([45]\d\d)\b/i.exec(body)?.[1];
    const kind = refusal ? (refusal === "token_expired" ? "expired" : "refused") : status ? `http-${status}` : "error";
    out.push({ type: "tool_error", source: "collie-mcp", ref: `${tool}:${kind}`, stage });
  }
  return out;
}

if (typeof process !== "undefined" && /collie-tool-error\.mjs$/.test(process.argv?.[1] ?? "")) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      for (const e of events(JSON.parse(raw))) record(e);
    } catch {
      // unreadable payload: nothing to count
    }
  });
}
