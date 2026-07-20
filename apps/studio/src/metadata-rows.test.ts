import { describe, it, expect } from "vitest";
import { DEFAULT_METADATA_FIELDS, METADATA_EXCLUDED_PROPERTIES, type MetadataEntry, isMetadataEntry } from "@render/core";
import {
  addCustom,
  addProperty,
  canMove,
  displayLabelOf,
  isRelabelled,
  levelOf,
  moveRow,
  newRowId,
  overrideLabelOf,
  pickableProperties,
  relabelRow,
  removeRow,
  repeatRow,
  resetLabel,
  runsOf,
  sameEntries,
  seedRows,
  toEntries,
  type MetadataRow,
} from "./metadata-rows.js";

/** Build rows without caring about ids (they are ephemeral view keys). */
const rows = (...specs: Array<Omit<MetadataRow, "id">>): MetadataRow[] =>
  specs.map((s) => ({ id: newRowId(), ...s }));
/** Compare rows by their persisted shape, ignoring ids. */
const shape = (rs: readonly MetadataRow[]) => rs.map(({ id: _id, ...r }) => r);

describe("levelOf", () => {
  it("narrows the three known scopes", () => {
    expect(levelOf("library")).toBe("library");
    expect(levelOf("exhibit")).toBe("exhibit");
    expect(levelOf("object")).toBe("object");
  });
  it("degrades an unknown scope to object (the widest default set)", () => {
    expect(levelOf("note")).toBe("object");
  });
});

describe("seedRows", () => {
  it("seeds the level's default field set as blank rows when nothing is authored", () => {
    for (const level of ["library", "exhibit", "object"] as const) {
      const seeded = seedRows(undefined, level);
      expect(seeded.map((r) => r.property)).toEqual([...DEFAULT_METADATA_FIELDS[level]]);
      expect(seeded.every((r) => r.value === "")).toBe(true);
    }
    expect(seedRows([], "exhibit").map((r) => r.property)).toEqual([...DEFAULT_METADATA_FIELDS.exhibit]);
  });

  it("renders authored entries as themselves, in order, without topping up the defaults", () => {
    const entries: MetadataEntry[] = [
      { property: "dcterms:source", label: "Archive", value: "Beinecke" },
      { property: "dcterms:creator", value: "Unknown scribe" },
    ];
    expect(shape(seedRows(entries, "object"))).toEqual([
      { property: "dcterms:source", label: "Archive", value: "Beinecke" },
      { property: "dcterms:creator", value: "Unknown scribe" },
    ]);
  });

  it("gives every row a distinct id", () => {
    const seeded = seedRows(undefined, "object");
    expect(new Set(seeded.map((r) => r.id)).size).toBe(seeded.length);
  });
});

describe("toEntries — sanitize on write", () => {
  it("drops blank rows and trims values, keeping display order", () => {
    const rs = rows(
      { property: "dcterms:creator", value: "  M. Alexander  " },
      { property: "dcterms:date", value: "" },
      { property: "dcterms:subject", value: "   " },
      { property: "dcterms:type", value: "Manuscript" },
    );
    expect(toEntries(rs)).toEqual([
      { property: "dcterms:creator", value: "M. Alexander" },
      { property: "dcterms:type", value: "Manuscript" },
    ]);
  });

  it("keeps a real label override and drops one that only restates the vocabulary", () => {
    const rs = rows(
      { property: "dcterms:source", label: "Archive", value: "Beinecke" },
      { property: "dcterms:creator", label: "creator", value: "Anon" },
      { property: "dcterms:date", label: "   ", value: "1404" },
    );
    expect(toEntries(rs)).toEqual([
      { property: "dcterms:source", label: "Archive", value: "Beinecke" },
      { property: "dcterms:creator", value: "Anon" },
      { property: "dcterms:date", value: "1404" },
    ]);
  });

  it("keeps free text verbatim — a date is prose, not a parsed value", () => {
    expect(toEntries(rows({ property: "dcterms:date", value: "ca. 1404–1438" }))).toEqual([
      { property: "dcterms:date", value: "ca. 1404–1438" },
    ]);
  });

  it("keeps a custom label-only entry but drops a row that would carry neither property nor label", () => {
    const rs = rows({ label: "Shelfmark", value: "MS 408" }, { label: "  ", value: "orphan" });
    expect(toEntries(rs)).toEqual([{ label: "Shelfmark", value: "MS 408" }]);
  });

  it("only ever emits entries the model's read boundary accepts", () => {
    const rs = rows(
      { property: "dcterms:creator", value: "A" },
      { label: "Shelfmark", value: "MS 408" },
      { property: "dcterms:source", label: "Archive", value: "B" },
    );
    expect(toEntries(rs).every(isMetadataEntry)).toBe(true);
  });

  it("emits no key at all for an absent property or label (byte-absent, not undefined)", () => {
    const [entry] = toEntries(rows({ property: "dcterms:creator", value: "A" }));
    expect(Object.keys(entry!)).toEqual(["property", "value"]);
  });
});

