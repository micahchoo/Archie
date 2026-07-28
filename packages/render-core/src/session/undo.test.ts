import { describe, it, expect } from "vitest";
import { AnnotationSession } from "./session.js";
import { AnnotationUndoManager } from "./undo.js";
import { asClientId } from "../wadm/brand.js";
import type { W3CSpecificResource } from "../wadm/types.js";

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

function fresh(): { session: AnnotationSession; undo: AnnotationUndoManager } {
  const session = new AnnotationSession(alice);
  return { session, undo: new AnnotationUndoManager(session) };
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
