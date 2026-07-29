// previewTree — the tree Studio hands <archie-viewer> for an in-Studio preview (archie-ux Q-6).
//
// Two things are under test, and only the second is obvious:
//   1. The tree is a REAL published tree — same publishLibrary projection the deploy pushes, so a
//      preview is evidence about what readers get rather than a second rendering path.
//   2. It is NOT the eager-zip path. publish-flows.svelte.ts:72 records that materializing the zip
//      builds a second full copy (peak ≈2×) and OOMs a tab on large libraries. Preview must never
//      pay that, so the assertion is structural (not a ZipFilesystem), not a comment.
//
// The strongest assertion here is the marker check: previewTree's output is fed straight into the
// element's openLibraryFs, which calls validateArchieMarker. Asserting it passes proves the two
// halves actually compose, rather than each being green in isolation.
import { describe, it, expect, vi } from "vitest";
import {
  ZipFilesystem,
  collectFiles,
  validateArchieMarker,
  SCHEMA_VERSION,
  asExhibitId,
  asLibraryId,
  asObjectId,
  type Library,
} from "@render/core";
import { createPublishFlows, type PublishDeps } from "./publish-flows.svelte.js";

vi.mock("./store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store.js")>()),
  openExhibitStructureDirIfExists: async () => null, // structure persistence not under test (no OPFS)
}));

const library: Library = {
  id: asLibraryId("lib"),
  title: "Preview Library",
  exhibits: [
    { id: asExhibitId("herbal"), slug: "herbal", title: "Herbal", objects: [{ id: asObjectId("o1"), source: "https://img/h1.jpg", label: "h1", width: 10, height: 10 }] },
    { id: asExhibitId("recipes"), slug: "recipes", title: "Recipes", objects: [{ id: asObjectId("o2"), source: "https://img/r1.jpg", label: "r1", width: 10, height: 10 }] },
  ],
};
function deps(): PublishDeps {
  return {
    publishBase: () => "https://u.gh.io/lib/",
    flushExhibit: async () => {},
    loadAllLogs: async () => ({}),
    buildFullLibrary: () => library,
    exhibits: () => [],
    canFolder: () => false,
    currentZipName: () => "lib.archie.zip",
  };
}

describe("previewTree — the in-Studio preview source", () => {
  it("projects the whole published tree, marker included", async () => {
    const { fs } = await createPublishFlows(deps()).previewTree();
    const paths = Object.keys(await collectFiles(await fs.root()));
    expect(paths).toContain("archie.json"); // the ADR-0020 marker the element's door validates
    expect(paths).toContain("exhibits.json"); // the gallery index openFilesystem reads first
    expect(paths).toContain("herbal/manifest.json");
    expect(paths).toContain("recipes/manifest.json");
  });

  it("the tree PASSES the same marker gate the element applies (the two halves compose)", async () => {
    const { fs } = await createPublishFlows(deps()).previewTree();
    // Archie-69f9: the gate now RETURNS the schema version to migrate FROM (was void). A freshly
    // published preview tree is at the current version, so nothing migrates.
    await expect(validateArchieMarker(fs)).resolves.toBe(SCHEMA_VERSION);
  });

  it("does NOT take the eager-zip path — no second full copy for a preview", async () => {
    const { fs } = await createPublishFlows(deps()).previewTree();
    // A ZipFilesystem here would mean preview inherited the eager path's ~2× memory peak and its
    // EAGER_ZIP_CEILING_BYTES abort — neither of which a preview has any reason to pay.
    expect(fs).not.toBeInstanceOf(ZipFilesystem);
  });

  it("surfaces the same advisories the publish paths do, so preview can show them", async () => {
    const result = await createPublishFlows(deps()).previewTree();
    expect(result.brokenLinks).toEqual([]);
    expect(result.incompleteCanvases).toEqual([]);
    expect(result.missingAssets).toEqual([]);
    expect(result.corruptLogs).toEqual([]);
  });
});
