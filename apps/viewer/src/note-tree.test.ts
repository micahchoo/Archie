// THE canonical note-tree walk (Phase 5) — the ONE home for the owner search, the flat list and the
// exact-id lookup. The V100 regression suites from note-arrival.test.ts and narrative-landing.test.ts
// moved here (those files now pin the thin public seams over this module); the ORDER unification —
// per-object interleaved, first match wins — is pinned here too.
import { describe, it, expect } from "vitest";
import { flattenNotes, ownerOf, locate, noteById, type NoteTreeData } from "./note-tree.js";
import type { W3CAnnotation } from "@render/core";

const ann = (id: string): W3CAnnotation => ({ id, type: "Annotation", motivation: "commenting", target: "" });

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
const ULID_GONE = "01KVPQ3WXQ4PJ0614J4BEAC2XN";
const ID_BASE = `${BASE}/${ULID_BASE}/v1`;
const ID_CIPHER = `${BASE}/${ULID_CIPHER}/v2`;

const data: NoteTreeData = {
  annotationsByObject: {
    o1: [ann(ID_BASE)],
    o2: [],
  },
  readingAnnotationsByObject: {
    o2: {
      cipher: [ann(ID_CIPHER)],
      hoax: [],
    },
  },
};
const objects = [{ id: "o1" }, { id: "o2" }];

describe("ownerOf — the canonical owner search (V100 regression home)", () => {
  it("resolves a base-page note from the ADDRESS-BAR form (a bare ULID)", () => {
    // The exact shape that never resolved: one path segment in, a full IRI in the data.
    expect(ownerOf(ULID_BASE, data)).toEqual({
      objectId: "o1", reading: null, noteId: ID_BASE,
    });
  });

  it("resolves a per-reading note from the address-bar form, with its reading id", () => {
    expect(ownerOf(ULID_CIPHER, data)).toEqual({
      objectId: "o2", reading: "cipher", noteId: ID_CIPHER,
    });
  });

  it("also accepts the FULL IRI — internal callers (search, keyboard index) pass that", () => {
    expect(ownerOf(ID_BASE, data)).toEqual({
      objectId: "o1", reading: null, noteId: ID_BASE,
    });
  });

  it("hands back the PUBLISHED id, not the id it was asked with", () => {
    // The second half of V100: `arrivedNote` feeds Reader's `initialSelected`, which is matched
    // against `annotation.id`. Returning the caller's bare ULID re-opened the same gap one layer
    // down — the object would open and the note still never select.
    expect(ownerOf(ULID_BASE, data)!.noteId).toBe(ID_BASE);
  });

  it("ignores the VERSION — a cite minted before an edit still lands (ADR-0003)", () => {
    // ID_CIPHER is /v2; a citation captured at /v1 names the same logical note.
    expect(ownerOf(`${BASE}/${ULID_CIPHER}/v1`, data)).toEqual({
      objectId: "o2", reading: "cipher", noteId: ID_CIPHER,
    });
  });

  it("resolves an unknown id to null (tombstoned cite, ADR-0003)", () => {
    expect(ownerOf(ULID_GONE, data)).toBeNull();
  });

  it("degrades on a malformed id rather than throwing", () => {
    // A hand-edited address must land somewhere honest, never break the page.
    for (const bad of ["", "   ", "not-a-ulid", "../../etc/passwd", `${BASE}/nope/v1`]) {
      expect(ownerOf(bad, data)).toBeNull();
    }
  });
});

