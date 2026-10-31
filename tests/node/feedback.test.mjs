// node --test "tests/node/*.test.mjs"
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { feedbackFile, readEvents, record, sanitize, summarize, MAX_BYTES } from "../../hooks/feedback.mjs";
import { events, MATCHER, stageOf } from "../../hooks/collie-tool-error.mjs";

const tmpEnv = () => ({ COLLIE_FEEDBACK_FILE: join(mkdtempSync(join(tmpdir(), "collie-fb-")), "events.jsonl") });
const NOW = new Date("2026-10-30T12:00:00.000Z");

test("sanitize keeps only the whitelisted, text-free fields", () => {
  const ev = sanitize(
    { type: "guide_gap", stage: "rob", source: "collie-rob-grade", ref: "robins-e", review_id: 6, n: 2, title: "secret", text: "x" },
    NOW,
  );
  assert.deepEqual(ev, { v: 1, ts: NOW.toISOString(), stage: "rob", source: "collie-rob-grade", type: "guide_gap", ref: "robins-e", review_id: 6, n: 2 });
});

test("sanitize refuses free text, unknown types and token-like refs", () => {
  assert.equal(sanitize({ type: "guide_gap", source: "x", ref: "Mortality was 12% in the arm" }), null);
  assert.equal(sanitize({ type: "made_up", source: "x", ref: "a" }), null);
  assert.equal(sanitize({ type: "tool_error", source: "x", ref: "a".repeat(81) }), null);
  assert.equal(sanitize({ type: "tool_error", source: "bad source", ref: "a" }), null);
  assert.equal(sanitize({ type: "tool_error", source: "x", ref: "a", stage: "nowhere" }).stage, "other");
  // guide gaps are typed by the agent: topic slugs only, no digits, no dotted sentences
  assert.equal(sanitize({ type: "guide_gap", source: "x", ref: "rr.0.82.in.smith.cohort" }), null);
  assert.equal(sanitize({ type: "guide_gap", source: "x", ref: "patient-123" }), null);
  assert.equal(sanitize({ type: "guide_gap", source: "x", ref: "cluster-rct-icc" }).ref, "cluster-rct-icc");
  assert.equal(sanitize({ type: "hook_warning_shown", source: "x", ref: "a", rule: "free-text-rule" }).rule, undefined);
});

test("the log stays in the local (non-roaming) folder; overrides must be .jsonl", () => {
  assert.equal(feedbackFile({ COLLIE_FEEDBACK_FILE: "C:/sync/notes.txt", LOCALAPPDATA: "L", XDG_STATE_HOME: "L" }).startsWith("L"), true);
  assert.equal(feedbackFile({ COLLIE_FEEDBACK_FILE: "C:/x/e.jsonl" }), "C:/x/e.jsonl");
  if (process.platform === "win32") assert.ok(!/Roaming/i.test(feedbackFile({ APPDATA: "C:/Users/u/AppData/Roaming", LOCALAPPDATA: "C:/Users/u/AppData/Local" })));
});

test("record appends JSONL, honours COLLIE_FEEDBACK=off and never throws", () => {
  const env = tmpEnv();
  assert.equal(record({ type: "tool_call", source: "collie-mcp", ref: "rob_assess", stage: "rob" }, { env, now: NOW }), true);
  assert.equal(record({ type: "tool_call", source: "collie-mcp", ref: "no text please" }, { env }), false);
  assert.equal(record({ type: "tool_call", source: "collie-mcp", ref: "x" }, { env: { ...env, COLLIE_FEEDBACK: "off" } }), false);
  const lines = readFileSync(env.COLLIE_FEEDBACK_FILE, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).ref, "rob_assess");
  assert.equal(record({ type: "tool_call", source: "a", ref: "b" }, { env: { COLLIE_FEEDBACK_FILE: "\0bad.jsonl" } }), false);
});

test("the log rotates past the size cap and readEvents reads both files", () => {
  const env = tmpEnv();
  writeFileSync(env.COLLIE_FEEDBACK_FILE, JSON.stringify(sanitize({ type: "tool_call", source: "a", ref: "old" }, NOW)) + "\n" + " ".repeat(MAX_BYTES));
  record({ type: "tool_call", source: "a", ref: "new" }, { env, now: NOW });
  assert.deepEqual(readEvents(env).map((e) => e.ref), ["old", "new"]);
});

