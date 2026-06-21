import { describe, it, expect } from "vitest";
import { resolveNoteArrival, type NoteArrivalData } from "./note-arrival.js";

// A note in the base page resolves with reading:null; a note only on a per-reading page resolves with
// that reading id; an unknown id (tombstoned cite) resolves null. Mirrors the deep-link owner search.
const objects = [{ id: "o1" }, { id: "o2" }];

const data: NoteArrivalData = {
  annotationsByObject: {
    o1: [{ id: "n-base", type: "Annotation", motivation: "commenting", target: "" }],
    o2: [],
  },
  readingAnnotationsByObject: {
    o2: {
      cipher: [{ id: "n-cipher", type: "Annotation", motivation: "commenting", target: "" }],
      hoax: [],
    },
  },
};

describe("resolveNoteArrival", () => {
  it("resolves a base-page note with reading null, on the owning object", () => {
    expect(resolveNoteArrival("n-base", objects, data)).toEqual({ objectId: "o1", reading: null });
  });

  it("resolves a per-reading note with its reading id, on the owning object", () => {
    expect(resolveNoteArrival("n-cipher", objects, data)).toEqual({ objectId: "o2", reading: "cipher" });
  });

  it("resolves an unknown id to null (tombstoned cite, ADR-0003)", () => {
    expect(resolveNoteArrival("n-gone", objects, data)).toBeNull();
  });
});
