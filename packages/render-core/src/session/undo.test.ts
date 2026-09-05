import { describe, it, expect, vi } from "vitest";
import { AnnotationSession } from "./session.js";
import { AnnotationUndoManager } from "./undo.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { asClientId, type LogicalId } from "../wadm/brand.js";
import type { AnnotationLog, W3CSpecificResource } from "../wadm/types.js";

// Archie-69a6 prototype gate. The claim under test is narrow and it is the whole ticket:
// undo/redo can move the EDITING PROJECTION while the append-only log (ADR-0003) only ever grows.
// Every assertion below therefore comes in a pair — what the surface shows, and what the log holds.

const alice = asClientId("alice");
const canvas = "https://archie.demo/sample/canvas/o1";
const rect = (x: number, y: number, w: number, h: number): W3CSpecificResource => ({
  type: "SpecificResource",
  source: canvas,
  selector: { type: "FragmentSelector", value: `xywh=pixel:${x},${y},${w},${h}` },
});
const text = (value: string) => ({ type: "TextualBody" as const, value });
const bodyText = (record: { body?: unknown }): string | undefined => {
  const body = record.body as { value?: string } | undefined;
  return body?.value;
};

function fresh(opts?: ConstructorParameters<typeof AnnotationUndoManager>[1]): { session: AnnotationSession; undo: AnnotationUndoManager } {
  const session = new AnnotationSession(alice);
  return { session, undo: new AnnotationUndoManager(session, opts) };
}

describe("AnnotationUndoManager — create / undo / redo", () => {
  it("undo removes the note from the projection; redo puts it back", () => {
    const { session, undo } = fresh();
    const id = undo.createNote({ target: rect(0, 0, 10, 10), body: text("first") });
    expect(undo.notes().map((n) => n.logicalId)).toEqual([id]);

    undo.undo();
    expect(undo.notes()).toHaveLength(0);
    expect(session.notes().map((n) => n.logicalId)).toEqual([id]); // the SESSION still projects it

    undo.redo();
    expect(undo.notes().map((n) => n.logicalId)).toEqual([id]);
    expect(bodyText(undo.notes()[0]!)).toBe("first");
  });

  it("undoing an edit shows the previous version — the newer version is still the log's head", () => {
    const { session, undo } = fresh();
    const id = undo.createNote({ target: rect(0, 0, 10, 10), body: text("v1") });
    undo.mark("edit");
    undo.editNote(id, { body: text("v2") });
    expect(bodyText(undo.notes()[0]!)).toBe("v2");

    undo.undo();
    expect(bodyText(undo.notes()[0]!)).toBe("v1");
    expect(bodyText(session.notes()[0]!)).toBe("v2");
    expect(session.notes()[0]!.version).toBe(2);

    undo.redo();
    expect(bodyText(undo.notes()[0]!)).toBe("v2");
  });

  it("undoing a delete re-shows the note while the tombstone stays in the log", () => {
    const { session, undo } = fresh();
    const id = undo.createNote({ target: rect(0, 0, 10, 10), body: text("keep") });
    undo.mark("delete");
    undo.deleteNote(id);
    expect(undo.notes()).toHaveLength(0);

    undo.undo();
    expect(undo.notes().map((n) => n.logicalId)).toEqual([id]);
    expect(session.notes()).toHaveLength(0); // the log's own projection is still deleted
    expect(session.entries.filter((r) => r.deleted)).toHaveLength(1);
  });

  it("with nothing undone the projection IS the session's array, identity included", () => {
    // The identity contract HeadIndex.heads documents (a Svelte $derived reads "same array ⇒ no
    // change"). A wrapper that rebuilt the array on every read would silently break it.
    const { session, undo } = fresh();
    undo.createNote({ target: rect(0, 0, 10, 10) });
    expect(undo.notes()).toBe(session.notes());
    undo.undo();
    expect(undo.notes()).not.toBe(session.notes());
    undo.redo();
    expect(undo.notes()).toBe(session.notes()); // the overlay emptied itself again
  });
});

