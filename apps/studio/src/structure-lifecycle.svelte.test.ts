// Structure-store lifecycle on exhibit delete (Archie-2a9a deliverable 2): the deleted exhibit's
// structure/ dir is removed (clearExhibitStructure — FLAG-INDEPENDENT, the sibling of
// clearExhibitAnnotations in App.svelte's removeExhibitById), and the structure session forgets its
// cached log so a recreated same-slug exhibit (ids are deterministic `ex-${slug}`) seeds clean —
// including when the delete lands while the slug's log is still loading (the generation guard).
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryFilesystem, readStructureReport, asExhibitId, type FsDirectory, type Section } from "@render/core";
import { createStructureSession, type StructureSessionDeps } from "./structure-session.svelte.js";
import { clearExhibitStructure } from "./store.js";
import { asClientId } from "@render/core";

const alice = asClientId("alice");
const sec = (id: string, title: string, objectId = "o1"): Section => ({ id, title, objectId });

// ---- deliverable-2a: clearExhibitStructure over a fake OPFS handle tree (node has no real OPFS) ----

type DirNode = { dirs: Map<string, DirNode> };
function handleFor(node: DirNode): unknown {
  return {
    getDirectoryHandle: async (name: string, opts?: { create?: boolean }) => {
      let child = node.dirs.get(name);
      if (!child) {
        if (!opts?.create) throw new Error(`NotFoundError: ${name}`);
        child = { dirs: new Map() };
        node.dirs.set(name, child);
      }
      return handleFor(child);
    },
    removeEntry: async (name: string) => {
      if (!node.dirs.delete(name)) throw new Error(`NotFoundError: ${name}`);
    },
  };
}
/** A fake OPFS: seed a path of nested dirs, then stub navigator.storage over it. */
function fakeOpfs(...paths: string[][]): DirNode {
  const root: DirNode = { dirs: new Map() };
  for (const path of paths) {
    let cur = root;
    for (const name of path) {
      if (!cur.dirs.has(name)) cur.dirs.set(name, { dirs: new Map() });
      cur = cur.dirs.get(name)!;
    }
  }
  vi.stubGlobal("navigator", { storage: { getDirectory: async () => handleFor(root) } });
  return root;
}
const at = (root: DirNode, ...path: string[]): DirNode | undefined =>
  path.reduce<DirNode | undefined>((n, name) => n?.dirs.get(name), root);

afterEach(() => vi.unstubAllGlobals());

describe("clearExhibitStructure — the on-disk half of exhibit delete (flag-independent)", () => {
  it("removes the exhibit's structure/ dir and leaves its siblings", async () => {
    const root = fakeOpfs(
      ["archie-demo-project", "exhibits", "myex", "structure", "history"],
      ["archie-demo-project", "exhibits", "myex", "annotations"],
    );
    // NB: no archie.structureRevlog flag exists in this environment at all — the clear must not
    // consult it (the dir may be a leftover from a previous flagged session).
    await clearExhibitStructure("myex");
    expect(at(root, "archie-demo-project", "exhibits", "myex", "structure")).toBeUndefined();
    expect(at(root, "archie-demo-project", "exhibits", "myex", "annotations")).toBeDefined();
  });

  it("tolerates an absent dir (nothing stored / already cleared) and no OPFS at all", async () => {
    fakeOpfs(["archie-demo-project", "exhibits", "myex"]); // exhibit exists, no structure/
    await expect(clearExhibitStructure("myex")).resolves.toBeUndefined();
    await expect(clearExhibitStructure("never-existed")).resolves.toBeUndefined();
    vi.stubGlobal("navigator", {}); // no storage API (private mode / unsupported)
    await expect(clearExhibitStructure("myex")).resolves.toBeUndefined();
  });

  it("clears the legacy project-root location for the sample slug", async () => {
    const root = fakeOpfs(["archie-demo-project", "structure", "history"]);
    await clearExhibitStructure("sample");
    expect(at(root, "archie-demo-project", "structure")).toBeUndefined();
  });
});

// ---- deliverable-2b: the session forgets the slug (in-memory half; same deps idiom as the 42f3 tests) ----

function makeDeps(over: Partial<StructureSessionDeps> = {}) {
  const fs = new MemoryFilesystem();
  let queue: Promise<void> = Promise.resolve();
  const counters = { enqueue: 0 };
  const structDir = (slug: string) => fs.root().then((r) => r.getDirectory(`structure-${slug}`, { create: true }));
  const deps: StructureSessionDeps = {
    author: () => alice,
    openStructDir: structDir,
    enqueue: (_key, _label, job) => {
      counters.enqueue++;
      queue = queue.then(job);
      return queue.then(() => true);
    },
    isTemplate: () => false,
    enabled: () => true,
    ...over,
  };
  return { fs, deps, counters, structDir, flush: () => queue };
}

describe("structure-session.forget — delete drops the cached log; a recreated slug seeds clean", () => {
  it("forget + cleared store: re-ensureLoaded seeds fresh v1 roots, no ghost sections", async () => {
    const { fs, deps, flush, structDir } = makeDeps();
    const s = createStructureSession(deps);
    await s.ensureLoaded("ex", "ex-ex", [sec("old", "Old ghost")]);
    await flush();

    // Exhibit deleted: session forgets, disk store cleared (the MemoryFilesystem analogue).
    s.forget("ex");
    await (await fs.root()).remove("structure-ex");

    // Recreated under the same slug (deterministic id) with a NEW seed array.
    await s.ensureLoaded("ex", "ex-ex", [sec("fresh", "Fresh start")]);
    const ws = s.apply("ex", "ex-ex", [sec("fresh", "Fresh start")]);
    expect(ws!.sections.map((x) => x.id)).toEqual(["fresh"]); // no "old" ghost row
    expect(ws!.tombstoned.size).toBe(0); // clean seed — not "old tombstoned on first apply"
    await flush();
    const log = (await readStructureReport(await structDir("ex"), asExhibitId("ex-ex"))).log;
    expect(log.every((r) => !String(r.logicalId).endsWith("/old"))).toBe(true);
  });

  it("forget mid-load abandons the in-flight job: no resurrected log, no persist into the removed dir", async () => {
    const { deps, counters, flush } = makeDeps();
    // Gate openStructDir so the delete can land while ensureLoaded is awaiting it.
    let release!: (d: FsDirectory | null) => void;
    const gated = new Promise<FsDirectory | null>((r) => (release = r));
    const base = deps.openStructDir;
    deps.openStructDir = () => gated;
    const s = createStructureSession(deps);

    const loadP = s.ensureLoaded("ex", "ex-ex", [sec("old", "Old ghost")]);
    s.forget("ex"); // the delete wins the race
    release(await base("ex"));
    await loadP;
    await flush();

    expect(s.apply("ex", "ex-ex", [sec("old", "Old ghost")])).toBeNull(); // not loaded — the job abandoned
    expect(counters.enqueue).toBe(0); // and nothing was persisted (the dir the delete removed stays gone)
  });

  it("reset forgets every slug (the project-replace teardown)", async () => {
    const { deps } = makeDeps();
    const s = createStructureSession(deps);
    await s.ensureLoaded("a", "ex-a", [sec("s1", "One")]);
    await s.ensureLoaded("b", "ex-b", [sec("s2", "Two")]);
    s.reset();
    expect(s.apply("a", "ex-a", [sec("s1", "One")])).toBeNull();
    expect(s.apply("b", "ex-b", [sec("s2", "Two")])).toBeNull();
  });
});
