// Merge-preserving regen (Archie-9b93) — the index-merge invariants: generated wins collisions,
// carried exhibits append (re-numbered), collection items follow the same membership, and a
// carried card whose dir vanished does not resurrect.
import { describe, it, expect } from "vitest";
import type { ExhibitsJson } from "../iiif/exhibits.js";
import type { IIIFCollection } from "../iiif/presentation.js";
import { mergePublishedIndexes, collectionItemSlug } from "./merge.js";

const BASE = "https://u.gh.io/lib/";
const card = (slug: string, order: number) => ({ slug, title: slug, order });
const item = (slug: string) => ({ id: `${BASE}${slug}/manifest.json`, type: "Manifest" as const, label: { en: [slug] } });
const indexes = (slugs: string[], libId = "L"): { exhibits: ExhibitsJson; collection: IIIFCollection } => ({
  exhibits: { library: { id: libId }, exhibits: slugs.map(card), presentation: {} },
  collection: { "@context": "ctx", id: `${BASE}collection.json`, type: "Collection", label: { en: ["L"] }, items: slugs.map(item) } as unknown as IIIFCollection,
});

describe("collectionItemSlug", () => {
  it("extracts the slug from a manifest item id", () => {
    expect(collectionItemSlug(item("voynich"))).toBe("voynich");
    expect(collectionItemSlug({ id: "weird" })).toBeNull();
  });
});

describe("mergePublishedIndexes", () => {
  it("no existing tree → generated as-is", () => {
    const g = indexes(["voynich"]);
    const m = mergePublishedIndexes(g, null);
    expect(m.preservedSlugs).toEqual([]);
    expect(m.exhibits).toBe(g.exhibits);
  });

  it("carries existing exhibits the generation doesn't own; generated wins collisions", () => {
    const m = mergePublishedIndexes(indexes(["voynich", "av"]), indexes(["voynich", "language-atlas"]));
    expect(m.preservedSlugs).toEqual(["language-atlas"]);
    expect(m.exhibits.exhibits.map((c) => [c.slug, c.order])).toEqual([["voynich", 0], ["av", 1], ["language-atlas", 2]]);
    expect(m.collection.items.map((i) => collectionItemSlug(i))).toEqual(["voynich", "av", "language-atlas"]);
    // the colliding voynich is the GENERATED one (slug appears once)
    expect(m.exhibits.exhibits.filter((c) => c.slug === "voynich")).toHaveLength(1);
  });

  it("a carried card whose dir is gone does not resurrect", () => {
    const m = mergePublishedIndexes(indexes(["voynich"]), indexes(["language-atlas", "deleted-one"]), {
      dirExists: (slug) => slug !== "deleted-one",
    });
    expect(m.preservedSlugs).toEqual(["language-atlas"]);
  });

  it("library identity (title/rights) comes from the GENERATION", () => {
    const g = indexes(["voynich"], "mine");
    const m = mergePublishedIndexes(g, indexes(["language-atlas"], "theirs"));
    expect(m.exhibits.library.id).toBe("mine");
  });
});