describe("AnnotationUndoManager — marks", () => {
  it("bailToMark abandons everything after the mark and pushes no redo", () => {
    const { undo } = fresh();
    const a = undo.createNote({ target: rect(0, 0, 10, 10), body: text("A") });
    undo.mark("m");
    undo.createNote({ target: rect(20, 20, 10, 10), body: text("B") });
    expect(undo.notes()).toHaveLength(2);

    undo.bailToMark("m");
    expect(undo.notes().map((n) => n.logicalId)).toEqual([a]);
    expect(undo.canRedo).toBe(false);
  });

  it("bailToMark unwinds past intervening marks, and an unknown mark unwinds nothing", () => {
    const { undo } = fresh();
    const a = undo.createNote({ target: rect(0, 0, 10, 10), body: text("A") });
    undo.mark("outer");
    undo.createNote({ target: rect(20, 20, 10, 10), body: text("B") });
    undo.mark("inner");
    undo.createNote({ target: rect(40, 40, 10, 10), body: text("C") });

    undo.bailToMark("nope");
    expect(undo.notes()).toHaveLength(3);

    undo.bailToMark("outer");
    expect(undo.notes().map((n) => n.logicalId)).toEqual([a]);
  });

  it("undo reverses one marked block at a time", () => {
    const { undo } = fresh();
    undo.mark("one");
    const a = undo.createNote({ target: rect(0, 0, 10, 10), body: text("A") });
    undo.mark("two");
    undo.createNote({ target: rect(20, 20, 10, 10), body: text("B") });
    undo.createNote({ target: rect(40, 40, 10, 10), body: text("C") });

    undo.undo(); // the whole "two" block — B and C together, because no mark separates them
    expect(undo.notes().map((n) => n.logicalId)).toEqual([a]);

    undo.undo();
    expect(undo.notes()).toHaveLength(0);
  });
});

describe("AnnotationUndoManager — the log is append-only, whatever the projection says", () => {
  it("every version survives undo, bail and redo (ADR-0003 immutability pin)", () => {
    const { session, undo } = fresh();
    const id = undo.createNote({ target: rect(0, 0, 10, 10), body: text("v1") });
    undo.mark("e1");
    undo.editNote(id, { body: text("v2") });
    undo.mark("e2");
    undo.editNote(id, { body: text("v3") });
    const afterAuthoring = [...session.entries];
    expect(afterAuthoring).toHaveLength(3);

    undo.undo();
    expect(bodyText(undo.notes()[0]!)).toBe("v2");
    undo.undo();
    expect(bodyText(undo.notes()[0]!)).toBe("v1");
    undo.redo();
    expect(bodyText(undo.notes()[0]!)).toBe("v2");
    // "e1" was CONSUMED by the second undo — a mark is a one-shot boundary, as in tldraw — so this
    // bail has nothing to unwind. Pinned deliberately: the alternative reading (marks persist and
    // can be bailed to repeatedly) would make undo and bail disagree about the same stack.
    undo.bailToMark("e1");
    expect(bodyText(undo.notes()[0]!)).toBe("v2");

    // Not merely the same length — the same records, in the same order, byte for byte.
    expect(session.entries).toHaveLength(3);
    expect(session.entries).toEqual(afterAuthoring);
    expect(session.entries.map((r) => r.rev)).toEqual(afterAuthoring.map((r) => r.rev));
    expect(session.entries.map((r) => bodyText(r))).toEqual(["v1", "v2", "v3"]);
    // …and v3 is still the log's head throughout, whatever the surface was showing.
    expect(bodyText(session.notes()[0]!)).toBe("v3");
  });

  it("an outstanding undo survives a colleague's merge, and the merged notes come through", () => {
    // The property that decides Archie-0f72: the overlay is keyed PER logicalId, so a wholesale log
    // replacement (importChanges → setLog → a rebuilt HeadIndex) flows through untouched except for
    // the ids the author actually undid. A whole-projection snapshot — freecut's shape — would be a
    // stale array here and would hide every note the merge brought in.
    const session = new AnnotationSession(alice);
    const undo = new AnnotationUndoManager(session);
    undo.createNote({ target: rect(0, 0, 10, 10), body: text("mine-undone") });
    undo.undo();
    expect(undo.notes()).toHaveLength(0);

    const colleague = new AnnotationSession(asClientId("bob"));
    colleague.createNote({ target: rect(50, 50, 10, 10), body: text("theirs") });
    session.importChanges(colleague.entries);
    undo.resyncLog(); // the merge is the ONE legit bypass — the wrapper's contract, exercised here

    expect(session.notes()).toHaveLength(2); // the log projects both
    expect(undo.notes().map((n) => bodyText(n))).toEqual(["theirs"]); // the surface still hides the undone one
  });

  it("THE BOUNDARY: an undo does NOT survive save+reload — the note comes back", async () => {
    // Recorded, not fixed. The overlay is in-memory and the log is the only durable thing, so
    // reopening the exhibit re-projects every head — including the one the author had undone. This
    // is the deciding constraint for Archie-0f72: it is a property of PROJECTION-ONLY undo on an
    // append-only log, and it holds for the freecut whole-snapshot shape exactly as it does here.
    const fs = new MemoryFilesystem();
    const dir = await fs.root();
    const session = new AnnotationSession(alice);
    const undo = new AnnotationUndoManager(session);
    undo.createNote({ target: rect(0, 0, 10, 10), body: text("undone") });
    undo.undo();
    expect(undo.notes()).toHaveLength(0);

    await session.save(dir);
    const reloaded = await AnnotationSession.load(dir, alice);
    const reloadedUndo = new AnnotationUndoManager(reloaded);
    expect(reloadedUndo.notes()).toHaveLength(1);
    expect(bodyText(reloadedUndo.notes()[0]!)).toBe("undone");
  });

  it("an undone create is invisible to the surface and present in the log", () => {
    const { session, undo } = fresh();
    const id = undo.createNote({ target: rect(0, 0, 10, 10), body: text("ghost") });
    undo.undo();
    expect(undo.notes()).toHaveLength(0);
    expect(undo.workingAnnotations()).toHaveLength(0);
    expect(session.entries).toHaveLength(1);
    expect(session.entries[0]!.logicalId).toBe(id);
  });
});

