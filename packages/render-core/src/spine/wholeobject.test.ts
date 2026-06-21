import { describe, it, expect } from "vitest";
import { appendNew, appendEdit } from "./log.js";
import { toHeadsPage, toHistory } from "./serialize.js";
import { fromHistory } from "./deserialize.js";
import { AnnotationSession } from "../session/session.js";
import { wholeObjectFlagOf } from "../query/published.js";
import { selectorOf } from "../geometry/selector.js";
import { asClientId } from "../wadm/brand.js";
import type { W3CTarget } from "../wadm/types.js";

// Object-level (whole-object) Notes (ADR-0018): a whole-object Note is a BARE-IRI target with no
// selector; `archie:wholeObject` is the region-override that closes the read-but-never-written seam.
const editor = asClientId("alice");
const CANVAS = "https://ex.org/lib/voynich/canvas/p1";
const region = (value: string): W3CTarget => ({
  type: "SpecificResource",
  source: CANVAS,
  selector: { type: "FragmentSelector", value },
});
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

describe("whole-object Note = bare-IRI target (no selector)", () => {
  it("round-trips a bare-IRI target through heads + history losslessly", () => {
    const { log } = appendNew([], { target: CANVAS, lastEditor: editor, body: { type: "TextualBody", value: "this whole folio is a later addition" } });

    const heads = toHeadsPage(log, "page-1");
    expect(heads.items[0]!.target).toBe(CANVAS); // bare string survives — no SpecificResource wrapping
    expect(selectorOf(heads.items[0]!)).toBeNull(); // zero geometry by construction

    const back = fromHistory(Object.values(toHistory(log).pages));
    expect(back).toHaveLength(1);
    expect(back[0]!.target).toBe(CANVAS);
    expect(back[0]!.wholeObject).toBeUndefined(); // a bare-IRI note needs no flag
  });

  it("a bare-IRI note carries NO archie:wholeObject key (the flag is for region notes only)", () => {
    const { log } = appendNew([], { target: CANVAS, lastEditor: editor });
    const head = toHeadsPage(log, "p").items[0]!;
    expect(has(head, "archie:wholeObject")).toBe(false);
  });
});

describe("archie:wholeObject = region-override (the closed seam)", () => {
  it("emits + round-trips on a region note when set true", () => {
    const { log } = appendNew([], { target: region("xywh=pixel:0,0,10,10"), wholeObject: true, lastEditor: editor });

    const head = toHeadsPage(log, "p").items[0]!;
    expect((head as Record<string, unknown>)["archie:wholeObject"]).toBe(true);
    expect(wholeObjectFlagOf(head)).toBe(true); // the reader the viewer already calls now sees a real value

    const back = fromHistory(Object.values(toHistory(log).pages));
    expect(back[0]!.wholeObject).toBe(true);
  });

  it("is byte-stable when absent — no key on EITHER the heads OR the history page", () => {
    const { log } = appendNew([], { target: region("xywh=pixel:0,0,10,10"), lastEditor: editor });
    const head = toHeadsPage(log, "p").items[0]!; // withExtensions path
    const hist = Object.values(toHistory(log).pages)[0]!.items[0]!; // withDagMeta path (separate emitter)
    expect(has(head, "archie:wholeObject")).toBe(false);
    expect(has(hist, "archie:wholeObject")).toBe(false);
    expect(wholeObjectFlagOf(head)).toBe(false);
  });

  it("carries the region-override forward across an UNRELATED (body-only) edit; clears on false/null", () => {
    const a = appendNew([], { target: region("xywh=pixel:0,0,10,10"), wholeObject: true, lastEditor: editor });
    const b = appendEdit(a.log, a.record.logicalId, { lastEditor: editor, body: { type: "TextualBody", value: "x" } });
    expect(b.record.wholeObject).toBe(true); // carry-forward when not mentioned (mirrors emphasis/geo)
    const c = appendEdit(b.log, a.record.logicalId, { lastEditor: editor, wholeObject: false });
    expect(c.record.wholeObject).toBeUndefined(); // false clears
    const d = appendEdit(c.log, a.record.logicalId, { lastEditor: editor, wholeObject: true });
    const e = appendEdit(d.log, a.record.logicalId, { lastEditor: editor, wholeObject: null });
    expect(e.record.wholeObject).toBeUndefined(); // null clears
  });
});

describe("merge resolve() carries the region-override (data-loss guard)", () => {
  it("does NOT drop wholeObject when resolving a concurrent conflict", () => {
    const base = new AnnotationSession(editor);
    const id = base.createNote({ target: region("xywh=pixel:0,0,10,10"), wholeObject: true });
    // A divergent remote branch edited from the same v1 parent → concurrent (plural) heads on import.
    const remote = appendEdit(base.entries, id, { lastEditor: asClientId("bob"), body: { type: "TextualBody", value: "remote" } }).log;
    base.editNote(id, { body: { type: "TextualBody", value: "local" } });
    base.importChanges(remote);
    expect(base.conflicts()).toContain(id); // genuinely conflicted
    base.resolve(id, { body: { type: "TextualBody", value: "merged" } }); // choice omits wholeObject
    const head = base.notes().find((r) => r.logicalId === id)!;
    expect(head.wholeObject).toBe(true); // inherited onto the merge node, not lost
  });
});

describe("session authoring + conversion (ADR-0018 lifecycle)", () => {
  it("createNote accepts a bare-IRI target and exposes it selector-less", () => {
    const s = new AnnotationSession(editor);
    const id = s.createNote({ target: CANVAS });
    const w = s.workingAnnotations();
    expect(w[0]!.id).toBe(id);
    expect(w[0]!.target).toBe(CANVAS);
    expect(selectorOf(w[0]!)).toBeNull();
  });

  it("converts a region note to whole-object (drop selector) as a versioned edit", () => {
    const s = new AnnotationSession(editor);
    const id = s.createNote({ target: region("xywh=pixel:0,0,10,10") });
    s.editNote(id, { target: CANVAS }); // convert: drop the selector → bare IRI
    const head = s.notes().find((r) => r.logicalId === id)!;
    expect(head.target).toBe(CANVAS);
    expect(head.version).toBe(2); // append-only: a new version, same logicalId
  });

  it("sets and clears the region-override through the session edit path", () => {
    const s = new AnnotationSession(editor);
    const id = s.createNote({ target: region("xywh=pixel:0,0,10,10") });
    s.editNote(id, { wholeObject: true });
    expect(s.notes().find((r) => r.logicalId === id)!.wholeObject).toBe(true);
    s.editNote(id, { wholeObject: null }); // clear
    expect(s.notes().find((r) => r.logicalId === id)!.wholeObject).toBeUndefined();
  });
});
