// Zip-import structure-log merging (Archie-2a9a deliverable 1) — the headless merge core, over
// MemoryFilesystem stand-ins for the incoming zip/folder tree and the local OPFS structure store.
// The scenarios are the ticket's: two diverged copies merge to plural heads (gated in projection),
// an import without structure pages leaves the local store byte-untouched (seed-from-array stays),
// a corrupt incoming page is skipped-and-reported with the local log intact, and an import into an
// exhibit with no local log lands the incoming history whole.
import { describe, it, expect, vi } from "vitest";
import {
  MemoryFilesystem,
  appendEditSection,
  appendNewSection,
  asClientId,
  asExhibitId,
  headsOf,
  readStructureReport,
  sectionKey,
  writeStructure,
  type FsDirectory,
  type SectionLog,
} from "@render/core";
import { mergeImportedStructure } from "./structure-import.js";
import { workingStructure } from "./structure-reconcile.js";

const alice = asClientId("alice");
const bob = asClientId("bob");
const EX = "voynich";
const exId = asExhibitId(EX);
const k1 = sectionKey(exId, "s1");
const k2 = sectionKey(exId, "s2");

/** A shared base log (one section) plus two DIVERGED continuations — the two-zips scenario. */
function divergedLogs(): { base: SectionLog; local: SectionLog; incoming: SectionLog } {
  const base = appendNewSection([], { key: k1, order: "i", objectId: "o1", title: "Intro", lastEditor: alice, now: 1 }).log;
  const local = appendEditSection(base, k1, { title: "Intro (local)", lastEditor: alice, now: 2 }).log;
  const incoming = appendEditSection(base, k1, { title: "Intro (incoming)", lastEditor: bob, now: 3 }).log;
  return { base, local, incoming };
}

/** An incoming library tree carrying `{slug}/structure/history/` pages for `log`. */
async function incomingExhibitDir(log: SectionLog): Promise<FsDirectory> {
  const src = new MemoryFilesystem();
  const exDir = await (await src.root()).getDirectory(EX, { create: true });
  await writeStructure(await exDir.getDirectory("structure", { create: true }), log);
  return exDir;
}

/** A local structure dir (the openExhibitStructureDir stand-in), optionally pre-populated. */
async function localStructDir(log?: SectionLog): Promise<FsDirectory> {
  const fs = new MemoryFilesystem();
  const dir = await (await fs.root()).getDirectory("structure", { create: true });
  if (log) await writeStructure(dir, log);
  return dir;
}

/** Corrupt one section's history page in a structure dir (torn-write / on-disk damage stand-in). */
async function corruptPage(structDir: FsDirectory, localId: string): Promise<void> {
  const hist = await structDir.getDirectory("history");
  const w = await (await hist.getFile(`${localId}.json`, { create: true })).writable();
  await w.write("{ not json");
  await w.close();
}

