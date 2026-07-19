import { describe, it, expect } from "vitest";
import {
  migrateLibraryObjectIds,
  readIdScheme,
  CURRENT_ID_SCHEME,
  LEGACY_ID_SCHEME,
  ID_SCHEME_MARKER_FILE,
  PRE_MIGRATION_DIR,
  SNAPSHOT_SENTINEL_FILE,
} from "./object-ids.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { writeAnnotations, readAnnotations } from "../spine/persist.js";
import { writeStructure } from "../spine/structure-persist.js";
import { appendNew, appendEdit, appendDelete } from "../spine/log.js";
import { appendNewSection, appendDeleteSection, sectionKey, orderKeyBetween } from "../spine/structure.js";
import { canvasIdFor } from "../iiif/canvasid.js";
import { isLegacyObjectId } from "../object-id.js";
import { parseLinkRef } from "../link/link.js";
import { asClientId, asExhibitId } from "../wadm/brand.js";
import type { Filesystem, FsDirectory } from "../fs/seam.js";
import type { AnnotationLog } from "../wadm/types.js";

// Object-id migration engine (Archie-8c10): the EXHAUSTIVENESS fixture exercises all FIVE id-bearing
// classes + tombstones, then proves zero legacy refs remain and the DAG shape is untouched. Plus the
// torn-state / idempotency / pass-through contracts.

const alice = asClientId("alice");
const BASE = "https://archie.demo/"; // WORKING_IRI_BASE — the canvas-IRI namespace
const SAMPLE = asExhibitId("ex-sample");
const VOYNICH = asExhibitId("ex-voynich");

const dec = (b: ArrayBuffer): string => new TextDecoder().decode(b);
async function writeJson(dir: FsDirectory, name: string, data: unknown): Promise<void> {
  const f = await dir.getFile(name, { create: true });
  const w = await f.writable();
  await w.write(JSON.stringify(data, null, 2));
  await w.close();
}

/** Build a working store exercising every class: two exhibits (both with a LOCAL `o1`, so the composed
 *  scheme must disambiguate `ex-sample.o1` vs `ex-voynich.o1`), annotations (targets + a cross-exhibit
 *  archie: body link), a structure log, tombstones, and a pending-notes sidecar. */
