import { describe, it, expect } from "vitest";
import { AnnotationSession } from "./session.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { appendNew } from "../spine/log.js";
import { asClientId, mintRevId, type LogicalId } from "../wadm/brand.js";
import type { W3CSpecificResource } from "../wadm/types.js";

// The Studio editor brain (pure, headless-tested): owns an annotation log, create/edit/delete
// notes, projects working annotations keyed by stable logicalId (so selection survives edits),
// persists/reloads via the Filesystem seam. The Svelte editor is a thin shell over this.

const alice = asClientId("alice");
const bob = asClientId("bob");
const canvas = "https://archie.demo/sample/canvas/o1";
const rect = (x: number, y: number, w: number, h: number): W3CSpecificResource => ({
  type: "SpecificResource",
  source: canvas,
  selector: { type: "FragmentSelector", value: `xywh=pixel:${x},${y},${w},${h}` },
});

describe("AnnotationSession — log-boundary degenerate guard (worklist 0.2)", () => {
  const degenerateSvg = (): W3CSpecificResource => ({
    type: "SpecificResource",
    source: canvas,
    selector: { type: "SvgSelector", value: '<svg><polygon points=""></polygon></svg>' },
  });
  const nanRect = (): W3CSpecificResource => ({
    type: "SpecificResource",
    source: canvas,
    selector: { type: "FragmentSelector", value: "xywh=pixel:NaN,0,10,10" },
  });

  it("createNote refuses a degenerate target — the log never holds unrenderable geometry", () => {
    const s = new AnnotationSession(alice);
    expect(() => s.createNote({ target: degenerateSvg() })).toThrow(/degenerate/);
    expect(() => s.createNote({ target: nanRect() })).toThrow(/degenerate/);
    expect(s.entries).toHaveLength(0);
  });

  it("editNote refuses a degenerate replacement target (original head stays intact)", () => {
    const s = new AnnotationSession(alice);
    const id = s.createNote({ target: rect(0, 0, 10, 10) });
    expect(() => s.editNote(id, { target: nanRect() })).toThrow(/degenerate/);
    expect(s.notes()[0]!.version).toBe(1); // nothing appended
  });

  it("a selector-less target (whole-canvas / Exhibit / Library note) is NOT degenerate", () => {
    const s = new AnnotationSession(alice);
    const id = s.createNote({ target: { type: "SpecificResource", source: canvas } as W3CSpecificResource });
    expect(s.notes()).toHaveLength(1);
    s.editNote(id, { body: { type: "TextualBody", value: "curatorial prose" } }); // body-only edit untouched by the guard
    expect(s.notes()[0]!.version).toBe(2);
  });
});

describe("AnnotationSession — create / edit / delete", () => {
  it("createNote appends a note and returns its stable logicalId", () => {
    const s = new AnnotationSession(alice);
    const id = s.createNote({ target: rect(0, 0, 10, 10), body: { type: "TextualBody", value: "hi" } });
    expect(s.notes()).toHaveLength(1);
    expect(s.workingAnnotations()[0]!.id).toBe(id); // working annotation keyed by logicalId
  });

  it("editNote bumps the version but keeps the SAME working id (selection survives edits)", () => {
    const s = new AnnotationSession(alice);
    const id = s.createNote({ target: rect(0, 0, 10, 10), body: { type: "TextualBody", value: "v1" } });
    s.editNote(id, { body: { type: "TextualBody", value: "v2" } });
    const notes = s.notes();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.version).toBe(2);
    expect(s.workingAnnotations()[0]!.id).toBe(id); // unchanged across the edit
    expect(s.entries).toHaveLength(2); // append-only: v1 + v2 both retained
  });

  it("deleteNote removes the note from the working view (tombstone retained in the log)", () => {
    const s = new AnnotationSession(alice);
    const id = s.createNote({ target: rect(0, 0, 10, 10) });
    s.deleteNote(id);
    expect(s.notes()).toHaveLength(0);
    expect(s.entries).toHaveLength(2); // create + tombstone
  });

  it("carries layers onto the working annotation (archie:layers, for the editor's layer view)", () => {
    const s = new AnnotationSession(alice);
    s.createNote({ target: rect(0, 0, 10, 10), layers: ["conservation"] });
    expect((s.workingAnnotations()[0] as unknown as Record<string, unknown>)["archie:layers"]).toEqual(["conservation"]);
  });
});

describe("AnnotationSession — collaboration (Import changes / resolve)", () => {
  it("fast-forwards silently and flags genuine conflicts", () => {
    const local = new AnnotationSession(alice);
    const id = local.createNote({ target: rect(0, 0, 10, 10), body: { type: "TextualBody", value: "v1" } });
    const v1 = local.entries[0]!;
    local.editNote(id, { body: { type: "TextualBody", value: "mine" } }); // local v2

    // Colleague's incoming log: the shared v1 + a CONCURRENT v2 (also from v1) + a brand-new note.
    const theirV2 = { logicalId: v1.logicalId, rev: mintRevId(0, () => 0.9), version: 2, parent: v1.rev, modifiedAt: "tT", lastEditor: bob, deleted: false, target: rect(0, 0, 10, 10), body: { type: "TextualBody" as const, value: "theirs" } };
    const newNote = appendNew([], { target: rect(50, 50, 5, 5), body: { type: "TextualBody", value: "brand new" }, lastEditor: bob, modifiedAt: "t", now: 5 }).record;
    const incoming = [v1, theirV2, newNote];

    const needDecision = local.importChanges(incoming);
    expect(needDecision).toEqual([id]); // the concurrent note conflicts
    expect(local.notes().some((r) => r.logicalId === newNote.logicalId)).toBe(true); // the new note was adopted (ff)
    expect(local.conflictHeads(id as LogicalId)).toHaveLength(2); // both sides available to the card

    local.resolve(id as LogicalId, { body: { type: "TextualBody", value: "merged" } });
    expect(local.conflicts()).toEqual([]); // resolved
    expect(local.notes().filter((r) => r.logicalId === id)).toHaveLength(1); // single head again
  });
});

describe("AnnotationSession — persistence round-trip", () => {
  it("saves to the seam and reloads an equivalent session", async () => {
    const s = new AnnotationSession(alice);
    s.createNote({ target: rect(0, 0, 10, 10), body: { type: "TextualBody", value: "a" } });
    s.createNote({ target: rect(20, 20, 5, 5), body: { type: "TextualBody", value: "b" } });
    const fs = new MemoryFilesystem();
    await s.save(await fs.root(), { baseUrl: "b/" });

    const reloaded = await AnnotationSession.load(await fs.root(), alice);
    expect(reloaded.notes().map((r) => r.logicalId).sort()).toEqual(s.notes().map((r) => r.logicalId).sort());
  });
});
