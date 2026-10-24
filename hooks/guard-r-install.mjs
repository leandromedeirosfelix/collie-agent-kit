#!/usr/bin/env node
// PreToolUse(Bash): R packages are never installed silently — ask the user first (Collie rule).
const INSTALL = /install\.packages|remotes::install_|devtools::install|pak::pkg_install|pak::pak\b|BiocManager::install|renv::(install|restore|update)|R CMD INSTALL/;
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = JSON.parse(raw).tool_input?.command ?? "";
  } catch {
    process.exit(0); // unreadable payload: not ours to judge
  }
  if (!INSTALL.test(cmd)) process.exit(0);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "Collie: this command installs R packages. Confirm with the user before changing their R library.",
      },
    }),
  );
});
