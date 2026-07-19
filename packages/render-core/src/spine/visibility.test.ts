// Hide-by-ancestry + bulk delete (Archie-6b8e; spine-gate #6) — production tests for
// spine/visibility.ts. NEW file; existing suites untouched.

import { describe, it, expect } from "vitest";
import { asClientId, asExhibitId } from "../wadm/brand.js";
import type { AnnotationLog } from "../wadm/types.js";
import { appendNew, appendEdit, appendDelete } from "./log.js";
import { mergeLogs } from "./merge.js";
import { projectHeads } from "./heads.js";
import {
  sectionKey,
  orderKeyBetween,
  appendNewSection,
  appendDeleteSection,
  appendUndeleteSection,
  projectSections,
  type SectionLog,
} from "./structure.js";
import { noteHiddenByStructure, hiddenNoteIds, deleteSectionWithNotes } from "./visibility.js";

const alice = asClientId("alice");
const bob = asClientId("bob");
const EX = asExhibitId("ex-vis");
const rng = () => 0.5;
const T0 = 1_700_000_000_000;
const S1 = sectionKey(EX, "s1");
const liveObjects = new Set(["o1"]);

function oneSection(): SectionLog {
  return appendNewSection([], {
    key: S1,
    order: orderKeyBetween(null, null),
    objectId: "o1",
    title: "Section one",
    lastEditor: alice,
    now: T0,
    rng,
  }).log;
}

function note(log: AnnotationLog, section: string | undefined, now: number) {
  return appendNew(log, {
    target: "https://example.org/canvas/1",
    body: { type: "TextualBody", value: "note" },
    ...(section !== undefined ? { section } : {}),
    lastEditor: alice,
    now,
    rng,
  });
}

describe("hide-by-ancestry read derivation", () => {
  it("hides an attributed note while its section is tombstoned; un-delete restores visibility atomically with ZERO note writes", () => {
    let structure = oneSection();
    const n = note([], "s1", T0 + 1);
    const annotations = n.log;

    // live section: nothing hidden
    expect(hiddenNoteIds(annotations, projectSections(structure, liveObjects).tombstoned).size).toBe(0);

    // tombstone the section: the note is hidden — derivation only, annotation log untouched
    structure = appendDeleteSection(structure, S1, { lastEditor: alice, now: T0 + 2, rng }).log;
    const hidden = hiddenNoteIds(annotations, projectSections(structure, liveObjects).tombstoned);
    expect(hidden.has(n.record.logicalId)).toBe(true);
    expect(annotations).toHaveLength(1); // zero cascade writes
    expect(projectHeads(annotations)).toHaveLength(1); // the note record itself is NOT tombstoned

    // un-delete: the SAME annotation log reads visible again — pure derivation, atomic
    structure = appendUndeleteSection(structure, S1, { lastEditor: alice, now: T0 + 3, rng }).log;
    expect(hiddenNoteIds(annotations, projectSections(structure, liveObjects).tombstoned).size).toBe(0);
  });

  it("leaves unattributed and dangling-attributed notes visible (referential tolerance, semantic #5)", () => {
    let structure = oneSection();
    structure = appendDeleteSection(structure, S1, { lastEditor: alice, now: T0 + 2, rng }).log;
    const tombstoned = projectSections(structure, liveObjects).tombstoned;

    const unattributed = note([], undefined, T0 + 1);
    expect(noteHiddenByStructure(unattributed.record, tombstoned)).toBe(false);
    const dangling = note([], "ghost-section", T0 + 2);
    expect(noteHiddenByStructure(dangling.record, tombstoned)).toBe(false);
    expect(noteHiddenByStructure(note([], "s1", T0 + 3).record, tombstoned)).toBe(true);
  });

  it("keeps note tombstones independent: an independently-deleted note is not in the hidden set and stays deleted across section delete/un-delete", () => {
    let structure = oneSection();
    const n1 = note([], "s1", T0 + 1);
    const n2 = note(n1.log, "s1", T0 + 2);
    // n2 deleted independently, on its own tombstone
    const annotations = appendDelete(n2.log, n2.record.logicalId, { lastEditor: bob, now: T0 + 3 }).log;

    structure = appendDeleteSection(structure, S1, { lastEditor: alice, now: T0 + 4, rng }).log;
    const hidden = hiddenNoteIds(annotations, projectSections(structure, liveObjects).tombstoned);
    expect(hidden.has(n1.record.logicalId)).toBe(true);
    expect(hidden.has(n2.record.logicalId)).toBe(false); // no live head — its own tombstone governs

    structure = appendUndeleteSection(structure, S1, { lastEditor: alice, now: T0 + 5, rng }).log;
    // n1 visible again; n2 still deleted (section un-delete never touches note tombstones)
    expect(hiddenNoteIds(annotations, projectSections(structure, liveObjects).tombstoned).size).toBe(0);
    expect(projectHeads(annotations).map((h) => h.logicalId)).toEqual([n1.record.logicalId]);
  });

  it("hides a plural-head note only when ALL live heads are attributed to tombstoned sections", () => {
    let structure = oneSection();
    const base = note([], "s1", T0 + 1);
    const id = base.record.logicalId;
    // concurrent: alice keeps s1, bob moves the note OUT of the section
    const a = appendEdit(base.log, id, { body: { type: "TextualBody", value: "a" }, lastEditor: alice, now: T0 + 10 });
    const b = appendEdit(base.log, id, { section: null, lastEditor: bob, now: T0 + 20 });
    const merged = mergeLogs(a.log, b.log);

    structure = appendDeleteSection(structure, S1, { lastEditor: alice, now: T0 + 30, rng }).log;
    const tombstoned = projectSections(structure, liveObjects).tombstoned;
    // one live branch says "not in s1" — hiding would suppress live authored content
    expect(hiddenNoteIds(merged, tombstoned).has(id)).toBe(false);
    // both-branches-attributed IS hidden
    const b2 = appendEdit(base.log, id, { body: { type: "TextualBody", value: "b" }, lastEditor: bob, now: T0 + 20 });
    expect(hiddenNoteIds(mergeLogs(a.log, b2.log), tombstoned).has(id)).toBe(true);
  });
});

