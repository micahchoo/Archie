// The signals contract at the AnnotationSession seam (Archie-01c9).
//
// Separate from session.test.ts because these assert a PERFORMANCE-shaped property — how many
// times a projection runs — which is a different claim from what the projection produces, and
// the two rot in different ways.
//
// Headless by construction: this file imports nothing but vitest and render-core. That is the
// point of putting the signals layer in render-core rather than render-svelte
// (`ledgers/LEARN-tldraw-merged-2026-07-22.md` §1a: "Testable without Svelte").

import { describe, it, expect } from "vitest";
import { AnnotationSession } from "./session.js";
import { onEpochChange, transact } from "../state/index.js";
import { asClientId, type LogicalId } from "../wadm/brand.js";
import type { W3CAnnotation } from "../wadm/types.js";

function newSession() {
  return new AnnotationSession(asClientId("alice"));
}

let seq = 0;
function addNote(s: AnnotationSession, value = "note"): LogicalId {
  seq += 1;
  return s.createNote({
    target: { source: "https://img/a.jpg", selector: { type: "FragmentSelector", value: `xywh=${seq},${seq},10,10` } },
    body: { type: "TextualBody", value },
  });
}

describe("AnnotationSession · workingAnnotations is memoized", () => {
  it("returns the SAME array across repeated calls with no mutation in between", () => {
    // Reference identity is the assertion, not deep equality — `toEqual` would pass against the
    // un-memoized code and prove nothing. Injection that fails it: have workingAnnotations()
    // call this.projectWorkingAnnotations() directly instead of this.working.get().
    const s = newSession();
    addNote(s);
    addNote(s);

    const first = s.workingAnnotations();
    expect(s.workingAnnotations()).toBe(first);
    expect(s.workingAnnotations()).toBe(first);
    expect(first).toHaveLength(2);
  });

  it("invalidates on create, edit and delete — a stale read is the failure mode that matters", () => {
    const s = newSession();
    const id = addNote(s, "original");

    const afterCreate = s.workingAnnotations();
    expect(afterCreate).toHaveLength(1);

    s.editNote(id, { body: { type: "TextualBody", value: "edited" } });
    const afterEdit = s.workingAnnotations();
    expect(afterEdit).not.toBe(afterCreate);
    expect((afterEdit[0]!.body as { value: string }).value).toBe("edited");

    addNote(s, "second");
    expect(s.workingAnnotations()).toHaveLength(2);

    s.deleteNote(id);
    const afterDelete = s.workingAnnotations();
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete.map((a) => a.id)).not.toContain(id);
  });

  it("invalidates on the setLog paths too — importChanges and resolve", () => {
    // These do not go through advance(), so they are the paths most likely to be forgotten when
    // someone adds a fourth mutation. Injection that fails it: remove bumpRevision() from setLog.
    const local = newSession();
    const shared = addNote(local, "shared");
    const beforeImport = local.workingAnnotations();

    const remote = new AnnotationSession(asClientId("bob"), local.entries);
    remote.editNote(shared, { body: { type: "TextualBody", value: "bob's take" } });
    local.editNote(shared, { body: { type: "TextualBody", value: "alice's take" } });

    local.importChanges(remote.entries);
    const afterImport = local.workingAnnotations();
    expect(afterImport).not.toBe(beforeImport);
    expect(local.conflicts()).toContain(shared);

    local.resolve(shared, { body: { type: "TextualBody", value: "agreed" } });
    const afterResolve = local.workingAnnotations();
    expect(afterResolve).not.toBe(afterImport);
    expect(local.conflicts()).toHaveLength(0);
    const resolved = afterResolve.find((a) => a.id === shared)!;
    expect((resolved.body as { value: string }).value).toBe("agreed");
  });

  it("N reads between two mutations cost ONE projection", () => {
    // The actual win, measured rather than asserted structurally. Counted through reference
    // identity because the projection is private: a fresh array means it ran.
    const s = newSession();
    for (let i = 0; i < 5; i++) addNote(s);

    const seen = new Set<W3CAnnotation[]>();
    for (let i = 0; i < 50; i++) seen.add(s.workingAnnotations());
    expect(seen.size).toBe(1);

    addNote(s);
    for (let i = 0; i < 50; i++) seen.add(s.workingAnnotations());
    expect(seen.size).toBe(2);
  });
});

describe("AnnotationSession · the revision atom is the subscription seam", () => {
  it("ticks a subscriber once per mutation — the 19 manual bump() call sites become one edge", () => {
    // What a Svelte adapter binds to instead of App.svelte's `rev`/`bump()` pair.
    const s = newSession();
    let ticks = 0;
    const off = onEpochChange(() => {
      ticks += 1;
    });
    try {
      const id = addNote(s);
      expect(ticks).toBe(1);
      s.editNote(id, { body: { type: "TextualBody", value: "x" } });
      expect(ticks).toBe(2);
      s.deleteNote(id);
      expect(ticks).toBe(3);
    } finally {
      off();
    }
  });

  it("a bulk create in ONE transact ticks once, not N times", () => {
    // The bulk-import shape. Note what this does NOT claim: it does not reduce the number of
    // PROJECTIONS, which laziness already handled — see state.test.ts's (b) test, which pins
    // that distinction. It reduces how many times a subscriber is woken.
    const s = newSession();
    let ticks = 0;
    const off = onEpochChange(() => {
      ticks += 1;
    });
    try {
      transact(() => {
        for (let i = 0; i < 20; i++) addNote(s);
      });
      expect(ticks).toBe(1);
      expect(s.workingAnnotations()).toHaveLength(20);
    } finally {
      off();
    }
  });

  it("the revision counter itself advances once per mutation", () => {
    const s = newSession();
    expect(s.revision.get()).toBe(0);
    const id = addNote(s);
    expect(s.revision.get()).toBe(1);
    s.editNote(id, { body: { type: "TextualBody", value: "y" } });
    expect(s.revision.get()).toBe(2);
  });

  it("does not tick when nothing mutated", () => {
    const s = newSession();
    addNote(s);
    let ticks = 0;
    const off = onEpochChange(() => {
      ticks += 1;
    });
    try {
      s.workingAnnotations();
      s.notes();
      s.conflicts();
      void s.entries;
      expect(ticks).toBe(0);
    } finally {
      off();
    }
  });

  it("a session with no subscriber never touches the listener set", () => {
    // Guards the zero-subscriber fast path in epoch.ts's notifyListeners, which is what keeps
    // the spine's per-edit hot path allocation-free (perf-measure-the-flow §3). Structural, not
    // timed: it only checks that a mutation with nobody listening still works and still bumps.
    const s = newSession();
    for (let i = 0; i < 100; i++) addNote(s);
    expect(s.revision.get()).toBe(100);
    expect(s.workingAnnotations()).toHaveLength(100);
  });
});
