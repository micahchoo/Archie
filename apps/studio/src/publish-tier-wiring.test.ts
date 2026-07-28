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
  MemoryFilesystem, ZipFilesystem, collectFiles, asLibraryId, asExhibitId, asObjectId, asClientId, appendNew,
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
  // `pagesUrlFor("o", "r")`. The library is set up as one that HAS ALREADY DEPLOYED, so the warm
  // projection and the push run at the SAME base.
  //
  // That setup is the whole test, and the first version of it did not have it. With a never-deployed
  // library the warm tree is relative and the push's is the Pages URL, so `cachedSiteBase === base`
  // is already false and the push re-projects whatever the tier does. The assertion passed with the
  // tier deleted from the cache key — a green that measured the base key, not this one. Holding the
  // base fixed is what leaves the tier as the only thing that can decide reuse.
  const DEPLOYED = "https://o.github.io/r/";

  /** Wait until `openPublish`'s fire-and-forget projection has actually POPULATED the cache.
   *
   *  `h.bases.length === 1` is not that signal: the mock records the base when `publishLibrary` is
   *  ENTERED, while the cache is assigned in the `.then()` after it resolves. Pushing on that signal
   *  raced, found no cache, and re-projected — which reads exactly like the cache key doing its job.
   *  `tierRescaled` is set on the same line as the cache assignment, so it is the honest edge. */
  const warmCache = async (flows: { tierRescaled: unknown[] }) => {
    await vi.waitFor(() => expect(h.bases.length).toBe(1));
    await vi.waitFor(() => expect(flows.tierRescaled.length).toBe(1));
  };

  it("a tree projected at WEB is not reused for an ARCHIVAL publish — it re-projects", async () => {
    let tier: QualityTier = "web";
    const flows = createPublishFlows({ ...deps(() => tier), publishBase: () => DEPLOYED });

    // Warm the cache exactly the way the dialog does, and wait for the background projection.
    expect(await flows.openPublish()).toBe(true);
    await warmCache(flows);
    expect(h.bases[0], "the warm projection did not run at the deployed base").toBe(DEPLOYED);

    // The author changes the tier on the surface AFTER the warm projection — the ordering that makes
    // this a cache-key question rather than a parameter-passing one.
    tier = "archival";
    await flows.publish(TARGET);

    expect(h.bases, "the push reused the web-tier tree instead of re-projecting").toEqual([DEPLOYED, DEPLOYED]);
    const pushed = h.pushed!;
    expect(Object.keys(pushed)).toContain(`${SLUG}/assets/folio.tif`);
    expect(Object.keys(pushed), "a WEB-tier file reached an ARCHIVAL publish").not.toContain(`${SLUG}/assets/folio.webp`);
  });

  it("an UNCHANGED tier still reuses the warm tree — the key discriminates, it does not just disable the cache", async () => {
    const flows = createPublishFlows({ ...deps(() => "web"), publishBase: () => DEPLOYED });
    expect(await flows.openPublish()).toBe(true);
    await warmCache(flows);

    await flows.publish(TARGET);
    expect(h.bases, "the warm tree was not reused even though base AND tier were unchanged").toEqual([DEPLOYED]);
    expect(Object.keys(h.pushed!)).toContain(`${SLUG}/assets/folio.webp`);
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

describe("the annotation-geometry blocker is CLOSED — the rescale report drives the fix (Archie-4b0a)", () => {
  // A log against the SAME library the suite already publishes: a rect + a polygon on `o1` (the
  // 6000x4000 master, which the web tier serves at 2400x1600), and a rect on `o2` (1200x900, under
  // the cap and therefore untouched). Authored coordinates are master-space, as they always are.
  const log = (() => {
    const sel = (value: string, type: "FragmentSelector" | "SvgSelector" = "FragmentSelector") => ({ type, value });
    let l = appendNew([], { target: { type: "SpecificResource", source: `${SLUG}/canvas/o1`, selector: sel("xywh=pixel:1200,800,600,400") }, lastEditor: asClientId("a"), modifiedAt: "t", now: 1 } as never).log;
    l = appendNew(l, { target: { type: "SpecificResource", source: `${SLUG}/canvas/o1`, selector: sel(`<svg><polygon points="1200,800 1800,800 1500,1600" /></svg>`, "SvgSelector") }, lastEditor: asClientId("a"), modifiedAt: "t", now: 2 } as never).log;
    l = appendNew(l, { target: { type: "SpecificResource", source: `${SLUG}/canvas/o2`, selector: sel("xywh=pixel:100,100,50,50") }, lastEditor: asClientId("a"), modifiedAt: "t", now: 3 } as never).log;
    return l;
  })();
  const annotatedDeps = (tier: () => QualityTier): PublishDeps => ({ ...deps(tier), loadAllLogs: async () => ({ [SLUG]: log }) });

  /** Selector values on one canvas's published base page, SORTED — never keyed on projection order
   *  (`.claude/rules/a-green-run-is-one-sample.md`). */
  const publishedSelectors = (files: Record<string, FileContent>, objId: string): string[] => {
    const page = JSON.parse(textAt(files, `${SLUG}/canvas/${objId}/annotations.json`)) as { items?: Array<{ target: { selector?: { value?: string } } }> };
    return (page.items ?? []).map((a) => a.target.selector?.value ?? "").sort();
  };

  it("a WEB publish ships selectors in the SERVED pixel space — both shapes, on the object that moved", async () => {
    const flows = createPublishFlows(annotatedDeps(() => "web"));
    const fs = new MemoryFilesystem();
    await flows.writeToFolder(fs);
    const files = await treeOf(await fs.root());
    expect(publishedSelectors(files, "o1")).toEqual([
      "xywh=pixel:480,320,240,160",
      `<svg><polygon points="480,320 720,320 600,640" /></svg>`,
    ].sort());
    // The manifest's canvas dimensions and the selectors now describe the SAME image — the internal
    // consistency the fence was about. 2400/6000 = 0.4, and 1200*0.4 = 480.
    const manifest = JSON.parse(textAt(files, `${SLUG}/manifest.json`)) as { items: Array<{ id: string; width: number; height: number }> };
    const o1 = manifest.items.find((c) => c.id.endsWith("/canvas/o1"))!;
    expect([o1.width, o1.height]).toEqual([2400, 1600]);
  });

  it("the object that did NOT move keeps its authored coordinates", async () => {
    const flows = createPublishFlows(annotatedDeps(() => "web"));
    const fs = new MemoryFilesystem();
    await flows.writeToFolder(fs);
    expect(publishedSelectors(await treeOf(await fs.root()), "o2")).toEqual(["xywh=pixel:100,100,50,50"]);
  });

  it("an ARCHIVAL publish ships the authored coordinates unchanged — the tier is what decides", async () => {
    const flows = createPublishFlows(annotatedDeps(() => "archival"));
    const fs = new MemoryFilesystem();
    await flows.writeToFolder(fs);
    expect(publishedSelectors(await treeOf(await fs.root()), "o1")).toEqual([
      "xywh=pixel:1200,800,600,400",
      `<svg><polygon points="1200,800 1800,800 1500,1600" /></svg>`,
    ].sort());
  });

  it("the HISTORY sidecar keeps master-space coordinates even at the web tier (projection-only)", async () => {
    const flows = createPublishFlows(annotatedDeps(() => "web"));
    const fs = new MemoryFilesystem();
    await flows.writeToFolder(fs);
    const files = await treeOf(await fs.root());
    const hist = Object.keys(files).filter((p) => p.startsWith(`${SLUG}/annotations/history/`) && !p.endsWith("index.json"));
    expect(hist.length).toBe(3);
    const values = hist.flatMap((p) => {
      const page = JSON.parse(textAt(files, p)) as { items?: Array<{ target: { selector?: { value?: string } } }> };
      return (page.items ?? []).map((a) => a.target.selector?.value ?? "");
    });
    expect(values.sort()).toEqual([
      "xywh=pixel:100,100,50,50",
      "xywh=pixel:1200,800,600,400",
      `<svg><polygon points="1200,800 1800,800 1500,1600" /></svg>`,
    ].sort());
  });

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