describe("deleteSectionWithNotes — the explicit bulk-delete verb", () => {
  it("appends the section tombstone AND one real tombstone per attributed live note", () => {
    const structure = oneSection();
    const n1 = note([], "s1", T0 + 1);
    const n2 = note(n1.log, "s1", T0 + 2);
    const n3 = note(n2.log, undefined, T0 + 3); // unattributed — untouched
    const result = deleteSectionWithNotes(structure, n3.log, S1, { lastEditor: alice, now: T0 + 10, rng });

    expect(result.section.deleted).toBe(true);
    expect(result.noteTombstones).toHaveLength(2);
    for (const tomb of result.noteTombstones) {
      expect(tomb.deleted).toBe(true);
      expect("section" in tomb).toBe(false); // tombstone drops content, attribution severed
    }
    // only the unattributed note is still live
    expect(projectHeads(result.annotations).map((h) => h.logicalId)).toEqual([n3.record.logicalId]);
    expect(projectSections(result.structure, liveObjects).tombstoned.has(S1)).toBe(true);
  });

  it("un-deleting the section does NOT revive bulk-deleted notes (the documented asymmetry)", () => {
    const structure = oneSection();
    const n1 = note([], "s1", T0 + 1);
    const bulk = deleteSectionWithNotes(structure, n1.log, S1, { lastEditor: alice, now: T0 + 10, rng });

    const revived = appendUndeleteSection(bulk.structure, S1, { lastEditor: alice, now: T0 + 20, rng }).log;
    const projection = projectSections(revived, liveObjects);
    expect(projection.tombstoned.has(S1)).toBe(false); // section is back
    expect(projection.sections.map((s) => s.section.id)).toEqual(["s1"]);
    // ...but the note has its OWN tombstone — not hidden-by-ancestry, actually deleted
    expect(projectHeads(bulk.annotations)).toHaveLength(0);
    expect(hiddenNoteIds(bulk.annotations, projection.tombstoned).size).toBe(0);
  });

  it("skips notes already tombstoned independently (not an error)", () => {
    const structure = oneSection();
    const n1 = note([], "s1", T0 + 1);
    const annotations = appendDelete(n1.log, n1.record.logicalId, { lastEditor: bob, now: T0 + 2 }).log;
    const result = deleteSectionWithNotes(structure, annotations, S1, { lastEditor: alice, now: T0 + 10, rng });
    expect(result.noteTombstones).toHaveLength(0);
    expect(result.annotations).toHaveLength(annotations.length);
  });

  it("refuses atomically when an attributed note has plural heads (C4) — nothing partial is returned", () => {
    const structure = oneSection();
    const base = note([], "s1", T0 + 1);
    const id = base.record.logicalId;
    const a = appendEdit(base.log, id, { body: { type: "TextualBody", value: "a" }, lastEditor: alice, now: T0 + 10 });
    const b = appendEdit(base.log, id, { body: { type: "TextualBody", value: "b" }, lastEditor: bob, now: T0 + 20 });
    const merged = mergeLogs(a.log, b.log);
    expect(() => deleteSectionWithNotes(structure, merged, S1, { lastEditor: alice, now: T0 + 30, rng })).toThrow(/plural heads/);
    // pure inputs untouched — the section was NOT tombstoned by the failed call
    expect(projectSections(structure, liveObjects).tombstoned.size).toBe(0);
    expect(merged).toHaveLength(3);
  });

  it("throws on an absent or already-deleted section before touching any note", () => {
    const n1 = note([], "s1", T0 + 1);
    expect(() => deleteSectionWithNotes([], n1.log, S1, { lastEditor: alice, now: T0 + 10, rng })).toThrow(/no such/);
    let structure = oneSection();
    structure = appendDeleteSection(structure, S1, { lastEditor: alice, now: T0 + 2, rng }).log;
    expect(() => deleteSectionWithNotes(structure, n1.log, S1, { lastEditor: alice, now: T0 + 10, rng })).toThrow(/already deleted/);
  });
});
