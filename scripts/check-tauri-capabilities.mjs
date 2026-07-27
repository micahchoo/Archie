#!/usr/bin/env node
// CLI for the desktop capability gate: `pnpm capabilities:check`.
//
// Two independent audits, because the manifest has two independent ways of being wrong:
//   1. PERMISSIONS (Archie-91e7) — is the command granted at all?  `fs:allow-rename` was not, and
//      every durable write failed at its temp-then-rename commit point.
//   2. SCOPE (Archie-7b48) — may the granted command touch that PATH?  `fs:allow-exists` was granted
//      and `.bake-schema` was still refused, because Tauri's scope globs do not match a component
//      starting with a dot. Audit 1 is structurally blind to this; it only reads identifiers.
//
// Thin by design — all logic lives in scripts/lib/tauri-capabilities.mjs so it is unit-testable
// without a build, a browser, or a Tauri toolchain (scripts/lib/tauri-capabilities.test.mjs, run by
// CI's `unit-scripts` job). This file only resolves paths, prints, and sets the exit code.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { auditCapabilities, formatReport, auditScope, formatScopeReport } from "./lib/tauri-capabilities.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const BRIDGE = `${root}packages/render-core/src/fs/tauri.ts`;
const MANIFEST = `${root}src-tauri/capabilities/default.json`;
// Where getFile/getDirectory call sites live. Both trees, because the hidden paths are split across
// them: apps/studio owns `.bake-schema`, and render-core owns the fs backends they run through.
const SOURCE_DIRS = [`${root}apps/studio/src`, `${root}packages/render-core/src`];

/** Every .ts file under `dir`, recursively, excluding tests (a fixture path is not a real call site). */
function tsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) out.push(...tsFiles(path));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

let report;
let scope;
try {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  report = auditCapabilities(readFileSync(BRIDGE, "utf8"), manifest);
  const sources = SOURCE_DIRS.flatMap(tsFiles).map((path) => ({ path, text: readFileSync(path, "utf8") }));
  if (sources.length === 0) throw new Error("no sources found — the scope audit would pass vacuously");
  scope = auditScope(sources, manifest);
} catch (err) {
  // A moved seam or an unparseable manifest must FAIL, never pass quietly — a gate that cannot find
  // what it checks has stopped checking.
  console.error(`capabilities: could not audit — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

console.log(formatReport(report));
console.log(formatScopeReport(scope));

if (!report.ok) {
  console.error(
    "\nThe packaged desktop app would deny these commands AT RUNTIME, silently: writes fail, the UI\n" +
      "reports a soft retry, and authored work is lost. Grant them in src-tauri/capabilities/default.json.",
  );
}
if (!scope.ok) {
  console.error(
    "\nThe packaged desktop app would refuse these PATHS at runtime even though the command is granted.\n" +
      "The refusal lands AFTER bytes are written, so the tree looks healthy while the save reports failure.",
  );
}
if (!report.ok || !scope.ok) process.exit(1);
