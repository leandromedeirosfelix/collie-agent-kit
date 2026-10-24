// Shared by the hooks: locate Rscript the same way Collie's R engine does.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** MSR_RSCRIPT / MA_RSCRIPT / RSCRIPT_PATH > newest C:\Program Files\R\R-*\bin\Rscript.exe > "Rscript" on PATH. */
export function findRscript() {
  const env = process.env.MSR_RSCRIPT || process.env.MA_RSCRIPT || process.env.RSCRIPT_PATH;
  if (env) return env;
  if (process.platform === "win32") {
    const base = "C:\\Program Files\\R";
    if (existsSync(base)) {
      const versions = readdirSync(base)
        .filter((d) => /^R-\d/.test(d))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const v of versions) {
        const exe = join(base, v, "bin", "Rscript.exe");
        if (existsSync(exe)) return exe;
      }
    }
  }
  return "Rscript";
}