test("summarize gives counts, dismiss rates and errors per 100 calls only", () => {
  const ev = (type, extra = {}) => ({ ...sanitize({ type, source: "check-manuscript", ref: "r", ...extra }, NOW) });
  const s = summarize([
    ev("hook_warning_shown", { rule: "missing" }),
    ev("hook_warning_shown", { rule: "missing" }),
    ev("hook_warning_dismissed", { rule: "missing" }),
    ...Array.from({ length: 4 }, () => ev("tool_call", { source: "collie-mcp" })),
    ev("tool_error", { source: "collie-mcp", ref: "rob_assess:http-409" }),
    ev("guide_gap", { source: "collie-rob-grade", ref: "robins-e" }),
    { ...ev("tool_call"), ts: "2026-01-01T00:00:00.000Z" },
  ], "2026-10-01");
  assert.equal(s.total, 9);
  assert.deepEqual(s.warnings["check-manuscript:missing"], { shown: 2, dismissed: 1, dismissRate: 0.5 });
  assert.equal(s.toolErrorsPer100, 25);
  assert.deepEqual(s.guideGaps, { "collie-rob-grade:robins-e": 1 });
});

test("the tool-error hook counts Collie calls and errors, nothing else", () => {
  assert.deepEqual(events({ tool_name: "Read" }), []);
  assert.deepEqual(events({ tool_name: "mcp__fetch__fetch" }), []);
  const ok = events({ tool_name: "mcp__plugin_collie_collie__rob_assess", tool_input: { review_id: 6 }, tool_response: { content: [] } });
  assert.deepEqual(ok, [{ type: "tool_call", source: "collie-mcp", ref: "rob_assess", stage: "rob" }]);
  const bad = events({
    tool_name: "mcp__collie__grade_set",
    tool_response: { isError: true, content: [{ type: "text", text: "HTTP 409: saved GRADE cannot be overwritten" }] },
  });
  assert.equal(bad[1].ref, "grade_set:http-409");
  assert.equal(events({ tool_name: "mcp__msr__pdf_text", hook_event_name: "PostToolUseFailure", error: "boom" })[1].ref, "pdf_text:error");
  const count = { tool_name: "mcp__collie__outcome_analyze", tool_response: { isError: true, content: [{ type: "text", text: "Only 450 articles matched" }] } };
  assert.equal(events(count)[1].ref, "outcome_analyze:error", "a number in the message is not a status");
  for (const e of bad) assert.ok(sanitize(e), "every emitted event fits the schema");
});

test("stages follow the Collie workflow", () => {
  assert.equal(stageOf("duplicates_suggest"), "dedup");
  assert.equal(stageOf("ai_suggest", { phase: "full_text" }), "screening-ft");
  assert.equal(stageOf("ai_screen_run", {}), "screening-ta");
  assert.equal(stageOf("table1_get"), "extraction");
  assert.equal(stageOf("outcome_analyze"), "analysis");
  assert.equal(stageOf("paper_section_put"), "manuscript");
  assert.equal(stageOf("collie_guide"), "other");
  assert.ok(new RegExp(`^(?:${MATCHER})$`).test("mcp__plugin_collie_collie__records_search"));
});

test("governance refusals and expired tokens are counted apart from tool errors", () => {
  const refused = events({ tool_name: "mcp__collie__screening_decide", tool_response: { isError: true, content: [{ type: "text", text: "403 human_decision_required" }] } });
  assert.equal(refused[1].ref, "screening_decide:refused");
  const expired = events({ tool_name: "mcp__collie__review_get", tool_response: { isError: true, content: [{ type: "text", text: "HTTP 401 token_expired" }] } });
  assert.equal(expired[1].ref, "review_get:expired");
  const s = summarize([...refused, ...expired, ...events({ tool_name: "mcp__collie__pdf_text", hook_event_name: "PostToolUseFailure", error: "HTTP 500" })].map((e) => sanitize(e)));
  assert.equal(s.refusals, 2);
  assert.equal(s.toolErrorsPer100, 33.3); // 1 real error in 3 calls; refusals excluded
});
