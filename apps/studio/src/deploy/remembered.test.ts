import { describe, it, expect, beforeEach, vi } from "vitest";
import { publishBaseFor, rememberTarget, rememberedTarget } from "./remembered.js";
import { WORKING_IRI_BASE } from "@render/core";

// The publish base (decided 2026-07-26). A published id should say where the thing actually lives, or
// say nothing — never a placeholder.
//
// WHAT WAS WRONG. `WORKING_IRI_BASE` ("https://archie.demo/") is the Studio's internal identifier
// namespace, and its own doc says it is "never published". It was in fact the base every publish sink
// baked, so every deployed site carried manifest ids, canvas ids and annotation targets on a domain
// nobody owns, and ADR-0021's cite ladder resolved to nothing. Nothing caught it because the tree was
// internally CONSISTENT — ids matched targets, so every round-trip test passed.

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

const target = { owner: "you", repo: "archive", branch: "gh-pages" } as const;

describe("publishBaseFor", () => {
  it("is EMPTY for a library that has never deployed — relative ids, not a placeholder", () => {
    // The honest answer when there is no destination: the tree is self-contained and correct wherever
    // it lands, and a later deploy re-mints every id (rebaseCanvasId) against the real origin.
    expect(publishBaseFor("lib-never")).toBe("");
  });

  it("is the live URL once the library has deployed", () => {
    rememberTarget("lib-1", target, "https://you.github.io/archive/");
    expect(publishBaseFor("lib-1")).toBe("https://you.github.io/archive/");
  });

  it("adds the trailing slash publishLibrary's join needs", () => {
    // publishLibrary builds `${base}${slug}/…`, so a base without the slash silently produces
    // "…/archivevoynich/canvas/o1" — a broken id that still looks like a URL.
    rememberTarget("lib-2", target, "https://you.github.io/archive");
    expect(publishBaseFor("lib-2")).toBe("https://you.github.io/archive/");
  });

  it("NEVER returns the working-store namespace", () => {
    // The regression guard. Whatever else changes here, `archie.demo` must not reach a published tree.
    for (const id of ["lib-never", "lib-1"]) {
      expect(publishBaseFor(id)).not.toContain("archie.demo");
      expect(publishBaseFor(id)).not.toBe(WORKING_IRI_BASE);
    }
    rememberTarget("lib-1", target, "https://you.github.io/archive/");
    expect(publishBaseFor("lib-1")).not.toContain("archie.demo");
  });

  it("degrades to relative when the remembered entry is corrupt or has no url", () => {
    store.set("archie:deploy:lib-3", "{ not json");
    expect(publishBaseFor("lib-3")).toBe("");
    store.set("archie:deploy:lib-4", JSON.stringify({ target }));
    expect(publishBaseFor("lib-4")).toBe("");
  });
});

describe("rememberedTarget round trip", () => {
  it("returns what was stored, and null for an unknown library", () => {
    rememberTarget("lib-1", target, "https://you.github.io/archive/");
    expect(rememberedTarget("lib-1")).toEqual({ target, url: "https://you.github.io/archive/" });
    expect(rememberedTarget("lib-unknown")).toBeNull();
  });
});
