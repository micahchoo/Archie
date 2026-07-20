import { describe, it, expect, beforeEach, vi } from "vitest";
// Characterization tests on the browser glue of invention #3 (worklist 0.4 — the binding seam was
// the highest-risk UNTESTED surface; the pure recents algebra is already core-tested). localStorage
// is stubbed (node env): these pin the tolerant-load / silent-save contracts the boot path leans on.
import { zipNameFor, loadLastBinding, saveLastBinding, loadRecents, saveRecents, subscribeRecents, supportsFolderPicker, supportsFileStreamSave, supportsOpfsStagedZipSave, openOpfsStagedZipSave, type StagedDirLike, type StagedSaveEnv } from "./binding.js";
import { ZipFilesystem, type Binding, type RecentProject } from "@render/core";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const BINDING_KEY = "archie.activeBinding.v1";
const RECENTS_KEY = "archie.recentProjects.v1";

beforeEach(() => store.clear());

describe("binding seam — capability detection (node = the no-FSA floor)", () => {
  it("reports no folder picker / file stream without a window", () => {
    expect(supportsFolderPicker()).toBe(false);
    expect(supportsFileStreamSave()).toBe(false);
  });
  it("reports no OPFS staged save without OPFS + FileSystemFileHandle.createWritable", () => {
    expect(supportsOpfsStagedZipSave()).toBe(false);
  });
});

// The Firefox/Safari streaming sink: stream the archive into an OPFS staging file, then hand the
// disk-backed File to the download pipeline. The OPFS/download surfaces are injected (StagedSaveEnv)
// — node has no OPFS — so these pin the orchestration contract: staged bytes form a REAL archive,
// delivery carries the right name, cleanup runs after delivery, abort discards, the sweep only
// touches stale leftovers.
describe("binding seam — OPFS-staged streaming zip save", () => {
  /** In-memory StagedDirLike + delivery capture. `now` controls staleness for the sweep tests. */
  function fakeEnv(preexisting: { name: string; ageMs: number }[] = []) {
    const files = new Map<string, { chunks: Uint8Array[]; lastModified: number }>();
    for (const p of preexisting) files.set(p.name, { chunks: [new Uint8Array(4)], lastModified: Date.now() - p.ageMs });
    const delivered: { file: File; name: string }[] = [];
    const scheduled: (() => void)[] = [];
    const dir: StagedDirLike = {
      async *keys() { yield* [...files.keys()]; },
      async getFileHandle(name, opts) {
        if (!files.has(name)) {
          if (!opts?.create) throw new Error(`no such file: ${name}`);
          files.set(name, { chunks: [], lastModified: Date.now() });
        }
        const rec = files.get(name)!;
        return {
          createWritable: async () => ({
            write: (c: Uint8Array) => void rec.chunks.push(c.slice()),
            close: () => {},
            abort: () => {},
          }),
          getFile: async () => new File(rec.chunks as unknown as BlobPart[], name, { lastModified: rec.lastModified }),
        };
      },
      async removeEntry(name) {
        if (!files.delete(name)) throw new Error(`no such entry: ${name}`);
      },
    };
    const env: StagedSaveEnv = {
      dir: async () => dir,
      deliver: (file, name) => void delivered.push({ file, name }),
      later: (fn) => void scheduled.push(fn),
    };
    return { env, files, delivered, scheduled };
  }

  it("stages a valid archive, delivers it disk-backed under the right name, and cleans up after", async () => {
    const { env, files, delivered, scheduled } = fakeEnv();
    const target = await openOpfsStagedZipSave("my-lib", env);
    expect(target.name).toBe("my-lib.archie.zip"); // extension normalized, like every save surface

    // Publish-shaped writes: a structural string + released media bytes.
    const root = await target.fs.root();
    const dir = await root.getDirectory("voynich", { create: true });
    const w1 = await (await dir.getFile("manifest.json", { create: true })).writable();
    await w1.write('{"type":"Manifest"}');
    await w1.close();
    const w2 = await (await (await dir.getDirectory("assets", { create: true })).getFile("f1.jpg", { create: true })).writable();
    await w2.write(new Uint8Array(2048).fill(7).buffer);
    await w2.close();
    await target.finish();

    // Delivered exactly once, and the staged bytes reopen through the REAL open-side decoder.
    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.name).toBe("my-lib.archie.zip");
    const bytes = new Uint8Array(await delivered[0]!.file.arrayBuffer());
    const reopened = await (await ZipFilesystem.fromZip(bytes).root()).getDirectory("voynich");
    const man = await (await reopened.getFile("manifest.json")).readable();
    expect(new TextDecoder().decode(new Uint8Array(man))).toBe('{"type":"Manifest"}');

    // Cleanup is DEFERRED (the download must commit first), then removes the staging copy.
    expect(files.size).toBe(1);
    expect(scheduled).toHaveLength(1);
    scheduled[0]!();
    await Promise.resolve(); // discard is fire-and-forget async
    expect(files.size).toBe(0);
  });

  it("abort discards the staged file and never delivers", async () => {
    const { env, files, delivered } = fakeEnv();
    const target = await openOpfsStagedZipSave("x.archie.zip", env);
    expect(files.size).toBe(1);
    await target.abort();
    expect(files.size).toBe(0);
    expect(delivered).toHaveLength(0);
  });

  it("sweeps STALE leftovers on open but leaves fresh ones (a concurrent export's staging file)", async () => {
    const { env, files } = fakeEnv([
      { name: "old-crash.archie.zip", ageMs: 60 * 60_000 }, // an hour old — a dead session's leftover
      { name: "fresh.archie.zip", ageMs: 1000 }, // another export still downloading
    ]);
    await openOpfsStagedZipSave("y", env);
    expect(files.has("old-crash.archie.zip")).toBe(false);
    expect(files.has("fresh.archie.zip")).toBe(true);
  });
});

