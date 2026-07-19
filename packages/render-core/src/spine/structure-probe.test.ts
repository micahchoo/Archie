// ============================================================================
// PROBE (Archie-b766) harness — probe ARTIFACT, not contract. These tests
// demonstrate/measure the four ledger assumptions (A1-A4) for "sections as
// rev-logged structure records" and are deleted or rewritten wholesale when the
// probe is verdicted. They deliberately live beside structure-probe.ts.
//
// SEED DATA: the section + object literals below are a VERBATIM copy of the
// seed library (apps/viewer/fixtures/voynich.ts — voynichSections + the eleven
// image folios of voynichObjects). Copied, not imported, because render-core's
// tsconfig rootDir "src" cannot include the fixture file; treat the fixture as
// the source of truth. (The o12 sound object carries no section and is omitted.)
// ============================================================================

import { describe, it, expect } from "vitest";
import { libraryToZip, loadLibrary } from "../publish/site.js";
import { ZipFilesystem } from "../fs/zip.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library, Section, AObject } from "../model/model.js";
import type { AnnotationLog } from "../wadm/types.js";
import { linearHead } from "./log.js";
import { mergeLogs, headsOf, classifyLogical } from "./merge.js";
import {
  sectionKey,
  orderKeyBetween,
  appendNewSection,
  appendEditSection,
  appendDeleteSection,
  appendUndeleteSection,
  resolveSectionConflict,
  projectSections,
  toWorkingSections,
  noteHiddenByStructure,
  structureRevlogEnabled,
  STRUCTURE_REVLOG_FLAG,
  type SectionLog,
  type SectionKey,
} from "./structure-probe.js";

const alice = asClientId("alice");
const bob = asClientId("bob");
const EX_ID = asExhibitId("ex-voynich");
const rng = () => 0.5; // deterministic revs (each append gets a distinct `now`)

// ---- Seed copy (see header): apps/viewer/fixtures/voynich.ts ----
const iiif = (imageId: string) => `https://collections.library.yale.edu/iiif/2/${imageId}`;
const BEINECKE_RIGHTS = "http://creativecommons.org/publicdomain/mark/1.0/";
const BEINECKE_STATEMENT = { label: "Source", value: "Beinecke Rare Book & Manuscript Library, Yale University — MS 408 (public domain)" } as const;
const folio = (o: AObject): AObject => ({ ...o, rights: BEINECKE_RIGHTS, requiredStatement: { ...BEINECKE_STATEMENT } });
const seedObjects: AObject[] = [
  folio({ id: asObjectId("o1"), source: iiif("1006076"), label: "f1r — Herbal (opening page)", width: 2972, height: 3766 }),
  folio({ id: asObjectId("o2"), source: iiif("1006109"), label: "f18v — Herbal (the sonified folio)", width: 2846, height: 3781 }),
  folio({ id: asObjectId("o3"), source: iiif("1006123"), label: "f25v — Herbal", width: 2863, height: 3769 }),
  folio({ id: asObjectId("o4"), source: iiif("1006139"), label: "f33v — Herbal", width: 2871, height: 3769 }),
  folio({ id: asObjectId("o5"), source: iiif("1006194"), label: "f67r — Astronomical (foldout)", width: 4972, height: 3738 }),
  folio({ id: asObjectId("o6"), source: iiif("1006196"), label: "f68r — Astronomical (foldout star-chart)", width: 7993, height: 3828 }),
  folio({ id: asObjectId("o7"), source: iiif("1006208"), label: "f75r — Balneological", width: 2852, height: 3759 }),
  folio({ id: asObjectId("o8"), source: iiif("1006214"), label: "f78r — Balneological", width: 2793, height: 3761 }),
  folio({ id: asObjectId("o9"), source: iiif("1006231"), label: "f85v–86r — Cosmological (the Rosettes foldout)", width: 7925, height: 7268 }),
  folio({ id: asObjectId("o10"), source: iiif("1006246"), label: "f99r — Pharmaceutical", width: 2702, height: 3765 }),
  folio({ id: asObjectId("o11"), source: iiif("1006277"), label: "f116v — Recipes (the final page)", width: 2686, height: 3697 }),
];
const seedSections: Section[] = [
  { id: "s1", title: "Herbal", objectId: "o1", start: "xywh=pixel:200,200,2600,3400", prose: "The book opens as a herbal: a plant to a page, text flowing around the drawing. None of these plants can be named with certainty — some look observed, some invented — and the writing has never been read. Step back, first, to the leaf entire:\n\n[Folio 1r, as a whole object.](archie:voynich/#/o/o1)" },
  { id: "s2", title: "Astronomical", objectId: "o5", start: "xywh=pixel:400,300,4000,3100", prose: "The pages widen into fold-out wheels of Sun, Moon, and stars, each star tied to a small labelled word. Conventional zodiac figures appear, but the labels around them stay closed to us." },
  { id: "s3", title: "Balneological", objectId: "o8", start: "xywh=pixel:200,400,2400,3000", prose: "Small bathing figures move through green networks of pipes and basins. The script shifts character here — measurably a different system than the herbal — as if a second voice took up the pen." },
  { id: "s4", title: "Cosmological", objectId: "o9", start: "xywh=pixel:2600,2400,2800,2600", prose: "The largest spread in the book unfolds into nine medallions joined by causeways, with castle-like and map-like forms. Whether it charts real places or imagined ones is part of what the page refuses to settle. The same foldout, alone and deep-zoomed, is its own study:\n\n[The Rosettes foldout, in the full grid.](archie:voynich/#/o/o9)" },
  { id: "s5", title: "Pharmaceutical", objectId: "o10", start: "xywh=pixel:200,400,2300,3000", prose: "Rows of labelled containers sit beside isolated roots and leaves — many of them tidier copies of plants from the opening herbal, as if assembled into a working reference." },
  { id: "s6", title: "Recipes", objectId: "o11", start: "xywh=pixel:200,160,2300,420", prose: "The book closes on short starred paragraphs and, on its very last page, a few lines in ordinary Latin script — a later hand reaching in from outside the manuscript's silence." },
];
const liveIds = new Set<string>(seedObjects.map((o) => o.id));

