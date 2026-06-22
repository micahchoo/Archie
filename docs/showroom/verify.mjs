// Verify every showroom CSV parses cleanly through the REAL planCsvImport.
// Run: node --experimental-strip-types docs/showroom/verify.mjs   (Node 22)
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { planCsvImport } from "../../apps/studio/src/csv-import.ts";

const here = dirname(fileURLToPath(import.meta.url));
const csvDir = join(here, "csv");

// Canonical objects (labels copied from exhibit.md). All images → no mediaType.
const LABELS = [
  "S1 · Library & save status", "S2 · Exhibit overview", "S3 · Image canvas & note editor",
  "S4 · Readings rail & editor", "S5 · Narrative composer", "S6a · Audio annotation",
  "S6b · Video frame annotation", "S7 · Map layer", "S8 · Cite palette (Cmd-K)",
  "S9 · Exhibit metadata & rights", "S10 · Ingest & IIIF import", "S11 · Publish dialog",
  "S12 · Keyboard shortcuts", "V1 · Gallery", "V2 · Reader & sidebar", "V3 · Narrative reader",
  "V4 · AV & transcript", "V5 · Search finder", "V6 · Note media lightbox",
  "V7 · Reading sheet, legend & cites", "E1 · Embedded viewer",
];
const objects = LABELS.map((label, i) => ({ id: `o${i + 1}`, label }));
const readings = ["studio", "viewer", "embed", "power"].map((n) => ({ id: n, name: n }));
const ctx = { objects, readings, currentObjectId: "o1" };

let totalRows = 0, totalPending = 0, totalSkipped = 0, fail = false;
for (const f of readdirSync(csvDir).filter((f) => f.endsWith(".csv")).sort()) {
  const text = readFileSync(join(csvDir, f), "utf8");
  const dataRows = text.trim().split("\n").length - 1; // minus header
  const plan = planCsvImport(text, ctx);
  totalRows += dataRows; totalPending += plan.pending.length; totalSkipped += plan.skipped.length;
  const ok = plan.skipped.length === 0 && plan.notes.length === 0 && plan.pending.length === dataRows;
  if (!ok) { fail = true; console.log(`✗ ${f}: rows=${dataRows} pending=${plan.pending.length} notes=${plan.notes.length} skipped=${JSON.stringify(plan.skipped)}`); }
  else console.log(`✓ ${f}: ${plan.pending.length} pending notes`);
}
console.log(`\nTOTAL: ${totalRows} rows → ${totalPending} pending, ${totalSkipped} skipped across 21 CSVs`);
process.exit(fail ? 1 : 0);