/** A real conflict: bob forks alice's log at `base` (BEFORE alice's own edit) and edits the same
 *  note; importing the fork unions SIBLING revs — plural heads, the state the conflict card
 *  resolves. Alice must have edited after `base` was taken, or the union is a fast-forward. */
function importBobEdit(session: AnnotationSession, undo: AnnotationUndoManager, base: AnnotationLog, id: LogicalId): void {
  const bob = new AnnotationSession(asClientId("bob"), base);
  bob.editNote(id, { body: text("bob") });
  session.importChanges(bob.entries);
  undo.resyncLog(); // the merge bypasses the manager by design — re-baseline the tripwire
}

describe("AnnotationUndoManager — composite gestures (feasibility rec 2)", () => {
  it("a drag of many edits between one mark pair is ONE undo step", () => {
    const { session, undo } = fresh();
    const id = undo.createNote({ target: rect(0, 0, 10, 10) });
    undo.mark("drag");
    for (let i = 0; i < 10; i++) undo.editNote(id, { body: text(`v${i}`) });
    undo.mark("drag-end");

    undo.undo(); // the whole block — not ten fragments
    expect(undo.notes()[0]!.body).toBeUndefined(); // back to the created state
    expect(session.entries).toHaveLength(11); // and every version still in the log
    undo.redo();
    expect(bodyText(undo.notes()[0]!)).toBe("v9");
  });

  it("mark() with nothing pending is a no-op — an empty gesture cannot fragment history", () => {
    const { undo } = fresh();
    const a = undo.createNote({ target: rect(0, 0, 10, 10), body: text("A") });
    undo.mark("g1");
    undo.mark("g1"); // empty gesture re-arms
    undo.mark("g1"); // and again — still one boundary, not three
    undo.createNote({ target: rect(20, 20, 10, 10), body: text("B") });

    undo.undo(); // B's block alone
    expect(undo.notes().map((n) => n.logicalId)).toEqual([a]);
  });
});

