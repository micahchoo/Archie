import { describe, it, expect } from "vitest";
import { resolveNoteArrival, type NoteArrivalData } from "./note-arrival.js";

// resolveNoteArrival is now a THIN composition over note-tree.locate (Phase 5) — the canonical walk.
// The full V100 regression suite (bare ULID / full IRI / versioned / tombstoned / malformed, plus
// the published-id return contract) moved to note-tree.test.ts, where the ONE implementation lives.
// This file pins the public seam ExhibitView calls: same signature, same resolution, via the walk.

// REALISTIC IDS (V100, Archie-67b6): an annotation's `id` is the published IRI
// `{base}{slug}/annotations/{ULID}/v{n}`; the address bar carries the bare ULID.
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

describe("resolveNoteArrival — the A0 seam resolves through the canonical walk", () => {
  it("resolves a base-page note from the ADDRESS-BAR form (a bare ULID)", () => {
    expect(resolveNoteArrival(ULID_BASE, objects, data)).toEqual({
      objectId: "o1", reading: null, noteId: ID_BASE,
    });
  });

  it("resolves a per-reading note from the address-bar form, with its reading id", () => {
    expect(resolveNoteArrival(ULID_CIPHER, objects, data)).toEqual({
      objectId: "o2", reading: "cipher", noteId: ID_CIPHER,
    });
  });

  it("hands back the PUBLISHED id, not the id it was asked with (V100's second half)", () => {
    expect(resolveNoteArrival(ULID_BASE, objects, data)!.noteId).toBe(ID_BASE);
  });

  it("resolves an unknown id to null (tombstoned cite, ADR-0003)", () => {
    expect(resolveNoteArrival("01KVPQ3WXQ4PJ0614J4BEAC2XN", objects, data)).toBeNull();
  });
});
