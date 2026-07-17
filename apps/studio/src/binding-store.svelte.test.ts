import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard the incremental folder-mirror dirty-set (spike-0002): the scope/removals a mirror drains, that a
// FAILED write retains for retry, and that the first mirror of a session resyncs BUT still prunes removals.
// Mock the platform seams (binding descriptor persistence + folder backend) so no OPFS/IndexedDB loads; the
// save queue is the real pure singleton (reset between tests).
const loadLastBinding = vi.fn();
vi.mock("./binding.js", () => ({
  loadRecents: () => [],
  saveRecents: () => {},
  loadLastBinding,
  saveLastBinding: () => {},
}));
const reopenFolderBinding = vi.fn();
const pickFolderBinding = vi.fn();
vi.mock("./folder-backend.js", () => ({
  folderSinkSupported: () => true,
  pickFolderBinding,
  reopenFolderBinding,
  forgetFolderBinding: () => {},
}));

const { createBindingStore } = await import("./binding-store.svelte.js");
const { resetSaveQueueForTests } = await import("./save-queue.svelte.js");
type FolderWritePlan = import("./publish-flows.svelte.js").FolderWritePlan;

const fakeFs = { root: async () => ({}) } as never; // never actually written — writeToFolder is a spy
const flush = () => new Promise<void>((r) => setTimeout(r, 0)); // drain the save-queue microtasks

function makeStore() {
  const writeToFolder = vi.fn(async (_fs: unknown, _plan?: FolderWritePlan) => {});
  const store = createBindingStore({
    flushExhibit: async () => {},
    writeToFolder,
    downloadProjectZip: async () => true,
    replaceProjectFrom: async () => {},
    zipName: () => "lib.archie.zip",
  });
  return { store, writeToFolder };
}
/** Establish a resynced folder binding via Save As (unbound → folder), so the NEXT mirror goes incremental. */
async function bindResynced(store: ReturnType<typeof makeStore>["store"]) {
  pickFolderBinding.mockResolvedValueOnce({ fs: fakeFs, name: "Docs", key: "k" });
  await store.saveProject();
}

describe("binding store — incremental folder mirror dirty-set (spike-0002)", () => {
  beforeEach(() => {
    resetSaveQueueForTests();
    loadLastBinding.mockReturnValue({ kind: "unbound" });
    reopenFolderBinding.mockReset();
    pickFolderBinding.mockReset();
  });

  it("drains the accumulated scope + removals into ONE incremental write, then clears it", async () => {
    const { store, writeToFolder } = makeStore();
    await bindResynced(store);
    expect(writeToFolder).toHaveBeenCalledTimes(1); // the Save-As full write
    writeToFolder.mockClear();

    store.markExhibitDirty("p");
    store.markAssetsDirty("q");
    store.markObjectRemoved("p", "o1", "photo.jpg");
    await store.autosaveToFolder();

    expect(writeToFolder).toHaveBeenCalledTimes(1);
    const plan = writeToFolder.mock.calls[0]![1]!;
    expect([...plan.incremental!.exhibits].sort()).toEqual(["p", "q"]);
    expect([...plan.incremental!.reassets]).toEqual(["q"]);
    expect(plan.removedObjects).toEqual([{ slug: "p", objId: "o1", assetName: "photo.jpg" }]);

    // Dirt cleared on success → a second trigger with nothing new is a no-op.
    writeToFolder.mockClear();
    await store.autosaveToFolder();
    expect(writeToFolder).not.toHaveBeenCalled();
  });

  it("RETAINS the scope on a failed write and retries it on the next trigger (never drops a save)", async () => {
    const { store, writeToFolder } = makeStore();
    await bindResynced(store);
    writeToFolder.mockClear();
    // Issue 25 row (d): a failed write now DROPS the cached handle, so the retry re-acquires — mock it.
    reopenFolderBinding.mockResolvedValue({ fs: fakeFs, name: "Docs", key: "k" });

    writeToFolder.mockRejectedValueOnce(new Error("disk full"));
    store.markExhibitDirty("p");
    await store.autosaveToFolder(); // fails → scope retained, handle invalidated
    await flush();

    writeToFolder.mockClear();
    await store.autosaveToFolder(); // retry (re-acquires the folder first)
    expect(writeToFolder).toHaveBeenCalledTimes(1);
    expect([...writeToFolder.mock.calls[0]![1]!.incremental!.exhibits]).toEqual(["p"]);
  });

  it("invalidates the cached folderFs on a write failure and surfaces reopen guidance (row d)", async () => {
    const { store, writeToFolder } = makeStore();
    await bindResynced(store);
    writeToFolder.mockClear();

    writeToFolder.mockRejectedValueOnce(new Error("NotFoundError: folder moved"));
    store.markExhibitDirty("p");
    await store.autosaveToFolder(); // fails
    await flush();

    // The recovery card names the folder and the one recovery that works.
    expect(store.error).toContain("reopen the folder");
    expect(store.error).toContain("Docs");

    // The dead handle was dropped: the next trigger RE-ACQUIRES (reopenFolderBinding) rather than
    // reusing the cached fs. Prove it by leaving reacquisition failing → no blind write on the dead handle.
    reopenFolderBinding.mockResolvedValueOnce(null);
    writeToFolder.mockClear();
    await store.autosaveToFolder();
    expect(reopenFolderBinding).toHaveBeenCalled();
    expect(writeToFolder).not.toHaveBeenCalled(); // re-acquire failed → nothing written to a dead handle
  });

  it("an explicit Save preserves dirt that accrues DURING the in-flight full write", async () => {
    const { store, writeToFolder } = makeStore();
    // The full write marks a new edit mid-flight (model mutations aren't blocked by s.busy).
    writeToFolder.mockImplementationOnce(async () => { store.markExhibitDirty("midflight"); });
    pickFolderBinding.mockResolvedValueOnce({ fs: fakeFs, name: "Docs", key: "k" });
    await store.saveProject();

    // That edit must survive the Save (not wiped by a wholesale reset) → the next autosave mirrors it.
    writeToFolder.mockClear();
    await store.autosaveToFolder();
    expect(writeToFolder).toHaveBeenCalledTimes(1);
    expect([...writeToFolder.mock.calls[0]![1]!.incremental!.exhibits]).toEqual(["midflight"]);
  });

  it("first mirror of a session RESYNCS (full write) but still prunes a pending removal", async () => {
    const { store, writeToFolder } = makeStore();
    loadLastBinding.mockReturnValue({ kind: "folder", name: "Docs", handleKey: "k" });
    reopenFolderBinding.mockResolvedValue({ fs: fakeFs, name: "Docs", key: "k" });
    store.boot(); // restores a folder binding, but folderResynced starts false

    store.markExhibitRemoved("gone");
    await store.autosaveToFolder();

    expect(writeToFolder).toHaveBeenCalledTimes(1);
    const plan = writeToFolder.mock.calls[0]![1]!;
    expect(plan.incremental).toBeUndefined(); // FULL write, not scoped
    expect(plan.removedExhibits).toEqual(["gone"]); // …but the removal still prunes
  });
});
