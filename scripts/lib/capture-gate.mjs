// Post-run gate for capture-screenshots.mjs (Archie-b975).
//
// The sweep is best-effort per shot (a broken selector records `skipped` and moves on), which
// used to mean the PROCESS exited 0 even at 100% skips — a silently useless run. This gate is
// the teeth: pure function over the run's manifest + the on-disk file sizes, so it is unit-
// testable without a browser or dev server (scripts/lib/capture-gate.test.mjs, `node --test`).
//
// A run passes only when ALL of:
//   1. zero `skipped` entries (any skip is a broken drive path, declared or not);
//   2. every expected shot name × viewport has a `captured` manifest entry;
//   3. each captured expected shot's file exists with size >= minBytes (blank/torn PNG guard).

// Floor: the smallest REAL shot measured (viewer-geo-map, a flat map-tile page) is ~17.5KB;
// a near-blank 1440x900 solid-fill PNG compresses well under 10KB. 10KB splits those. This is
// a blank/torn-write guard only — wrong-page captures (404s) are caught upstream by the
// sweep's gotoOk HTTP-status check, not by size.
export const MIN_SHOT_BYTES = 10_000;

/**
 * @param {object} args
 * @param {{name: string, viewport: string, status: string, detail?: string}[]} args.manifest
 * @param {string[]} args.expected  shot names the sweep declares it will produce
 * @param {string[]} args.viewports viewport keys (each expected shot must exist per viewport)
 * @param {Record<string, number>} args.fileSizes  bytes on disk, keyed `<name>.<viewport>.png`
 * @param {number} [args.minBytes]
 * @returns {{ok: boolean, problems: string[]}}
 */
export function evaluateCaptureGate({ manifest, expected, viewports, fileSizes, minBytes = MIN_SHOT_BYTES }) {
  const problems = [];
  for (const m of manifest) {
    if (m.status === "skipped") problems.push(`skipped: ${m.name}.${m.viewport}${m.detail ? ` — ${m.detail}` : ""}`);
  }
  for (const viewport of viewports) {
    for (const name of expected) {
      const entry = manifest.find((m) => m.name === name && m.viewport === viewport);
      if (!entry) { problems.push(`missing from manifest: ${name}.${viewport}`); continue; }
      if (entry.status !== "captured") continue; // its skip is already reported above
      const file = `${name}.${viewport}.png`;
      const size = fileSizes[file];
      if (size === undefined) problems.push(`recorded captured but no file on disk: ${file}`);
      else if (size < minBytes) problems.push(`file below the ${minBytes}-byte floor (${size} bytes): ${file}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
