// The Publish dialog's working-copy chooser: download(opts) must thread a custom file name to the
// save sink and narrow the published library to the chosen exhibit slugs — while an opts-less call
// keeps the old contract (derived/bound name, whole library). The eager (non-streaming) path is
// forced so the capture point is ONE seam: binding.js's saveZipToDisk.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectFiles, asExhibitId, asLibraryId, asObjectId, type Filesystem, type Library } from "@render/core";
import { createPublishFlows, type PublishDeps } from "./publish-flows.svelte.js";

const h = vi.hoisted(() => ({
  captured: [] as { fs: Filesystem; name: string }[],
}));
vi.mock("./binding.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./binding.js")>()),
  supportsStreamingZipSave: () => false, // force the eager path — saveZipToDisk is the capture seam
  saveZipToDisk: async (fs: Filesystem, name: string) => {
    h.captured.push({ fs, name });
    return { kind: "downloaded" as const, name };
  },
}));
vi.mock("./store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store.js")>()),
  openExhibitStructureDirIfExists: async () => null, // structure persistence not under test (no OPFS)
}));

const library: Library = {
  id: asLibraryId("lib"),
  exhibits: [
    { id: asExhibitId("herbal"), slug: "herbal", title: "Herbal", objects: [{ id: asObjectId("o1"), source: "https://img/h1.jpg", label: "h1", width: 10, height: 10 }] },
    { id: asExhibitId("recipes"), slug: "recipes", title: "Recipes", objects: [{ id: asObjectId("o2"), source: "https://img/r1.jpg", label: "r1", width: 10, height: 10 }] },
  ],
};
function deps(): PublishDeps {
  return {
    baseUrl: "https://u.gh.io/lib/",
    flushExhibit: async () => {},
    loadAllLogs: async () => ({}),
    buildFullLibrary: () => library,
    exhibits: () => [],
    canFolder: () => false,
    currentZipName: () => "lib.archie.zip",
  };
}
const shippedPaths = async () => Object.keys(await collectFiles(await h.captured[0]!.fs.root()));

describe("working-copy export options (rename + exhibit subset)", () => {
  beforeEach(() => { h.captured.length = 0; });

  it("no opts: the bound/derived name and the whole library — the pre-chooser contract", async () => {
    expect(await createPublishFlows(deps()).download()).toBe(true);
    expect(h.captured[0]!.name).toBe("lib.archie.zip");
    const paths = await shippedPaths();
    expect(paths).toContain("herbal/manifest.json");
    expect(paths).toContain("recipes/manifest.json");
  });

  it("opts narrow the zip: custom name reaches the sink, omitted exhibits ship nowhere", async () => {
    expect(await createPublishFlows(deps()).download({ name: "field-notes.archie.zip", slugs: ["herbal"] })).toBe(true);
    expect(h.captured[0]!.name).toBe("field-notes.archie.zip");
    const paths = await shippedPaths();
    expect(paths).toContain("herbal/manifest.json");
    expect(paths.some((p) => p.startsWith("recipes/"))).toBe(false);
    const exhibits = JSON.parse(((await collectFiles(await h.captured[0]!.fs.root()))["exhibits.json"] as { text: string }).text) as { exhibits: { slug: string }[] };
    expect(exhibits.exhibits.map((e) => e.slug)).toEqual(["herbal"]); // the root index names only what ships
  });

  // The local-publish zip fallback (non-Chromium "Publish locally") takes the same opts and, unlike
  // download(), REPORTS the saved name back to the dialog's done screen.
  it("localPublishZip: honors the opts and reports the name that was actually saved", async () => {
    const name = await createPublishFlows(deps()).localPublishZip({ name: "for-the-viewer.archie.zip", slugs: ["recipes"] });
    expect(name).toBe("for-the-viewer.archie.zip");
    expect(h.captured[0]!.name).toBe("for-the-viewer.archie.zip");
    expect((await shippedPaths()).some((p) => p.startsWith("herbal/"))).toBe(false);
  });
});
