import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { publishLibrary } from "./site.js";
import { FIXITY_MANIFEST_NAME, parseFixityManifest } from "./fixity.js";
import { MemoryFilesystem } from "../fs/memory.js";
import type { Filesystem, FsDirectory, FsFile, FsWritable } from "../fs/seam.js";
import { appendNew } from "../spine/log.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";
import type { AnnotationLog } from "../wadm/types.js";

// Archie-039e — the fixity manifest publishLibrary writes when PublishOptions.fixity is set.
//
// The oracle throughout is an INDEPENDENT re-hash: walk the finished tree through the seam and hash
// every file with node:crypto. Comparing the manifest against `HashingFilesystem`'s own records would
// only prove the two halves of one implementation agree; comparing it against a full re-read of the
// bytes that are actually on disk is the claim a verifier will make later, and the only one worth
// asserting. That is also exactly what makes the INCREMENTAL case falsifiable: a carried-forward line
// is not carried forward in the oracle, it is re-hashed from the file.

const alice = asClientId("alice");

function libraryFixture(titleA = "Exhibit A"): Library {
  return {
    id: asLibraryId("lib"),
    title: "Lib",
    exhibits: [
      {
        id: asExhibitId("exA"),
        slug: "a",
        title: titleA,
        objects: [{ id: asObjectId("o1"), source: "/assets/photo.jpg", label: "A1", width: 10, height: 10 }],
      },
      {
        id: asExhibitId("exB"),
        slug: "b",
        title: "Exhibit B",
        objects: [{ id: asObjectId("o2"), source: "/assets/other.jpg", label: "B1", width: 8, height: 8 }],
      },
    ],
  };
}

const logA: AnnotationLog = appendNew([], {
  target: "https://u.gh.io/lib/a/canvas/o1",
  body: { type: "TextualBody", value: "note" },
  lastEditor: alice,
  modifiedAt: "t",
  now: 1,
}).log;
const getLog = (id: string): AnnotationLog => (id === "exA" ? logA : []);

const ASSET_BYTES = new Uint8Array([9, 8, 7, 6, 5]).buffer;
const VIEWER_BUNDLE = new Map<string, string>([
  ["archie-viewer.js", "/* the embed bundle, ~1MB in reality */"],
  ["chunk-osd.js", "/* the lazy canvas chunk */"],
]);

const OPTS = {
  baseUrl: "https://u.gh.io/lib/",
  getAsset: async (): Promise<ArrayBuffer> => ASSET_BYTES,
  getViewerBundle: async (): Promise<Map<string, string>> => VIEWER_BUNDLE,
  publishedAt: "2026-07-27T00:00:00.000Z",
  fixity: true,
};

/** Walk the finished tree and hash every file with node:crypto — the independent oracle. */
async function rehashTree(fs: Filesystem): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (dir: FsDirectory, prefix: string): Promise<void> => {
    const entries: { name: string; kind: "file" | "directory" }[] = [];
    for await (const e of dir.entries()) entries.push(e);
    for (const e of entries) {
      const path = prefix === "" ? e.name : `${prefix}/${e.name}`;
      if (e.kind === "directory") await walk(await dir.getDirectory(e.name), path);
      else {
        const bytes = new Uint8Array(await (await dir.getFile(e.name)).readable());
        out.set(path, createHash("sha256").update(bytes).digest("hex"));
      }
    }
  };
  await walk(await fs.root(), "");
  return out;
}

async function readManifest(fs: Filesystem): Promise<Map<string, string>> {
  const file = await (await fs.root()).getFile(FIXITY_MANIFEST_NAME);
  const text = new TextDecoder().decode(await file.readable());
  return new Map(parseFixityManifest(text).map((e) => [e.path, e.sha256]));
}

/** Records the ORDER in which files finish being written — `close()`, not `getFile()`, because
 *  publish fans out and only the close is the commit of that file's bytes. */
