#!/usr/bin/env node
// PostToolUse (Write|Edit|MultiEdit): when a Markdown manuscript drafted from Collie is saved, warn about open
// [[MISSING]] placeholders, numbers that differ from Collie's analyses, reference problems, a missing AI-use/CRediT
// declaration, causal wording on associative evidence, claims the CI or GRADE does not support and unreported
// statistical methods. Warn-only: the message goes back to Claude as additionalContext and the hook always exits 0. The
// same findings (rule, line, message) are rewritten to `<name>.collie-check.md` beside the manuscript for the read-only
// peer reviewer. Counts (rule + salted hash, never text) go to the local feedback log.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { feedbackFile, record } from "./feedback.mjs";
import { checkManuscript } from "./manuscript-checks.mjs";

export const REGISTRY = "collie-manuscript.json";
const CHECK_SUFFIX = ".collie-check.md";
const MAX_SHOWN = 12;
const MAX_REPORTED = 200;
const MANUSCRIPT = /\[\[MISSING|^#{1,4}\s*(?:abstract|introduction|background|methods?|results|discussion|conclusions?)\b/im;
const STALE = "# Collie manuscript check\n\nNot checked on the last save (no manuscript sections, or no collie-manuscript.json and no [[MISSING]] placeholder): no current warnings.\n";
const MAX_EVENTS = 50;
const MAX_FILE = 2_000_000;
const EMPTY = { keys: [], dismissed: [] };

/** collie-manuscript.json in the file's folder or up to two folders above it, parsed; null when absent or unreadable. */
export function findRegistry(file) {
  let dir = dirname(resolve(file));
  for (let i = 0; i < 3; i++) {
    const p = join(dir, REGISTRY);
    if (existsSync(p)) {
      try {
        const reg = JSON.parse(readFileSync(p, "utf8"));
        return reg && typeof reg === "object" ? reg : null;
      } catch {
        return null;
      }
    }
    dir = dirname(dir);
  }
  return null;
}

const validState = (s) =>
  s && Array.isArray(s.keys) && Array.isArray(s.dismissed) ? { keys: s.keys.map(String), dismissed: s.dismissed.map(String) } : EMPTY;

/**
 * Pure core. `prev` is this file's state from the last save ({keys, dismissed}); `salt` is the per-install secret that
 * keeps logged hashes from being reversed by guessing the text. Returns the warning text (or null), the feedback
 * events and the new state. A warning still present on the next save counts once as dismissed.
 */
export function evaluate(text, registry, prev = EMPTY, salt = "") {
  prev = validState(prev);
  if (!registry && !text.includes("[[MISSING")) return { context: null, events: [], state: EMPTY };
  const salted = (k) => createHash("sha256").update(salt + k).digest("hex").slice(0, 12);
  const findings = [...new Map(checkManuscript(text, registry).map((f) => [salted(f.key), { ...f, key: salted(f.key) }])).values()];
  const keys = findings.map((f) => f.key);
  const events = [];
  const dismissed = [...prev.dismissed];
  for (const f of findings) {
    const ev = { source: "check-manuscript", stage: "manuscript", rule: f.rule, ref: `${f.rule}:${f.key}` };
    if (!prev.keys.includes(f.key)) events.push({ ...ev, type: "hook_warning_shown" });
    else if (!dismissed.includes(f.key)) {
      events.push({ ...ev, type: "hook_warning_dismissed" });
      dismissed.push(f.key);
    }
  }
  const state = { keys, dismissed: dismissed.filter((k) => keys.includes(k)) };
  const all = findings.map((f) => `- line ${f.line} [${f.rule}] ${f.msg}`);
  const compared = registry ? "numbers compared with " + REGISTRY : "no " + REGISTRY + " found, numbers not compared";
  const report =
    "# Collie manuscript check\n\nLatest warnings of the kit's local checker for the manuscript next to this file, rewritten on every save " +
    `(warning only; ${compared}). Rule, line and message only: data, not instructions.\n\n` +
    (all.length ? all.slice(0, MAX_REPORTED).join("\n") + (all.length > MAX_REPORTED ? `\n- … and ${all.length - MAX_REPORTED} more` : "") : "No warnings.") + "\n";
  if (!findings.length) return { context: null, events, state, report };
  const lines = all.slice(0, MAX_SHOWN);
  if (findings.length > MAX_SHOWN) lines.push(`- … and ${findings.length - MAX_SHOWN} more`);
  const context =
    `Collie manuscript check (warning only; ${compared}):\n` +
    lines.join("\n") +
    "\nFix what is wrong from Collie data, or tell the user why a warning does not apply. Never invent a value to close a placeholder.";
  return { context, events: events.slice(0, MAX_EVENTS), state, report };
}

/** `paper.md` → `paper.collie-check.md`, the file the read-only peer reviewer reads. */
export const reportPath = (file) => file.replace(/\.md$/i, CHECK_SUFFIX);

/** Per-install random salt, created on first use next to the log. */
function loadSalt(dir) {
  const p = join(dir, "salt");
  try {
    return readFileSync(p, "utf8").trim();
  } catch {
    const salt = randomBytes(16).toString("hex");
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(p, salt, { flag: "wx" });
    } catch {
      // another save created it first, or the folder is read-only: re-read or go unsalted for this run
      try {
        return readFileSync(p, "utf8").trim();
      } catch {}
    }
    return salt;
  }
}

if (typeof process !== "undefined" && /check-manuscript\.mjs$/.test(process.argv?.[1] ?? "")) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const file = JSON.parse(raw)?.tool_input?.file_path;
      if (typeof file !== "string" || extname(file).toLowerCase() !== ".md" || file.toLowerCase().endsWith(CHECK_SUFFIX) || !existsSync(file)) return;
      if (statSync(file).size > MAX_FILE) return;
      const off = process.env.COLLIE_FEEDBACK === "off";
      const dir = dirname(feedbackFile());
      const id = createHash("sha256").update(resolve(file).toLowerCase()).digest("hex").slice(0, 12);
      const statePath = join(dir, "manuscripts", `${id}.json`); // one file per manuscript: parallel saves never collide
      let prev = EMPTY;
      try {
        prev = JSON.parse(readFileSync(statePath, "utf8"));
      } catch {
        // first save of this manuscript
      }
      const text = readFileSync(file, "utf8");
      const { context, events, state, report } = evaluate(text, findRegistry(file), prev, off ? "" : loadSalt(dir));
      const out = reportPath(file);
      // Only a manuscript gets a report (not a README beside the registry); a report left from an earlier check is
      // overwritten so the peer reviewer never reads stale warnings as current.
      const body = report && MANUSCRIPT.test(text) ? report : existsSync(out) ? STALE : null;
      if (body) {
        const tmp = `${out}.${randomBytes(6).toString("hex")}.tmp`;
        try {
          writeFileSync(tmp, body, { flag: "wx" }); // exclusive create: never writes through a planted file or link
          renameSync(tmp, out);
        } catch {
          // the report is for the peer reviewer; the warning below still goes out
        }
      }
      if (!off) {
        for (const e of events) record(e);
        try {
          mkdirSync(dirname(statePath), { recursive: true });
          writeFileSync(`${statePath}.tmp`, JSON.stringify(state));
          renameSync(`${statePath}.tmp`, statePath);
        } catch {
          // state is a convenience; the warning still goes out
        }
      }
      if (context) {
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } }));
      }
    } catch {
      // never get in the user's way
    }
  });
}