describe("AnnotationUndoManager — the ring cap (feasibility rec 1)", () => {
  it("undo depth is capped at `limit` blocks; oldest drop first; the log never shrinks", () => {
    const { session, undo } = fresh({ limit: 2 });
    for (let i = 0; i < 3; i++) {
      undo.createNote({ target: rect(i * 20, 0, 10, 10), body: text(`n${i}`) });
      undo.mark(`m${i}`);
    }
    expect(undo.notes()).toHaveLength(3);

    undo.undo();
    expect(undo.notes()).toHaveLength(2);
    undo.undo();
    expect(undo.notes()).toHaveLength(1); // depth 2 held — two full blocks
    undo.undo();
    expect(undo.notes()).toHaveLength(1); // n0's block was trimmed — depth lost, not corrupted
    expect(undo.canUndo).toBe(false);
    expect(session.entries).toHaveLength(3); // the log is untouched by any of it
  });
});

describe("AnnotationUndoManager — undo × conflict resolution (the gap the prototype left)", () => {
  it("plural heads under an outstanding overlay show ONE row — the per-id verdict, not a duplicate", () => {
    const { session, undo } = fresh();
    const id = undo.createNote({ target: rect(0, 0, 10, 10), body: text("v1") });
    const base = session.entries; // bob forks HERE — sibling revs, not a child of v2
    undo.mark("e");
    undo.editNote(id, { body: text("v2") });
    undo.undo(); // the surface now shows v1 via the overlay…
    importBobEdit(session, undo, base, id); // …while the log grows plural heads for the same id

    expect(session.notes().filter((n) => n.logicalId === id)).toHaveLength(2); // honest degradation
    const rows = undo.notes().filter((n) => n.logicalId === id);
    expect(rows).toHaveLength(1); // the overlay is a verdict on the ID, not on each head row
    expect(bodyText(rows[0]!)).toBe("v1");
  });

  it("WHY resolveNote EXISTS: a raw session.resolve lands UNDER a stale overlay, silently", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { session, undo } = fresh();
    const id = undo.createNote({ target: rect(0, 0, 10, 10), body: text("v1") });
    const base = session.entries;
    undo.mark("e");
    undo.editNote(id, { body: text("v2") });
    undo.undo();
    importBobEdit(session, undo, base, id);

    session.resolve(id, { body: text("merged") }); // the RAW path the conflict card could take
    expect(bodyText(session.notes().find((n) => n.logicalId === id)!)).toBe("merged"); // log resolved…
    expect(bodyText(undo.notes()[0]!)).toBe("v1"); // …but the surface never heard. The divergence.
    expect(err).toHaveBeenCalledTimes(1); // and the tripwire fired — resolve is a mutation
    err.mockRestore();
  });

  it("resolveNote routes the resolution onto the surface and the undo stack; the log only grows", () => {
    const { session, undo } = fresh();
    const id = undo.createNote({ target: rect(0, 0, 10, 10), body: text("v1") });
    const base = session.entries;
    undo.mark("e");
    undo.editNote(id, { body: text("v2") });
    importBobEdit(session, undo, base, id);
    const before = [...session.entries];

    undo.resolveNote(id, { body: text("merged") });
    expect(bodyText(session.notes().find((n) => n.logicalId === id)!)).toBe("merged");
    expect(bodyText(undo.notes()[0]!)).toBe("merged"); // the surface shows the merge node
    expect(session.entries).toHaveLength(before.length + 1); // exactly the merge node appended
    expect(session.entries.slice(0, before.length)).toEqual(before); // prefix byte-identical

    undo.undo(); // the resolution is undoable — the surface falls back to what it showed before
    const shown = undo.notes().filter((n) => n.logicalId === id);
    expect(shown).toHaveLength(1); // ONE record — the per-id diff cannot express the second head
    expect(bodyText(shown[0]!)).toBeDefined(); // (one of the two competing heads — the pinned
    // approximation in resolveNote's doc) — but never the merge node, never a duplicate row
    undo.redo();
    expect(bodyText(undo.notes()[0]!)).toBe("merged");
  });

  it("a resolution voids an outstanding undo decision for the same note", () => {
    const { session, undo } = fresh();
    const id = undo.createNote({ target: rect(0, 0, 10, 10), body: text("v1") });
    const base = session.entries;
    undo.mark("e");
    undo.editNote(id, { body: text("v2") });
    undo.undo(); // stale "show v1" decision now outstanding
    importBobEdit(session, undo, base, id);

    undo.resolveNote(id, { body: text("merged") });
    expect(bodyText(undo.notes()[0]!)).toBe("merged"); // not the stale v1 — the newest word wins
  });

  it("resolveNote refuses a note that is not conflicted (session.resolve's own contract)", () => {
    const { undo } = fresh();
    const id = undo.createNote({ target: rect(0, 0, 10, 10), body: text("v1") });
    expect(() => undo.resolveNote(id, {})).toThrow(/no conflict/);
  });
});

