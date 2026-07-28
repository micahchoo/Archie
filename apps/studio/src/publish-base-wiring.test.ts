// Archie-19c5 / Archie-3504 — the publish base is resolved AT PROJECTION TIME, from the destination.
//
// Two halves, both pinned here over the REAL projection (publishLibrary, static pages, IIIF manifest):
//
//   H1. `WORKING_IRI_BASE` (`https://archie.demo/`) is the AUTHORING identifier namespace and must
//       never reach a published artifact. Every assertion below greps the built tree for it.
//   H2. ORDERING. `openPublish()` bakes the tree the moment the author enters the GitHub step —
//       BEFORE any owner/repo is typed — and caches it in `cachedSiteFs`. The browser PAT push then
//       reused that cache, so a correctly derived `pagesUrlFor(owner, repo)` arrived four steps too
//       late to reach a single id. The push must project (or re-project) once the destination exists.
//
// The relative-first decision (Archie-3504 A1) is the other side of the same coin: a folder or zip
// publish has no destination, so it emits a RELATIVE tree that is correct wherever it lands. Only a
// push knows where it is going, and only a push bakes absolutes.
//
// Harness note: `@render/core` is partially mocked so the push's file map can be captured without a
// network, and so `publishLibrary` reports the `baseUrl` each projection actually ran at — the wait
// signal for `openPublish`'s fire-and-forget background projection (without it, a test could race
// past the cache and pass against the unfixed code for the wrong reason).
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MemoryFilesystem, ZipFilesystem, collectFiles, asLibraryId, asExhibitId, asObjectId,
  type Library, type FileContent, type GitHubTarget, type FsDirectory,
} from "@render/core";

const h = vi.hoisted(() => ({
  /** baseUrl of every projection this test triggered, in order. */
  bases: [] as (string | undefined)[],
  /** The flattened file map the GitHub push was handed. */
  pushed: null as Record<string, FileContent> | null,
  /** The eagerly-built zip filesystem, captured from the (mocked) disk save. */
  zipFs: null as ZipFilesystem | null,
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
      return { commitUrl: "https://github.com/o/r/commit/deadbeef", pagesUrl: "https://o.github.io/r/", pagesEnabled: true };
    },
  };
});

// No OPFS in the test env: the publish path's structure probe is non-creating and returns null, and
// the object below is a remote URL (never an `asset:`), so no asset bytes are read either.
vi.mock("./store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store.js")>()),
  openExhibitStructureDirIfExists: async () => null,
  openExhibitAnnotationsDir: async () => null,
}));

// Force the EAGER zip path (no save picker in the test env) and capture the built archive instead of
// writing it — this is the real `saveProjectZip` → `publishInto` → `zipPublishOpts()` chain.
vi.mock("./binding.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./binding.js")>()),
  supportsStreamingZipSave: () => false,
  saveZipToDisk: async (fs: ZipFilesystem, name: string) => { h.zipFs = fs; return { kind: "downloaded" as const, name }; },
}));

import { createPublishFlows, type PublishDeps } from "./publish-flows.svelte.js";

type Deps = PublishDeps;

const SLUG = "voynich";
const library: Library = {
  id: asLibraryId("lib-1"),
  title: "A Library",
  exhibits: [{
    id: asExhibitId(SLUG),
    slug: SLUG,
    title: "Voynich",
    objects: [{ id: asObjectId("o1"), source: "https://img.example/f1.jpg", label: "f1", width: 100, height: 80 }],
  }],
};

/** A library that has NEVER deployed — `publishBaseFor` returns `""`, i.e. relative ids. */
function deps(over: Partial<Deps> = {}): Deps {
  return {
    publishBase: () => "",
    flushExhibit: async () => {},
    loadAllLogs: async () => ({}),
    buildFullLibrary: () => library,
    exhibits: () => [],
    canFolder: () => false,
    currentZipName: () => "lib.archie.zip",
    ...over,
  };
}

const TARGET: GitHubTarget = { owner: "micahchoo", repo: "test", branch: "gh-pages", token: "tok" };
const PAGES = "https://micahchoo.github.io/test/";

/** Every text file in a built tree, as one string per path — what a `grep` of the artifact sees. */
async function textOf(files: Record<string, FileContent>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if ("text" in content) out[path] = content.text;
  }
  return out;
}

async function treeText(root: FsDirectory): Promise<Record<string, string>> {
  return textOf(await collectFiles(root));
}

beforeEach(() => {
  h.bases = [];
  h.pushed = null;
  h.zipFs = null;
});