describe("binding seam — zipNameFor", () => {
  it("derives a filesystem-safe .archie.zip name", () => {
    expect(zipNameFor("Archie Library")).toBe("archie-library.archie.zip");
    expect(zipNameFor("  Voynich: the *Cipher* reading!  ")).toBe("voynich-the-cipher-reading.archie.zip");
  });
  it("falls back to 'library' when the title sanitizes to nothing", () => {
    expect(zipNameFor("")).toBe("library.archie.zip");
    expect(zipNameFor("⌘⌘⌘")).toBe("library.archie.zip");
  });
});

describe("binding seam — active-binding descriptor round-trip", () => {
  it("folder binding (with handleKey) survives a reload", () => {
    const b: Binding = { kind: "folder", name: "MyLib", handleKey: "hk-1" };
    saveLastBinding(b);
    expect(loadLastBinding()).toEqual(b);
  });
  it("file binding (no handleKey) survives a reload without growing fields", () => {
    saveLastBinding({ kind: "file", name: "lib.archie.zip" });
    expect(loadLastBinding()).toEqual({ kind: "file", name: "lib.archie.zip" });
  });
  it("unbound CLEARS the stored descriptor (Close project leaves nothing behind)", () => {
    saveLastBinding({ kind: "folder", name: "X", handleKey: "k" });
    saveLastBinding({ kind: "unbound" });
    expect(store.has(BINDING_KEY)).toBe(false);
    expect(loadLastBinding()).toEqual({ kind: "unbound" });
  });
  it("tolerates corrupt / malformed records (boot must never throw)", () => {
    store.set(BINDING_KEY, "{not json");
    expect(loadLastBinding()).toEqual({ kind: "unbound" });
    store.set(BINDING_KEY, JSON.stringify({ kind: "teleport", name: "X" }));
    expect(loadLastBinding()).toEqual({ kind: "unbound" });
    store.set(BINDING_KEY, JSON.stringify({ kind: "folder" })); // missing name
    expect(loadLastBinding()).toEqual({ kind: "unbound" });
  });
});

describe("binding seam — recents round-trip", () => {
  const rec = (id: string, ts: number): RecentProject => ({ id, name: id, kind: "folder", lastOpened: ts, reopenable: true });
  it("save → load preserves the list", () => {
    const list = [rec("a", 2), rec("b", 1)];
    saveRecents(list);
    expect(loadRecents()).toEqual(list);
  });
  it("tolerates corrupt storage ([] — recents are hints, never load-bearing)", () => {
    store.set(RECENTS_KEY, "][");
    expect(loadRecents()).toEqual([]);
  });
  it("empty storage loads as []", () => {
    expect(loadRecents()).toEqual([]);
  });
});

describe("binding seam — cross-tab recents reconcile (Issue 22 / TABS)", () => {
  const rec = (id: string, ts: number): RecentProject => ({ id, name: id, kind: "folder", lastOpened: ts, reopenable: true });

  it("adopts another tab's recents write via the storage event (no lost update)", () => {
    // Stub a minimal window that records the storage listener so we can fire a cross-tab event.
    let handler: ((e: any) => void) | null = null;
    vi.stubGlobal("window", {
      addEventListener: (type: string, h: (e: any) => void) => { if (type === "storage") handler = h; },
      removeEventListener: () => {},
    });
    const seen: RecentProject[][] = [];
    const unsub = subscribeRecents((list) => seen.push(list));
    expect(typeof handler).toBe("function");

    // Simulate TAB B adding a recent to the shared key, then the storage event firing in THIS tab.
    store.set(RECENTS_KEY, JSON.stringify([rec("from-tab-b", 5)]));
    handler!({ key: RECENTS_KEY, newValue: store.get(RECENTS_KEY) });
    expect(seen.at(-1)).toEqual([rec("from-tab-b", 5)]); // this tab adopted B's list

    // An unrelated key change is ignored.
    handler!({ key: "some.other.key", newValue: "x" });
    expect(seen.length).toBe(1);

    unsub();
    vi.unstubAllGlobals();
  });

  it("no-ops without a window (node/SSR floor)", () => {
    // No window stubbed here → subscribeRecents returns a no-op unsubscribe and never throws.
    const unsub = subscribeRecents(() => { throw new Error("should not fire"); });
    expect(typeof unsub).toBe("function");
    unsub();
  });
});
