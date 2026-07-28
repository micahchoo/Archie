import { describe, it, expect, vi, afterEach } from "vitest";
import { collectFiles, buildGitTree, publishToGitHub, pagesUrlFor, ensureRepo, GitHubPublishError, type FileContent } from "./ghpages.js";
import { localBlobShas } from "./push-delta.js";
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
    // The ref lookup runs first now (the incremental push needs the base commit before it uploads).
    // A missing repo 404s there too, which reads as "fresh branch" — so the blob POST is still the
    // step that surfaces the cause, exactly as before.
    stub([
      { method: "GET", match: "/git/ref/heads/", status: 404 },
      { method: "POST", match: "/git/blobs", status: 404, json: { message: "Not Found" } },
    ]);
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
    expect(seen).toContain("comparing"); // the incremental read of what the branch already holds
    expect(seen.indexOf("comparing")).toBeLessThan(seen.indexOf("uploading")); // before, or it can't help
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

describe("publishToGitHub — incremental push: upload only what GitHub can't already name (Archie-53e3)", () => {
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

  const calls = () => (globalThis.fetch as unknown as { mock: { calls: [string | URL, RequestInit?][] } }).mock.calls;
  /** Every `POST /git/blobs` this publish made — the request the ticket is about. */
  const blobPosts = () => calls().filter(([u, i]) => String(u).includes("/git/blobs") && (i?.method ?? "GET").toUpperCase() === "POST");
  /** The `tree` array the publish actually POSTed. */
  const pushedTree = (): { path: string; sha?: string; content?: string }[] => {
    const call = calls().find(([u, i]) => String(u).endsWith("/git/trees") && (i?.method ?? "GET").toUpperCase() === "POST");
    return JSON.parse(String(call![1]!.body)).tree;
  };

  // A small tile-ish library: two JSON pages and three binary assets.
  const tile1Base64 = Buffer.from([2, 2, 2]).toString("base64");
  const files: Record<string, FileContent> = {
    "collection.json": { text: '{"type":"Collection"}' },
    "a/manifest.json": { text: '{"id":"a"}' },
    "a/tiles/0.jpg": { base64: Buffer.from([1, 1, 1]).toString("base64") },
    "a/tiles/1.jpg": { base64: tile1Base64 },
    "a/tiles/2.jpg": { base64: Buffer.from([3, 3, 3]).toString("base64") },
  };
  const target = { owner: "alice", repo: "exhibit", token: "github_pat_x" };

  /** Routes for a repo whose gh-pages branch ALREADY holds `remotePaths` (path -> blob sha). */
  const withExistingBranch = (remotePaths: Record<string, string>, opts?: { truncated?: boolean; treeStatus?: number }): Route[] => [
    { method: "POST", match: "/git/blobs", json: { sha: "freshly-uploaded" } },
    { method: "GET", match: "/git/ref/heads/", json: { object: { sha: "base-commit" } } },
    { method: "GET", match: "/git/commits/", json: { tree: { sha: "base-tree" } } },
    {
      method: "GET", match: "/git/trees/", status: opts?.treeStatus ?? 200,
      json: {
        truncated: opts?.truncated ?? false,
        tree: Object.entries(remotePaths).map(([path, sha]) => ({ path, type: "blob", mode: "100644", sha })),
      },
    },
    { method: "POST", match: "/git/trees", json: { sha: "tree1" } },
    { method: "POST", match: "/git/commits", json: { sha: "c1", html_url: "https://github.com/alice/exhibit/commit/c1" } },
    { method: "PATCH", match: "/git/refs/heads/", json: {} },
    { method: "GET", match: "/pages", json: { source: { branch: "gh-pages" } } },
  ];

  /** The real published tree as GitHub would have stored it — computed, never hand-written. */
  const remoteMirror = async (over: Partial<Record<keyof typeof files, string>> = {}) => {
    const shas = await localBlobShas(files);
    return { ...shas, ...over } as Record<string, string>;
  };

  it("an UNCHANGED republish makes ZERO blob uploads and references every existing sha", async () => {
    stub(withExistingBranch(await remoteMirror()));
    const res = await publishToGitHub({ ...files }, target);
    expect(blobPosts()).toHaveLength(0);
    expect(res.commitUrl).toBe("https://github.com/alice/exhibit/commit/c1");
    // Every entry names a sha; not one carries bytes. (The text pages are referenced too — that also
    // shrinks the tree POST, which on a real library is the JSON half of the payload.)
    const tree = pushedTree();
    expect(tree).toHaveLength(5);
    expect(tree.filter((e) => "content" in e)).toHaveLength(0);
    const shas = await localBlobShas(files);
    expect(Object.fromEntries(tree.map((e) => [e.path, e.sha]))).toEqual(shas);
  });

  it("a ONE-OBJECT edit uploads exactly that file — the other two tiles are referenced", async () => {
    // The remote holds a STALE sha for tile 1; everything else is current.
    stub(withExistingBranch(await remoteMirror({ "a/tiles/1.jpg": "stale-sha-for-tile-1" })));
    let lastUpload = { done: -1, total: -1, unchanged: -1 };
    await publishToGitHub({ ...files }, target, (p) => {
      if (p.phase === "uploading") lastUpload = { done: p.done, total: p.total, unchanged: p.unchanged };
    });

    const posts = blobPosts();
    expect(posts).toHaveLength(1);
    // …and it is the CHANGED tile's bytes, not just "some upload happened".
    expect(JSON.parse(String(posts[0]![1]!.body))).toEqual({ content: tile1Base64, encoding: "base64" });

    const tree = Object.fromEntries(pushedTree().map((e) => [e.path, e]));
    expect(tree["a/tiles/1.jpg"]!.sha).toBe("freshly-uploaded");
    const shas = await localBlobShas(files);
    expect(tree["a/tiles/0.jpg"]!.sha).toBe(shas["a/tiles/0.jpg"]);
    expect(tree["a/tiles/2.jpg"]!.sha).toBe(shas["a/tiles/2.jpg"]);

    // The progress model can now tell an incremental republish from a full one (the ticket's UX note).
    expect(lastUpload).toEqual({ done: 1, total: 1, unchanged: 4 });
  });

  it("a changed TEXT page goes inline (0 requests) while its unchanged neighbour is referenced", async () => {
    stub(withExistingBranch(await remoteMirror({ "a/manifest.json": "stale-manifest-sha" })));
    await publishToGitHub({ ...files }, target);
    expect(blobPosts()).toHaveLength(0); // text never costs a blob POST either way
    const tree = Object.fromEntries(pushedTree().map((e) => [e.path, e]));
    expect(tree["a/manifest.json"]!.content).toBe('{"id":"a"}');
    expect(tree["a/manifest.json"]!.sha).toBeUndefined();
    expect(tree["collection.json"]!.sha).toBe((await localBlobShas(files))["collection.json"]);
  });

  it("a REMOVED exhibit drops out of the pushed tree — a stale exhibit cannot survive republish", async () => {
    const remote = { ...(await remoteMirror()), "gone/manifest.json": "sha-gone", "gone/tiles/0.jpg": "sha-gone-0" };
    stub(withExistingBranch(remote));
    await publishToGitHub({ ...files }, target);
    const paths = pushedTree().map((e) => e.path);
    expect(paths).not.toContain("gone/manifest.json");
    expect(paths).not.toContain("gone/tiles/0.jpg");
    expect(paths.sort()).toEqual(Object.keys(files).sort());
    // No `base_tree`: the tree is complete, so omission IS the deletion. (A `base_tree` design would
    // need `sha: null` entries, and create-tree "Returns an error if you try to delete a file that
    // does not exist" — a wrong delete list would fail the publish outright.)
    const body = JSON.parse(String(calls().find(([u, i]) => String(u).endsWith("/git/trees") && i?.method === "POST")![1]!.body));
    expect("base_tree" in body).toBe(false);
  });

  it("a TRUNCATED remote listing re-uploads everything — it must never skip", async () => {
    // The listing carries the CURRENT shas, so a naive reader would skip all three tiles. It is cut,
    // so nothing in it may be read as proof of what the branch does or does not hold.
    stub(withExistingBranch(await remoteMirror(), { truncated: true }));
    await publishToGitHub({ ...files }, target);
    expect(blobPosts()).toHaveLength(3); // all three binaries, as if the branch were fresh
    expect(pushedTree().filter((e) => "content" in e)).toHaveLength(2); // both text pages inline
  });

  it("an UNREADABLE remote listing (500) re-uploads everything and still publishes", async () => {
    stub(withExistingBranch(await remoteMirror(), { treeStatus: 500 }));
    const res = await publishToGitHub({ ...files }, target);
    expect(blobPosts()).toHaveLength(3);
    expect(res.commitUrl).toBe("https://github.com/alice/exhibit/commit/c1"); // the publish is NOT failed by it
  });

  it("a FRESH branch (404 on the ref) uploads everything without reading a tree", async () => {
    stub([
      { method: "POST", match: "/git/blobs", json: { sha: "blob1" } },
      { method: "GET", match: "/git/ref/heads/", status: 404 },
      { method: "POST", match: "/git/trees", json: { sha: "tree1" } },
      { method: "POST", match: "/git/commits", json: { sha: "c1", html_url: "https://github.com/alice/exhibit/commit/c1" } },
      { method: "POST", match: "/git/refs/heads/", json: {} },
      { method: "GET", match: "/pages", json: { source: { branch: "gh-pages" } } },
    ]);
    await publishToGitHub({ ...files }, target);
    expect(blobPosts()).toHaveLength(3);
    // No GET of a commit or tree was attempted — there is no base commit to read one from. (The stub
    // would have thrown "unmocked GET", so this also proves the sequence, not just the count.)
    expect(calls().some(([u]) => String(u).includes("/git/commits/"))).toBe(false);
  });
});