describe("ownerOf — the canonical ORDER (Phase 5 unification)", () => {
  it("is per-object interleaved — base(o1), readings(o1), base(o2), readings(o2) — first match wins", () => {
    // THE unification decision. The old ownerObjectOf scanned ALL base pages before ANY reading
    // page; the old resolveNoteArrival scanned per-object interleaved. Unified: the interleaved
    // order, which is EXACTLY the order flattenNotes walks — so "first match wins" here IS "first
    // in the flattened tree". Pinned consequence: a note carried in an EARLIER object's reading
    // page outranks the same logical note in a LATER object's base page.
    const dup = ULID_BASE;
    const d: NoteTreeData = {
      annotationsByObject: { o1: [], o2: [ann(`${BASE}/${dup}/v1`)] },
      readingAnnotationsByObject: { o1: { cipher: [ann(`${BASE}/${dup}/v3`)] } },
    };
    expect(ownerOf(dup, d)).toEqual({
      objectId: "o1", reading: "cipher", noteId: `${BASE}/${dup}/v3`,
    });
  });

  it("matches the flatten order — first in the flat list is the owner", () => {
    const dup = ULID_CIPHER;
    const d: NoteTreeData = {
      annotationsByObject: { o1: [ann(`${BASE}/${dup}/v1`)] },
      readingAnnotationsByObject: { o2: { cipher: [ann(`${BASE}/${dup}/v2`)] } },
    };
    // flattenNotes walks base(o1) before readings(o2) → o1's copy is first → ownerOf agrees.
    expect(flattenNotes(d)[0]!.id).toBe(`${BASE}/${dup}/v1`);
    expect(ownerOf(dup, d)).toEqual({ objectId: "o1", reading: null, noteId: `${BASE}/${dup}/v1` });
  });

  it("still finds a reading-only note on an object whose base page is empty", () => {
    // An object keyed ONLY in readingAnnotationsByObject (hand-built data; published data always
    // carries the base key too, but the walk must not depend on that).
    const d: NoteTreeData = {
      annotationsByObject: { o1: [] },
      readingAnnotationsByObject: { o2: { cipher: [ann(ID_CIPHER)] } },
    };
    expect(ownerOf(ULID_CIPHER, d)).toEqual({ objectId: "o2", reading: "cipher", noteId: ID_CIPHER });
  });
});

describe("locate — ownerOf over an explicit object list (resolveNoteArrival's seam)", () => {
  it("resolves the same way given the layout's object list", () => {
    expect(locate(ULID_BASE, data, objects)).toEqual({ objectId: "o1", reading: null, noteId: ID_BASE });
    expect(locate(ULID_CIPHER, data, objects)).toEqual({ objectId: "o2", reading: "cipher", noteId: ID_CIPHER });
    expect(locate(ULID_GONE, data, objects)).toBeNull();
  });

  it("respects the given object ORDER, not the map order", () => {
    // The seam's contract: `objects` is the layout's list, and first-match wins IN THAT ORDER.
    const d: NoteTreeData = {
      annotationsByObject: { a: [ann(ID_BASE)], b: [] },
      readingAnnotationsByObject: {},
    };
    expect(locate(ULID_BASE, d, [{ id: "b" }, { id: "a" }])).toEqual({
      objectId: "a", reading: null, noteId: ID_BASE,
    });
  });
});

describe("flattenNotes — the one flat list, canonical order", () => {
  it("pulls base + every reading page into one array, de-duped by id (base wins)", () => {
    const base = ann(ID_BASE);
    const onlyInReading = ann(`${BASE}/01KVPP81XQ4PJ0614J4BEAC2ZZ/v1`);
    const sharedOverlay = ann(ID_BASE); // same id as base — a reading overlay copy
    const flat = flattenNotes({
      annotationsByObject: { objA: [base] },
      readingAnnotationsByObject: { objA: { readingX: [sharedOverlay, onlyInReading] } },
    });
    const ids = flat.map((a) => a.id);
    // a note living ONLY in a non-active reading is present in the flat index (Q-4 scope = all readings)
    expect(ids).toContain(onlyInReading.id);
    expect(ids).toContain(ID_BASE);
    // de-duped: ID_BASE appears in base AND as a reading overlay, but only once (base wins)
    expect(ids.filter((id) => id === ID_BASE)).toHaveLength(1);
  });

  it("walks base pages and reading pages in the same per-object interleaved order ownerOf matches", () => {
    // base(o1) → readings(o1) → base(o2) → readings(o2) — the order the owner search's
    // first-match-wins agrees with (pinned above).
    const flat = flattenNotes(data);
    expect(flat.map((a) => a.id)).toEqual([ID_BASE, ID_CIPHER]);
  });
});

describe("noteById — exact published-id lookup (the cite panel's read)", () => {
  it("finds a note by its published id across base + reading pages", () => {
    expect(noteById(ID_CIPHER, data)?.id).toBe(ID_CIPHER);
    expect(noteById(ID_BASE, data)?.id).toBe(ID_BASE);
  });

  it("does NOT resolve a bare ULID — it is the exact-id query, not the owner search", () => {
    // Deliberately a different query from ownerOf: callers hold the published id already.
    expect(noteById(ULID_BASE, data)).toBeUndefined();
  });

  it("returns undefined for an unknown id", () => {
    expect(noteById(`${BASE}/01KVPQ3WXQ4PJ0614J4BEAC2XN/v1`, data)).toBeUndefined();
  });
});
