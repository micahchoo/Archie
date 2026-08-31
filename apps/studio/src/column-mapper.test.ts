// Characterization for the mapping-step machinery extracted from MetadataImport.svelte
// (Archie-96e6). Written BEFORE the component was rewired: every semantic here was transcribed from
// the shipped component (Archie-3754, c800a83) — setTarget's padding, the dropdown's group order,
// the FieldTarget value encoding, and the DC_OPTIONS exclusion filter — so the extraction is judged
// against the behavior that already shipped, not against a re-derivation of it.
import { describe, it, expect } from "vitest";
import { groupOptions, setTargetAt, type MapperOption } from "./column-mapper.js";
import {
  dctermsFieldOptions,
  fieldTargetValue,
  parseFieldTargetValue,
  suggestMapping,
} from "./metadata-import.js";

describe("setTargetAt — the per-column dropdown grid (was MetadataImport.setTarget)", () => {
  it("pads to the header's width, so a choice made late can't misalign or crash", () => {
    expect(setTargetAt([], 2, "dcterms:creator", 5)).toEqual(["", "", "dcterms:creator", "", ""]);
  });
  it("overwrites exactly one column and preserves the rest", () => {
    expect(setTargetAt(["", "native:label", ""], 0, "dcterms:creator", 3)).toEqual([
      "dcterms:creator",
      "native:label",
      "",
    ]);
  });
  it("returns a new array — the host's $state must be replaced, not mutated", () => {
    const grid = ["", ""];
    const next = setTargetAt(grid, 1, "native:rights", 2);
    expect(next).not.toBe(grid);
    expect(grid).toEqual(["", ""]);
  });
  it("a grid wider than the header is left alone (no truncation of stale columns)", () => {
    expect(setTargetAt(["a", "b", "c"], 0, "x", 2)).toEqual(["x", "b", "c"]);
  });
});

describe("groupOptions — the dropdown's optgroup runs (was MetadataImport's markup)", () => {
  const options: MapperOption[] = [
    { value: "", label: "Don't import" },
    { value: "native:label", label: "Title", group: "Archie's own fields" },
    { value: "dcterms:creator", label: "Creator", group: "Dublin Core" },
    { value: "dcterms:date", label: "Date", group: "Dublin Core" },
  ];
  it("the flat run renders before the named groups; groups keep first-appearance order", () => {
    expect(groupOptions(options)).toEqual([
      { name: "", options: [{ value: "", label: "Don't import" }] },
      {
        name: "Archie's own fields",
        options: [{ value: "native:label", label: "Title", group: "Archie's own fields" }],
      },
      {
        name: "Dublin Core",
        options: [
          { value: "dcterms:creator", label: "Creator", group: "Dublin Core" },
          { value: "dcterms:date", label: "Date", group: "Dublin Core" },
        ],
      },
    ]);
  });
  it("no grouped options → one flat run (the annotation mapper's shape)", () => {
    expect(groupOptions([{ value: "object", label: "Object" }, { value: "comment", label: "Comment" }])).toEqual([
      {
        name: "",
        options: [
          { value: "object", label: "Object" },
          { value: "comment", label: "Comment" },
        ],
      },
    ]);
  });
});

describe("fieldTargetValue / parseFieldTargetValue — the dropdown value encoding", () => {
  it("round-trips every target kind", () => {
    const targets = [
      { kind: "ignore" },
      { kind: "native", field: "label" },
      { kind: "native", field: "summary" },
      { kind: "native", field: "rights" },
      { kind: "native", field: "credit" },
      { kind: "dcterms", property: "dcterms:creator" },
    ] as const;
    for (const t of targets) expect(parseFieldTargetValue(fieldTargetValue(t))).toEqual(t);
  });
  it("'' decodes to ignore; undefined and ignore both encode to '' (an unmapped dropdown slot)", () => {
    expect(parseFieldTargetValue("")).toEqual({ kind: "ignore" });
    expect(fieldTargetValue(undefined)).toBe("");
    expect(fieldTargetValue({ kind: "ignore" })).toBe("");
  });
  it("native: and dcterms: namespaces never collide as dropdown values", () => {
    expect(fieldTargetValue({ kind: "native", field: "rights" })).toBe("native:rights");
    expect(parseFieldTargetValue("native:rights")).toEqual({ kind: "native", field: "rights" });
    expect(parseFieldTargetValue("dcterms:rights")).toEqual({ kind: "dcterms", property: "dcterms:rights" });
  });
});

describe("dctermsFieldOptions — the Dublin Core run of the dropdown (was MetadataImport.DC_OPTIONS)", () => {
  it("offers every DCTERMS property EXCEPT the ones a native field already covers", () => {
    const offered = dctermsFieldOptions().map((p) => p.property);
    expect(offered).not.toContain("dcterms:title"); // "Title" means native:label
    expect(offered).not.toContain("dcterms:description");
    expect(offered).not.toContain("dcterms:rights");
    expect(offered).toContain("dcterms:creator");
    expect(new Set(offered).size).toBe(offered.length); // no repeats in the dropdown
  });
  it("whatever suggestMapping guesses as dcterms is always OFFERED — a suggestion the dropdown can't display would silently reset on first render", () => {
    const offered = dctermsFieldOptions().map((p) => p.property);
    const header = ["title", "creator", "date", "subject", "type", "format", "coverage"];
    for (const target of suggestMapping(header)) {
      if (target.kind === "dcterms") expect(offered).toContain(target.property);
    }
  });
});