describe("ensureRepo — create the target repo (creation only, never mutate an existing one)", () => {
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

  it("201 → 'created', POSTs /user/repos with {name, private:false} and NO auto_init", async () => {
    stub([{ method: "POST", match: "/user/repos", status: 201, json: { id: 1 } }]);
    const result = await ensureRepo("alice", "my-exhibit", "github_pat_x");
    expect(result).toBe("created");
    const calls = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
    const [url, init] = calls[0]!;
    expect(String(url)).toBe("https://api.github.com/user/repos");
    expect((init?.method ?? "GET").toUpperCase()).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ name: "my-exhibit", private: false });
    expect("auto_init" in body).toBe(false);
  });

  it("422 (name already exists) → 'exists', does not throw or mutate", async () => {
    stub([{ method: "POST", match: "/user/repos", status: 422, json: { message: "name already exists on this account" } }]);
    expect(await ensureRepo("alice", "my-exhibit", "github_pat_x")).toBe("exists");
  });

  it("any other status (403 no repo scope) throws a mapped GitHubPublishError", async () => {
    stub([{ method: "POST", match: "/user/repos", status: 403, json: { message: "Forbidden" } }]);
    await expect(ensureRepo("alice", "my-exhibit", "github_pat_x")).rejects.toBeInstanceOf(GitHubPublishError);
  });
});
