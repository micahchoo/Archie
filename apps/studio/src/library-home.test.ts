// Archie-2308 (library home layout) — pure helpers: the project bar's one-line location phrase, the
// Examples-shelf default-open predicate, and the own/example split that leads the grid.
import { describe, it, expect } from "vitest";
import { bindingLocationLabel, examplesDefaultOpen, partitionExhibits } from "./library-home.js";
import type { Binding } from "@render/core";

describe("bindingLocationLabel", () => {
  it("unbound reads as this browser, with no mechanics (SafetyState owns those now)", () => {
    expect(bindingLocationLabel({ kind: "unbound" } as Binding)).toBe("this browser");
  });

  it("says Archie's own folder on DESKTOP — 'this browser' is false there (the resident store is a real folder)", () => {
    expect(bindingLocationLabel({ kind: "unbound" } as Binding, true)).toBe("Archie\u2019s own folder");
  });

  it("a BOUND library reads the same on both platforms — only the unbound default differs", () => {
    const b = { kind: "folder", name: "Field Notes" } as Binding;
    expect(bindingLocationLabel(b, true)).toBe(bindingLocationLabel(b, false));
  });
  it("folder names the folder", () => {
    expect(bindingLocationLabel({ kind: "folder", name: "Field Notes" } as Binding)).toBe("folder “Field Notes”");
  });
  it("file names the file", () => {
    expect(bindingLocationLabel({ kind: "file", name: "library.archie.zip" } as Binding)).toBe("file “library.archie.zip”");
  });
});

describe("examplesDefaultOpen", () => {
  it("expands when the user owns nothing yet", () => {
    expect(examplesDefaultOpen(0)).toBe(true);
  });
  it("auto-collapses once the user has any own exhibit", () => {
    expect(examplesDefaultOpen(1)).toBe(false);
    expect(examplesDefaultOpen(5)).toBe(false);
  });
});

describe("partitionExhibits", () => {
  const exhibits = [
    { slug: "mine-a" },
    { slug: "example-1" },
    { slug: "mine-b" },
    { slug: "example-2" },
  ];
  const isTemplate = (slug: string) => slug.startsWith("example-");

  it("splits into own / examples, preserving each subset's library order", () => {
    const { own, examples } = partitionExhibits(exhibits, isTemplate);
    expect(own.map((e) => e.slug)).toEqual(["mine-a", "mine-b"]);
    expect(examples.map((e) => e.slug)).toEqual(["example-1", "example-2"]);
  });
  it("an all-template library has zero own", () => {
    const { own, examples } = partitionExhibits(exhibits.filter((e) => isTemplate(e.slug)), isTemplate);
    expect(own).toEqual([]);
    expect(examples.length).toBe(2);
  });
  it("an all-own library has zero examples", () => {
    const { own, examples } = partitionExhibits(exhibits.filter((e) => !isTemplate(e.slug)), isTemplate);
    expect(examples).toEqual([]);
    expect(own.length).toBe(2);
  });
});
