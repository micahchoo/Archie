import { describe, it, expect, vi, afterEach } from "vitest";
import { collectFiles, buildGitTree, publishToGitHub, pagesUrlFor, GitHubPublishError } from "./ghpages.js";
import { publishLibrary } from "./site.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { appendNew } from "../spine/log.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";

// GH-Pages publish adapter core (CONTEXT: zip-primitive + per-host adapters; the GH adapter uses
// the GitHub git-trees API — "replace this tree"). The file-tree builder is pure + testable; the
// actual createBlob/tree/commit/ref fetch sequence is the thin browser/network layer.

const alice = asClientId("alice");
const base = "https://u.gh.io/lib/";
const canvas = `${base}a/canvas/o1`;
const library: Library = { id: asLibraryId("lib"), title: "Lib", exhibits: [{ id: asExhibitId("a"), slug: "a", title: "A", objects: [{ id: asObjectId("o1"), source: "https://img/a.jpg", label: "A", width: 10, height: 10 }] }] };
const logA = appendNew([], { target: { type: "SpecificResource", source: canvas, selector: { type: "FragmentSelector", value: "xywh=pixel:0,0,3,3" } }, body: { type: "TextualBody", value: "n" }, lastEditor: alice, modifiedAt: "t", now: 1 }).log;

describe("collectFiles — flatten the published tree from the seam", () => {
  it("walks the directory recursively into a path -> FileContent map (JSON pages are text)", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, library, () => logA, { baseUrl: base });
    const files = await collectFiles(await fs.root());
    expect(Object.keys(files)).toContain("collection.json");
    expect(Object.keys(files)).toContain("exhibits.json");
    expect(Object.keys(files)).toContain("a/manifest.json");
    expect(Object.keys(files).some((p) => p.startsWith("a/canvas/o1/annotations"))).toBe(true);
    expect(Object.keys(files).some((p) => p.startsWith("a/annotations/history/"))).toBe(true);
    const coll = files["collection.json"]!;
    expect("text" in coll && JSON.parse(coll.text).type).toBe("Collection");
  });

  it("encodes image assets as base64 (binary), JSON as text", async () => {
    const fs = new MemoryFilesystem();
    const lib: Library = { id: asLibraryId("lib"), exhibits: [{ id: asExhibitId("c"), slug: "c", title: "C", objects: [{ id: asObjectId("o1"), source: "/assets/pic.png", label: "Imported", width: 4, height: 4 }] }] };
    const bytes = new Uint8Array([0, 1, 254, 255]).buffer; // non-UTF8 bytes
    await publishLibrary(fs, lib, () => [], { baseUrl: base, getAsset: async () => bytes });
    const files = await collectFiles(await fs.root());
    const asset = files["c/assets/pic.png"]!;
    expect("base64" in asset).toBe(true);
    if ("base64" in asset) expect(asset.base64).toBe(Buffer.from([0, 1, 254, 255]).toString("base64"));
    expect("text" in files["c/manifest.json"]!).toBe(true);
  });
});

describe("buildGitTree — GitHub git-trees payload (replace-this-tree)", () => {
  it("maps text → inline content + binary → base64 blob entries, sorted by path", async () => {
    const fs = new MemoryFilesystem();
    const lib: Library = { id: asLibraryId("lib"), exhibits: [{ id: asExhibitId("c"), slug: "c", title: "C", objects: [{ id: asObjectId("o1"), source: "/assets/pic.png", label: "Imported", width: 4, height: 4 }] }] };
    await publishLibrary(fs, lib, () => [], { baseUrl: base, getAsset: async () => new Uint8Array([1, 2, 3]).buffer });
    const tree = buildGitTree(await collectFiles(await fs.root()));
    expect(tree.length).toBeGreaterThanOrEqual(4);
    for (const e of tree) {
      expect(e.mode).toBe("100644");
      expect(e.type).toBe("blob");
      expect("content" in e || "base64" in e).toBe(true);
    }
    const assetEntry = tree.find((e) => e.path === "c/assets/pic.png")!;
    expect("base64" in assetEntry).toBe(true);
    const paths = tree.map((e) => e.path);
    expect([...paths].sort()).toEqual(paths); // sorted
  });
});

describe("pagesUrlFor — project- vs user-site address", () => {
  it("a normal repo → project site at /{repo}/", () => {
    expect(pagesUrlFor("alice", "my-exhibit")).toBe("https://alice.github.io/my-exhibit/");
  });
  it("an {owner}.github.io repo → user/org site at root (case-insensitive)", () => {
    expect(pagesUrlFor("Alice", "alice.github.io")).toBe("https://Alice.github.io/");
  });
});

