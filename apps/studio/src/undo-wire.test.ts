// UndoWire tests (Archie-9da0) — headless. The manager's own semantics are pinned in
// packages/render-core/src/session/undo.test.ts; what is proven HERE is the studio seam: routing,
// notify pulses, the importChanges re-baseline, session-following (history never crosses an
// exhibit switch), and the ⌘Z / ⇧⌘Z matcher vocabulary.
import { describe, it, expect, vi } from "vitest";
import { AnnotationSession, asClientId, type AnnotationLog } from "@render/core";
import { createUndoWire } from "./undo-wire.js";
import { matches } from "./shortcuts.js";

const alice = asClientId("alice");
const rect = { type: "SpecificResource" as const, source: "https://x.test/c", selector: { type: "FragmentSelector" as const, value: "xywh=pixel:0,0,10,10" } };

const ev = (key: string, mod: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mod }) as KeyboardEvent;

describe("createUndoWire — routing", () => {
  it("every routed mutation pulses notify once and lands in the log exactly as before", () => {
    const session = new AnnotationSession(alice);
    const notify = vi.fn();
    const wire = createUndoWire(() => session, notify);

    const id = wire.createNote({ target: rect });
    wire.editNote(id, { body: [{ type: "TextualBody", value: "v2", purpose: "commenting" }] });
    wire.deleteNote(id);

    expect(notify).toHaveBeenCalledTimes(3); // one pulse per routed mutation
    expect(session.entries).toHaveLength(3); // v1 + edit + tombstone — the log is unchanged
    // Each user act is independently reversible, even when create+delete net to empty.
    expect(wire.canUndo).toBe(true);
    expect(wire.notes()).toHaveLength(0);
  });

  it("routed mutations form undoable blocks without caller marks", () => {
    const session = new AnnotationSession(alice);
    const notify = vi.fn();
    const wire = createUndoWire(() => session, notify);
    const id = wire.createNote({ target: rect });
    wire.editNote(id, { body: [{ type: "TextualBody", value: "v2", purpose: "commenting" }] });
    expect(wire.canUndo).toBe(true);

    notify.mockClear();
    wire.undo(); // the edit block
    expect(notify).toHaveBeenCalledTimes(1);
    expect(wire.notes()[0]!.body).toBeUndefined(); // back to the created state
    expect(session.entries).toHaveLength(2); // v1 + v2 both still in the log
  });

  it("undo/redo pulse notify and move the projection; the log only grows", () => {
    const session = new AnnotationSession(alice);
    const notify = vi.fn();
    const wire = createUndoWire(() => session, notify);
    const id = wire.createNote({ target: rect });

    notify.mockClear();
    wire.undo();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(wire.notes()).toHaveLength(0); // hidden on the surface…
    expect(session.entries).toHaveLength(1); // …still in the log

    wire.redo();
    expect(wire.notes().map((n) => n.logicalId)).toEqual([id]);
  });

  it("the wire FOLLOWS the session: a replaced session starts with EMPTY history", () => {
    // The exhibit-session store swaps `sess.session` on every open — the wire must swap its manager
    // with it, or exhibit A's overlay would bleed onto exhibit B (feasibility rec 3's exact hazard).
    let session = new AnnotationSession(alice);
    const wire = createUndoWire(() => session, () => {});
    wire.createNote({ target: rect });
    expect(wire.canUndo).toBe(true);

    session = new AnnotationSession(alice); // the exhibit switch
    expect(wire.canUndo).toBe(false); // fresh manager — nothing to undo
    expect(wire.notes()).toHaveLength(0);
    expect(wire.conflicts()).toEqual([]);
    expect(wire.conflictHeads("nope" as never)).toEqual([]);
  });
});

