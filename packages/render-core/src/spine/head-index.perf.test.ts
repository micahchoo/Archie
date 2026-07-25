// SCALING GATE for the incremental heads projection.
//
// The equivalence suite (head-index.test.ts) proves the index is CORRECT. Nothing proved it is still
// FAST — and the failure mode is silent: add an innocuous `projectHeads(this.log)` to a session
// method, or a `[...this.groups]` scan inside `append`, and every test stays green while per-edit
// cost goes back to O(log). That is how the 130x quietly disappears.
//
// WHY THESE ASSERTIONS ARE RATIOS, NOT MILLISECONDS. A wall-clock threshold is a CI flake generator:
// it encodes the machine that wrote it. Both numbers here are measured in the SAME process on the
// SAME data, so the comparison is machine-independent — a slow runner scales both sides equally.
//
// The invariant, stated directly: A MUTATION MUST COST FAR LESS THAN ONE SINGLE PASS OVER THE LOG.
//
// The comparator is a bare `log.filter(...)`, deliberately NOT a full projection. A projection is
// expensive PER ELEMENT (it allocates a Map and a Set per logicalId), so "a fraction of a projection"
// is a bound loose enough for a plain O(log) scan to slip under — verified: reverting deleteNote to
// `linearHead(this.entries, id)` (exactly the scan this work removed) passed a 0.25-of-a-projection
// bound. A single filter pass is the cheapest possible O(log) work, so anything that touches every
// record lands at ratio >= 1, and a projection lands far above it.
// WHAT THIS GATE CATCHES, verified by reverting each change and re-running:
//   editNote back to a whole-log linearHead scan      -> caught (3 of 4 fail)
//   deleteNote back to a whole-log linearHead scan    -> caught
//   notes() rebuilding via projectHeads               -> caught
//   advance() reintroducing the [...records] copy     -> caught (by the bulk-create test)
//
// WHAT IT DOES NOT CATCH, stated so nobody reads green as proof of more than it is:
//   conflicts() scanning every GROUP instead of the plural set. That is O(notes) per edit, but the
//   per-element cost is a bare Map iteration — cheap enough to sit under the one-pass bound. It is
//   the mildest of the regressions here (~0.15 ms/edit at 20k, versus ~15 ms for a full rebuild);
//   catching it would need operation counting rather than timing.
import { describe, it, expect } from "vitest";
import { AnnotationSession } from "../session/session.js";
import { projectHeads, headsByLogicalId } from "./heads.js";
import { asClientId, type LogicalId } from "../wadm/brand.js";

function seed(n: number) {
  const s = new AnnotationSession(asClientId("alice"));
  const ids: LogicalId[] = [];
  for (let i = 0; i < n; i++) {
    ids.push(s.createNote({
      target: { source: `https://img/${i % 20}.jpg`, selector: { type: "FragmentSelector", value: `xywh=${i},${i},10,10` } },
      body: { type: "TextualBody", value: `note ${i}` },
    }));
  }
  return { s, ids };
}

/** The cheapest possible O(log) operation: one pass touching every record. Everything this gate
 *  forbids costs at least this much, so it is the tightest self-calibrating bound available. */
function singlePassMs(log: readonly { logicalId: string }[], target: string): number {
  return medianMs(15, () => {
    const hit = log.filter((r) => r.logicalId === target);
    if (hit.length < 0) throw new Error("unreachable");
  });
}

/** Median of `reps` timings — one GC pause must not decide a CI run. */
function medianMs(reps: number, fn: () => void): number {
  const runs: number[] = [];
  for (let i = 0; i < reps; i++) {
    const t = performance.now();
    fn();
    runs.push(performance.now() - t);
  }
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length / 2)]!;
}

