// exhibit-session.svelte.ts (ledgers/ANTIPATTERN-SWEEP-2026-07-19.md real defect 2 / Archie-94b6):
// a characterization test for the atomic `open()` transition. The module's own header comment says
// it exists SPECIFICALLY to fix a partial-state-visibility bug ("the old inline openExhibit
// interleaved 7 mutations across 2 awaits — partial states visible"). This test pins the invariant
// the fix promises, not any new behavior: at no point during open() may a reader observe a mixed
// session/annDir/storeReady triple — reads mid-transition see only the OLD triple, reads after
// open() settles see only the NEW one, landed together. It also pins what happens when open() fails
// partway through (does state stay on the OLD coherent triple, or does it partially move?).
//
// No live bug is known here (the sweep read the ordering in full and found it correct) — this is a
// coverage gap being closed, not a fix. If any assertion below turns up behavior that actually
// VIOLATES the invariant, it is pinned as-is (characterization, not correction) and flagged in the
// handoff, per the ticket.
//
// Observational limit (review, Archie-94b6): these are black-box tests — they can only observe at
// await suspension points that ALREADY exist in open(). A mutation that introduces a NEW await
// between the swap writes opens a mixed-triple window these tests cannot reach (empirically
// verified: all 7 stay green under it). That case is guarded only by the `// no await between
// writes` comment in exhibit-session.svelte.ts — keep the swap batch synchronous.
//
// Harness: store.js's OPFS-touching openExhibitAnnotationsDir is the one production seam this module
// can't run headlessly over — mocked the way replace-structure.test.ts mocks the same module (real
// MemoryFilesystem directories stand in for OPFS dirs, so save()/AnnotationSession.load() run for
// real against them). save-queue.svelte.ts is the REAL singleton (reset per test) — its own doc
// comment says enqueueSave NEVER throws, which is why the failure-midway tests below inject
// rejections at resolveAssets / the incoming dir open / AnnotationSession.load instead: those are
// the only awaits inside open() that can actually reject.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnnotationSession,
  MemoryFilesystem,
  asClientId,
  readAnnotationsReport,
  type FsDirectory,
  type W3CTarget,
} from "@render/core";
import { createExhibitSession, type ExhibitSessionDeps } from "./exhibit-session.svelte.js";
import { resetSaveQueueForTests } from "./save-queue.svelte.js";

const h = vi.hoisted(() => ({
  /** Per-slug incoming-dir resolver — installed per test; null = "return null" (no OPFS). */
  openDir: null as null | ((slug: string) => Promise<FsDirectory | null>),
  opens: [] as string[],
}));
vi.mock("./store.js", () => ({
  openExhibitAnnotationsDir: async (slug: string): Promise<FsDirectory | null> => {
    h.opens.push(slug);
    return h.openDir ? h.openDir(slug) : null;
  },
}));

const alice = asClientId("alice");
const TARGET: W3CTarget = { type: "SpecificResource", source: "c", selector: { type: "FragmentSelector", value: "xywh=pixel:0,0,5,5" } };

function makeDeps(over: Partial<ExhibitSessionDeps> = {}): ExhibitSessionDeps {
  return {
    baseUrl: "/",
    author: () => alice,
    isTemplate: () => false,
    seedFor: () => null,
    autosaveToFolder: () => {},
    touchBinding: () => {},
    ...over,
  };
}

async function makeDir(): Promise<FsDirectory> {
  return new MemoryFilesystem().root();
}

/** Drain pending microtasks (a setTimeout(0) macrotask always runs after they've settled) — the same
 *  idiom binding-store.svelte.test.ts uses to observe state between two `await`s inside open(). */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  h.openDir = null;
  h.opens = [];
  resetSaveQueueForTests();
});

describe("exhibit-session — open() baseline (session/annDir/storeReady land together)", () => {
  it("opening a bound (non-template) exhibit flips storeReady and binds the annDir in the same call", async () => {
    const dirA = await makeDir();
    h.openDir = async () => dirA;
    const s = createExhibitSession(makeDeps());

    expect(s.storeReady).toBe(false); // boot: no exhibit open yet

    await s.open("boot", { slug: "A", resolveAssets: async () => {} });

    expect(s.storeReady).toBe(true);
    expect(h.opens).toEqual(["A"]);
    // annDir isn't exposed by a getter — prove it landed by round-tripping a note through save().
    const id = s.session.createNote({ target: TARGET });
    s.markDirty();
    await s.save("A");
    const report = await readAnnotationsReport(dirA);
    expect(report.log.some((r) => r.logicalId === id)).toBe(true);
  });

  it("opening a TEMPLATE exhibit: storeReady flips to false and the session flips to a fresh one, together", async () => {
    const dirA = await makeDir();
    h.openDir = async () => dirA;
    const s = createExhibitSession(makeDeps({ isTemplate: (slug) => slug === "tmpl" }));
    await s.open("boot", { slug: "A", resolveAssets: async () => {} });
    const sessA = s.session;
    expect(s.storeReady).toBe(true);

    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    const openPromise = s.open("A", { slug: "tmpl", resolveAssets: () => gate });

    await flush(); // outgoing flush (save("A")) has resolved; open() is now parked on resolveAssets()
    expect(s.session).toBe(sessA); // still the OLD pair
    expect(s.storeReady).toBe(true);

    release();
    await openPromise;

    expect(s.session).not.toBe(sessA); // NEW session
    expect(s.storeReady).toBe(false); // NEW storeReady — landed together with the session swap
    expect(h.opens).toEqual(["A"]); // the template path never opens an annDir for "tmpl"
  });
});

