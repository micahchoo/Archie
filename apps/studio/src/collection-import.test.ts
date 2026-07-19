import { describe, it, expect } from "vitest";
import {
  collectionToRefs,
  traverseCollection,
  type FetchJson,
  type TraverseCaps,
} from "./collection-import.js";

// A fake fetcher over an in-memory url → document map. Any url mapped to the FAIL sentinel throws,
// so fetch-failure is a counted skip, not a thrown test.
const FAIL = Symbol("fetch-fail");
function fakeFetcher(docs: Record<string, unknown | typeof FAIL>): FetchJson {
  return async (url) => {
    if (!(url in docs)) throw new Error(`no such doc: ${url}`);
    const d = docs[url];
    if (d === FAIL) throw new Error(`fetch failed: ${url}`);
    return d;
  };
}

const p3Collection = (id: string, label: string, items: unknown[]) => ({
  "@context": "https://iiif.io/api/presentation/3/context.json",
  id,
  type: "Collection",
  label: { none: [label] },
  items,
});
const p3ManifestRef = (id: string, label?: string) => ({
  id,
  type: "Manifest",
  ...(label ? { label: { none: [label] } } : {}),
});
const p3CollectionRef = (id: string, label?: string) => ({
  id,
  type: "Collection",
  ...(label ? { label: { none: [label] } } : {}),
});

describe("collectionToRefs — P3 items", () => {
  it("reads typed member refs with inline labels, in document order", () => {
    const doc = p3Collection("https://c/root", "Root", [
      p3ManifestRef("https://c/m1", "Manifest One"),
      p3CollectionRef("https://c/sub", "Sub"),
      p3ManifestRef("https://c/m2", "Manifest Two"),
    ]);
    expect(collectionToRefs(doc, "https://c/root")).toEqual([
      { id: "https://c/m1", kind: "manifest", label: "Manifest One" },
      { id: "https://c/sub", kind: "collection", label: "Sub" },
      { id: "https://c/m2", kind: "manifest", label: "Manifest Two" },
    ]);
  });

  it("omits label when the collection inlined none (SHOULD, not MUST)", () => {
    const doc = p3Collection("https://c/root", "Root", [p3ManifestRef("https://c/m1")]);
    const refs = collectionToRefs(doc, "https://c/root");
    expect(refs).toEqual([{ id: "https://c/m1", kind: "manifest" }]);
    expect("label" in refs[0]!).toBe(false);
  });

  it("defaults a member with no type to a manifest", () => {
    const doc = p3Collection("https://c/root", "Root", [{ id: "https://c/m1", label: { none: ["Untyped"] } }]);
    expect(collectionToRefs(doc, "https://c/root")[0]).toEqual({
      id: "https://c/m1",
      kind: "manifest",
      label: "Untyped",
    });
  });
});

describe("collectionToRefs — P2 shapes", () => {
  it("reads P2 members[] with @id/@type", () => {
    const doc = {
      "@id": "http://c/root",
      "@type": "sc:Collection",
      members: [
        { "@id": "http://c/m1", "@type": "sc:Manifest", label: "M1" },
        { "@id": "http://c/sub", "@type": "sc:Collection", label: "Sub" },
      ],
    };
    expect(collectionToRefs(doc, "http://c/root")).toEqual([
      { id: "http://c/m1", kind: "manifest", label: "M1" },
      { id: "http://c/sub", kind: "collection", label: "Sub" },
    ]);
  });

  it("reads P2 split collections[]/manifests[] with forced kinds", () => {
    const doc = {
      "@id": "http://c/root",
      "@type": "sc:Collection",
      collections: [{ "@id": "http://c/sub", label: "Sub" }],
      manifests: [{ "@id": "http://c/m1", label: "M1" }],
    };
    expect(collectionToRefs(doc, "http://c/root")).toEqual([
      { id: "http://c/sub", kind: "collection", label: "Sub" },
      { id: "http://c/m1", kind: "manifest", label: "M1" },
    ]);
  });

  it("dedupes when a P2 doc carries BOTH members[] and the split arrays (members order wins)", () => {
    const doc = {
      "@id": "http://c/root",
      "@type": "sc:Collection",
      members: [
        { "@id": "http://c/m1", "@type": "sc:Manifest", label: "M1" },
        { "@id": "http://c/sub", "@type": "sc:Collection", label: "Sub" },
      ],
      collections: [{ "@id": "http://c/sub", label: "Sub (dup)" }],
      manifests: [{ "@id": "http://c/m1", label: "M1 (dup)" }],
    };
    expect(collectionToRefs(doc, "http://c/root")).toEqual([
      { id: "http://c/m1", kind: "manifest", label: "M1" },
      { id: "http://c/sub", kind: "collection", label: "Sub" },
    ]);
  });

  it("returns [] for a non-object", () => {
    expect(collectionToRefs(null, "u")).toEqual([]);
    expect(collectionToRefs("nope", "u")).toEqual([]);
  });
});