async function buildLegacyStore(fs: Filesystem, project = "proj"): Promise<{ sampleLog: AnnotationLog; voynichLog: AnnotationLog }> {
  const root = await fs.root();
  const proj = await root.getDirectory(project, { create: true });

  // 1. object metas + 6. sections-in-library.json (the DEFAULT structure home — rev-log flag OFF).
  //    Each voynich section carries a legacy objectId AND prose with a cross-exhibit archie: object ref.
  await writeJson(proj, "library.json", {
    exhibits: [
      { id: "ex-sample", slug: "sample", title: "Sample", objects: [{ id: "o1", source: "s1", label: "A" }, { id: "o2", source: "s2", label: "B" }] },
      {
        id: "ex-voynich", slug: "voynich", title: "Voynich",
        objects: [{ id: "o1", source: "v1", label: "Folio" }],
        sections: [
          { id: "s1", title: "Intro", objectId: "o1", start: "xywh=0,0,10,10", prose: "see [the sample](archie:sample/#/o/o2)" },
          { id: "s2", title: "More", objectId: "o1" },
        ],
      },
    ],
  });

  // 2. annotation targets + a tombstone — sample exhibit (LEGACY root `annotations/` location)
  const sTarget1 = canvasIdFor(BASE, "sample", "o1");
  const sTarget2 = canvasIdFor(BASE, "sample", "o2");
  let sLog = appendNew([], { target: sTarget1, body: { type: "TextualBody", value: "on o1" }, lastEditor: alice, modifiedAt: "t1", now: 1 }).log;
  const s2 = appendNew(sLog, { target: sTarget2, body: { type: "TextualBody", value: "on o2" }, lastEditor: alice, modifiedAt: "t2", now: 2 });
  sLog = appendDelete(s2.log, s2.record.logicalId, { lastEditor: alice, modifiedAt: "t3", now: 3 }).log; // tombstone
  const sampleAnn = await proj.getDirectory("annotations", { create: true });
  await writeAnnotations(sampleAnn, sLog);

  // 2 + 3. voynich exhibit: a target on o1, a body with a CROSS-exhibit archie: object link, and an edit (v2)
  const vTarget = canvasIdFor(BASE, "voynich", "o1");
  const crossBody = { type: "TextualBody" as const, value: "compare [the sample](archie:sample/#/o/o2) here" };
  const v1 = appendNew([], { target: vTarget, body: crossBody, lastEditor: alice, modifiedAt: "t4", now: 4 });
  const vLog = appendEdit(v1.log, v1.record.logicalId, { body: { type: "TextualBody", value: "compare [the sample](archie:sample/#/o/o2) again" }, lastEditor: alice, modifiedAt: "t5", now: 5 }).log;
  const voyExDir = await (await proj.getDirectory("exhibits", { create: true })).getDirectory("voynich", { create: true });
  await writeAnnotations(await voyExDir.getDirectory("annotations", { create: true }), vLog);

  // 4. structure log (voynich) — sections referencing legacy objectId `o1`, incl. a tombstoned section
  const k1 = sectionKey(VOYNICH, "s1");
  const k2 = sectionKey(VOYNICH, "s2");
  const ord1 = orderKeyBetween(null, null);
  const ord2 = orderKeyBetween(ord1, null);
  let structLog = appendNewSection([], { key: k1, order: ord1, objectId: "o1", title: "Intro", lastEditor: alice, modifiedAt: "t6", now: 6 }).log;
  structLog = appendNewSection(structLog, { key: k2, order: ord2, objectId: "o1", title: "Gone", lastEditor: alice, modifiedAt: "t7", now: 7 }).log;
  structLog = appendDeleteSection(structLog, k2, { lastEditor: alice, modifiedAt: "t8", now: 8 }).log; // tombstone
  await writeStructure(await voyExDir.getDirectory("structure", { create: true }), structLog);

  // 5. pending-notes sidecar
  await writeJson(proj, "pending-notes.json", {
    sample: [{ id: "p1", objectId: "o2", comment: "staged", tags: [] }],
    voynich: [{ id: "p2", objectId: "o1", comment: "staged", tags: [] }],
  });

  return { sampleLog: sLog, voynichLog: vLog };
}

/** Recursively collect every string value in every `.json` file under `dir`, skipping `pre-migration/`. */
async function collectStrings(dir: FsDirectory, skipSnapshot = true): Promise<string[]> {
  const out: string[] = [];
  const visit = (v: unknown): void => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  const walk = async (d: FsDirectory): Promise<void> => {
    for await (const e of d.entries()) {
      if (skipSnapshot && e.name === PRE_MIGRATION_DIR) continue;
      if (e.kind === "directory") await walk(await d.getDirectory(e.name));
      else if (e.name.endsWith(".json")) {
        try {
          visit(JSON.parse(dec(await (await d.getFile(e.name)).readable())));
        } catch {
          /* corrupt file — not part of the legacy-ref check */
        }
      }
    }
  };
  await walk(dir);
  return out;
}

/** Every object-id-bearing token extracted from a string pool (canvas tails + archie: ref objectIds +
 *  any bare token), for the "isLegacyObjectId on every extracted id" assertion. */
function extractedIds(strings: string[]): string[] {
  const ids: string[] = [];
  for (const s of strings) {
    ids.push(s); // bare tokens (object `id`, `objectId`, order keys, revs — none should be legacy)
    if (s.includes("/canvas/")) ids.push(s.split("/").pop() ?? s);
    if (s.startsWith("archie:")) {
      const t = parseLinkRef(s);
      if (t?.objectId !== undefined) ids.push(t.objectId);
    }
    // archie: refs embedded in markdown bodies
    for (const m of s.matchAll(/archie:[^)\s]+/g)) {
      const t = parseLinkRef(m[0]);
      if (t?.objectId !== undefined) ids.push(t.objectId);
    }
  }
  return ids;
}

