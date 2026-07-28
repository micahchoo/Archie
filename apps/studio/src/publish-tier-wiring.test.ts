// Archie-4b0a — the tier engine wired into the REAL publish projection, not a stand-in.
//
// `publish-tier.test.ts` proves the decisions. This proves the three things only the wiring can get
// wrong, each of which is silent when it does:
//
//   1. The published tree is INTERNALLY CONSISTENT — every asset path a manifest cites resolves to a
//      file that exists. A tier renames files, and a rename that misses one reference orphans an
//      object with nothing failing.
//   2. The TIER is part of the projection cache key. `cachedSiteFs` already keys on the publish base
//      (Archie-19c5, and it shipped every id on the wrong origin before it did); a tier that is not
//      in the key ships 2400px WebP under a publish the author asked to be archival.
//   3. A fallback inside a web publish is COUNTED and reaches the surface. It is deliberately silent
//      to the user's eye — the publish succeeds and merely under-delivers — so the counter is the
//      only thing that can say so (`bake-async.ts:38` `bakeFallbackCount()` is the donor pattern).
//
// Harness, following `publish-base-wiring.test.ts` next door: `@render/core` is partially mocked only
// to observe `publishLibrary` and to capture the GitHub push without a network. The projection itself
// is the real one — real `publishLibrary`, real manifest, real MemoryFilesystem tree.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MemoryFilesystem, ZipFilesystem, collectFiles, asLibraryId, asExhibitId, asObjectId,
  type Library, type FileContent, type GitHubTarget, type FsDirectory,
} from "@render/core";

const h = vi.hoisted(() => ({
  bases: [] as (string | undefined)[],
  pushed: null as Record<string, FileContent> | null,
  /** Every (slug, name) the asset read was asked for — the PUBLISHED names, as site.ts derives them. */
  assetReads: [] as string[],
  /** Set true to make the injected WebP encode throw, exercising the counted fallback. */
  encodeThrows: false,
  encodeCalls: 0,
}));

vi.mock("@render/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@render/core")>();
  return {
    ...actual,
    publishLibrary: (...args: Parameters<typeof actual.publishLibrary>) => {
      h.bases.push(args[3]?.baseUrl);
      return actual.publishLibrary(...args);
    },
    publishToGitHub: async (files: Record<string, FileContent>) => {
      h.pushed = files;
      return { commitUrl: "https://github.com/o/r/commit/dead", pagesUrl: "https://o.github.io/r/", pagesEnabled: true };
    },
  };
});

// The asset store, standing in for OPFS. `readAssetBlob` must be asked for the STORED name — if the
// tier's reverse map were wrong it would be asked for "folio.webp", find nothing, and the object
// would publish as a missingAsset. Recording the calls is what makes that failure legible.
vi.mock("./store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store.js")>()),
  openExhibitStructureDirIfExists: async () => null,
  openExhibitAnnotationsDir: async () => null,
  readAssetBlob: async (slug: string, name: string) => {
    h.assetReads.push(`${slug}/${name}`);
    return name.endsWith(".tif") || name.endsWith(".jpg") || name.endsWith(".wav") ? new Blob([`RAW:${name}`], { type: "" }) : null;
  },
  readThumbBytes: async (_slug: string, name: string) => (name.endsWith(".tif") ? new Blob([`THUMB:${name}`], { type: "" }) : null),
}));

// jsdom has no canvas, so the browser encode is stubbed at the SEAM publish-flows injects it through.
// The stub returns a recognisable payload: "the bytes in the tree are the encoder's" is then a real
// assertion rather than an inference from the file name.
vi.mock("./bake-async.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bake-async.js")>()),
  bakeDisplayMasterAsync: async (src: Blob) => {
    h.encodeCalls++;
    if (h.encodeThrows) throw new Error("no canvas");
    return { blob: new Blob([`WEBP(${await src.text()})`], { type: "image/webp" }), width: 2400, height: 1600 };
  },
}));

vi.mock("./binding.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./binding.js")>()),
  supportsStreamingZipSave: () => false,
  saveZipToDisk: async (fs: ZipFilesystem, name: string) => ({ kind: "downloaded" as const, name, fs }),
}));

import { createPublishFlows, type PublishDeps } from "./publish-flows.svelte.js";
import type { QualityTier } from "./publish-tier.js";

const SLUG = "ex";
const library: Library = {
  id: asLibraryId("lib"),
  title: "A Library",
  exhibits: [{
    id: asExhibitId(SLUG),
    slug: SLUG,
    title: "Exhibit",
    objects: [
      { id: asObjectId("o1"), source: "/assets/folio.tif", label: "folio", format: "image/tiff", width: 6000, height: 4000, thumbnail: "/assets-thumb/folio.tif" },
      { id: asObjectId("o2"), source: "/assets/plate.jpg", label: "plate", format: "image/jpeg", width: 1200, height: 900 },
      { id: asObjectId("o3"), source: "/assets/talk.wav", label: "talk", format: "audio/wav", mediaType: "sound", duration: 60 },
    ],
  }],
};

