// The export-fields gate. `canExport` is what every save surface disables its button on, and the
// case that matters is the EMPTY one: a library with nothing to pick still saves.
//
// Regression (2026-07-20, caught by review before it shipped): all three surfaces originally gated on
// `selectedCount(...) > 0`. With no exportable exhibits — a fresh library whose only exhibits are
// bundled templates (App's `exportableExhibits` filters those out), or one whose last exhibit was
// just deleted — the checkbox list renders empty, so the count is permanently 0 and the button can
// never enable. On a browser with no folder picker the zip IS the only save route, and SafetyState
// counts library-level metadata (title/summary/credit) as real work, so the UI demanded a save that
// could not complete, with Cancel the only exit. The guard also contradicted `exportOpts`, which
// already maps the empty case to "whole library".
import { describe, it, expect } from "vitest";
import { allSelected, baseNameOf, canExport, exportOpts, selectedCount } from "./zip-export-opts.js";

const EXHIBITS = [{ slug: "herbal" }, { slug: "recipes" }];

describe("canExport — the save-button gate", () => {
  it("NOTHING to pick still exports: no exhibits ⇒ enabled, and the opts say whole-library", () => {
    expect(canExport({}, [])).toBe(true);
    expect(exportOpts("lib", {}, [])).toEqual({ name: "lib.archie.zip" }); // no `slugs` ⇒ full library
  });

  it("has exhibits but none checked ⇒ blocked (the real 'pick something first')", () => {
    expect(canExport({}, EXHIBITS)).toBe(false);
    expect(canExport({ herbal: false, recipes: false }, EXHIBITS)).toBe(false);
  });

  it("any checked ⇒ enabled, for a subset and for all", () => {
    expect(canExport({ herbal: true }, EXHIBITS)).toBe(true);
    expect(canExport(allSelected(EXHIBITS), EXHIBITS)).toBe(true);
  });
});

describe("exportOpts — name and subset composition", () => {
  it("omits slugs when everything is checked (the pre-chooser contract)", () => {
    expect(exportOpts("lib", allSelected(EXHIBITS), EXHIBITS)).toEqual({ name: "lib.archie.zip" });
  });

  it("carries slugs for a strict subset", () => {
    expect(exportOpts("lib", { herbal: true }, EXHIBITS)).toEqual({ name: "lib.archie.zip", slugs: ["herbal"] });
  });

  it("normalizes the suffix rather than doubling it", () => {
    expect(exportOpts("notes.archie.zip", allSelected(EXHIBITS), EXHIBITS).name).toBe("notes.archie.zip");
    expect(exportOpts("notes.zip", allSelected(EXHIBITS), EXHIBITS).name).toBe("notes.archie.zip");
  });

  it("an empty/whitespace name falls back to the caller's derived name (no `name` key)", () => {
    expect(exportOpts("   ", allSelected(EXHIBITS), EXHIBITS).name).toBe("library.archie.zip");
  });
});

describe("baseNameOf / selectedCount", () => {
  it("strips the suffix for editing and falls back to 'library'", () => {
    expect(baseNameOf("voynich-folios.archie.zip")).toBe("voynich-folios");
    expect(baseNameOf("")).toBe("library");
  });
  it("counts only checked exhibits that still exist", () => {
    expect(selectedCount({ herbal: true, gone: true }, EXHIBITS)).toBe(1);
  });
});
