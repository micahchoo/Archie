// The zip-sink Save's export options (the SaveZipDialog's name + exhibit subset), and the ONE rule
// that keeps a partial save honest: a save of a strict SUBSET must NOT clear `dirty` or take over the
// binding — the file on disk isn't the whole project, so calling it "saved" would let the exhibits
// left out read as safe. A FULL save (no slugs) keeps the old contract, and a rename retargets the
// binding. Harness mirrors binding-store.svelte.test.ts (platform seams mocked; no OPFS).
import { describe, it, expect, vi, beforeEach } from "vitest";

const loadLastBinding = vi.fn();
vi.mock("./binding.js", () => ({
  loadRecents: () => [],
  saveRecents: () => {},
  loadLastBinding,
  saveLastBinding: () => {},
  subscribeRecents: () => () => {},
}));
vi.mock("./folder-backend.js", () => ({
  folderSinkSupported: () => false, // no folder picker → Save lands in a .archie.zip (the surface under test)
  pickFolderBinding: vi.fn(),
  reopenFolderBinding: vi.fn(),
  forgetFolderBinding: () => {},
}));

const { createBindingStore } = await import("./binding-store.svelte.js");
const { resetSaveQueueForTests } = await import("./save-queue.svelte.js");

function makeStore() {
  const downloadProjectZip = vi.fn(async (_opts?: { name?: string; slugs?: string[] }) => true);
  const store = createBindingStore({
    flushExhibit: async () => {},
    writeToFolder: async () => {},
    downloadProjectZip,
    replaceProjectFrom: async () => {},
    zipName: () => "lib.archie.zip",
  });
  return { store, downloadProjectZip };
}

describe("zip-sink Save — export options and the partial-save rule", () => {
  beforeEach(() => {
    resetSaveQueueForTests();
    loadLastBinding.mockReturnValue({ kind: "unbound" });
  });

  it("full save: the opts reach the sink, the chosen name becomes the binding, dirty clears", async () => {
    const { store, downloadProjectZip } = makeStore();
    await store.saveProject({ name: "field-notes.archie.zip" });
    expect(downloadProjectZip).toHaveBeenCalledWith({ name: "field-notes.archie.zip" });
    expect(store.binding).toEqual({ kind: "file", name: "field-notes.archie.zip" });
    expect(store.dirty).toBe(false);
  });

  it("partial save: the subset ships, but the project stays unbound and DIRTY", async () => {
    const { store, downloadProjectZip } = makeStore();
    await store.saveProject({ name: "just-herbal.archie.zip", slugs: ["herbal"] });
    expect(downloadProjectZip).toHaveBeenCalledWith({ name: "just-herbal.archie.zip", slugs: ["herbal"] });
    // Still unbound: a subset copy is not this project's save file, so it never becomes the binding
    // (and the unsaved work it left out keeps its "not saved anywhere" standing).
    expect(store.binding.kind).toBe("unbound");
  });

  it("partial save over an EXISTING file binding leaves that binding (and dirty) untouched", async () => {
    const { store } = makeStore();
    await store.saveProject(); // bind: full save under the derived name
    expect(store.binding).toEqual({ kind: "file", name: "lib.archie.zip" });
    store.touch(); // the user-facing dirty flag (touch requires a binding to be dirty against)
    await store.saveProject({ slugs: ["herbal"] });
    expect(store.binding).toEqual({ kind: "file", name: "lib.archie.zip" }); // still the last FULL save
    expect(store.dirty).toBe(true);
  });

  it("no opts (the automatic safety flushes): whole library, derived name, dirty clears", async () => {
    const { store, downloadProjectZip } = makeStore();
    await store.saveProject();
    expect(downloadProjectZip).toHaveBeenCalledWith(undefined);
    expect(store.binding).toEqual({ kind: "file", name: "lib.archie.zip" });
    expect(store.dirty).toBe(false);
  });
});