describe("the publish base is the DESTINATION's, resolved before the tree is projected (Archie-19c5 / Archie-3504)", () => {
  it("a GitHub push bakes pagesUrlFor(owner, repo) — even though openPublish cached a tree before the repo was named", async () => {
    const flows = createPublishFlows(deps());

    // The ordering hazard, reproduced exactly: the author enters the GitHub step, the projection runs
    // and caches, and ONLY THEN do owner/repo exist. Await the cached projection before pushing —
    // without this the push might re-project for the mundane reason that no cache had landed yet,
    // which would prove nothing about the reuse path.
    expect(await flows.openPublish()).toBe(true);
    await vi.waitFor(() => expect(h.bases.length).toBe(1));
    expect(h.bases[0]).toBe(""); // the pre-destination projection is relative, as it must be

    await flows.publish(TARGET);

    const files = h.pushed;
    expect(files, "the push was never handed a file map").not.toBeNull();
    const text = await textOf(files!);

    // The four spots that genuinely need an absolute (Archie-3504 A1's decided list).
    const manifest = text[`${SLUG}/manifest.json`];
    expect(manifest, "no manifest in the pushed tree").toBeDefined();
    expect(JSON.parse(manifest!).id).toBe(`${PAGES}${SLUG}/manifest.json`); // IIIF id
    const page = text[`${SLUG}/index.html`];
    expect(page, "no exhibit page in the pushed tree").toBeDefined();
    expect(page!).toContain(`<link rel="canonical" href="${PAGES}${SLUG}/index.html">`); // canonical link
    expect(page!).toContain(`<meta property="og:url" content="${PAGES}${SLUG}/index.html">`); // og:url
    expect(page!).toContain(`"url":"${PAGES}${SLUG}/index.html"`); // JSON-LD url

    // And the authoring namespace is nowhere in the artifact.
    const demo = Object.entries(text).filter(([, body]) => body.includes("archie.demo"));
    expect(demo.map(([p]) => p), "WORKING_IRI_BASE leaked into the published tree").toEqual([]);
  });

  it("the push's projection is the one that ran at the derived base — the stale cache is not reused", async () => {
    const flows = createPublishFlows(deps());
    expect(await flows.openPublish()).toBe(true);
    await vi.waitFor(() => expect(h.bases.length).toBe(1));

    await flows.publish(TARGET);

    // Two projections: the pre-destination one (relative) and the push's (the derived Pages URL).
    expect(h.bases).toEqual(["", PAGES]);
  });

  it("a second push to the SAME destination reuses the cache — re-projection is keyed on the base, not unconditional", async () => {
    const flows = createPublishFlows(deps());
    expect(await flows.openPublish()).toBe(true);
    await vi.waitFor(() => expect(h.bases.length).toBe(1));

    await flows.publish(TARGET);
    await flows.publish(TARGET);

    expect(h.bases).toEqual(["", PAGES]); // the second push re-used the tree the first one built
  });
});

describe("relative-first: a destination-less publish emits a tree that works at any base (Archie-3504 A1)", () => {
  it("the folder sink writes RELATIVE ids and no archie.demo", async () => {
    const flows = createPublishFlows(deps());
    const fs = new MemoryFilesystem();
    await flows.writeToFolder(fs);

    const text = await treeText(await fs.root());
    expect(h.bases).toEqual([""]);
    expect(JSON.parse(text[`${SLUG}/manifest.json`]!).id).toBe(`${SLUG}/manifest.json`);
    expect(text[`${SLUG}/index.html`]!).toContain(`<link rel="canonical" href="${SLUG}/index.html">`);
    expect(Object.entries(text).filter(([, b]) => b.includes("archie.demo")).map(([p]) => p)).toEqual([]);
    // No publish base was baked. (The static pages DO carry one deliberate absolute — the canonical
    // Viewer link from `archie.config.json`, `STATIC_PAGE_OPTS.viewerBase`. That is an outbound link
    // to a different site, not this tree's own base, so it is not what "relative-first" is about.)
    expect(Object.entries(text).filter(([, b]) => b.includes(PAGES)).map(([p]) => p)).toEqual([]);
  });

  it("the zip export writes RELATIVE ids and no archie.demo", async () => {
    const flows = createPublishFlows(deps());
    expect(await flows.downloadProjectZip()).toBe(true);

    expect(h.zipFs, "the eager zip path never ran").not.toBeNull();
    const text = await treeText(await h.zipFs!.root());
    expect(h.bases).toEqual([""]);
    expect(JSON.parse(text[`${SLUG}/manifest.json`]!).id).toBe(`${SLUG}/manifest.json`);
    expect(Object.entries(text).filter(([, b]) => b.includes("archie.demo")).map(([p]) => p)).toEqual([]);
  });

  it("a library that HAS deployed keeps baking its own live URL (never the authoring namespace)", async () => {
    const live = "https://micahchoo.github.io/test/";
    const flows = createPublishFlows(deps({ publishBase: () => live }));
    const fs = new MemoryFilesystem();
    await flows.writeToFolder(fs);

    const text = await treeText(await fs.root());
    expect(JSON.parse(text[`${SLUG}/manifest.json`]!).id).toBe(`${live}${SLUG}/manifest.json`);
    expect(Object.entries(text).filter(([, b]) => b.includes("archie.demo")).map(([p]) => p)).toEqual([]);
  });
});
