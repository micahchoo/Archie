import { describe, it, expect } from "vitest";
import { ingestActivityOf, createImportRunTracker, type IngestStatus } from "./ingest-activity.js";

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

describe("createImportRunTracker — concurrent runs share one status slot", () => {
  const s = (name: string, index = 1, total = 5): IngestStatus => ({ name, index, total });
  const setup = () => {
    const published: (IngestStatus | null)[] = [];
    const tracker = createImportRunTracker((v) => published.push(v));
    return { published, tracker, last: () => published.at(-1) };
  };

  it("a single run publishes its ticks and nulls on end", () => {
    const { tracker, last } = setup();
    const run = tracker.begin();
    run.tick(s("a.jpg", 1));
    expect(last()).toMatchObject({ name: "a.jpg", index: 1 });
    run.tick(s("b.jpg", 2));
    expect(last()).toMatchObject({ name: "b.jpg", index: 2 });
    run.end();
    expect(last()).toBeNull();
  });

  it("the oldest reported run leads; a younger run's ticks never alternate in", () => {
    // THE BUG (pre-tracker): two overlapping drops alternated filenames and totals in the band as
    // their ticks interleaved through the one unkeyed global.
    const { tracker, last } = setup();
    const a = tracker.begin();
    const b = tracker.begin();
    a.tick(s("a1.jpg", 1, 10));
    b.tick(s("b1.jpg", 1, 3));
    expect(last()).toMatchObject({ name: "a1.jpg", total: 10 }); // a leads
    b.tick(s("b2.jpg", 2, 3));
    a.tick(s("a2.jpg", 2, 10));
    expect(last()).toMatchObject({ name: "a2.jpg", total: 10 }); // still a — no flapping
  });

  it("a sibling finishing does NOT blank a still-running lead", () => {
    // THE OTHER HALF OF THE BUG: the first flow to finish nulled the shared slot out from under the
    // survivor. Now an end() removes only its own entry.
    const { tracker, last } = setup();
    const a = tracker.begin();
    const b = tracker.begin();
    a.tick(s("a1.jpg", 3, 10));
    b.tick(s("b1.jpg", 3, 3));
    b.end(); // the younger run finishes first
    expect(last()).toMatchObject({ name: "a1.jpg", index: 3, total: 10 }); // a undisturbed
  });

  it("when the lead ends, the next-oldest reported run takes over; when all end, null", () => {
    const { tracker, last } = setup();
    const a = tracker.begin();
    const b = tracker.begin();
    a.tick(s("a1.jpg", 9, 10));
    b.tick(s("b1.jpg", 1, 3));
    a.end();
    expect(last()).toMatchObject({ name: "b1.jpg", total: 3 }); // b promoted with ITS progress
    b.end();
    expect(last()).toBeNull();
  });

  it("an older run reporting late takes the lead back — once, without flapping", () => {
    // The one sanctioned lead change besides end(): run A begins first but sits in a silent discovery
    // phase (the folder flow awaits newExhibit before its first tick), so B leads briefly; A's first
    // tick moves the lead back to A, where it stays — begin-order is fixed, so this happens at most
    // once per late reporter. Pinned so the doc comment's "bounded exception" stays true of the code.
    const { tracker, last } = setup();
    const a = tracker.begin(); // older, but slow to report
    const b = tracker.begin();
    b.tick(s("b1.jpg", 1, 3));
    expect(last()).toMatchObject({ name: "b1.jpg" }); // b leads while a is silent
    a.tick(s("a1.jpg", 1, 10));
    expect(last()).toMatchObject({ name: "a1.jpg" }); // a takes over on its first tick
    b.tick(s("b2.jpg", 2, 3));
    expect(last()).toMatchObject({ name: "a1.jpg" }); // and b can't take it back
    a.end();
    expect(last()).toMatchObject({ name: "b2.jpg", index: 2 });
  });

  it("a run that never ticked (refused up front) ends without disturbing anything", () => {
    const { tracker, published, last } = setup();
    const a = tracker.begin();
    a.tick(s("a1.jpg"));
    const refused = tracker.begin(); // e.g. addFiles bailing on storeReady before any tick
    refused.end();
    expect(last()).toMatchObject({ name: "a1.jpg" });
    expect(published.every((p) => p === null || p.name === "a1.jpg")).toBe(true);
  });

  it("tick and end after end are inert, not a resurrection", () => {
    const { tracker, last } = setup();
    const a = tracker.begin();
    a.tick(s("a1.jpg"));
    a.end();
    a.tick(s("ghost.jpg")); // a straggling callback after the finally must not repaint the band
    a.end();
    expect(last()).toBeNull();
  });
});
