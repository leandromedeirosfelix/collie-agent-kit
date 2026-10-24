#!/usr/bin/env node
// PreToolUse guard: an agent calling Collie's screening_decide would cast a real reviewer vote. Collie's rule is
// "AI suggests, humans decide", so the human is asked first and the agent is pointed at ai_suggest.
// MSR_AGENT_DECISIONS=allow (agent runs as its own second-reviewer account) | deny | ask (default).
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let args = {};
  try {
    args = JSON.parse(input).tool_input ?? {};
  } catch {
    // unreadable payload: fall through to "ask"
  }
  const mode = (process.env.MSR_AGENT_DECISIONS ?? "ask").toLowerCase();
  if (mode === "allow") process.exit(0);
  const what = `${args.value ?? "?"} on record ${args.record_id ?? "?"} (review ${args.review_id ?? "?"})`;
  const reason =
    `Collie: screening_decide records a real reviewer vote (${what}). AI should suggest, not decide — use ai_suggest ` +
    `so the reviewer accepts or dismisses it in Collie. Approve only if this agent is set up as a separate reviewer account.`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: mode === "deny" ? "deny" : "ask", permissionDecisionReason: reason },
    }),
  );
});