describe("traverseCollection — flatten in document order", () => {
  it("emits root manifests in order with the root label trail", async () => {
    const root = p3Collection("https://c/root", "Root", [
      p3ManifestRef("https://c/m1", "One"),
      p3ManifestRef("https://c/m2", "Two"),
    ]);
    const r = await traverseCollection(root, "https://c/root", fakeFetcher({}));
    expect(r.status).toBe("ok");
    expect(r.manifests).toEqual([
      { id: "https://c/m1", label: "One", trail: ["Root"] },
      { id: "https://c/m2", label: "Two", trail: ["Root"] },
    ]);
    expect(r.skips).toEqual([]);
    expect(r.docsAttempted).toBe(1);
    expect(r.manifestCount).toBe(2);
  });

  it("descends sub-collections depth-first, carrying the parent label trail", async () => {
    const root = p3Collection("https://c/root", "Root", [
      p3CollectionRef("https://c/sub", "Sub"),
      p3ManifestRef("https://c/m3", "Three"),
    ]);
    const sub = p3Collection("https://c/sub", "Sub", [
      p3ManifestRef("https://c/m1", "One"),
      p3ManifestRef("https://c/m2", "Two"),
    ]);
    const r = await traverseCollection(root, "https://c/root", fakeFetcher({ "https://c/sub": sub }));
    // DFS document order: sub's manifests come before the root's later manifest m3.
    expect(r.manifests).toEqual([
      { id: "https://c/m1", label: "One", trail: ["Root", "Sub"] },
      { id: "https://c/m2", label: "Two", trail: ["Root", "Sub"] },
      { id: "https://c/m3", label: "Three", trail: ["Root"] },
    ]);
    expect(r.docsAttempted).toBe(2);
  });

  it("uses the fetched child's own label for the trail when the ref had none inline", async () => {
    const root = p3Collection("https://c/root", "Root", [p3CollectionRef("https://c/sub")]);
    const sub = p3Collection("https://c/sub", "Real Sub Label", [p3ManifestRef("https://c/m1", "One")]);
    const r = await traverseCollection(root, "https://c/root", fakeFetcher({ "https://c/sub": sub }));
    expect(r.manifests[0]!.trail).toEqual(["Root", "Real Sub Label"]);
  });

  it("terminates on a cycle (child links back to root)", async () => {
    const root = p3Collection("https://c/root", "Root", [p3CollectionRef("https://c/a", "A")]);
    const a = p3Collection("https://c/a", "A", [
      p3ManifestRef("https://c/m1", "One"),
      p3CollectionRef("https://c/root", "Back to root"),
    ]);
    const r = await traverseCollection(root, "https://c/root", fakeFetcher({ "https://c/a": a }));
    expect(r.manifests.map((m) => m.id)).toEqual(["https://c/m1"]);
    expect(r.skips).toEqual([
      { reason: "duplicate", id: "https://c/root", kind: "collection", label: "Back to root", trail: ["Root", "A"] },
    ]);
  });

  it("dedupes a manifest reached down two branches — it appears once, the second is a skip", async () => {
    const root = p3Collection("https://c/root", "Root", [
      p3CollectionRef("https://c/a", "A"),
      p3CollectionRef("https://c/b", "B"),
    ]);
    const shared = p3ManifestRef("https://c/shared", "Shared");
    const a = p3Collection("https://c/a", "A", [shared]);
    const b = p3Collection("https://c/b", "B", [shared]);
    const r = await traverseCollection(
      root,
      "https://c/root",
      fakeFetcher({ "https://c/a": a, "https://c/b": b }),
    );
    expect(r.manifests).toEqual([{ id: "https://c/shared", label: "Shared", trail: ["Root", "A"] }]);
    expect(r.skips).toEqual([
      { reason: "duplicate", id: "https://c/shared", kind: "manifest", label: "Shared", trail: ["Root", "B"] },
    ]);
  });
});

