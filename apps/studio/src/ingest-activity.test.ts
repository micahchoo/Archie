import { describe, it, expect } from "vitest";
import { ingestActivityOf } from "./ingest-activity.js";

describe("ingestActivityOf", () => {
  it("is null when nothing has happened", () => {
    expect(ingestActivityOf(0, null, null)).toBeNull();
  });

  it("reports the discovery lead-in as indeterminate", () => {
    // A run is in flight but no flow has ticked yet — fetchManifestPlan / the EXIF pre-pass. Without
    // this the band stays empty through a 32MB manifest fetch and then snaps to a bar, reading as a hang.
    expect(ingestActivityOf(1, null, null)).toEqual({ kind: "preparing" });
  });

  it("becomes a determinate bar on the first tick", () => {
    expect(ingestActivityOf(1, { name: "f34r.jpg", index: 1, total: 24 }, null)).toEqual({
      kind: "running", name: "f34r.jpg", index: 1, total: 24, done: 0,
    });
  });

  it("counts done as index-1, because the tick precedes the work", () => {
    // ingest-flows.ts:492 sets the status BEFORE addObjectFromFile runs, so on the 8th tick seven have
    // actually landed. The visible "8 of 24" and the bar's 7/24 are both correct about different things.
    const a = ingestActivityOf(1, { name: "f41v.jpg", index: 8, total: 24 }, null);
    expect(a).toMatchObject({ kind: "running", index: 8, done: 7, total: 24 });
  });

  it("never lets the bar exceed its total, or go negative", () => {
    expect(ingestActivityOf(1, { name: "x", index: 0, total: 5 }, null)).toMatchObject({ done: 0 });
    expect(ingestActivityOf(1, { name: "x", index: 99, total: 5 }, null)).toMatchObject({ done: 5 });
  });

  it("shows the outcome once the run has settled", () => {
    expect(ingestActivityOf(0, null, { message: "Added 24 images.", ok: true })).toEqual({
      kind: "done", message: "Added 24 images.", ok: true,
    });
  });

  it("marks a REFUSAL as not-ok even though its run resolved", () => {
    // REGRESSION (caught by driving the real app, not by these tests): an OPFS-less browser refuses the
    // import, composes this note, and RESOLVES. A band inferring tone from "did the promise reject?"
    // rendered it as "✓ This browser can't store files here…". The tone must come from the producer —
    // ingest-flows.ts now passes "problem" at every refusal site, which App maps to ok:false.
    const refusal = "This browser can’t store files here — you may be in a private window.";
    expect(ingestActivityOf(0, null, { message: refusal, ok: false })).toEqual({
      kind: "done", message: refusal, ok: false,
    });
  });

  it("marks a run that threw as not-ok", () => {
    expect(ingestActivityOf(0, null, { message: "Couldn't add those files.", ok: false })).toMatchObject({
      kind: "done", ok: false,
    });
  });

  it("suppresses a stale note while a new run is in flight", () => {
    // Only two of the five flows blank importNote at start (ingest-flows.ts:311/461), so without this
    // precedence a previous import's summary would sit beside the new run's bar.
    const stale = { message: "Added 3 images.", ok: true };
    expect(ingestActivityOf(1, null, stale)).toEqual({ kind: "preparing" });
    expect(ingestActivityOf(1, { name: "a.jpg", index: 2, total: 9 }, stale)).toMatchObject({ kind: "running" });
  });

  it("prefers a live tick over the busy count", () => {
    // Two overlapping runs: the tick is the most specific thing known, so it wins.
    expect(ingestActivityOf(2, { name: "b.jpg", index: 3, total: 4 }, null)).toMatchObject({
      kind: "running", name: "b.jpg",
    });
  });
});