describe("AnnotationUndoManager — the bypass tripwire (a missed call site must not fail silently)", () => {
  it("a mutation that skips the manager is reported loudly on the next projection read", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { session, undo } = fresh();
    undo.notes(); // baseline
    session.createNote({ target: rect(50, 50, 10, 10), body: text("bypass") }); // NOT through the manager
    undo.notes(); // the observation
    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0]?.[0]).toMatch(/did not go through this manager/);
    err.mockRestore();
  });

  it("resyncLog clears the report after a legitimate importChanges", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { session, undo } = fresh();
    undo.notes();
    const colleague = new AnnotationSession(asClientId("bob"));
    colleague.createNote({ target: rect(50, 50, 10, 10), body: text("theirs") });
    session.importChanges(colleague.entries);
    undo.resyncLog();
    undo.notes();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});


describe("editing the visible note after undo", () => {
  it("carries the visible content into a new durable descendant of the current head", async () => {
    const { session, undo } = fresh();
    const id = undo.createNote({ target: rect(0, 0, 10, 10), body: text("original"), reading: "cipher" });
    undo.mark("edit");
    undo.editNote(id, { body: text("discarded"), reading: "hoax" });
    const oldHead = session.notes()[0]!;
    const history = [...session.entries];
    undo.undo();
    undo.mark("resume");
    undo.editNote(id, { target: rect(20, 20, 10, 10) });
    expect(bodyText(undo.notes()[0]!)).toBe("original");
    expect(undo.notes()[0]!.reading).toBe("cipher");
    expect(undo.notes()[0]!.target).toEqual(rect(20, 20, 10, 10));
    expect(undo.notes()).toBe(session.notes());
    expect(session.notes()[0]!.parent).toBe(oldHead.rev);
    expect(session.notes()[0]!.version).toBe(oldHead.version + 1);
    expect(session.entries.slice(0, history.length)).toEqual(history);
    const dir = await new MemoryFilesystem().root();
    await session.save(dir);
    expect((await AnnotationSession.load(dir, alice)).notes()).toEqual(undo.notes());
    undo.undo();
    expect(undo.notes()[0]!.target).toEqual(rect(0, 0, 10, 10));
    expect(bodyText(undo.notes()[0]!)).toBe("original");
  });

  it("edits a visibly restored deletion while preserving its tombstone history", () => {
    const { session, undo } = fresh();
    const id = undo.createNote({ target: rect(0, 0, 10, 10), body: text("restored"), section: "s1" });
    undo.mark("delete");
    undo.deleteNote(id);
    const tombstone = session.entries.at(-1)!;
    undo.undo();
    undo.mark("resume");
    undo.editNote(id, { body: text("new authored version") });
    expect(bodyText(undo.notes()[0]!)).toBe("new authored version");
    expect(undo.notes()[0]!.section).toBe("s1");
    expect(session.notes()[0]!.parent).toBe(tombstone.rev);
    expect(session.entries).toContain(tombstone);
    expect(session.conflicts()).toEqual([]);
    undo.undo();
    expect(bodyText(undo.notes()[0]!)).toBe("restored");
  });

  it("can delete a restored note again without treating its displayed state as absent", () => {
    const { session, undo } = fresh();
    const id = undo.createNote({ target: canvas, body: text("restored") });
    undo.mark("delete");
    undo.deleteNote(id);
    undo.undo();
    undo.mark("delete again");
    expect(() => undo.deleteNote(id)).not.toThrow();
    expect(undo.notes()).toEqual([]);
    expect(session.notes()).toEqual([]);
    undo.undo();
    expect(bodyText(undo.notes()[0]!)).toBe("restored");
  });
});