describe("traverseCollection — caps and skip accounting", () => {
  const caps = (over: Partial<TraverseCaps>): TraverseCaps => ({ depth: 3, docs: 25, manifests: 1000, ...over });

  it("skips a sub-collection past the depth cap, keeping manifests at the cap depth", async () => {
    // root(0) → c1(1) → c2(2) → c3(3): c3's manifest is kept, c3's sub-collection would be depth 4.
    const root = p3Collection("root", "R", [p3CollectionRef("c1")]);
    const c1 = p3Collection("c1", "C1", [p3CollectionRef("c2")]);
    const c2 = p3Collection("c2", "C2", [p3CollectionRef("c3")]);
    const c3 = p3Collection("c3", "C3", [p3ManifestRef("m3", "deep"), p3CollectionRef("c4", "too deep")]);
    const r = await traverseCollection(
      root,
      "root",
      fakeFetcher({ c1, c2, c3, c4: p3Collection("c4", "C4", []) }),
      caps({ depth: 3 }),
    );
    expect(r.manifests.map((m) => m.id)).toEqual(["m3"]);
    expect(r.skips).toEqual([
      { reason: "depth-cap", id: "c4", kind: "collection", label: "too deep", trail: ["R", "C1", "C2", "C3"] },
    ]);
    expect(r.docsAttempted).toBe(4); // root + c1 + c2 + c3; c4 never fetched (depth-capped, no attempt)
  });

  it("skips sub-collections past the document-fetch cap (root counts toward the budget)", async () => {
    const root = p3Collection("root", "R", [p3CollectionRef("c1", "C1"), p3CollectionRef("c2", "C2")]);
    const c1 = p3Collection("c1", "C1", [p3ManifestRef("m1", "One")]);
    const c2 = p3Collection("c2", "C2", [p3ManifestRef("m2", "Two")]);
    const r = await traverseCollection(root, "root", fakeFetcher({ c1, c2 }), caps({ docs: 2 }));
    // budget 2 = root + one fetch; c1 fetched, c2 refused.
    expect(r.manifests.map((m) => m.id)).toEqual(["m1"]);
    expect(r.skips).toEqual([
      { reason: "doc-cap", id: "c2", kind: "collection", label: "C2", trail: ["R"] },
    ]);
    expect(r.docsAttempted).toBe(2);
  });

  it("flags over-manifest-cap while still reporting the true total", async () => {
    const root = p3Collection("root", "R", [
      p3ManifestRef("m1"),
      p3ManifestRef("m2"),
      p3ManifestRef("m3"),
    ]);
    const r = await traverseCollection(root, "root", fakeFetcher({}), caps({ manifests: 2 }));
    expect(r.status).toBe("over-manifest-cap");
    expect(r.manifestCount).toBe(3);
    expect(r.manifests).toHaveLength(3);
  });

  it("counts a sub-collection fetch failure as a skip and continues with siblings", async () => {
    const root = p3Collection("root", "R", [
      p3CollectionRef("cfail", "Broken"),
      p3CollectionRef("cok", "Ok"),
    ]);
    const cok = p3Collection("cok", "Ok", [p3ManifestRef("m1", "One")]);
    const r = await traverseCollection(root, "root", fakeFetcher({ cfail: FAIL, cok }));
    expect(r.manifests.map((m) => m.id)).toEqual(["m1"]);
    expect(r.skips).toEqual([
      { reason: "fetch-failed", id: "cfail", kind: "collection", label: "Broken", trail: ["R"], error: "fetch failed: cfail" },
    ]);
    expect(r.docsAttempted).toBe(3); // root + cfail attempt + cok; a failed fetch STILL spends a slot
  });

  it("bounds fetch ATTEMPTS (not just successes) under an all-failing hostile root", async () => {
    // A root listing 5 broken sub-collections against a 3-doc budget: root + 2 attempts, then the
    // budget is spent — the rest are doc-cap skips with NO fetch attempted.
    const root = p3Collection("root", "R", [
      p3CollectionRef("c1", "C1"),
      p3CollectionRef("c2", "C2"),
      p3CollectionRef("c3", "C3"),
      p3CollectionRef("c4", "C4"),
      p3CollectionRef("c5", "C5"),
    ]);
    let attempts = 0;
    const counting: FetchJson = async (url) => {
      attempts++;
      throw new Error(`down: ${url}`);
    };
    const r = await traverseCollection(root, "root", counting, caps({ docs: 3 }));
    expect(attempts).toBe(2); // NOT 5 — the budget caps attempts, the whole point of the fix
    expect(r.docsAttempted).toBe(3); // root + 2 attempts
    expect(r.skips.map((s) => [s.reason, s.id])).toEqual([
      ["fetch-failed", "c1"],
      ["fetch-failed", "c2"],
      ["doc-cap", "c3"],
      ["doc-cap", "c4"],
      ["doc-cap", "c5"],
    ]);
    expect(r.manifests).toEqual([]);
  });
});