/**
 * Author the seed sections into a rev-log the way a Studio session would: each section is
 * created (v1: title/objectId/start only), then EDITED to add its prose (v2) — so projection
 * reads real multi-rev history, not a 1:1 transcription.
 */
function authorSeedLog(): SectionLog {
  let log: SectionLog = [];
  let now = 1000;
  let prevOrder: string | null = null;
  for (const s of seedSections) {
    const order = orderKeyBetween(prevOrder, null);
    prevOrder = order;
    const key = sectionKey(EX_ID, s.id);
    log = appendNewSection(log, {
      key, order, objectId: s.objectId, title: s.title,
      ...(s.start !== undefined ? { start: s.start } : {}),
      lastEditor: alice, modifiedAt: "t1", now: now++, rng,
    }).log;
    log = appendEditSection(log, key, {
      ...(s.prose !== undefined ? { prose: s.prose } : {}),
      lastEditor: alice, modifiedAt: "t2", now: now++, rng,
    }).log;
  }
  return log;
}

describe("PROBE flag (slice shape)", () => {
  it("exists and is wired into nothing", () => {
    expect(STRUCTURE_REVLOG_FLAG).toBe("archie.structureRevlog");
    expect(structureRevlogEnabled).toBe(false);
  });
});

describe("A2 — seed library round-trips losslessly through working → publish → open", () => {
  const baseUrl = "https://probe.example/lib/";
  const emptyLog = (): AnnotationLog => [];

  const makeLibrary = (sections: Section[]): Library => ({
    id: asLibraryId("L-probe"),
    title: "Probe Library",
    exhibits: [{ id: EX_ID, slug: "voynich", title: "The Voynich Manuscript", objects: seedObjects, sections }],
  });

  it("projection of the authored rev-log deep-equals the seed working sections", () => {
    const projected = toWorkingSections(projectSections(authorSeedLog(), liveIds));
    expect(projected).toEqual(seedSections);
  });

  it("publish → open of the projected sections deep-equals publish → open of today's sections", async () => {
    const baseline = makeLibrary(seedSections);
    const probe = makeLibrary(toWorkingSections(projectSections(authorSeedLog(), liveIds)));
    const { zip: zipBase } = await libraryToZip(baseline, emptyLog, { baseUrl });
    const { zip: zipProbe } = await libraryToZip(probe, emptyLog, { baseUrl });
    const openedBase = await loadLibrary(ZipFilesystem.fromZip(zipBase));
    const openedProbe = await loadLibrary(ZipFilesystem.fromZip(zipProbe));
    expect(openedProbe.library).toEqual(openedBase.library); // whole library, deep — THE A2 gate
    // NB: opened prose is NOT byte-equal to the authored seed prose for EITHER path — publish
    // rewrites `archie:` cites in section prose into viewer URLs (site.ts link seam) identically
    // for baseline and probe. The revlog projection itself is lossless (previous test); the
    // publish→open transform is shared. Spot-check the spine's identity fields against the seed:
    const opened = openedProbe.library.exhibits[0]!.sections!;
    expect(opened.map((s) => [s.id, s.title, s.objectId, s.start])).toEqual(
      seedSections.map((s) => [s.id, s.title, s.objectId, s.start]),
    );
  });
});

