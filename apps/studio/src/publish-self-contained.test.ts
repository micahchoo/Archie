// The self-contained tree (Archie-e09d), wired into Studio's site sinks by Archie-c367.
//
// e09d proved the MECHANISM against a bare static server: 10/10 drive assertions off a published
// tree, red-green 5/10 with the bundle omitted. What it did not do — and said so — was wire it into
// any app. This suite is that wiring's gate, and it MEASURES THE ARTIFACT rather than the exit code:
// the built tree either contains `_viewer/archie-viewer.js` or it does not.
//
// WHICH SINKS, and this is the whole point of the suite:
//   • the GitHub push, the desktop deploy projection, and the folder DESTINATION carry it — they all
//     produce a site somebody visits;
//   • the `.archie.zip` does NOT — a zip is opened BY a viewer, so carrying one is redundancy;
//   • the binding store's folder AUTOSAVE does not either — same writer, but it is the author's
//     working copy, and +959 KB on every autosave buys nothing.
// Those four claims are one `expect` each, because each is a separate call site that could regress
// on its own.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MemoryFilesystem, ZipFilesystem, collectFiles, asLibraryId, asExhibitId, asObjectId,
  type Library, type FileContent, type FsDirectory,
} from "@render/core";

const h = vi.hoisted(() => ({
  pushed: null as Record<string, FileContent> | null,
  zipFs: null as ZipFilesystem | null,
}));

vi.mock("@render/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@render/core")>();
  return {
    ...actual,
    publishToGitHub: async (files: Record<string, FileContent>) => {
      h.pushed = files;
      return { commitUrl: "https://github.com/o/r/commit/deadbeef", pagesUrl: "https://o.github.io/r/", pagesEnabled: true };
    },
  };
});

vi.mock("./store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store.js")>()),
  openExhibitStructureDirIfExists: async () => null,
  openExhibitAnnotationsDir: async () => null,
}));

// Force the EAGER zip path and capture the archive instead of writing it — the real
// `saveProjectZip` → `publishInto` → `zipPublishOpts()` chain, same shape as publish-base-wiring.
vi.mock("./binding.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./binding.js")>()),
  supportsStreamingZipSave: () => false,
  saveZipToDisk: async (fs: ZipFilesystem, name: string) => { h.zipFs = fs; return { kind: "downloaded" as const, name }; },
}));

import { createPublishFlows, type PublishDeps } from "./publish-flows.svelte.js";

const SLUG = "voynich";
const VIEWER_ENTRY = "_viewer/archie-viewer.js";

const library = (): Library => ({
  id: asLibraryId("lib-1"),
  title: "Test Library",
  exhibits: [{
    id: asExhibitId("ex-1"),
    slug: SLUG,
    title: "Folios",
    objects: [{ id: asObjectId("o1"), source: "https://example.org/iiif/1/info.json", label: "f1", width: 800, height: 600 }],
  }],
});

const deps = (over: Partial<PublishDeps> = {}): PublishDeps => ({
  publishBase: () => "",
  flushExhibit: async () => {},
  loadAllLogs: async () => ({}),
  buildFullLibrary: library,
  exhibits: () => [],
  canFolder: () => true,
  currentZipName: () => "test.archie.zip",
  ...over,
});

/** Every path in a built tree — via `collectFiles`, the same walker the GitHub push flattens with,
 *  so this reads the tree exactly as a real publish does. */
async function paths(root: FsDirectory): Promise<string[]> {
  return Object.keys(await collectFiles(root));
}

beforeEach(() => { h.pushed = null; h.zipFs = null; });

describe("the published tree carries its own reader (Archie-e09d)", () => {
  it("the folder DESTINATION writes _viewer/ and a viewer.html beside it", async () => {
    const fs = new MemoryFilesystem();
    // `localPublishFolder` picks a folder, which the test env cannot; call the writer with the same
    // plan that call site passes, which is the thing under test.
    await createPublishFlows(deps()).writeToFolder(fs, { withViewer: true });

    const files = await collectFiles(await fs.root());
    const all = Object.keys(files);
    expect(all, "the bundle entry must be in the tree, not merely available to it").toContain(VIEWER_ENTRY);
    expect(all).toContain("viewer.html");
    // Pages runs Jekyll, which owns `_`-prefixed top-level directories — without this guard the
    // whole `_viewer/` disappears on the one host most likely to serve it.
    expect(all).toContain(".nojekyll");
    // The bundle is the IIFE single-file build (`@render/archie-viewer/single`) — ONE file under
    // `_viewer/`, shared with `exportSelfContained` so Studio never carries the viewer twice.
    // Assert the CONTENT is the real ~950 KB bundle, not a name-only write of an empty string —
    // the vitest-css-id-empty-string class is exactly a resolved-but-empty module.
    expect(all.filter((p) => p.startsWith("_viewer/"))).toEqual([VIEWER_ENTRY]);
    const entry = files[VIEWER_ENTRY]!;
    const text = "text" in entry ? entry.text : atob(entry.base64);
    expect(text.length, "the entry must carry the real bundle").toBeGreaterThan(100_000);
    expect(text).toContain("archie-viewer");
  });

  it("the GitHub push carries it too — the destination that most needs a self-contained tree", async () => {
    const flows = createPublishFlows(deps());
    await flows.publish({ owner: "o", repo: "r", branch: "gh-pages", token: "t" });
    expect(h.pushed, "the push never ran").not.toBeNull();
    expect(Object.keys(h.pushed!)).toContain(VIEWER_ENTRY);
  });

  it("the .archie.zip does NOT — a zip is opened BY a viewer, so carrying one is redundancy", async () => {
    const flows = createPublishFlows(deps());
    expect(await flows.downloadProjectZip()).toBe(true);
    expect(h.zipFs).not.toBeNull();
    const all = await paths(await h.zipFs!.root());
    expect(all).not.toContain(VIEWER_ENTRY);
    expect(all.filter((p) => p.startsWith("_viewer/"))).toEqual([]);
    // …and it is a real tree either way, so this is not passing because nothing was written.
    expect(all).toContain(`${SLUG}/manifest.json`);
  });

  it("the binding store's folder AUTOSAVE does not — same writer, different job", async () => {
    // `writeToFolder` with no plan is what `createBindingStore` calls on every autosave. Paying
    // +959 KB there, repeatedly, for a reader nobody opens in a working folder would be a regression
    // introduced by a feature that never intended to touch this path.
    const fs = new MemoryFilesystem();
    await createPublishFlows(deps()).writeToFolder(fs);
    const all = await paths(await fs.root());
    expect(all).not.toContain(VIEWER_ENTRY);
    expect(all).toContain(`${SLUG}/manifest.json`);
  });
});