function deps(tier: () => QualityTier): PublishDeps {
  return {
    publishBase: () => "",
    flushExhibit: async () => {},
    loadAllLogs: async () => ({}),
    buildFullLibrary: () => library,
    exhibits: () => [],
    canFolder: () => false,
    currentZipName: () => "lib.archie.zip",
    tier,
  };
}

async function treeOf(root: FsDirectory): Promise<Record<string, FileContent>> {
  return collectFiles(root);
}
const textAt = (files: Record<string, FileContent>, path: string): string => {
  const c = files[path];
  if (!c) throw new Error(`no file at ${path}; tree has: ${Object.keys(files).join(", ")}`);
  return "text" in c ? c.text : Buffer.from(c.base64, "base64").toString("utf8");
};

/**
 * Every asset-ish path the published manifests cite, relative to the tree root.
 *
 * Deliberately derived from the ARTIFACT rather than from the model: the whole point is to catch a
 * rewrite that updated the model and not the writer (or the reverse), so re-deriving the expected set
 * from the model would be the tautology `.claude/rules/post-review-fixes-are-unreviewed.md` warns
 * about. Reads the manifest as JSON and walks it for strings pointing at `assets/`, `assets-thumb/`
 * or `assets-original/`.
 */
function citedAssetPaths(files: Record<string, FileContent>): string[] {
  const out = new Set<string>();
  for (const path of Object.keys(files)) {
    if (!path.endsWith("manifest.json")) continue;
    const walk = (v: unknown): void => {
      if (typeof v === "string") {
        if (/(^|\/)assets(-thumb|-original)?\//.test(v)) out.add(v.replace(/^\.?\//, ""));
        return;
      }
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v && typeof v === "object") { Object.values(v).forEach(walk); }
    };
    walk(JSON.parse(textAt(files, path)));
  }
  return [...out].sort();
}

beforeEach(() => {
  h.bases = [];
  h.pushed = null;
  h.assetReads = [];
  h.encodeThrows = false;
  h.encodeCalls = 0;
});

describe("every asset path the published manifest cites RESOLVES to a file in the tree", () => {
  for (const tier of ["archival", "web"] as const) {
    it(`${tier}: no manifest reference is orphaned`, async () => {
      const flows = createPublishFlows(deps(() => tier));
      const fs = new MemoryFilesystem();
      await flows.writeToFolder(fs);
      const files = await treeOf(await fs.root());

      const cited = citedAssetPaths(files);
      // The subject must be non-empty, or "nothing is orphaned" is a verdict about nothing
      // (`.claude/rules/post-review-fixes-are-unreviewed.md` §1a).
      expect(cited.length, "the manifest cited no asset at all — this assertion would be vacuous").toBeGreaterThan(0);
      const missing = cited.filter((p) => !(p in files));
      expect(missing, `manifest references with no file behind them (tree: ${Object.keys(files).join(", ")})`).toEqual([]);
    });
  }

  it("web: the cited names are the RE-ENCODED ones, and the bytes behind them came from the encoder", async () => {
    const flows = createPublishFlows(deps(() => "web"));
    const fs = new MemoryFilesystem();
    await flows.writeToFolder(fs);
    const files = await treeOf(await fs.root());

    expect(citedAssetPaths(files)).toEqual([
      `${SLUG}/assets-thumb/folio.webp`,
      `${SLUG}/assets/folio.webp`,
      `${SLUG}/assets/plate.webp`,
      `${SLUG}/assets/talk.wav`, // audio: no encoder ships, so it keeps its own name — see below
    ]);
    // The reverse map worked: the store was asked for the STORED names, never the published ones.
    expect(h.assetReads.filter((r) => r.includes(".webp"))).toEqual([]);
    expect(h.assetReads).toContain(`${SLUG}/folio.tif`);
    // …and the bytes in the tree are the encoder's output, not a rename of the originals.
    expect(textAt(files, `${SLUG}/assets/folio.webp`)).toBe("WEBP(RAW:folio.tif)");
    expect(textAt(files, `${SLUG}/assets-thumb/folio.webp`)).toBe("WEBP(THUMB:folio.tif)");
    // The manifest's declared format moved with the bytes.
    const manifest = JSON.parse(textAt(files, `${SLUG}/manifest.json`));
    const formats = JSON.stringify(manifest).match(/"format":"image\/tiff"/g) ?? [];
    expect(formats, "an image/tiff format survived into a web-tier manifest").toEqual([]);
  });

  it("archival is byte-for-byte today's behaviour — original names, original bytes, no encode attempted", async () => {
    const flows = createPublishFlows(deps(() => "archival"));
    const fs = new MemoryFilesystem();
    await flows.writeToFolder(fs);
    const files = await treeOf(await fs.root());

    expect(citedAssetPaths(files)).toEqual([
      `${SLUG}/assets-thumb/folio.tif`,
      `${SLUG}/assets/folio.tif`,
      `${SLUG}/assets/plate.jpg`,
      `${SLUG}/assets/talk.wav`,
    ]);
    expect(textAt(files, `${SLUG}/assets/folio.tif`)).toBe("RAW:folio.tif");
    expect(h.encodeCalls, "the archival tier re-encoded something").toBe(0);
  });
});