describe("sameEntries", () => {
  it("distinguishes an external change from the echo of our own write", () => {
    const a: MetadataEntry[] = [{ property: "dcterms:creator", value: "A" }];
    expect(sameEntries(a, [{ property: "dcterms:creator", value: "A" }])).toBe(true);
    expect(sameEntries(a, [{ property: "dcterms:creator", value: "B" }])).toBe(false);
    expect(sameEntries(a, [{ property: "dcterms:creator", label: "By", value: "A" }])).toBe(false);
    expect(sameEntries(a, [])).toBe(false);
  });
});

describe("labels", () => {
  it("prefers an override, then the vocabulary label, then the raw property", () => {
    expect(displayLabelOf({ property: "dcterms:creator" })).toBe("Creator");
    expect(displayLabelOf({ property: "dcterms:creator", label: "Scribe" })).toBe("Scribe");
    expect(displayLabelOf({ property: "dcterms:unheardOf" })).toBe("dcterms:unheardOf");
    expect(displayLabelOf({ label: "Shelfmark" })).toBe("Shelfmark");
    expect(displayLabelOf({})).toBe("Field");
  });

  it("marks the spine only while the label really departs from the vocabulary", () => {
    expect(isRelabelled({ property: "dcterms:source", label: "Archive" })).toBe(true);
    expect(isRelabelled({ property: "dcterms:source", label: "source" })).toBe(false);
    expect(isRelabelled({ property: "dcterms:source" })).toBe(false);
    expect(isRelabelled({ label: "Shelfmark" })).toBe(false); // a custom row has no spine to depart from
    expect(overrideLabelOf({ property: "dcterms:source", label: "  Archive " })).toBe("Archive");
  });

  it("relabel drops the key on a vocab row and falls back to Field on a custom row", () => {
    const vocab = rows({ property: "dcterms:source", label: "Archive", value: "B" });
    expect(shape(relabelRow(vocab, 0, ""))).toEqual([{ property: "dcterms:source", value: "B" }]);
    expect(shape(relabelRow(vocab, 0, "Source"))).toEqual([{ property: "dcterms:source", value: "B" }]);
    expect(shape(resetLabel(vocab, 0))).toEqual([{ property: "dcterms:source", value: "B" }]);
    expect(shape(relabelRow(rows({ label: "Shelfmark", value: "x" }), 0, "  "))).toEqual([
      { label: "Field", value: "x" },
    ]);
  });

  it("keeps the row's id across a relabel, so the caret survives", () => {
    const rs = rows({ property: "dcterms:source", value: "B" });
    expect(relabelRow(rs, 0, "Archive")[0]!.id).toBe(rs[0]!.id);
  });
});