describe("exhibit-session — open() is atomic: no reader ever observes a mixed triple", () => {
  it("mid-transition reads (across BOTH internal awaits) see only the OLD triple; the swap lands together once open() settles", async () => {
    const dirA = await makeDir();
    const dirB = await makeDir();
    h.openDir = async () => dirA;
    const s = createExhibitSession(makeDeps());
    await s.open("boot", { slug: "A", resolveAssets: async () => {} });
    const sessA = s.session;
    expect(s.storeReady).toBe(true);

    let releaseAssets!: () => void;
    const assetsGate = new Promise<void>((res) => { releaseAssets = res; });
    let releaseDir!: (d: FsDirectory) => void;
    const dirGate = new Promise<FsDirectory>((res) => { releaseDir = res; });
    h.openDir = async () => dirGate; // the INCOMING dir open now pauses on dirGate

    const openPromise = s.open("A", { slug: "B", resolveAssets: () => assetsGate });

    // Window 1: open() is parked on resolveAssets(), before step 3 (the incoming dir/session compute)
    // has even started — nothing about the incoming exhibit has been touched yet.
    await flush();
    expect(s.session).toBe(sessA);
    expect(s.storeReady).toBe(true);
    expect(h.opens).toEqual(["A"]); // "B"'s dir has not been requested yet

    releaseAssets();
    // Window 2: resolveAssets settled, open() is now parked on the incoming dir open — still strictly
    // BEFORE any state write (step 4, the swap, hasn't run).
    await flush();
    expect(s.session).toBe(sessA); // STILL the OLD pair
    expect(s.storeReady).toBe(true);
    expect(h.opens).toEqual(["A", "B"]); // requested, but not yet resolved

    releaseDir(dirB);
    await openPromise;

    // Post-swap: the NEW triple, observed together — never staggered.
    expect(s.session).not.toBe(sessA);
    expect(s.storeReady).toBe(true);
    const id = s.session.createNote({ target: TARGET });
    s.markDirty();
    await s.save("B");
    const reportB = await readAnnotationsReport(dirB);
    expect(reportB.log.some((r) => r.logicalId === id)).toBe(true); // the NEW annDir is really dirB
  });

  it("the outgoing exhibit's flush (prevSlug) writes under the OLD annDir before the swap — never the incoming one", async () => {
    const dirA = await makeDir();
    const dirB = await makeDir();
    h.openDir = async (slug) => (slug === "A" ? dirA : dirB);
    const s = createExhibitSession(makeDeps());
    await s.open("boot", { slug: "A", resolveAssets: async () => {} });

    const id = s.session.createNote({ target: TARGET });
    s.markDirty(); // a dirty edit against A, never flushed by autosave (debounced, never fires in-test)

    await s.open("A", { slug: "B", resolveAssets: async () => {} }); // opening B must flush A first

    const reportA = await readAnnotationsReport(dirA);
    expect(reportA.log.some((r) => r.logicalId === id)).toBe(true); // landed in A's dir
    const reportB = await readAnnotationsReport(dirB);
    expect(reportB.log.some((r) => r.logicalId === id)).toBe(false); // never touched B's dir
  });
});

describe("exhibit-session — open() failing midway leaves the OLD coherent triple untouched", () => {
  it("a rejection in resolveAssets (before the incoming dir is even requested) leaves session/storeReady/annDir exactly as they were", async () => {
    const dirA = await makeDir();
    h.openDir = async () => dirA;
    const s = createExhibitSession(makeDeps());
    await s.open("boot", { slug: "A", resolveAssets: async () => {} });
    const sessA = s.session;
    h.opens = []; // reset the counter for the assertion below

    const boom = new Error("resolveAssets boom");
    await expect(s.open("A", { slug: "B", resolveAssets: async () => { throw boom; } })).rejects.toThrow(boom);

    expect(s.session).toBe(sessA); // unchanged
    expect(s.storeReady).toBe(true); // unchanged
    expect(h.opens).toEqual([]); // step 3 (incoming dir open) never ran
  });

  it("a rejection opening the incoming annDir leaves the OLD triple untouched — including the OLD annDir binding", async () => {
    const dirA = await makeDir();
    h.openDir = async (slug) => (slug === "A" ? dirA : Promise.reject(new Error("dir open boom")));
    const s = createExhibitSession(makeDeps());
    await s.open("boot", { slug: "A", resolveAssets: async () => {} });
    const sessA = s.session;

    await expect(s.open("A", { slug: "B", resolveAssets: async () => {} })).rejects.toThrow("dir open boom");

    expect(s.session).toBe(sessA);
    expect(s.storeReady).toBe(true);
    // The OLD annDir binding is still intact (not nulled, not swapped) — a subsequent save still
    // reaches A's dir, proving the failed transition left the non-reactive `annDir` local alone too.
    const id = s.session.createNote({ target: TARGET });
    s.markDirty();
    await s.save("A");
    const report = await readAnnotationsReport(dirA);
    expect(report.log.some((r) => r.logicalId === id)).toBe(true);
  });

  it("a rejection loading the incoming log leaves the OLD triple untouched", async () => {
    const dirA = await makeDir();
    const dirB = await makeDir();
    h.openDir = async (slug) => (slug === "A" ? dirA : dirB);
    const s = createExhibitSession(makeDeps());
    await s.open("boot", { slug: "A", resolveAssets: async () => {} });
    const sessA = s.session;

    const loadSpy = vi.spyOn(AnnotationSession, "load").mockRejectedValueOnce(new Error("load boom"));
    try {
      await expect(s.open("A", { slug: "B", resolveAssets: async () => {} })).rejects.toThrow("load boom");
    } finally {
      loadSpy.mockRestore();
    }

    expect(s.session).toBe(sessA);
    expect(s.storeReady).toBe(true);
  });
});