describe("mergeImportedStructure — the one-contract merge (Archie-2a9a deliverable 1)", () => {
  it("merges concurrent edits from two copies into plural heads, gated in the projection", async () => {
    const { local, incoming } = divergedLogs();
    const dir = await localStructDir(local);
    const res = await mergeImportedStructure(await incomingExhibitDir(incoming), EX, async () => dir);

    expect(res.action).toBe("merged");
    expect(res.corruptIncoming).toEqual([]);
    const reloaded = (await readStructureReport(dir, exId)).log;
    // Shared history deduped by rev: base + the two diverged edits, nothing else.
    expect(reloaded.length).toBe(3);
    expect(new Set(reloaded.map((r) => r.rev))).toEqual(new Set([...local, ...incoming].map((r) => r.rev)));
    // Plural heads are FINE — they are deliberately NOT auto-resolved; the existing conflicted
    // gating (42f3) surfaces them through the projection.
    expect(headsOf(reloaded, k1).length).toBe(2);
    expect(workingStructure(reloaded, new Set(["o1"])).conflicted.has("s1")).toBe(true);
  });

  it("import WITHOUT structure pages: local store untouched, local dir never opened (seed-from-array stays)", async () => {
    const src = new MemoryFilesystem();
    const exDir = await (await src.root()).getDirectory(EX, { create: true });
    await (await (await exDir.getFile("manifest.json", { create: true })).writable()).close(); // an exhibit dir, no structure/
    const openLocal = vi.fn(async () => localStructDir());

    const res = await mergeImportedStructure(exDir, EX, openLocal);

    expect(res.action).toBe("none");
    expect(res.corruptIncoming).toEqual([]);
    expect(openLocal).not.toHaveBeenCalled(); // no local structure/ dir is created for a page-less import
  });

  it("corrupt incoming page: skipped-and-reported, the readable rest merges, local history intact", async () => {
    const { local, incoming } = divergedLogs();
    // A second, cleanly-readable incoming section rides beside the one whose page gets corrupted.
    const incoming2 = appendNewSection(incoming, { key: k2, order: "m", objectId: "o1", title: "Coda", lastEditor: bob, now: 4 }).log;
    const exDir = await incomingExhibitDir(incoming2);
    await corruptPage(await exDir.getDirectory("structure"), "s1");
    const dir = await localStructDir(local);

    const res = await mergeImportedStructure(exDir, EX, async () => dir);

    expect(res.action).toBe("merged");
    expect(res.corruptIncoming.length).toBe(1);
    expect(res.corruptIncoming[0]!.localId).toBe("s1");
    const reloaded = (await readStructureReport(dir, exId)).log;
    // Local s1 history survived whole (2 revs); the incoming s1 page was skipped, not substituted.
    expect(reloaded.filter((r) => r.logicalId === k1).map((r) => r.rev).sort()).toEqual(local.map((r) => r.rev).sort());
    // The readable incoming section landed.
    expect(headsOf(reloaded, k2).length).toBe(1);
  });

  it("EVERY incoming page corrupt: reports, refuses to touch the local store", async () => {
    const { local, incoming } = divergedLogs();
    const exDir = await incomingExhibitDir(incoming);
    await corruptPage(await exDir.getDirectory("structure"), "s1");
    const dir = await localStructDir(local);
    const before = (await readStructureReport(dir, exId)).log;

    const res = await mergeImportedStructure(exDir, EX, async () => dir);

    expect(res.action).toBe("none");
    expect(res.corruptIncoming.length).toBe(1);
    expect((await readStructureReport(dir, exId)).log).toEqual(before); // local intact
  });

  it("import into an exhibit with NO local log: the incoming history lands whole", async () => {
    const { incoming } = divergedLogs();
    const dir = await localStructDir(); // empty — no committed index
    const res = await mergeImportedStructure(await incomingExhibitDir(incoming), EX, async () => dir);

    expect(res.action).toBe("merged");
    const reloaded = (await readStructureReport(dir, exId)).log;
    expect(new Set(reloaded.map((r) => r.rev))).toEqual(new Set(incoming.map((r) => r.rev)));
    expect(headsOf(reloaded, k1).length).toBe(1); // nothing to conflict with
  });

  it("no local persistence (OPFS unavailable): reports no-store, does not throw", async () => {
    const { incoming } = divergedLogs();
    const res = await mergeImportedStructure(await incomingExhibitDir(incoming), EX, async () => null);
    expect(res.action).toBe("no-store");
  });

  it("TORN local store: refuses the merge write (rule #2 — corrupt ≠ empty, never clobbered)", async () => {
    const { local, incoming } = divergedLogs();
    const dir = await localStructDir(local);
    await corruptPage(dir, "s1"); // the local store is now torn
    const indexBefore = new TextDecoder().decode(await (await (await dir.getDirectory("history")).getFile("index.json")).readable());

    const res = await mergeImportedStructure(await incomingExhibitDir(incoming), EX, async () => dir);

    expect(res.action).toBe("local-torn");
    const indexAfter = new TextDecoder().decode(await (await (await dir.getDirectory("history")).getFile("index.json")).readable());
    expect(indexAfter).toBe(indexBefore); // nothing rewritten — the unreadable page is not orphaned
    expect((await readStructureReport(dir, exId)).corrupt.length).toBe(1); // still surfaced as torn, not empty
  });
});