describe("runs", () => {
  it("groups contiguous same-property rows and splits on a different one", () => {
    const rs = rows(
      { property: "dcterms:creator", value: "A" },
      { property: "dcterms:creator", value: "B" },
      { property: "dcterms:date", value: "1404" },
      { property: "dcterms:creator", value: "C" },
    );
    expect(runsOf(rs).map((r) => [r.start, r.end])).toEqual([
      [0, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it("groups custom rows by their label", () => {
    const rs = rows({ label: "Shelfmark", value: "a" }, { label: "Shelfmark", value: "b" }, { label: "Box", value: "c" });
    expect(runsOf(rs).map((r) => [r.start, r.end])).toEqual([
      [0, 1],
      [2, 2],
    ]);
  });
});

describe("moveRow — reorder without interleaving", () => {
  const base = () =>
    rows(
      { property: "dcterms:creator", value: "A" },
      { property: "dcterms:creator", value: "B" },
      { property: "dcterms:date", value: "1404" },
      { property: "dcterms:subject", value: "Botany" },
    );

  it("swaps repeated values inside their run", () => {
    const moved = moveRow(base(), 1, -1)!;
    expect(moved.rows.map((r) => r.value)).toEqual(["B", "A", "1404", "Botany"]);
    expect(moved.index).toBe(0);
  });

  it("hops the WHOLE run over its neighbour rather than interleaving properties", () => {
    const moved = moveRow(base(), 2, -1)!; // the Date, upward past the two-row Creator run
    expect(moved.rows.map((r) => r.value)).toEqual(["1404", "A", "B", "Botany"]);
    expect(moved.index).toBe(0);
    expect(runsOf(moved.rows).map((r) => [r.start, r.end])).toEqual([
      [0, 0],
      [1, 2],
      [3, 3],
    ]);
  });

  it("carries the whole run downward and reports the moved row's new index", () => {
    const moved = moveRow(base(), 1, 1)!; // the LAST Creator, downward → the whole Creator run hops the Date
    expect(moved.rows.map((r) => r.value)).toEqual(["1404", "A", "B", "Botany"]);
    expect(moved.index).toBe(2);
    // …while the FIRST Creator moving down still has somewhere to go inside its own run.
    expect(moveRow(base(), 0, 1)!.rows.map((r) => r.value)).toEqual(["B", "A", "1404", "Botany"]);
  });

  it("never leaves a property interleaved, whatever the step", () => {
    let rs = base();
    for (const [i, d] of [
      [0, 1],
      [3, -1],
      [1, 1],
      [2, -1],
    ] as Array<[number, -1 | 1]>) {
      const moved = moveRow(rs, i, d);
      if (moved) rs = moved.rows;
      const keys = runsOf(rs).map((r) => r.key);
      expect(new Set(keys).size).toBe(keys.length); // no property appears in two runs
    }
  });

  it("refuses at the list's ends, and canMove agrees exactly", () => {
    const rs = base();
    expect(moveRow(rs, 0, -1)).toBeNull();
    expect(moveRow(rs, rs.length - 1, 1)).toBeNull();
    for (let i = 0; i < rs.length; i++) {
      for (const d of [-1, 1] as const) {
        expect(canMove(rs, i, d)).toBe(moveRow(rs, i, d) !== null);
      }
    }
  });
});

describe("adding fields", () => {
  it("repeats a field at the END of its run, inheriting the property and the override label", () => {
    const rs = rows(
      { property: "dcterms:creator", value: "A" },
      { property: "dcterms:creator", value: "B" },
      { property: "dcterms:date", value: "1404" },
    );
    const added = repeatRow(rs, 0);
    expect(added.index).toBe(2);
    expect(shape(added.rows)).toEqual([
      { property: "dcterms:creator", value: "A" },
      { property: "dcterms:creator", value: "B" },
      { property: "dcterms:creator", value: "" },
      { property: "dcterms:date", value: "1404" },
    ]);

    const relabelled = repeatRow(rows({ property: "dcterms:source", label: "Archive", value: "x" }), 0);
    expect(shape(relabelled.rows)[1]).toEqual({ property: "dcterms:source", label: "Archive", value: "" });
  });

  it("repeats a custom field by its display label", () => {
    const added = repeatRow(rows({ label: "Shelfmark", value: "MS 408" }), 0);
    expect(shape(added.rows)[1]).toEqual({ label: "Shelfmark", value: "" });
  });

  it("appends a picked property and a custom field at the end", () => {
    const rs = rows({ property: "dcterms:creator", value: "A" });
    expect(shape(addProperty(rs, "dcterms:medium").rows)[1]).toEqual({ property: "dcterms:medium", value: "" });
    expect(addProperty(rs, "dcterms:medium").index).toBe(1);
    expect(shape(addCustom(rs, "  Shelfmark ").rows)[1]).toEqual({ label: "Shelfmark", value: "" });
    expect(shape(addCustom(rs, "").rows)[1]).toEqual({ label: "Field", value: "" });
  });

  it("removes by index", () => {
    const rs = rows({ property: "dcterms:creator", value: "A" }, { property: "dcterms:date", value: "1404" });
    expect(shape(removeRow(rs, 0))).toEqual([{ property: "dcterms:date", value: "1404" }]);
  });
});

describe("pickableProperties", () => {
  it("never offers a property Archie owns natively", () => {
    const offered = pickableProperties([]).map((p) => p.property);
    for (const excluded of METADATA_EXCLUDED_PROPERTIES) expect(offered).not.toContain(excluded);
    expect(offered.length).toBe(50);
  });

  it("hides properties already on screen — a second value comes from the row's +", () => {
    const rs = rows({ property: "dcterms:creator", value: "" }, { label: "Shelfmark", value: "" });
    const offered = pickableProperties(rs).map((p) => p.property);
    expect(offered).not.toContain("dcterms:creator");
    expect(offered).toContain("dcterms:date");
  });

  it("is alphabetical by label", () => {
    const labels = pickableProperties([]).map((p) => p.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it("searches label, property, and comment", () => {
    expect(pickableProperties([], "creator").map((p) => p.property)).toContain("dcterms:creator");
    expect(pickableProperties([], "dcterms:medium").map((p) => p.property)).toEqual(["dcterms:medium"]);
    expect(pickableProperties([], "genre").map((p) => p.property)).toContain("dcterms:type"); // comment hit
    expect(pickableProperties([], "zzz")).toEqual([]);
  });
});