describe("HeadIndex scaling gate — an edit must not rebuild the projection", () => {
  it("one edit costs a small fraction of one pass over the log", () => {
    const N = 8000;
    const { s, ids } = seed(N);
    const log = s.entries;
    const target = ids[Math.floor(N / 2)]!;

    const onePass = singlePassMs(log, target);
    // The work the OLD path did per edit: heads() projected, conflicts() grouped again. Measured only
    // to report the margin — the assertion below uses the much tighter one-pass bound.
    const fullProjection = medianMs(15, () => {
      projectHeads(log);
      headsByLogicalId(log);
    });
    // The work the CURRENT path does per edit, including both reads the Studio performs after one.
    let i = 0;
    const perEdit = medianMs(15, () => {
      s.editNote(target, { body: { type: "TextualBody", value: `e${i++}` } });
      s.notes();
      s.conflicts();
    });

    // Guard the guard: if the baseline is immeasurably small the ratio is meaningless, so make sure
    // there is a real signal to compare against before trusting the assertion below.
    expect(onePass).toBeGreaterThan(0.02);
    expect(fullProjection).toBeGreaterThan(onePass); // sanity: a projection is dearer than one pass
    expect(perEdit).toBeLessThan(onePass * 0.5);
  });

  it("per-edit cost stays flat as the log grows 4x", () => {
    // Linear would be ~4x, the old quadratic-per-session behaviour worse still. Bound at 2.5x: well
    // under linear, well over the ~1x that flat costs plus timer noise at these magnitudes.
    const measure = (n: number): number => {
      const { s, ids } = seed(n);
      const target = ids[Math.floor(n / 2)]!;
      let i = 0;
      return medianMs(25, () => {
        s.editNote(target, { body: { type: "TextualBody", value: `e${i++}` } });
        s.notes();
        s.conflicts();
      });
    };
    const small = measure(2000);
    const large = measure(8000);
    // Timer granularity: at sub-microsecond costs the ratio is noise, so floor the denominator.
    expect(large).toBeLessThan(Math.max(small, 0.002) * 2.5);
  });

  it("building a log stays linear — no whole-array copy per append", () => {
    // A per-edit RATIO cannot catch this one. Reintroducing `records = [...records, record]` costs a
    // spread copy, which is ~33x cheaper per element than a filter pass (pointer memcpy vs a
    // predicate call), so it hides comfortably under the one-pass bound above. It only becomes
    // visible in a BULK loop, where O(1)-per-append vs O(log)-per-append is linear vs quadratic.
    //
    // Measured both ways on this machine, 4000 -> 16000 notes: push = 4.40x (linear is 4x),
    // the spread copy = 14.04x (quadratic is 16x). The bound sits between, with real margin on
    // both sides, and is a RATIO so a slower runner scales both terms alike.
    const create = (n: number): number => {
      const t = performance.now();
      seed(n);
      return performance.now() - t;
    };
    create(2000); // warm the JIT so the first real measurement is not the outlier
    const small = create(4000);
    const large = create(16000);
    expect(large / small).toBeLessThan(8);
  });

  it("one bulk deletion costs a small fraction of one pass over the log", () => {
    // App.svelte's per-canvas bulk delete (:517, :890) is one deleteNote per note. When each mutation
    // rebuilt the projection this loop was quadratic — 21 ms for 200 notes, ~100 ms for 1000 at 20k.
    //
    // HONEST SCOPE: this does NOT assert per-deletion cost is flat, because it is not. `resplice`
    // does an Array#splice on the sorted heads, which is a memmove over the tail — O(heads) with a
    // very small constant (measured 0.024 ms per deletion at 20 000, vs 0.005 ms at 2000). Removing
    // that last factor needs an order-statistic structure instead of an array, which is not worth it
    // at these magnitudes. What this gate catches is a return to a real per-deletion PASS over the
    // log — a rescan (`linearHead(entries, id)`) or a rebuilt projection.
    const N = 8000;
    const { s, ids } = seed(N);
    const log = s.entries;
    const onePass = singlePassMs(log, ids[0]!);
    const doomed = s.notes().filter((r) => String((r.target as { source?: string }).source).endsWith("/3.jpg"));
    expect(doomed.length).toBeGreaterThan(100); // a real loop, not a couple of notes
    const t = performance.now();
    for (const r of doomed) s.deleteNote(r.logicalId as LogicalId);
    const perDelete = (performance.now() - t) / doomed.length;

    expect(onePass).toBeGreaterThan(0.02);
    expect(perDelete).toBeLessThan(onePass * 0.5);
  });
});