const dagShape = (log: AnnotationLog) =>
  [...log].map((r) => ({ rev: r.rev, logicalId: r.logicalId, version: r.version, parent: r.parent, deleted: r.deleted })).sort((a, b) => (a.rev < b.rev ? -1 : 1));

describe("migrateLibraryObjectIds — exhaustiveness across all five id classes", () => {
  it("rewrites every class, leaves ZERO legacy refs anywhere in the tree", async () => {
    const fs = new MemoryFilesystem();
    await buildLegacyStore(fs);

    const result = await migrateLibraryObjectIds(fs, { project: "proj" });
    expect(result.migrated).toBe(true);
    expect(result.fromScheme).toBe(LEGACY_ID_SCHEME);
    expect(result.toScheme).toBe(CURRENT_ID_SCHEME);
    expect(result.snapshotCreated).toBe(true);
    expect(result.corrupt).toEqual([]);

    // every class saw at least one rewrite
    expect(result.rewrites.libraryObjects).toBe(3); // ex-sample.o1, ex-sample.o2, ex-voynich.o1
    expect(result.rewrites.librarySectionObjectIds).toBe(2); // voynich s1 + s2, both objectId o1 (DEFAULT structure home)
    expect(result.rewrites.annotationTargets).toBeGreaterThanOrEqual(3); // heads + history pages, both exhibits
    expect(result.rewrites.bodyLinks).toBeGreaterThanOrEqual(2); // cross-exhibit archie: link in note bodies AND section prose
    expect(result.rewrites.sectionObjectIds).toBeGreaterThanOrEqual(2);
    expect(result.rewrites.pendingNotes).toBe(2);

    // THE exhaustive assertion: walk every file, isLegacyObjectId on every extracted id → all false
    const proj = await (await fs.root()).getDirectory("proj");
    const ids = extractedIds(await collectStrings(proj));
    expect(ids.filter(isLegacyObjectId)).toEqual([]);
  });

  it("composes the disambiguated ids and preserves the DAG shape (revs/parents/tombstones)", async () => {
    const fs = new MemoryFilesystem();
    const { voynichLog } = await buildLegacyStore(fs);
    await migrateLibraryObjectIds(fs, { project: "proj" });
    const proj = await (await fs.root()).getDirectory("proj");

    // library.json: local o1 in different exhibits → distinct composed ids
    const lib = JSON.parse(dec(await (await proj.getFile("library.json")).readable())) as {
      exhibits: { id: string; objects: { id: string }[]; sections?: { objectId: string; start?: string; prose?: string }[] }[];
    };
    expect(lib.exhibits[0]!.objects.map((o) => o.id)).toEqual(["ex-sample.o1", "ex-sample.o2"]);
    expect(lib.exhibits[1]!.objects.map((o) => o.id)).toEqual(["ex-voynich.o1"]);

    // sections-in-library.json (DEFAULT structure home): objectId composed under the OWNING exhibit,
    // prose archie: ref recomposed under its TARGET exhibit, `start` (media fragment) untouched.
    const secs = lib.exhibits[1]!.sections!;
    expect(secs.map((s) => s.objectId)).toEqual(["ex-voynich.o1", "ex-voynich.o1"]);
    expect(secs[0]!.start).toBe("xywh=0,0,10,10"); // media fragment left alone
    expect(secs[0]!.prose).toBe("see [the sample](archie:sample/#/o/ex-sample.o2)");

    // cross-exhibit archie: link recomposed under the TARGET exhibit (sample), not the body's (voynich)
    const voyHist = await (await (await (await proj.getDirectory("exhibits")).getDirectory("voynich")).getDirectory("annotations")).getDirectory("history");
    const bodies = await collectStrings(voyHist);
    expect(bodies.some((s) => s.includes("archie:sample/#/o/ex-sample.o2"))).toBe(true);
    expect(bodies.some((s) => s.includes("archie:sample/#/o/o2"))).toBe(false);

    // DAG shape unchanged: reload the voynich log and compare identity/DAG fields (only targets/bodies moved)
    const reloaded = await readAnnotations(await (await (await proj.getDirectory("exhibits")).getDirectory("voynich")).getDirectory("annotations"));
    expect(dagShape(reloaded)).toEqual(dagShape(voynichLog));
    // target now composed
    expect(reloaded.every((r) => (typeof r.target === "string" ? r.target : r.target.source).endsWith("/canvas/ex-voynich.o1"))).toBe(true);
  });

  it("keeps a verbatim pre-migration snapshot carrying the ORIGINAL legacy ids", async () => {
    const fs = new MemoryFilesystem();
    await buildLegacyStore(fs);
    await migrateLibraryObjectIds(fs, { project: "proj" });
    const proj = await (await fs.root()).getDirectory("proj");
    const snap = await proj.getDirectory(PRE_MIGRATION_DIR);
    const snapLib = JSON.parse(dec(await (await snap.getFile("library.json")).readable())) as { exhibits: { objects: { id: string }[] }[] };
    expect(snapLib.exhibits[0]!.objects.map((o) => o.id)).toEqual(["o1", "o2"]); // legacy, preserved
    // the snapshot legitimately still contains legacy ids (that's its point)
    const snapIds = extractedIds(await collectStrings(snap, false));
    expect(snapIds.some(isLegacyObjectId)).toBe(true);
  });
});