function orderRecording(inner: Filesystem, order: string[]): Filesystem {
  const wrapDir = (d: FsDirectory, prefix: string): FsDirectory => ({
    getDirectory: async (n, o) => wrapDir(await d.getDirectory(n, o), prefix === "" ? n : `${prefix}/${n}`),
    getFile: async (n, o) => wrapFile(await d.getFile(n, o), prefix === "" ? n : `${prefix}/${n}`),
    remove: (n) => d.remove(n),
    entries: () => d.entries(),
  });
  const wrapFile = (f: FsFile, path: string): FsFile => ({
    readable: () => f.readable(),
    getFile: () => f.getFile(),
    size: () => f.size(),
    writable: async (): Promise<FsWritable> => {
      const w = await f.writable();
      return {
        write: (data) => w.write(data),
        close: async () => {
          await w.close();
          order.push(path);
        },
      };
    },
  });
  return { root: async () => wrapDir(await inner.root(), "") };
}

describe("publishLibrary — the fixity manifest (Archie-039e)", () => {
  it("is OFF by default: no manifest-sha256.txt, no fixity in the result", async () => {
    const fs = new MemoryFilesystem();
    const result = await publishLibrary(fs, libraryFixture(), getLog, { ...OPTS, fixity: false });
    const names: string[] = [];
    for await (const e of (await fs.root()).entries()) names.push(e.name);
    expect(names).not.toContain(FIXITY_MANIFEST_NAME);
    expect(result.fixity).toBeUndefined();
  });

  it("a FULL publish lists exactly the tree, and every line matches an independent re-hash", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libraryFixture(), getLog, OPTS);

    const manifest = await readManifest(fs);
    const actual = await rehashTree(fs);
    // The manifest cannot list itself, and the marker is written AFTER it — see the ordering test.
    actual.delete(FIXITY_MANIFEST_NAME);
    actual.delete("archie.json");

    expect([...manifest.keys()].sort()).toEqual([...actual.keys()].sort());
    expect(manifest).toEqual(actual);
    // Guard against a vacuous pass on an empty tree: this fixture is substantial.
    expect(manifest.size).toBeGreaterThan(20);
  });

  it("covers the asset bytes, the static pages and the _viewer/ bundle — not only the JSON", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libraryFixture(), getLog, OPTS);
    const paths = [...(await readManifest(fs)).keys()];
    for (const expected of [
      "a/assets/photo.jpg",
      "a/manifest.json",
      "a/index.html",
      "a/canvas/o1/annotations.json",
      "a/annotations/history/index.json",
      "_viewer/archie-viewer.js",
      "_viewer/chunk-osd.js",
      "viewer.html",
      "index.html",
      "exhibits.json",
      "images.json",
      "sitemap.xml",
      ".nojekyll",
    ]) {
      expect(paths, `manifest is missing ${expected}`).toContain(expected);
    }
  });

  it("is written SECOND-TO-LAST — after every payload file, immediately before archie.json", async () => {
    const order: string[] = [];
    const mem = new MemoryFilesystem();
    await publishLibrary(orderRecording(mem, order), libraryFixture(), getLog, OPTS);
    expect(order.at(-1)).toBe("archie.json");
    expect(order.at(-2)).toBe(FIXITY_MANIFEST_NAME);
    // And nothing else wrote either name earlier — the two appear exactly once each.
    expect(order.filter((p) => p === "archie.json")).toHaveLength(1);
    expect(order.filter((p) => p === FIXITY_MANIFEST_NAME)).toHaveLength(1);
  });

  it("republishing identical content produces a byte-identical manifest", async () => {
    const one = new MemoryFilesystem();
    const two = new MemoryFilesystem();
    await publishLibrary(one, libraryFixture(), getLog, OPTS);
    await publishLibrary(two, libraryFixture(), getLog, OPTS);
    const text = async (fs: MemoryFilesystem): Promise<string> =>
      new TextDecoder().decode(await (await (await fs.root()).getFile(FIXITY_MANIFEST_NAME)).readable());
    expect(await text(one)).toBe(await text(two));
  });

  it("PublishResult.fixity is the manifest's own lines, with the byte sizes the format cannot carry", async () => {
    const fs = new MemoryFilesystem();
    const result = await publishLibrary(fs, libraryFixture(), getLog, OPTS);
    const manifest = await readManifest(fs);
    expect(result.fixity!.map((e) => e.path).sort()).toEqual([...manifest.keys()].sort());
    for (const e of result.fixity!) {
      expect(e.sha256).toBe(manifest.get(e.path));
      expect(typeof e.bytes).toBe("number"); // a full publish carries a size for every line
    }
    expect(result.fixity!.find((e) => e.path === "a/assets/photo.jpg")!.bytes).toBe(5);
  });
});

