import { describe, it, expect } from "vitest";
import { resolveNoteArrival, type NoteArrivalData } from "./note-arrival.js";

// A note in the base page resolves with reading:null; a note only on a per-reading page resolves with
// that reading id; an unknown id (tombstoned cite) resolves null. Mirrors the deep-link owner search.
//
// REALISTIC IDS, DELIBERATELY (V100, Archie-67b6). This fixture used to use `"n-base"` as BOTH the
// queried id and the annotation's id. Every case then passed under the broken `a.id === noteId`
// comparison, because the two sides were literally the same string — the suite was structurally
// incapable of modelling the bug, which is how a cite rung that had NEVER resolved kept a green file.
//
// The real shapes: an annotation's `id` is the published IRI `{base}{slug}/annotations/{ULID}/v{n}`
// (publish/site.ts `citeBase`), while the address bar carries only the bare ULID (`#/<slug>/a/<ULID>`).
// Both must resolve, and the resolver must hand back the PUBLISHED id.
const BASE = "https://micahchoo.github.io/Archie/viewer/published/voynich/annotations";
const ULID_BASE = "01KVPP7FN3KRAF8B45HJQKYSZG";
const ULID_CIPHER = "01KVPP80S5NHFMEBP6XPB5X6B5";
const ID_BASE = `${BASE}/${ULID_BASE}/v1`;
const ID_CIPHER = `${BASE}/${ULID_CIPHER}/v2`;

const objects = [{ id: "o1" }, { id: "o2" }];

const data: NoteArrivalData = {
  annotationsByObject: {
    o1: [{ id: ID_BASE, type: "Annotation", motivation: "commenting", target: "" }],
    o2: [],
  },
  readingAnnotationsByObject: {
    o2: {
      cipher: [{ id: ID_CIPHER, type: "Annotation", motivation: "commenting", target: "" }],
      hoax: [],
    },
  },
};

describe("resolveNoteArrival", () => {
  it("resolves a base-page note from the ADDRESS-BAR form (a bare ULID)", () => {
    // The exact shape that never resolved: one path segment in, a full IRI in the data.
    expect(resolveNoteArrival(ULID_BASE, objects, data)).toEqual({
      objectId: "o1", reading: null, noteId: ID_BASE,
    });
  });

  it("resolves a per-reading note from the address-bar form, with its reading id", () => {
    expect(resolveNoteArrival(ULID_CIPHER, objects, data)).toEqual({
      objectId: "o2", reading: "cipher", noteId: ID_CIPHER,
    });
  });

  it("also accepts the FULL IRI — internal callers (search, keyboard index) pass that", () => {
    expect(resolveNoteArrival(ID_BASE, objects, data)).toEqual({
      objectId: "o1", reading: null, noteId: ID_BASE,
    });
  });

  it("hands back the PUBLISHED id, not the id it was asked with", () => {
    // The second half of V100: `arrivedNote` feeds Reader's `initialSelected`, which is matched
    // against `annotation.id`. Returning the caller's bare ULID re-opened the same gap one layer
    // down — the object would open and the note still never select.
    expect(resolveNoteArrival(ULID_BASE, objects, data)!.noteId).toBe(ID_BASE);
  });

  it("ignores the VERSION — a cite minted before an edit still lands (ADR-0003)", () => {
    // ID_CIPHER is /v2; a citation captured at /v1 names the same logical note.
    expect(resolveNoteArrival(`${BASE}/${ULID_CIPHER}/v1`, objects, data)).toEqual({
      objectId: "o2", reading: "cipher", noteId: ID_CIPHER,
    });
  });

  it("resolves an unknown id to null (tombstoned cite, ADR-0003)", () => {
    expect(resolveNoteArrival("01KVPQ3WXQ4PJ0614J4BEAC2XN", objects, data)).toBeNull();
  });

  it("degrades on a malformed id rather than throwing", () => {
    // A hand-edited address must land somewhere honest, never break the page.
    for (const bad of ["", "   ", "not-a-ulid", "../../etc/passwd", `${BASE}/nope/v1`]) {
      expect(resolveNoteArrival(bad, objects, data)).toBeNull();
    }
  });
});