describe("createUndoWire — the importChanges re-baseline", () => {
  it("a colleague's merge does NOT trip the bypass report", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const session = new AnnotationSession(alice);
    const notify = vi.fn();
    const wire = createUndoWire(() => session, notify);
    wire.notes(); // baseline the tripwire

    const colleague = new AnnotationSession(asClientId("bob"));
    colleague.createNote({ target: rect, body: [{ type: "TextualBody", value: "theirs", purpose: "commenting" }] });
    wire.importChanges(colleague.entries as AnnotationLog);

    wire.notes();
    expect(err).not.toHaveBeenCalled(); // the ONE legit bypass was re-baselined by the wire
    err.mockRestore();
  });

  it("a raw session mutation that skips the wire still trips the report (loud, not silent)", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const session = new AnnotationSession(alice);
    const wire = createUndoWire(() => session, () => {});
    wire.notes();
    session.createNote({ target: rect }); // bypass
    wire.notes();
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});

describe("⌘Z / ⇧⌘Z matcher vocabulary (registry rows in shortcuts.ts)", () => {
  it("⌘Z fires on meta+z and ctrl+z, without shift", () => {
    expect(matches(ev("z", { metaKey: true }), "⌘Z")).toBe(true);
    expect(matches(ev("z", { ctrlKey: true }), "⌘Z")).toBe(true);
    expect(matches(ev("z"), "⌘Z")).toBe(false); // bare z is not undo
    expect(matches(ev("s", { metaKey: true }), "⌘Z")).toBe(false);
  });

  it("⇧⌘Z takes the shift modifier — and ⌘Z must not fire on it", () => {
    expect(matches(ev("z", { metaKey: true, shiftKey: true }), "⇧⌘Z")).toBe(true);
    expect(matches(ev("z", { ctrlKey: true, shiftKey: true }), "⇧⌘Z")).toBe(true);
    expect(matches(ev("z", { metaKey: true, shiftKey: true }), "⌘Z")).toBe(false); // shift = redo, not undo
    expect(matches(ev("z", { metaKey: true }), "⇧⌘Z")).toBe(false);
  });
});


describe("production action grouping", () => {
  it("undoes two separately created notes in two steps without caller marks", () => {
    const session = new AnnotationSession(alice);
    const wire = createUndoWire(() => session, () => {});
    const first = wire.createNote({ target: rect });
    wire.createNote({ target: rect });
    wire.undo();
    expect(wire.notes().map(n => n.logicalId)).toEqual([first]);
    wire.undo();
    expect(wire.notes()).toEqual([]);
  });

  it("groups a synchronous bulk import as one action", () => {
    const session = new AnnotationSession(alice);
    const wire = createUndoWire(() => session, () => {});
    const first = wire.createNote({ target: rect });
    wire.batch(() => { wire.createNote({ target: rect }); wire.createNote({ target: rect }); });
    wire.undo();
    expect(wire.notes().map(n => n.logicalId)).toEqual([first]);
  });

  it("groups a text burst but starts a new action after a pause", () => {
    vi.useFakeTimers();
    try {
      const session = new AnnotationSession(alice);
      const wire = createUndoWire(() => session, () => {});
      const id = wire.createNote({ target: rect });
      wire.editNote(id, { body: [{ type: "TextualBody", value: "h" }] });
      vi.advanceTimersByTime(100);
      wire.editNote(id, { body: [{ type: "TextualBody", value: "hi" }] });
      vi.advanceTimersByTime(1000);
      wire.editNote(id, { body: [{ type: "TextualBody", value: "hi there" }] });
      wire.undo();
      expect(wire.notes()[0]!.body).toEqual([{ type: "TextualBody", value: "hi" }]);
      wire.undo();
      expect(wire.notes()[0]!.body).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });
});

 it("redo preserves separate action stops for the next undo", () => {
   const session = new AnnotationSession(alice);
   const wire = createUndoWire(() => session, () => {});
   const first = wire.createNote({ target: rect });
   const second = wire.createNote({ target: rect });
   wire.undo(); wire.undo(); wire.redo(); wire.redo(); wire.undo();
   expect(wire.notes().map(n => n.logicalId)).toEqual([first]);
   expect(wire.notes().some(n => n.logicalId === second)).toBe(false);
 });
