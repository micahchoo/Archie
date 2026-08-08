// The editor view-model (Archie P8): pins the two headless-testable pieces the extraction produced —
// bboxIoU (the co-located predicate, pure) and the co-located-note stack + cycler (built from a real
// AnnotationSession + the same store factories App composes). Everything else in the model is a
// projection of the session/log the App-level tests already drive, so this file stays small.
import { describe, it, expect } from "vitest";
import { AnnotationSession, asClientId } from "@render/core";
import { createEditorModel, bboxIoU, type Bx } from "./editor-model.svelte.js";
import { createViewState } from "./view-state.svelte.js";
import { createReadingState } from "./reading-state.svelte.js";
import { createStructureSession } from "./structure-session.svelte.js";
import type { ExhibitMeta } from "./store.js";

const BASE_URL = "https://archie.test/lib/";
const SLUG = "ex";
const CANVAS = `${BASE_URL}${SLUG}/canvas/o1`;

// The W3C target → source IRI read (App owns the same helper; the model takes it as a dep).
const srcOf = (t: unknown): string | undefined => {
  if (typeof t === "string") return t;
  if (t && typeof t === "object" && "source" in t) {
    const s = t.source;
    return typeof s === "string" ? s : undefined;
  }
  return undefined;
};

const exhibit = (): ExhibitMeta => ({
  id: "ex1",
  slug: SLUG,
  title: "Ex",
  objects: [{ id: "o1", source: "https://img/a.jpg", label: "O", width: 200, height: 200 }],
});

const region = (x: number, y: number, w = 10, h = 10) => ({
  type: "SpecificResource" as const,
  source: CANVAS,
  selector: { type: "FragmentSelector" as const, value: `xywh=pixel:${x},${y},${w},${h}` },
});
const note = (s: AnnotationSession, x: number, y: number) =>
  s.createNote({ target: region(x, y), body: [{ type: "TextualBody", value: `n@${x},${y}`, purpose: "commenting" }] });

/** The same composition App.svelte performs: real session + view-state + reading-state + structure
 *  (rev-log OFF — the inert path), with a static rev (no log writes in these tests) and no readings. */
function makeModel() {
  const session = new AnnotationSession(asClientId("me"));
  const vs = createViewState({
    exhibits: () => [exhibit()],
    baseUrl: BASE_URL,
    initialSlug: SLUG,
    onObjectSwitch: () => {},
  });
  const rdg = createReadingState();
  const structure = createStructureSession({
    author: () => asClientId("me"),
    openStructDir: async () => null,
    enqueue: async () => true,
    isTemplate: () => false,
    enabled: () => false,
  });
  const model = createEditorModel({
    session: () => session,
    vs,
    rdg,
    structure,
    rev: () => 0,
    currentReadings: () => [],
    isAvCurrent: () => false,
    zoomRatio: () => 1,
    srcOf,
    commentOf: () => "",
  });
  return { session, vs, model };
}

describe("bboxIoU — the co-located-note overlap predicate (≥ 0.5 = a stack)", () => {
  it("identity is 1, disjoint boxes are 0", () => {
    const b: Bx = { x: 0, y: 0, w: 10, h: 10 };
    expect(bboxIoU(b, b)).toBe(1);
    expect(bboxIoU({ x: 0, y: 0, w: 5, h: 5 }, { x: 10, y: 10, w: 5, h: 5 })).toBe(0);
  });

  it("partial overlap = intersection / union", () => {
    // 10×10 shifted by (5,0): intersection 5×10 = 50, union 100+100−50 = 150 → 1/3.
    expect(bboxIoU({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 0, w: 10, h: 10 })).toBeCloseTo(1 / 3);
  });

  it("a contained box scores its own area over the container's", () => {
    expect(bboxIoU({ x: 0, y: 0, w: 10, h: 10 }, { x: 2, y: 2, w: 4, h: 4 })).toBeCloseTo(0.16);
  });

  it("zero-area boxes score 0 (no division by zero)", () => {
    expect(bboxIoU({ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 5, h: 5 })).toBe(0);
  });
});

describe("editor-model — the co-located note stack (NoteEditor's cycler)", () => {
  it("collects overlapping notes on the SAME object and cycles selection through them", () => {
    const { session, vs, model } = makeModel();
    // 10×10 at (1,1) overlaps 10×10 at (0,0) with IoU 81/119 ≈ 0.68 ≥ 0.5 — a stack; (50,50) is disjoint.
    const a = note(session, 0, 0);
    const b = note(session, 1, 1);
    const c = note(session, 50, 50);
    vs.selected = a;
    vs.editing = a;

    // The stack holds exactly the two overlapping notes. `coLocated` preserves objNotes order
    // (session head order, NOT creation order), so index assertions are derived from the model's own
    // list rather than assumed — the contract is which notes stack and that cycling visits both.
    const ids = model.coLocated.map((r) => r.logicalId);
    expect(ids.sort()).toEqual([a, b].sort());
    const idxOf = (id: string) => model.coLocated.findIndex((r) => r.logicalId === id);
    expect(idxOf(a)).toBe(model.coLocatedIndex);
    const sibling = model.coLocated[1 - idxOf(a)]!.logicalId;

    // cycle forward → the overlapping sibling; back → wrap to the first. `vs.editing` follows
    // `vs.selected` through App's $effect (line ~1122) — mirrored here between steps.
    model.cycleCoLocated(1);
    expect(vs.selected).toBe(sibling);
    vs.editing = vs.selected;
    expect(model.coLocatedIndex).toBe(idxOf(sibling));

    model.cycleCoLocated(1);
    expect(vs.selected).toBe(a);
    vs.editing = vs.selected;

    model.cycleCoLocated(-1);
    expect(vs.selected).toBe(sibling);

    // A lone note at its spot is a stack of one — cycling is a no-op.
    vs.selected = c;
    vs.editing = c;
    expect(model.coLocated.map((r) => r.logicalId)).toEqual([c]);
    model.cycleCoLocated(1);
    expect(vs.selected).toBe(c);
  });

  it("a whole-object (bare-IRI) note has no region → no stack to step through", () => {
    const { session, vs, model } = makeModel();
    note(session, 0, 0);
    const w = session.createNote({ target: CANVAS, body: [{ type: "TextualBody", value: "whole", purpose: "commenting" }] });
    vs.selected = w;
    vs.editing = w;

    expect(model.coLocated).toEqual([]);
    expect(model.coLocatedIndex).toBe(-1);
    model.cycleCoLocated(1); // no-op — selection unchanged
    expect(vs.selected).toBe(w);
  });

  it("a disjoint note is not co-located with the selected note", () => {
    const { session, vs, model } = makeModel();
    const a = note(session, 0, 0);
    note(session, 50, 50); // far away — same object, different spot
    vs.selected = a;
    vs.editing = a;

    expect(model.coLocated.map((r) => r.logicalId)).toEqual([a]);
  });
});
