import { describe, it, expect } from "vitest";
import { MemoryFilesystem } from "../fs/memory.js";
import { publishLibrary, readPublishedExhibit } from "./site.js";
import { appendNew } from "../spine/log.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";
import type { AnnotationLog } from "../wadm/types.js";

// LV-C1: the in-Studio Preview reads the PUBLISHED projection from an in-memory Filesystem, so
// "what you preview == what publishes" (CONTEXT §"Local view loop"). This is the testable heart of
// Phase C; the visual panel (LV-C2) is the human gate.

const author = asClientId("curator");
const base = "https://u.gh.io/lib/";
const canvasId = `${base}voynich/canvas/o1`;
const note = appendNew([], { target: canvasId, body: { type: "TextualBody", value: "hi" }, lastEditor: author, modifiedAt: "t", now: 1 }).record;
const lib: Library = {
  id: asLibraryId("L"),
  title: "Lib",
  exhibits: [{ id: asExhibitId("e1"), slug: "voynich", title: "Voynich", objects: [{ id: asObjectId("o1"), source: "https://img/1.jpg", label: "one" }] }],
};
const logs: Record<string, AnnotationLog> = { e1: [note] };

describe("readPublishedExhibit (preview == publish, in-memory)", () => {
  it("reads back the exhibit's objects, per-object heads, and canvas IRIs from the published memFs", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, lib, (id) => logs[id] ?? [], { baseUrl: base });
    const ex = await readPublishedExhibit(fs, "voynich");
    expect(ex.title).toBe("Voynich");
    expect(ex.objects.map((o) => o.id)).toEqual(["o1"]);
    expect(ex.canvasIdByObject).toEqual({ o1: canvasId }); // IRI from the manifest, not a fixed BASE
    expect(ex.annotationsByObject.o1?.length).toBe(1); // the head note, grouped under its canvas
    expect(ex.readings).toEqual([]); // base-only exhibit → empty registry (ADR-0007)
    expect(ex.readingAnnotationsByObject).toEqual({}); // …and no per-reading pages
  });

  // ADR-0007 read↔write symmetry: readPublishedExhibit reads back the Readings registry + per-reading
  // pages that publishLibrary writes, mirroring loadPortableExhibit/the viewer (minus the blob rewrite).
  it("surfaces the readings registry and per-reading pages (ADR-0007)", async () => {
    const rdLib: Library = {
      id: asLibraryId("L"),
      title: "Lib",
      exhibits: [{
        id: asExhibitId("e1"),
        slug: "rd",
        title: "Readings",
        objects: [{ id: asObjectId("o1"), source: "https://img/1.jpg", label: "one" }],
        readings: [{ id: "cipher", name: "Cipher" }, { id: "hoax", name: "Hoax" }],
      }],
    };
    const rdCanvas = `${base}rd/canvas/o1`;
    let rdLog = appendNew([], { target: rdCanvas, body: { type: "TextualBody", value: "ciph" }, lastEditor: author, modifiedAt: "t", now: 1, reading: "cipher" }).log;
    rdLog = appendNew(rdLog, { target: rdCanvas, body: { type: "TextualBody", value: "base" }, lastEditor: author, modifiedAt: "t", now: 2 }).log;
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, rdLib, (id) => (id === "e1" ? rdLog : []), { baseUrl: base });
    const ex = await readPublishedExhibit(fs, "rd");
    expect(ex.readings.map((r) => r.id)).toEqual(["cipher", "hoax"]); // registry surfaced
    expect(ex.readingAnnotationsByObject.o1?.cipher?.length).toBe(1); // the reading-assigned note read back
    expect(ex.readingAnnotationsByObject.o1?.hoax?.length).toBe(0); // empty per-reading page tolerated
    expect(ex.annotationsByObject.o1?.length).toBe(1); // the reading-less note stays in the base page
  });

  // Bug repro: "notes don't show when a section is present" (narrative layout). Verify the narrative
  // DATA path — section.objectId recovered correctly AND the same object still carries its heads —
  // so NarrativeReader's activeNotes = annotationsByObject[section.objectId] is populated.
  it("a sectioned (narrative) exhibit still surfaces the object's notes, keyed to the section's objectId", async () => {
    const narrativeLib: Library = {
      id: asLibraryId("L"),
      exhibits: [{
        id: asExhibitId("e1"),
        slug: "story",
        title: "Story",
        objects: [{ id: asObjectId("o1"), source: "https://img/1.jpg", label: "one" }],
        sections: [{ id: "s1", title: "Section 1", objectId: "o1", start: "xywh=0,0,10,10", prose: "hi" }],
      }],
    };
    const storyCanvas = `${base}story/canvas/o1`;
    const storyNote = appendNew([], { target: storyCanvas, body: { type: "TextualBody", value: "narr" }, lastEditor: author, modifiedAt: "t", now: 1 }).record;
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, narrativeLib, (id) => (id === "e1" ? [storyNote] : []), { baseUrl: base });
    const ex = await readPublishedExhibit(fs, "story");
    expect(ex.sections.map((s) => s.objectId)).toEqual(["o1"]); // section.objectId recovered
    expect(ex.canvasIdByObject.o1).toBe(storyCanvas);
    expect(ex.annotationsByObject.o1?.length).toBe(1); // ← the note NarrativeReader should render
  });
});
