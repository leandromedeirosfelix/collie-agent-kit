#!/usr/bin/env node
// PostToolUse(Write|Edit): parse-check edited .R files so syntax errors surface immediately. Silent no-op without R.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { findRscript } from "./rscript.mjs";

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let file;
  try {
    file = JSON.parse(raw).tool_input?.file_path;
  } catch {
    process.exit(0);
  }
  if (!file || !/\.r$/i.test(file) || !existsSync(file)) process.exit(0);
  const r = spawnSync(findRscript(), ["--vanilla", "-e", "invisible(parse(file = commandArgs(TRUE)[1]))", file], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 50_000,
  });
  if (r.error) process.exit(0); // R not installed: nothing to check
  if (r.status !== 0) {
    process.stderr.write(`R syntax error in ${file}:\n${(r.stderr || "").trim()}`);
    process.exit(2); // exit 2 feeds the message back to Claude
  }
});