describe("migrateLibraryObjectIds — torn-state, idempotency, pass-through", () => {
  it("a torn migration (content rewritten, marker absent) reads un-migrated and re-runs idempotently", async () => {
    const fs = new MemoryFilesystem();
    await buildLegacyStore(fs);
    await migrateLibraryObjectIds(fs, { project: "proj" });
    const proj = await (await fs.root()).getDirectory("proj");

    // Simulate a crash AFTER snapshot + content rewrite but BEFORE the marker landed.
    await proj.remove(ID_SCHEME_MARKER_FILE);
    expect(await readIdScheme(fs, { project: "proj" })).toBe(LEGACY_ID_SCHEME); // reads as un-migrated

    const snapBefore = await collectStrings(await proj.getDirectory(PRE_MIGRATION_DIR), false);

    // Re-run: idempotent — already-composed ids pass through, snapshot NOT re-taken/clobbered, marker written.
    const second = await migrateLibraryObjectIds(fs, { project: "proj" });
    expect(second.migrated).toBe(true);
    expect(second.snapshotCreated).toBe(false); // first snapshot kept
    expect(second.rewrites).toEqual({ libraryObjects: 0, librarySectionObjectIds: 0, annotationTargets: 0, bodyLinks: 0, sectionObjectIds: 0, pendingNotes: 0 });
    expect(await readIdScheme(fs, { project: "proj" })).toBe(CURRENT_ID_SCHEME);

    // snapshot bytes unchanged (still the original legacy state)
    expect(await collectStrings(await proj.getDirectory(PRE_MIGRATION_DIR), false)).toEqual(snapBefore);
    // still zero legacy refs in the live tree
    expect(extractedIds(await collectStrings(proj)).filter(isLegacyObjectId)).toEqual([]);
  });

  it("a torn snapshot (pre-migration/ present but no completion sentinel) is recopied, then completed", async () => {
    const fs = new MemoryFilesystem();
    await buildLegacyStore(fs);
    const proj = await (await fs.root()).getDirectory("proj");

    // Simulate a crash MID-COPY: a partial pre-migration/ with a WRONG/partial library.json and NO sentinel.
    const partial = await proj.getDirectory(PRE_MIGRATION_DIR, { create: true });
    await writeJson(partial, "library.json", { exhibits: [{ id: "PARTIAL", slug: "x", objects: [] }] });
    await expect(partial.getFile(SNAPSHOT_SENTINEL_FILE)).rejects.toBeDefined(); // no sentinel

    const result = await migrateLibraryObjectIds(fs, { project: "proj" });
    expect(result.migrated).toBe(true);
    expect(result.snapshotCreated).toBe(true); // recopied over the partial (dir existence is NOT the commit point)

    // the snapshot now carries the REAL original legacy library (recopied), plus the completion sentinel
    const snap = await proj.getDirectory(PRE_MIGRATION_DIR);
    const snapLib = JSON.parse(dec(await (await snap.getFile("library.json")).readable())) as { exhibits: { id: string; objects: { id: string }[] }[] };
    expect(snapLib.exhibits.map((e) => e.id)).toEqual(["ex-sample", "ex-voynich"]); // partial overwritten
    expect(snapLib.exhibits[0]!.objects.map((o) => o.id)).toEqual(["o1", "o2"]); // original legacy ids preserved
    expect(await (await snap.getFile(SNAPSHOT_SENTINEL_FILE)).readable()).toBeDefined();
    // and the live tree completed the migration
    expect(await readIdScheme(fs, { project: "proj" })).toBe(CURRENT_ID_SCHEME);
    expect(extractedIds(await collectStrings(proj)).filter(isLegacyObjectId)).toEqual([]);
  });

  it("a library already on idScheme 2 is a pass-through: no snapshot, no rewrites", async () => {
    const fs = new MemoryFilesystem();
    await buildLegacyStore(fs);
    const proj = await (await fs.root()).getDirectory("proj");
    await writeJson(proj, ID_SCHEME_MARKER_FILE, { idScheme: CURRENT_ID_SCHEME }); // already migrated marker

    const result = await migrateLibraryObjectIds(fs, { project: "proj" });
    expect(result.migrated).toBe(false);
    expect(result.snapshotCreated).toBe(false);
    expect(result.rewrites).toEqual({ libraryObjects: 0, librarySectionObjectIds: 0, annotationTargets: 0, bodyLinks: 0, sectionObjectIds: 0, pendingNotes: 0 });

    // no snapshot dir, and the (legacy) content is untouched
    await expect(proj.getDirectory(PRE_MIGRATION_DIR)).rejects.toBeDefined();
    const lib = JSON.parse(dec(await (await proj.getFile("library.json")).readable())) as { exhibits: { objects: { id: string }[] }[] };
    expect(lib.exhibits[0]!.objects.map((o) => o.id)).toEqual(["o1", "o2"]); // still legacy
  });

  it("a corrupt annotation page is skipped-and-reported, never rewritten to silence, run continues", async () => {
    const fs = new MemoryFilesystem();
    await buildLegacyStore(fs);
    const proj = await (await fs.root()).getDirectory("proj");
    // Corrupt one voynich history page (torn JSON) before migrating.
    const voyHist = await (await (await (await proj.getDirectory("exhibits")).getDirectory("voynich")).getDirectory("annotations")).getDirectory("history");
    let victim = "";
    for await (const e of voyHist.entries()) if (e.name.endsWith(".json") && e.name !== "index.json") victim = e.name;
    const w = await (await voyHist.getFile(victim, { create: true })).writable();
    await w.write("{ this is not json");
    await w.close();

    const result = await migrateLibraryObjectIds(fs, { project: "proj" });
    expect(result.migrated).toBe(true);
    expect(result.corrupt.length).toBe(1);
    expect(result.corrupt[0]!.path).toContain(victim);
    // the corrupt file is left byte-identical (not silenced, not emptied)
    expect(dec(await (await voyHist.getFile(victim)).readable())).toBe("{ this is not json");
    // other classes still migrated
    const lib = JSON.parse(dec(await (await proj.getFile("library.json")).readable())) as { exhibits: { objects: { id: string }[] }[] };
    expect(lib.exhibits[1]!.objects.map((o) => o.id)).toEqual(["ex-voynich.o1"]);
  });

  it("no working store → a clean no-op pass-through", async () => {
    const fs = new MemoryFilesystem();
    const result = await migrateLibraryObjectIds(fs, { project: "proj" });
    expect(result.migrated).toBe(false);
    expect(result.snapshotCreated).toBe(false);
  });
});
