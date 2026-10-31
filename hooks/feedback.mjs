#!/usr/bin/env node
// Local feedback log for the self-improvement loop (collie-retro): whitelisted, text-free events appended to a JSONL
// file on this computer. Nothing here opens a connection; the file never leaves the machine. COLLIE_FEEDBACK=off disables
// it. No imports beyond node built-ins: hooks and the plugin test harness load this file directly.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const TYPES = [
  "hook_warning_shown",
  "hook_warning_dismissed",
  "suggestion_accepted",
  "suggestion_rejected",
  "user_correction",
  "tool_error",
  "tool_call", // denominator for "tool errors per 100 calls"
  "guide_gap",
];
export const STAGES = [
  "protocol", "search", "dedup", "screening-ta", "screening-ft", "extraction", "rob",
  "analysis", "grade", "prisma", "manuscript", "submission", "other",
];
export const MAX_BYTES = 2 * 1024 * 1024;
// Opaque ids only (rule names, numeric ids, short hashes): no free text, so no article text, patient data or tokens fit.
const REF = /^[a-z0-9:_.-]{1,80}$/;
const SOURCE = /^[a-z0-9-]{1,60}$/;
// A guide gap is typed by the agent, so it gets the narrowest shape: a topic slug, letters and hyphens, no digits.
const GAP = /^[a-z][a-z-]{2,40}$/;
export const RULES = [
  "missing", "effect", "ci", "i2", "k", "n", "ref-duplicate", "ref-no-id", "ai-disclosure", "credit", "causal",
  "claim-significance", "claim-no-difference", "claim-certainty",
  "methods-model", "methods-estimator", "methods-hk", "methods-heterogeneity", "methods-prediction", "methods-small-study", "methods-software",
];

/**
 * Collie's local (non-roaming) folder, under feedback/: LOCALAPPDATA on Windows, XDG_STATE_HOME or ~/.local/state
 * elsewhere. COLLIE_FEEDBACK_FILE overrides it only with a .jsonl path (rotation depends on the extension).
 */
export function feedbackFile(env = process.env) {
  if (env.COLLIE_FEEDBACK_FILE && /\.jsonl$/i.test(env.COLLIE_FEEDBACK_FILE)) return env.COLLIE_FEEDBACK_FILE;
  const base =
    process.platform === "win32"
      ? join(env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "collie")
      : join(env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "collie");
  return join(base, "feedback", "events.jsonl");
}

const count = (v) => (Number.isInteger(v) && v >= 0 && v < 1e9 ? v : undefined);

/** The event as it will be stored, or null when it does not fit the schema. Unknown fields are dropped. */
export function sanitize(e, now = new Date()) {
  if (!e || !TYPES.includes(e.type)) return null;
  const ref = String(e.ref ?? "").toLowerCase();
  const source = String(e.source ?? "").toLowerCase();
  if (!REF.test(ref) || !SOURCE.test(source)) return null;
  if (e.type === "guide_gap" && !GAP.test(ref)) return null;
  const out = { v: 1, ts: now.toISOString(), stage: STAGES.includes(e.stage) ? e.stage : "other", source, type: e.type, ref };
  const review = count(e.review_id);
  if (review) out.review_id = review;
  const rule = String(e.rule ?? "").toLowerCase();
  if (RULES.includes(rule)) out.rule = rule;
  const n = count(e.n);
  if (n !== undefined) out.n = n;
  return out;
}

/** Appends one event; returns false (never throws) when disabled, invalid or the disk refuses. */
export function record(e, { env = process.env, now } = {}) {
  if (env.COLLIE_FEEDBACK === "off") return false;
  const ev = sanitize(e, now);
  if (!ev) return false;
  const file = feedbackFile(env);
  try {
    mkdirSync(dirname(file), { recursive: true });
    try {
      if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, file.replace(/\.jsonl$/i, ".1.jsonl"));
    } catch {
      // the old copy is locked (antivirus, a viewer): keep appending; rotation retries on the next event
    }
    appendFileSync(file, JSON.stringify(ev) + "\n");
    return true;
  } catch {
    return false; // the log is a convenience: never break the user's work over it
  }
}

/** Events from the rotated and the current file, oldest first; unreadable or off-schema lines are skipped. */
export function readEvents(env = process.env) {
  const file = feedbackFile(env);
  const out = [];
  for (const f of [file.replace(/\.jsonl$/i, ".1.jsonl"), file]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      try {
        const raw = JSON.parse(line);
        const ev = sanitize(raw);
        if (ev && typeof raw.ts === "string") out.push({ ...ev, ts: raw.ts });
      } catch {
        // partial or foreign line
      }
    }
  }
  return out;
}

const bump = (o, k, by = 1) => ((o[k] = (o[k] ?? 0) + by), o);

/** Counts only: what collie-retro reads. `since` is an ISO date (inclusive). */
export function summarize(events, since = "") {
  const s = { since: since || null, total: 0, byType: {}, byStage: {}, warnings: {}, toolCalls: 0, toolErrors: {}, guideGaps: {} };
  for (const e of events) {
    if (since && e.ts < since) continue;
    s.total++;
    bump(s.byType, e.type);
    bump(s.byStage, e.stage);
    if (e.type === "hook_warning_shown" || e.type === "hook_warning_dismissed") {
      const w = (s.warnings[`${e.source}:${e.rule ?? "any"}`] ??= { shown: 0, dismissed: 0 });
      w[e.type === "hook_warning_shown" ? "shown" : "dismissed"] += e.n ?? 1;
    }
    if (e.type === "tool_call") s.toolCalls += e.n ?? 1;
    if (e.type === "tool_error") bump(s.toolErrors, e.ref);
    if (e.type === "guide_gap") bump(s.guideGaps, `${e.source}:${e.ref}`);
  }
  for (const w of Object.values(s.warnings)) w.dismissRate = w.shown ? Math.round((w.dismissed / w.shown) * 100) / 100 : null;
  // Refusals (agent tried to decide) and expired tokens are reported apart; they are not tool failures.
  const apart = (k) => /:(refused|expired)$/.test(k);
  s.refusals = Object.entries(s.toolErrors).filter(([k]) => apart(k)).reduce((a, [, n]) => a + n, 0);
  const errors = Object.entries(s.toolErrors).filter(([k]) => !apart(k)).reduce((a, [, n]) => a + n, 0);
  s.toolErrorsPer100 = s.toolCalls ? Math.round((errors / s.toolCalls) * 1000) / 10 : null;
  return s;
}

function flags(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) o[argv[i].slice(2)] = argv[++i];
  return o;
}

if (typeof process !== "undefined" && /feedback\.mjs$/.test(process.argv?.[1] ?? "")) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "add") {
    // The agent may only add guide gaps; every other event comes from the hooks themselves.
    const f = flags(rest.slice(1));
    const ok = rest[0] === "guide_gap" && record({ type: "guide_gap", stage: f.stage, source: f.source, ref: f.ref });
    process.stdout.write(ok ? "recorded\n" : "not recorded (off, or not a guide_gap with a letters-and-hyphens topic slug)\n");
  } else if (cmd === "summary") {
    const since = flags(rest).since ?? "";
    process.stdout.write(JSON.stringify(summarize(readEvents(), /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : ""), null, 2) + "\n");
  } else if (cmd === "path") {
    process.stdout.write(feedbackFile() + "\n");
  } else {
    process.stdout.write(
      "usage: feedback.mjs add guide_gap --source <guide> --ref <topic-slug> [--stage <stage>]\n" +
        "       feedback.mjs summary [--since YYYY-MM-DD]\n       feedback.mjs path\n",
    );
  }
}