describe("the TIER is part of the projection cache key (Archie-4b0a, the sibling of Archie-19c5's base key)", () => {
  const TARGET: GitHubTarget = { owner: "o", repo: "r", branch: "gh-pages", token: "t" };

  it("a tree projected at WEB is not reused for an ARCHIVAL publish — it re-projects", async () => {
    let tier: QualityTier = "web";
    const flows = createPublishFlows(deps(() => tier));

    // Warm the cache exactly the way the dialog does, and wait for the background projection.
    expect(await flows.openPublish()).toBe(true);
    await vi.waitFor(() => expect(h.bases.length).toBe(1));

    // The author changes the tier on the surface AFTER the warm projection — the ordering that makes
    // this a cache-key question rather than a parameter-passing one.
    tier = "archival";
    await flows.publish(TARGET);

    expect(h.bases.length, "the push reused the web-tier tree instead of re-projecting").toBe(2);
    const pushed = h.pushed!;
    expect(Object.keys(pushed)).toContain(`${SLUG}/assets/folio.tif`);
    expect(Object.keys(pushed), "a WEB-tier file reached an ARCHIVAL publish").not.toContain(`${SLUG}/assets/folio.webp`);
  });

  it("an UNCHANGED tier still reuses the warm tree — the key discriminates, it does not just disable the cache", async () => {
    const flows = createPublishFlows(deps(() => "web"));
    expect(await flows.openPublish()).toBe(true);
    await vi.waitFor(() => expect(h.bases.length).toBe(1));

    await flows.publish(TARGET);
    expect(h.bases.length, "the cache stopped working").toBe(2); // the base changed (relative → pages URL)
    await flows.publish(TARGET);
    expect(h.bases.length, "a second identical push re-projected").toBe(2);
  });
});

describe("a web-tier fallback is COUNTED and reaches the surface — never silent", () => {
  it("audio has no encoder today, so a web publish reports the passthrough", async () => {
    const flows = createPublishFlows(deps(() => "web"));
    await flows.projectSiteFs();
    expect(flows.tierFallbacks, "the audio passthrough was not counted").toBe(1);
  });

  it("an image encode that throws is counted too — the publish still succeeds", async () => {
    h.encodeThrows = true;
    const flows = createPublishFlows(deps(() => "web"));
    const fs = await flows.projectSiteFs();
    const files = await treeOf(await fs.root());
    // 2 images that failed to encode + 1 thumbnail + 1 audio with no encoder.
    expect(flows.tierFallbacks).toBe(4);
    // The publish did not fail, and the archival bytes shipped in place of the encode.
    expect(textAt(files, `${SLUG}/assets/folio.webp`)).toBe("RAW:folio.tif");
  });

  it("an ARCHIVAL publish reports zero of both — the counters belong to the tier that ran", async () => {
    const flows = createPublishFlows(deps(() => "archival"));
    await flows.projectSiteFs();
    expect(flows.tierFallbacks).toBe(0);
    expect(flows.tierRescaled).toEqual([]);
  });
});

describe("the annotation-geometry blocker is REPORTED, because nothing else can see it", () => {
  it("a web publish names every object whose pixel space moved", async () => {
    const flows = createPublishFlows(deps(() => "web"));
    await flows.projectSiteFs();
    // Only the 6000px master moves; the 1200px plate is already under the 2400 cap.
    expect(flows.tierRescaled.map((r) => r.objectId)).toEqual(["o1"]);
    expect(flows.tierRescaled[0]!.to).toEqual({ width: 2400, height: 1600 });
  });

  it("the default tier is archival, so an engine-only wiring changes nothing", async () => {
    const { tier: _omitted, ...noTier } = deps(() => "web"); // the dep genuinely ABSENT, not set to undefined
    const flows = createPublishFlows(noTier);
    expect(flows.tier).toBe("archival");
    const fs = new MemoryFilesystem();
    await flows.writeToFolder(fs);
    const files = await treeOf(await fs.root());
    expect(Object.keys(files)).toContain(`${SLUG}/assets/folio.tif`);
    expect(h.encodeCalls).toBe(0);
  });
});
