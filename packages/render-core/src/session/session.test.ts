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
  // (Removed: the `archie:layers` working-annotation assertion — `layers` is retired by the ADR-0007
  //  contraction; legacy values fold into Tags at load. Reading/emphasis/geo working-annotation
  //  carries are covered in reading.test.ts + the geo/emphasis suites.)
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

  it("resolve() carries reading + geo (+ emphasis) onto the merge node — they are NOT dropped on conflict resolution", () => {
    const geo = { type: "bbox" as const, west: -1, south: 50, east: 1, north: 52 };
    const local = new AnnotationSession(alice);
    // A Map note carrying a reading assignment, authored emphasis, AND a geo anchor.
    const id = local.createNote({ target: rect(0, 0, 10, 10), body: { type: "TextualBody", value: "v1" }, reading: "cipher", emphasis: "strong", geo });
    const v1 = local.entries[0]!;
    local.editNote(id, { body: { type: "TextualBody", value: "mine" } }); // local v2 (carries reading/emphasis/geo forward)

    // A CONCURRENT edit of the same note from a colleague, also branching off v1 → a genuine conflict.
    const theirV2 = { logicalId: v1.logicalId, rev: mintRevId(0, () => 0.9), version: 2, parent: v1.rev, modifiedAt: "tT", lastEditor: bob, deleted: false, target: rect(0, 0, 10, 10), body: { type: "TextualBody" as const, value: "theirs" } };
    local.importChanges([v1, theirV2]);
    expect(local.conflictHeads(id as LogicalId)).toHaveLength(2);

    // Resolve WITHOUT re-specifying reading/emphasis/geo — they must inherit from the primary head.
    local.resolve(id as LogicalId, { body: { type: "TextualBody", value: "merged" } });
    const head = local.notes().find((r) => r.logicalId === id)!;
    expect(head.reading).toBe("cipher");
    expect(head.emphasis).toBe("strong");
    expect(head.geo).toEqual(geo);
    // And they reach the working projection the editor binds to.
    const ann = local.workingAnnotations().find((a) => a.id === id)! as unknown as Record<string, unknown>;
    expect(ann["archie:reading"]).toBe("cipher");
    expect(ann["archie:geo"]).toEqual(geo);
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

  // Incremental persist (write-amplification fix): the session writes only changed pages after the first
  // full save. These guard data SAFETY — every mutation kind must reach disk, and a seed must full-write.
  const text = (value: string) => ({ type: "TextualBody" as const, value });
  const valueOf = (r: { body?: unknown } | undefined): string | undefined => {
    const b = r?.body as { value?: string } | Array<{ value?: string }> | undefined;
    return Array.isArray(b) ? b[0]?.value : b?.value;
  };

  it("persists every mutation kind across INCREMENTAL saves — reload is correct (no dirty-tracking gap)", async () => {
    const fs = new MemoryFilesystem();
    const root = await fs.root();
    const s = new AnnotationSession(alice);
    const a = s.createNote({ target: rect(0, 0, 10, 10), body: text("a1") });
    const b = s.createNote({ target: rect(20, 0, 10, 10), body: text("b1") });
    await s.save(root); // first save → FULL (persistedFully was false)
    s.editNote(a, { body: text("a2") });
    await s.save(root); // incremental → only A
    const c = s.createNote({ target: rect(40, 0, 10, 10), body: text("c1") });
    await s.save(root); // incremental → only C (a create AFTER the first save)
    s.deleteNote(b);
    await s.save(root); // incremental → only B (tombstone)

    const reloaded = await AnnotationSession.load(root, alice);
    const byId = new Map(reloaded.notes().map((r) => [r.logicalId, r]));
    expect(valueOf(byId.get(a))).toBe("a2"); // edit persisted incrementally
    expect(valueOf(byId.get(c))).toBe("c1"); // post-first-save create persisted incrementally
    const liveIds = reloaded.notes().filter((r) => !r.deleted).map((r) => r.logicalId);
    expect(liveIds).toContain(a);
    expect(liveIds).toContain(c);
    expect(liveIds).not.toContain(b); // delete persisted incrementally
  });

  it("a seeded session (log via constructor, no mutations) FULL-writes on first save", async () => {
    const fs = new MemoryFilesystem();
    const root = await fs.root();
    const { log } = appendNew([], { target: rect(0, 0, 5, 5), body: text("seed"), lastEditor: alice, modifiedAt: "t", now: 1 });
    const s = new AnnotationSession(alice, log); // seed NOT via createNote → dirty empty, persistedFully false
    await s.save(root); // must full-write the seed, NOT skip it because the dirty set is empty
    const reloaded = await AnnotationSession.load(root, alice);
    expect(valueOf(reloaded.notes()[0])).toBe("seed");
  });
});