describe("publishToGitHub — network sequence + error mapping (mocked fetch)", () => {
  afterEach(() => vi.unstubAllGlobals());

  type Route = { method?: string; match: string; status?: number; json?: unknown };
  const stub = (routes: Route[]) =>
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? "GET").toUpperCase();
      const r = routes.find((x) => u.includes(x.match) && (x.method ?? "GET") === method);
      if (!r) throw new Error(`unmocked ${method} ${u}`);
      const status = r.status ?? 200;
      return { ok: status >= 200 && status < 300, status, json: async () => r.json ?? {} } as Response;
    }));

  const files = { "index.json": { text: "{}" }, "a/assets/pic.png": { base64: "AAEC" } } as const;
  const target = { owner: "alice", repo: "exhibit", token: "github_pat_x" };
  const happy: Route[] = [
    { method: "POST", match: "/git/blobs", json: { sha: "blob1" } },
    { method: "GET", match: "/git/ref/heads/", status: 404 }, // fresh branch
    { method: "POST", match: "/git/trees", json: { sha: "tree1" } },
    { method: "POST", match: "/git/commits", json: { sha: "c1", html_url: "https://github.com/alice/exhibit/commit/c1" } },
    { method: "POST", match: "/git/refs/heads/", json: {} },
  ];

  it("uploads blobs, creates tree/commit/ref, enables Pages, returns commit + pages URL", async () => {
    stub([...happy, { method: "GET", match: "/pages", status: 404 }, { method: "POST", match: "/pages", status: 201 }]);
    const res = await publishToGitHub({ ...files }, target);
    expect(res.commitUrl).toBe("https://github.com/alice/exhibit/commit/c1");
    expect(res.pagesUrl).toBe("https://alice.github.io/exhibit/");
    expect(res.pagesEnabled).toBe(true);
  });

  it("a bad token (401) on tree creation rejects with an actionable cause, not undefined.sha", async () => {
    stub([
      { method: "POST", match: "/git/blobs", json: { sha: "blob1" } },
      { method: "GET", match: "/git/ref/heads/", status: 404 },
      { method: "POST", match: "/git/trees", status: 401, json: { message: "Bad credentials" } },
    ]);
    await expect(publishToGitHub({ ...files }, target)).rejects.toBeInstanceOf(GitHubPublishError);
    await expect(publishToGitHub({ ...files }, target)).rejects.toThrow(/token/i);
  });

  it("a missing repo (404) on blob upload names the repo, not a cryptic sha error", async () => {
    stub([{ method: "POST", match: "/git/blobs", status: 404, json: { message: "Not Found" } }]);
    await expect(publishToGitHub({ ...files }, target)).rejects.toThrow(/find that repository/i);
  });

  it("publish still succeeds when Pages can't be enabled (no scope) — pagesEnabled=false", async () => {
    stub([...happy, { method: "GET", match: "/pages", status: 404 }, { method: "POST", match: "/pages", status: 403 }]);
    const res = await publishToGitHub({ ...files }, target);
    expect(res.commitUrl).toBe("https://github.com/alice/exhibit/commit/c1");
    expect(res.pagesEnabled).toBe(false);
  });

  it("Pages already serving OUR branch → pagesEnabled=true (no write)", async () => {
    stub([...happy, { method: "GET", match: "/pages", json: { source: { branch: "gh-pages" } } }]);
    const res = await publishToGitHub({ ...files }, target);
    expect(res.pagesEnabled).toBe(true);
  });

  it("reports progress: uploading (counted) → committing → enabling-pages", async () => {
    stub([...happy, { method: "GET", match: "/pages", status: 404 }, { method: "POST", match: "/pages", status: 201 }]);
    const seen: string[] = [];
    let lastUpload = { done: -1, total: -1 };
    await publishToGitHub({ ...files }, target, (p) => {
      seen.push(p.phase);
      if (p.phase === "uploading") lastUpload = { done: p.done, total: p.total };
    });
    expect(seen).toContain("uploading");
    expect(seen).toContain("committing");
    expect(seen).toContain("enabling-pages");
    expect(lastUpload).toEqual({ done: 1, total: 1 }); // one binary asset (pic.png), fully uploaded
    expect(seen.indexOf("committing")).toBeLessThan(seen.indexOf("enabling-pages")); // ordered
  });

  it("Pages serving a DIFFERENT branch → left untouched, pagesEnabled=false (no silent repoint)", async () => {
    const putSpy = { method: "PUT" as const, match: "/pages", status: 200 };
    stub([...happy, { method: "GET", match: "/pages", json: { source: { branch: "main" } } }, putSpy]);
    const res = await publishToGitHub({ ...files }, target);
    expect(res.pagesEnabled).toBe(false);
    // No PUT was issued (the mock would throw "unmocked PUT" only if we tried a method with no route —
    // here the route exists; assert via the fetch mock that PUT was never called).
    const calls = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
    expect(calls.some(([, init]) => (init?.method ?? "GET").toUpperCase() === "PUT")).toBe(false);
  });
});
