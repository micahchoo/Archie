#!/usr/bin/env node
// CLI for the desktop capability gate (Archie-91e7): `pnpm capabilities:check`.
//
// Thin by design — all logic lives in scripts/lib/tauri-capabilities.mjs so it is unit-testable
// without a build, a browser, or a Tauri toolchain (scripts/lib/tauri-capabilities.test.mjs, run by
// CI's `unit-scripts` job). This file only resolves paths, prints, and sets the exit code.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { auditCapabilities, formatReport } from "./lib/tauri-capabilities.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const BRIDGE = `${root}packages/render-core/src/fs/tauri.ts`;
const MANIFEST = `${root}src-tauri/capabilities/default.json`;

let report;
try {
  report = auditCapabilities(readFileSync(BRIDGE, "utf8"), JSON.parse(readFileSync(MANIFEST, "utf8")));
} catch (err) {
  // A moved seam or an unparseable manifest must FAIL, never pass quietly — a gate that cannot find
  // what it checks has stopped checking.
  console.error(`capabilities: could not audit — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

console.log(formatReport(report));
if (!report.ok) {
  console.error(
    "\nThe packaged desktop app would deny these commands AT RUNTIME, silently: writes fail, the UI\n" +
      "reports a soft retry, and authored work is lost. Grant them in src-tauri/capabilities/default.json.",
  );
  process.exit(1);
}