describe("publishLibrary — the fixity manifest survives an INCREMENTAL publish", () => {
  it("after a scoped republish, every line still matches a full re-hash of the tree", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libraryFixture(), getLog, OPTS);
    const before = await readManifest(fs);

    // The folder-autosave hot path: only exhibit `a` is rewritten, its bytes are NOT re-copied, and
    // the ~1MB _viewer/ bundle is deliberately skipped (writeTreeViewer's skipBytesIfPresent).
    await publishLibrary(fs, libraryFixture("Exhibit A, retitled"), getLog, {
      ...OPTS,
      incremental: { exhibits: new Set(["a"]), reassets: new Set() },
    });

    const manifest = await readManifest(fs);
    const actual = await rehashTree(fs);
    actual.delete(FIXITY_MANIFEST_NAME);
    actual.delete("archie.json");

    expect([...manifest.keys()].sort()).toEqual([...actual.keys()].sort());
    expect(manifest).toEqual(actual);

    // Prove the incremental path was really taken rather than a full rewrite sneaking in:
    // `a/index.html` changed (the retitle) and `b/index.html` did not.
    expect(manifest.get("a/index.html")).not.toBe(before.get("a/index.html"));
    expect(manifest.get("b/index.html")).toBe(before.get("b/index.html"));
    expect(manifest.get("_viewer/archie-viewer.js")).toBe(before.get("_viewer/archie-viewer.js"));
  });

  it("a removed exhibit's lines leave the manifest", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libraryFixture(), getLog, OPTS);
    expect([...(await readManifest(fs)).keys()].some((p) => p.startsWith("b/"))).toBe(true);

    const oneExhibit: Library = { ...libraryFixture(), exhibits: [libraryFixture().exhibits[0]!] };
    await publishLibrary(fs, oneExhibit, getLog, {
      ...OPTS,
      incremental: { exhibits: new Set(["a"]), reassets: new Set() },
      removedExhibits: ["b"],
    });

    const manifest = await readManifest(fs);
    expect([...manifest.keys()].filter((p) => p.startsWith("b/"))).toEqual([]);
    // And the manifest still describes the tree exactly.
    const actual = await rehashTree(fs);
    actual.delete(FIXITY_MANIFEST_NAME);
    actual.delete("archie.json");
    expect(manifest).toEqual(actual);
  });

  it("a first publish with NO prior manifest carries nothing forward", async () => {
    const fs = new MemoryFilesystem();
    const result = await publishLibrary(fs, libraryFixture(), getLog, {
      ...OPTS,
      incremental: { exhibits: new Set(["a"]), reassets: new Set(["a"]) },
    });
    // Only exhibit `a` and the always-rewritten library-level projections exist; nothing invented.
    expect(result.fixity!.some((e) => e.path.startsWith("b/"))).toBe(false);
    const actual = await rehashTree(fs);
    actual.delete(FIXITY_MANIFEST_NAME);
    actual.delete("archie.json");
    expect(new Map(result.fixity!.map((e) => [e.path, e.sha256]))).toEqual(actual);
  });
});