describe("A3 — projection performance (numbers reported verbatim in the probe ledger)", () => {
  it("seed exhibit: per-edit projection stays interactive (< 16ms)", () => {
    let log = authorSeedLog();
    const key = sectionKey(EX_ID, "s3");
    const times: number[] = [];
    let now = 9000;
    for (let i = 0; i < 100; i++) {
      log = appendEditSection(log, key, { title: `Balneological ${i}`, lastEditor: alice, modifiedAt: "tp", now: now++, rng }).log;
      const t0 = performance.now();
      projectSections(log, liveIds);
      times.push(performance.now() - t0);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    console.info(`[PROBE A3] seed exhibit (6 sections, ${log.length} records after 100 edits): projection avg ${avg.toFixed(3)}ms, max ${max.toFixed(3)}ms over 100 edit-projections`);
    expect(avg).toBeLessThan(16);
  });

  it("synthetic 100 sections x 20 revs each (2000 records): projection stays interactive (< 16ms)", () => {
    let log: SectionLog = [];
    let now = 100000;
    let prevOrder: string | null = null;
    const keys: SectionKey[] = [];
    for (let s = 0; s < 100; s++) {
      const key = sectionKey(EX_ID, `syn-${String(s).padStart(3, "0")}`);
      keys.push(key);
      const order = orderKeyBetween(prevOrder, null);
      prevOrder = order;
      log = appendNewSection(log, { key, order, objectId: "o1", title: `Synthetic ${s}`, lastEditor: alice, modifiedAt: "t", now: now++, rng }).log;
      for (let v = 0; v < 19; v++) {
        log = appendEditSection(log, key, { prose: `rev ${v} of section ${s}`, lastEditor: alice, modifiedAt: "t", now: now++, rng }).log;
      }
    }
    expect(log.length).toBe(2000);
    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      const projection = projectSections(log, liveIds);
      times.push(performance.now() - t0);
      if (i === 0) expect(projection.sections).toHaveLength(100);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    console.info(`[PROBE A3] synthetic (100 sections x 20 revs, 2000 records): projection avg ${avg.toFixed(3)}ms, max ${max.toFixed(3)}ms over 50 projections`);
    expect(avg).toBeLessThan(16);
  });
});

describe("A4 — fractional order key: deterministic, stable order under concurrency", () => {
  const keyOf = (id: string) => sectionKey(EX_ID, id);

  const threeSections = (): { log: SectionLog; orders: string[] } => {
    let log: SectionLog = [];
    const orders: string[] = [];
    let prev: string | null = null;
    let now = 5000;
    for (const id of ["sa", "sb", "sc"]) {
      const order = orderKeyBetween(prev, null);
      orders.push(order);
      prev = order;
      log = appendNewSection(log, { key: keyOf(id), order, objectId: "o1", title: id, lastEditor: alice, modifiedAt: "t", now: now++, rng }).log;
    }
    return { log, orders };
  };

  it("orderKeyBetween generates strictly-between keys (property spot-checks)", () => {
    const first = orderKeyBetween(null, null);
    const after = orderKeyBetween(first, null);
    const before = orderKeyBetween(null, first);
    const mid = orderKeyBetween(first, after);
    expect(before < first && first < mid && mid < after).toBe(true);
    // dense insertion at one spot keeps producing strictly-between keys
    let lo = first;
    for (let i = 0; i < 50; i++) {
      const k = orderKeyBetween(lo, after);
      expect(lo < k && k < after).toBe(true);
      lo = k;
    }
    expect(() => orderKeyBetween("5", "5")).toThrow(/>=/);
  });

  it("concurrent reorder of the SAME section: both replicas project the identical order, then resolve to one head", () => {
    const { log: base, orders } = threeSections();
    // alice moves sa after sc; bob moves sa between sb and sc — a real DAG conflict on `order`.
    const rA = appendEditSection(base, keyOf("sa"), { order: orderKeyBetween(orders[2]!, null), lastEditor: alice, modifiedAt: "tA", now: 6000, rng }).log;
    const rB = appendEditSection(base, keyOf("sa"), { order: orderKeyBetween(orders[1]!, orders[2]!), lastEditor: bob, modifiedAt: "tB", now: 6001, rng }).log;

    const mergedAB = mergeLogs(rA, rB);
    const mergedBA = mergeLogs(rB, rA);
    const projAB = projectSections(mergedAB, liveIds);
    const projBA = projectSections(mergedBA, liveIds);

    // Pre-resolution: plural heads project honestly (two rows for sa, flagged), and BOTH
    // replicas converge to the IDENTICAL row sequence regardless of merge direction.
    expect(projAB.sections.map((p) => [p.key, p.rev])).toEqual(projBA.sections.map((p) => [p.key, p.rev]));
    expect(projAB.sections.filter((p) => p.conflicted).every((p) => p.section.id === "sa")).toBe(true);
    expect(headsOf(mergedAB, keyOf("sa"))).toHaveLength(2);
    expect(classifyLogical(rA, rB, keyOf("sa")).kind).toBe("conflict");

    // One replica resolves (multi-parent merge node); the other merges the resolution in.
    const resolved = resolveSectionConflict(mergedAB, keyOf("sa"), { lastEditor: alice, modifiedAt: "tR", now: 6002, rng });
    const other = mergeLogs(mergedBA, resolved);
    expect(headsOf(resolved, keyOf("sa"))).toHaveLength(1);
    expect(headsOf(other, keyOf("sa"))).toHaveLength(1);
    expect(projectSections(other, liveIds).sections.map((p) => [p.key, p.rev]))
      .toEqual(projectSections(resolved, liveIds).sections.map((p) => [p.key, p.rev]));
    expect(linearHead(other, keyOf("sa")).order).toBe(linearHead(resolved, keyOf("sa")).order);
  });

  it("concurrent INSERTS at the same position get equal keys — id tiebreak converges both replicas (#3)", () => {
    const { log: base, orders } = threeSections();
    const between = orderKeyBetween(orders[0]!, orders[1]!); // both replicas compute the SAME slot key
    const rA = appendNewSection(base, { key: keyOf("ins-alice"), order: between, objectId: "o1", title: "A's insert", lastEditor: alice, modifiedAt: "t", now: 7000, rng }).log;
    const rB = appendNewSection(base, { key: keyOf("ins-bob"), order: between, objectId: "o1", title: "B's insert", lastEditor: bob, modifiedAt: "t", now: 7001, rng }).log;
    const seqAB = projectSections(mergeLogs(rA, rB), liveIds).sections.map((p) => p.section.id);
    const seqBA = projectSections(mergeLogs(rB, rA), liveIds).sections.map((p) => p.section.id);
    expect(seqAB).toEqual(seqBA); // merge order does not matter
    expect(seqAB).toEqual(["sa", "ins-alice", "ins-bob", "sb", "sc"]); // equal keys → key (id) tiebreak, deterministic
  });
});

describe("hide-by-ancestry (#6) and referential tolerance (#5) — read-derivation only", () => {
  const keyOf = (id: string) => sectionKey(EX_ID, id);

  it("ONE section tombstone hides its notes at read; un-delete atomically restores content and visibility", () => {
    let log = authorSeedLog();
    const key = keyOf("s2");
    const before = projectSections(log, liveIds).sections.find((p) => p.key === key)!.section;
    // A note attributed to s2 (attribution supplied by the harness — notes carry no section field yet).
    const annLog: AnnotationLog = []; // zero note writes happen below — hiding is pure read-derivation
    log = appendDeleteSection(log, key, { lastEditor: alice, modifiedAt: "td", now: 8000, rng }).log;
    const afterDelete = projectSections(log, liveIds);
    expect(afterDelete.sections.map((p) => p.section.id)).toEqual(["s1", "s3", "s4", "s5", "s6"]);
    expect(afterDelete.tombstoned.has(key)).toBe(true);
    expect(noteHiddenByStructure(afterDelete, key)).toBe(true); // the section's notes are hidden…
    expect(noteHiddenByStructure(afterDelete, keyOf("s3"))).toBe(false); // …other sections' notes are not
    expect(noteHiddenByStructure(afterDelete, undefined)).toBe(false); // …nor exhibit-level notes
    expect(annLog).toHaveLength(0); // NO cascade writes to any note record

    log = appendUndeleteSection(log, key, { lastEditor: alice, modifiedAt: "tu", now: 8001, rng }).log;
    const afterUndelete = projectSections(log, liveIds);
    expect(afterUndelete.sections.map((p) => p.section.id)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
    expect(afterUndelete.sections.find((p) => p.key === key)!.section).toEqual(before); // lossless revive
    expect(noteHiddenByStructure(afterUndelete, key)).toBe(false); // atomic un-hide
  });

  it("a section referencing a missing objectId projects flagged-not-fatal", () => {
    let log = authorSeedLog();
    log = appendEditSection(log, keyOf("s5"), { objectId: "ghost-object", lastEditor: alice, modifiedAt: "tg", now: 8100, rng }).log;
    const projection = projectSections(log, liveIds); // no throw
    const s5 = projection.sections.find((p) => p.section.id === "s5")!;
    expect(s5.missingObject).toBe(true);
    expect(s5.section.objectId).toBe("ghost-object"); // reference kept raw for repair, not erased
    expect(projection.sections.filter((p) => p.missingObject)).toHaveLength(1); // everyone else untouched
  });

  it("edit of a tombstoned section is refused (un-delete is the sanctioned path)", () => {
    let log = authorSeedLog();
    log = appendDeleteSection(log, keyOf("s6"), { lastEditor: alice, modifiedAt: "t", now: 8200, rng }).log;
    expect(() => appendEditSection(log, keyOf("s6"), { title: "x", lastEditor: alice, now: 8201 })).toThrow(/tombstoned/);
    expect(() => appendDeleteSection(log, keyOf("s6"), { lastEditor: alice, now: 8202 })).toThrow(/already deleted/);
  });
});

describe("A1 — the DAG machinery is shared, and annotation call sites stay exactly as strict", () => {
  it("linearHead/headsOf/mergeLogs run unmodified over SectionRecord logs", () => {
    const { log } = appendNewSection([], { key: sectionKey(EX_ID, "only"), order: "i", objectId: "o1", title: "T", lastEditor: alice, modifiedAt: "t", now: 9500, rng });
    expect(linearHead(log, sectionKey(EX_ID, "only")).title).toBe("T");
    expect(headsOf(log, sectionKey(EX_ID, "only"))).toHaveLength(1);
    expect(mergeLogs(log, log)).toHaveLength(1); // dedup by rev, generic
  });

  it("type-level: a SectionKey cannot be passed where a LogicalId log expects one (compile-time probe)", () => {
    const annLog: AnnotationLog = [];
    const sKey: SectionKey = sectionKey(EX_ID, "s1");
    // @ts-expect-error — annotation logs remain keyed by LogicalId, exactly as strict as before
    const call = () => linearHead(annLog, sKey);
    expect(call).toThrow(/no such note/); // (runtime shape identical; the assertion above is the type gate)
  });
});
