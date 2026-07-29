import { describe, it, expect, beforeEach, vi } from "vitest";
import { publishBaseFor, rememberTarget, rememberedTarget, forgetTarget } from "./remembered.js";
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
    expect(rememberedTarget("lib-1")).toMatchObject({ target, url: "https://you.github.io/archive/" });
    expect(rememberedTarget("lib-unknown")).toBeNull();
  });
});

// The HOME the publish sheet reads (Q-15). The sheet says "last published <when>" and offers "Change
// where this publishes…", so the store has to carry a timestamp and be clearable — neither of which
// the deploy-only shape needed.
describe("the remembered target as a HOME", () => {
  it("stamps publishedAt when a deploy lands", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00Z"));
    rememberTarget("lib-1", target, "https://you.github.io/archive/");
    expect(rememberedTarget("lib-1")?.publishedAt).toBe(Date.parse("2026-07-28T12:00:00Z"));
    vi.useRealTimers();
  });

  it("forgetTarget clears the home — publishBaseFor goes back to relative with it", () => {
    rememberTarget("lib-1", target, "https://you.github.io/archive/");
    expect(rememberedTarget("lib-1")).not.toBeNull();
    forgetTarget("lib-1");
    expect(rememberedTarget("lib-1")).toBeNull();
    // The base is derived from the same record, so forgetting a home must not leave publishes
    // baking ids against a URL the author has disowned.
    expect(publishBaseFor("lib-1")).toBe("");
  });

  it("forgetTarget on a library with no home is a no-op, not a throw", () => {
    expect(() => forgetTarget("lib-never")).not.toThrow();
    expect(rememberedTarget("lib-never")).toBeNull();
  });

  // Records written before Q-15 have no `publishedAt`. They must still load and still drive the
  // publish base — the field is optional, and a reader that assumes it would strand every author who
  // deployed before this shipped.
  it("loads a LEGACY record that predates publishedAt", () => {
    store.set("archie:deploy:lib-old", JSON.stringify({ target, url: "https://you.github.io/old/" }));
    const got = rememberedTarget("lib-old");
    expect(got).toMatchObject({ target, url: "https://you.github.io/old/" });
    expect(got?.publishedAt).toBeUndefined();
    expect(publishBaseFor("lib-old")).toBe("https://you.github.io/old/");
  });
});
