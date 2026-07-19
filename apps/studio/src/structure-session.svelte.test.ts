// structure-session (Archie-42f3): the flag-gated reactive owner of the section rev-log.
// The FIRST describe is the ticket's off-path PIN: with archie.structureRevlog OFF, the module is
// inert — it never opens the structure dir, never reads or writes the fs seam, and every read
// surface returns the do-nothing value, so the App's array-only behavior is untouched.
import { describe, it, expect } from "vitest";
import { createStructureSession, type StructureSessionDeps } from "./structure-session.svelte.js";
import { MemoryFilesystem, asClientId, appendNew, type AnnotationLog, type FsDirectory, type Section } from "@render/core";

const alice = asClientId("alice");
const sec = (id: string, title: string, objectId = "o1", rest: Partial<Section> = {}): Section => ({ id, title, objectId, ...rest });

/** Deps over a MemoryFilesystem, with call counters for the off-path pin. `flush()` awaits every
 *  enqueued write — schedulePersist is fire-and-forget (the real save queue serializes per key),
 *  so a test must drain the queue before reloading the backing store. */
function makeDeps(over: Partial<StructureSessionDeps> = {}) {
  const fs = new MemoryFilesystem();
  const counters = { openStructDir: 0, enqueue: 0 };
  let queue: Promise<void> = Promise.resolve();
  const deps: StructureSessionDeps = {
    author: () => alice,
    openStructDir: async (slug: string): Promise<FsDirectory | null> => {
      counters.openStructDir++;
      const root = await fs.root();
      return root.getDirectory(`structure-${slug}`, { create: true });
    },
    enqueue: (_key, _label, job) => {
      counters.enqueue++;
      queue = queue.then(job); // serialized, like the real save queue
      return queue.then(() => true);
    },
    isTemplate: () => false,
    enabled: () => true,
    ...over,
  };
  const flush = () => queue;
  return { fs, counters, deps, flush };
}

describe("structure-session — flag OFF is inert (the Archie-42f3 off-path pin)", () => {
  it("never touches the fs seam or the save queue; every surface returns the do-nothing value", async () => {
    const { counters, deps } = makeDeps({ enabled: () => false });
    const s = createStructureSession(deps);

    await s.ensureLoaded("ex", "ex-id", [sec("a", "A")]);
    const applied = s.apply("ex", "ex-id", [sec("a", "A"), sec("b", "B")]);

    expect(applied).toBeNull(); // caller keeps its own array — today's path, untouched
    expect(counters.openStructDir).toBe(0); // no structure/ dir opened or created
    expect(counters.enqueue).toBe(0); // nothing written
    expect(s.conflictedLocalIds("ex").size).toBe(0);
    expect(s.tombstonedKeys("ex").size).toBe(0);
    const ann = appendNew([], { target: { type: "SpecificResource", source: "c", selector: { type: "FragmentSelector", value: "xywh=pixel:0,0,5,5" } }, lastEditor: alice, section: "a" }).log;
    expect(s.hiddenIds("ex", ann).size).toBe(0);
  });
});

describe("structure-session — flag ON: load / seed / apply / persist / reload", () => {
  it("seeds the log from a pre-revlog working array on first load, persists, and reloads it", async () => {
    const { counters, deps, flush } = makeDeps();
    const seed = [sec("a", "Alpha", "o1", { prose: "p" }), sec("b", "Beta", "o2")];

    const s1 = createStructureSession(deps);
    await s1.ensureLoaded("ex", "ex-id", seed);
    expect(counters.enqueue).toBeGreaterThan(0); // the seed reached disk
    // apply with the same array: idempotent (no growth), projection round-trips.
    const ws = s1.apply("ex", "ex-id", seed);
    expect(ws!.sections).toEqual(seed);
    await flush();

    // A second session over the SAME backing store (a reload) sees the persisted log — and does
    // NOT re-seed from the (possibly stale) array it is handed.
    const s2 = createStructureSession(deps);
    await s2.ensureLoaded("ex", "ex-id", []);
    const ws2 = s2.apply("ex", "ex-id", seed);
    expect(ws2!.sections).toEqual(seed);
  });

  it("apply appends + persists mutations; a reload projects the mutated structure", async () => {
    const { deps, flush } = makeDeps();
    const s1 = createStructureSession(deps);
    await s1.ensureLoaded("ex", "ex-id", [sec("a", "A"), sec("b", "B")]);
    s1.apply("ex", "ex-id", [sec("b", "B"), sec("a", "A retitled")]); // reorder + edit
    s1.apply("ex", "ex-id", [sec("b", "B")]); // delete a
    await flush();

    const s2 = createStructureSession(deps);
    await s2.ensureLoaded("ex", "ex-id", []);
    const ws = s2.apply("ex", "ex-id", [sec("b", "B")]);
    expect(ws!.sections).toEqual([sec("b", "B")]);
    expect(s2.tombstonedKeys("ex").size).toBe(1); // a's tombstone survived the round trip
  });

  it("hide-by-ancestry: notes attributed to a tombstoned section are hidden; others are not", async () => {
    const { deps } = makeDeps();
    const s = createStructureSession(deps);
    await s.ensureLoaded("ex", "ex-id", [sec("a", "A"), sec("b", "B")]);
    s.apply("ex", "ex-id", [sec("b", "B")]); // tombstone a

    const target = { type: "SpecificResource" as const, source: "c", selector: { type: "FragmentSelector" as const, value: "xywh=pixel:0,0,5,5" } };
    let ann: AnnotationLog = [];
    const r1 = appendNew(ann, { target, lastEditor: alice, section: "a" }); // attributed to the tombstoned section
    ann = r1.log;
    const r2 = appendNew(ann, { target, lastEditor: alice, section: "b" }); // live section
    ann = r2.log;
    const r3 = appendNew(ann, { target, lastEditor: alice }); // unattributed
    ann = r3.log;

    const hidden = s.hiddenIds("ex", ann);
    expect(hidden.has(r1.record.logicalId)).toBe(true);
    expect(hidden.has(r2.record.logicalId)).toBe(false);
    expect(hidden.has(r3.record.logicalId)).toBe(false);
  });

  it("a template slug stays in-memory: no dir opened, no writes, but the projection works", async () => {
    const { counters, deps } = makeDeps({ isTemplate: () => true });
    const s = createStructureSession(deps);
    await s.ensureLoaded("tmpl", "tmpl-id", [sec("a", "A")]);
    const ws = s.apply("tmpl", "tmpl-id", [sec("a", "A"), sec("b", "B")]);
    expect(ws!.sections.map((x) => x.id)).toEqual(["a", "b"]);
    expect(counters.openStructDir).toBe(0);
    expect(counters.enqueue).toBe(0);
  });
});
