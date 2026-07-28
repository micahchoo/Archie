// Catalogue-spreadsheet metadata import (Archie-3754). The four contracts named in metadata-import.ts's
// header each have a section here; the patch-shape section is the one that pins
// .claude/rules/metadata-rights-keyed-writebacks.md, and it is written to fail if a patch ever grows a key
// no column was mapped to.
import { describe, it, expect } from "vitest";
import {
  buildMatchIndex,
  buildMetadataCsvTemplate,
  filenameKeysOf,
  identifierOf,
  matchRow,
  mergeMetadata,
  planMetadataImport,
  resolveLicense,
  suggestMapping,
  suggestMatchColumn,
  summarizePlan,
  templateMapping,
  type ColumnMapping,
  type FieldTarget,
  type ImportObject,
  type ObjectFieldsPatch,
} from "./metadata-import.js";

// --- fixtures ---------------------------------------------------------------------------------

const obj = (over: Partial<ImportObject> & { id: string }): ImportObject => ({
  source: `/assets/${over.id}-file.jpg`,
  label: "file",
  ...over,
});

/** Three objects shaped the way Studio's importer actually leaves them (ingest-flows.ts:563): the label
 *  is the user's filename minus its extension, the source is the `{id}-{safe}` storage path. */
const OBJECTS: ImportObject[] = [
  obj({ id: "o1", source: "/assets/o1-plate-01.jpg", label: "plate-01" }),
  obj({ id: "o2", source: "/assets/o2-plate-02.jpg", label: "plate-02", summary: "A second plate." }),
  obj({
    id: "o3",
    source: "https://example.org/iiif/folio-9/info.json",
    label: "folio-9",
    rights: "http://creativecommons.org/licenses/by/4.0/",
    metadata: [
      { property: "dcterms:identifier", value: "ACC-003" },
      { label: "Shelfmark", value: "MS 12" }, // a verbatim entry — no property, must never be disturbed
      { property: "dcterms:creator", value: "Unknown" },
    ],
  }),
];

const IGNORE: FieldTarget = { kind: "ignore" };
const map = (targets: FieldTarget[], matchColumn: number, matchKey: ColumnMapping["matchKey"]): ColumnMapping =>
  ({ targets, matchColumn, matchKey });

/** What `lib.patchObject` does — `{ ...o, ...fields }` (library-meta-reducers.ts:64). Applying a plan
 *  through the same shape is what makes the idempotence assertions mean anything. */
function apply(objects: ImportObject[], plan: ReturnType<typeof planMetadataImport>): ImportObject[] {
  const patches = new Map(plan.updates.map((u) => [u.objectId, u.patch]));
  return objects.map((o) => (patches.has(o.id) ? { ...o, ...patches.get(o.id)! } : o));
}

// --- matching ---------------------------------------------------------------------------------

describe("matching, by each key the curator can pick", () => {
  it("archieId matches Archie's own object id", () => {
    const idx = buildMatchIndex(OBJECTS, "archieId");
    expect(matchRow(idx, "o2")).toEqual({ kind: "one", objectId: "o2" });
    expect(matchRow(idx, "O2")).toEqual({ kind: "one", objectId: "o2" }); // case-insensitive
    expect(matchRow(idx, "o9")).toEqual({ kind: "none" });
  });

  it("filename matches the label, the stored source basename, and either without its extension", () => {
    const idx = buildMatchIndex(OBJECTS, "filename");
    expect(matchRow(idx, "plate-01")).toEqual({ kind: "one", objectId: "o1" }); // the label, verbatim
    expect(matchRow(idx, "plate-01.jpg")).toEqual({ kind: "one", objectId: "o1" }); // ext dropped
    expect(matchRow(idx, "plate-01.tif")).toEqual({ kind: "one", objectId: "o1" }); // ext CHANGED by the TIFF path
    expect(matchRow(idx, "o1-plate-01.jpg")).toEqual({ kind: "one", objectId: "o1" }); // the storage name
    expect(matchRow(idx, "scans/2024/plate-02.jpg")).toEqual({ kind: "one", objectId: "o2" }); // a path cell
  });

  it("filename prefers an EXACT name over an extension-stripped one, so two formats of one plate stay distinct", () => {
    const both = [
      obj({ id: "a", source: "/assets/a-plate.tif", label: "plate.tif" }),
      obj({ id: "b", source: "/assets/b-plate.jpg", label: "plate.jpg" }),
    ];
    const idx = buildMatchIndex(both, "filename");
    expect(matchRow(idx, "plate.tif")).toEqual({ kind: "one", objectId: "a" });
    expect(matchRow(idx, "plate.jpg")).toEqual({ kind: "one", objectId: "b" });
    // "plate" is only reachable through the loose tier, where both objects sit — an ambiguity, not a guess.
    expect(matchRow(idx, "plate")).toEqual({ kind: "ambiguous", count: 2 });
  });

  it("path matches the object's source as stored, including a remote one", () => {
    const idx = buildMatchIndex(OBJECTS, "path");
    expect(matchRow(idx, "/assets/o1-plate-01.jpg")).toEqual({ kind: "one", objectId: "o1" });
    expect(matchRow(idx, "https://example.org/iiif/folio-9/info.json")).toEqual({ kind: "one", objectId: "o3" });
    expect(matchRow(idx, "plate-01")).toEqual({ kind: "none" }); // path is whole-string; it is not filename
  });

  it("identifier matches an object's existing dcterms:identifier", () => {
    const idx = buildMatchIndex(OBJECTS, "identifier");
    expect(identifierOf(OBJECTS[2]!)).toBe("ACC-003");
    expect(matchRow(idx, "ACC-003")).toEqual({ kind: "one", objectId: "o3" });
    expect(matchRow(idx, "ACC-001")).toEqual({ kind: "none" }); // o1 carries no identifier yet
  });

  it("filenameKeysOf splits exact from loose and never repeats a key", () => {
    const keys = filenameKeysOf(obj({ id: "o1", source: "/assets/o1-plate-01.jpg", label: "plate-01" }));
    expect(keys.exact).toContain("plate-01");
    expect(keys.exact).toContain("o1-plate-01.jpg");
    expect(keys.loose).toContain("plate-01.jpg");
    expect(new Set(keys.exact).size).toBe(keys.exact.length);
    expect(keys.exact.some((k) => keys.loose.includes(k))).toBe(false);
  });
});

// --- the patch shape (the rule this feature is bound by) ---------------------------------------

describe("the patch is a KEYED PARTIAL — it carries only what a column was mapped to", () => {
  const header = ["file", "Object Title", "Creator"];

  it("a patch built from title+creator carries label and metadata and NOTHING else", () => {
    const plan = planMetadataImport(
      `${header.join(",")}\nplate-01,The First Plate,A. Curator\n`,
      map([IGNORE, { kind: "native", field: "label" }, { kind: "dcterms", property: "dcterms:creator" }], 0, "filename"),
      { objects: OBJECTS },
    );
    expect(plan.updates).toHaveLength(1);
    expect(Object.keys(plan.updates[0]!.patch).sort()).toEqual(["label", "metadata"]);
  });

  it("NO mapping of any shape ever produces a key outside the fields it names", () => {
    // The exhaustive form of the rule: for every single-target mapping, the patch's key set must be
    // exactly the key that target owns. A patch that grew `rights` while only `label` was mapped — the
    // whole-RightsFields clobber metadata-rights-keyed-writebacks forbids — fails here.
    const cases: { target: FieldTarget; cell: string; keys: (keyof ObjectFieldsPatch)[] }[] = [
      { target: { kind: "native", field: "label" }, cell: "New title", keys: ["label"] },
      { target: { kind: "native", field: "summary" }, cell: "New words", keys: ["summary"] },
      { target: { kind: "native", field: "rights" }, cell: "CC BY 4.0", keys: ["rights"] },
      { target: { kind: "native", field: "credit" }, cell: "Courtesy of X", keys: ["requiredStatement"] },
      { target: { kind: "dcterms", property: "dcterms:date" }, cell: "1610", keys: ["metadata"] },
      { target: { kind: "dcterms", property: "dcterms:subject" }, cell: "Botany", keys: ["metadata"] },
    ];
    for (const c of cases) {
      const plan = planMetadataImport(
        `file,value\nplate-01,${c.cell}\n`,
        map([IGNORE, c.target], 0, "filename"),
        { objects: OBJECTS },
      );
      expect(plan.updates, `${JSON.stringify(c.target)} produced no update`).toHaveLength(1);
      expect(Object.keys(plan.updates[0]!.patch).sort(), `patch for ${JSON.stringify(c.target)}`).toEqual([...c.keys].sort());
    }
  });

  it("mapping a license never touches credit or metadata, and mapping credit never touches the license", () => {
    // o3 carries all three; a single-field import must leave the other two absent from the patch.
    const licensePlan = planMetadataImport(
      "file,rights\nfolio-9,CC0 1.0 — Public Domain Dedication\n",
      map([IGNORE, { kind: "native", field: "rights" }], 0, "filename"),
      { objects: OBJECTS },
    );
    expect(Object.keys(licensePlan.updates[0]!.patch)).toEqual(["rights"]);

    const creditPlan = planMetadataImport(
      "file,credit\nfolio-9,Courtesy of the Institute\n",
      map([IGNORE, { kind: "native", field: "credit" }], 0, "filename"),
      { objects: OBJECTS },
    );
    expect(Object.keys(creditPlan.updates[0]!.patch)).toEqual(["requiredStatement"]);
  });

  it("a credit patch preserves an object's own custom attribution label", () => {
    const custom = [obj({ id: "o1", label: "plate-01", requiredStatement: { label: "Collection", value: "Old" } })];
    const plan = planMetadataImport(
      "file,credit\nplate-01,New credit\n",
      map([IGNORE, { kind: "native", field: "credit" }], 0, "filename"),
      { objects: custom },
    );
    expect(plan.updates[0]!.patch.requiredStatement).toEqual({ label: "Collection", value: "New credit" });
  });
});

// --- blank cells, and the metadata merge -------------------------------------------------------

describe("a blank cell says nothing — it never clears", () => {
  it("a mapped column with an empty cell contributes no key", () => {
    const plan = planMetadataImport(
      "file,Object Title,Creator\nplate-02,,\n",
      map([IGNORE, { kind: "native", field: "label" }, { kind: "dcterms", property: "dcterms:creator" }], 0, "filename"),
      { objects: OBJECTS },
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
    expect(plan.skipped).toHaveLength(0);
  });

  it("a row whose only effect would be collapsing a pre-existing duplicate reads as unchanged, and writes nothing", () => {
    // The one way `changes` and `patch` could disagree: mergeMetadata returns a shorter array (the
    // duplicate collapsed) while no VALUE differs. The planner must not preview an empty row or write
    // a tidy-up the sheet never asked for.
    const doubled = [obj({
      id: "o1", label: "plate-01",
      metadata: [{ property: "dcterms:creator", value: "Unknown" }, { property: "dcterms:creator", value: "Unknown" }],
    })];
    const plan = planMetadataImport(
      "file,Creator\nplate-01,Unknown\n",
      map([IGNORE, { kind: "dcterms", property: "dcterms:creator" }], 0, "filename"),
      { objects: doubled },
    );
    expect(plan.updates).toEqual([]);
    expect(plan.unchanged).toBe(1);
  });

  it("a blank dcterms cell leaves the stored entry standing", () => {
    // o3 has dcterms:creator "Unknown". Blank creator + a real date must keep the creator.
    const plan = planMetadataImport(
      "file,Creator,Date\nfolio-9,,1610\n",
      map([IGNORE, { kind: "dcterms", property: "dcterms:creator" }, { kind: "dcterms", property: "dcterms:date" }], 0, "filename"),
      { objects: OBJECTS },
    );
    const metadata = plan.updates[0]!.patch.metadata!;
    expect(metadata.find((e) => e.property === "dcterms:creator")?.value).toBe("Unknown");
    expect(metadata.find((e) => e.property === "dcterms:date")?.value).toBe("1610");
  });
});

describe("mergeMetadata", () => {
  const existing = OBJECTS[2]!.metadata!;

  it("replaces a mapped property IN PLACE and leaves unmapped entries untouched, in order", () => {
    const merged = mergeMetadata(existing, [{ property: "dcterms:creator", value: "A. Curator" }])!;
    expect(merged.map((e) => e.property ?? e.label)).toEqual(["dcterms:identifier", "Shelfmark", "dcterms:creator"]);
    expect(merged[1]).toEqual({ label: "Shelfmark", value: "MS 12" }); // the verbatim entry, byte-identical
    expect(merged[2]!.value).toBe("A. Curator");
  });

  it("appends a property the object does not carry yet", () => {
    const merged = mergeMetadata(existing, [{ property: "dcterms:date", value: "1610" }])!;
    expect(merged).toHaveLength(4);
    expect(merged[3]).toEqual({ property: "dcterms:date", value: "1610" });
  });

  it("collapses REPEATS of a mapped property, so a re-import cannot accumulate", () => {
    const doubled = [
      { property: "dcterms:creator", value: "One" },
      { property: "dcterms:creator", value: "Two" },
    ];
    const merged = mergeMetadata(doubled, [{ property: "dcterms:creator", value: "Three" }])!;
    expect(merged).toEqual([{ property: "dcterms:creator", value: "Three" }]);
  });

  it("returns undefined when nothing would change, so the caller omits the key", () => {
    expect(mergeMetadata(existing, [{ property: "dcterms:creator", value: "Unknown" }])).toBeUndefined();
    expect(mergeMetadata(existing, [])).toBeUndefined();
    expect(mergeMetadata(existing, [{ property: "dcterms:creator", value: "   " }])).toBeUndefined();
  });

  it("keeps an entry's label override while replacing its value", () => {
    const labelled = [{ property: "dcterms:creator", label: "Maker", value: "Old" }];
    expect(mergeMetadata(labelled, [{ property: "dcterms:creator", value: "New" }])).toEqual([
      { property: "dcterms:creator", label: "Maker", value: "New" },
    ]);
  });
});

// --- re-import ---------------------------------------------------------------------------------

describe("re-import: same sheet + same mapping + same key is idempotent", () => {
  const csv = [
    "file,Object Title,Creator,Date,Rights",
    "plate-01,The First Plate,A. Curator,1610,CC BY 4.0",
    "plate-02,The Second Plate,B. Curator,1611,CC0 1.0 — Public Domain Dedication",
  ].join("\n");
  const mapping = map(
    [
      IGNORE,
      { kind: "native", field: "label" },
      { kind: "dcterms", property: "dcterms:creator" },
      { kind: "dcterms", property: "dcterms:date" },
      { kind: "native", field: "rights" },
    ],
    0,
    "filename",
  );

  it("the second run plans nothing and the objects are byte-identical", () => {
    const first = planMetadataImport(csv, mapping, { objects: OBJECTS });
    expect(first.updates).toHaveLength(2);
    const afterFirst = apply(OBJECTS, first);

    // The match key survives the first run: `label` was rewritten, so the SECOND run has to find the
    // object by its stored source name rather than by the label the sheet just changed.
    const second = planMetadataImport(csv, mapping, { objects: afterFirst });
    expect(second.updates).toHaveLength(0);
    expect(second.unchanged).toBe(2);
    expect(second.skipped).toEqual([]);
    expect(apply(afterFirst, second)).toEqual(afterFirst);
  });

  it("a CORRECTED sheet updates only what it corrected", () => {
    const afterFirst = apply(OBJECTS, planMetadataImport(csv, mapping, { objects: OBJECTS }));
    const fixed = csv.replace("1610", "1612");
    const third = planMetadataImport(fixed, mapping, { objects: afterFirst });
    expect(third.updates).toHaveLength(1);
    expect(third.updates[0]!.objectId).toBe("o1");
    expect(Object.keys(third.updates[0]!.patch)).toEqual(["metadata"]);
    expect(third.updates[0]!.changes).toEqual([{ field: "Date", from: "1610", to: "1612" }]);
  });

  it("an UNMAPPED field is never touched across either run", () => {
    // o2 carries a summary; no column maps to it, so it survives both passes verbatim.
    const afterFirst = apply(OBJECTS, planMetadataImport(csv, mapping, { objects: OBJECTS }));
    const o2 = afterFirst.find((o) => o.id === "o2")!;
    expect(o2.summary).toBe("A second plate.");
    expect(o2.requiredStatement).toBeUndefined();
  });
});

// --- per-row tolerance -------------------------------------------------------------------------

describe("a bad row is skipped and reported — never a whole-file refusal", () => {
  const mapping = map([IGNORE, { kind: "native", field: "label" }], 0, "filename");

  it("an unmatched row is skipped by line number while its neighbours import", () => {
    const plan = planMetadataImport(
      "file,Object Title\nplate-01,Good\nnot-a-plate,Orphan\nplate-02,Also good\n",
      mapping,
      { objects: OBJECTS },
    );
    expect(plan.updates.map((u) => u.objectId)).toEqual(["o1", "o2"]);
    expect(plan.skipped).toEqual([{ row: 3, reason: "no media item matches “not-a-plate”" }]);
  });

  it("an ambiguous row names the count instead of guessing", () => {
    const twins = [obj({ id: "a", label: "plate.tif" }), obj({ id: "b", label: "plate.jpg" })];
    const plan = planMetadataImport("file,Object Title\nplate,Which one?\n", mapping, { objects: twins });
    expect(plan.updates).toHaveLength(0);
    expect(plan.skipped[0]!.reason).toContain("matches 2 media items");
  });

  it("a blank match cell is a skip, not a match against the first object", () => {
    const plan = planMetadataImport("file,Object Title\n,Nameless\n", mapping, { objects: OBJECTS });
    expect(plan.updates).toHaveLength(0);
    expect(plan.skipped).toEqual([{ row: 2, reason: "no media item named in the match column" }]);
  });

  it("an unusable license skips its row and says what a usable one looks like", () => {
    const plan = planMetadataImport(
      "file,rights\nplate-01,Public domain we think\nplate-02,CC BY 4.0\n",
      map([IGNORE, { kind: "native", field: "rights" }], 0, "filename"),
      { objects: OBJECTS },
    );
    expect(plan.updates.map((u) => u.objectId)).toEqual(["o2"]);
    expect(plan.skipped[0]).toMatchObject({ row: 2 });
    expect(plan.skipped[0]!.reason).toContain("license URL");
  });

  it("a second row for an object already updated is skipped, naming the line that won", () => {
    const plan = planMetadataImport(
      "file,Object Title\nplate-01,First\nplate-01.jpg,Second\n",
      mapping,
      { objects: OBJECTS },
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.patch.label).toBe("First");
    expect(plan.skipped[0]!.reason).toContain("line 2");
  });

  it("row numbers are the SPREADSHEET's (header = line 1), so a reported line can be found", () => {
    const plan = planMetadataImport("file,Object Title\nplate-01,ok\nnope,x\n", mapping, { objects: OBJECTS });
    expect(plan.skipped[0]!.row).toBe(3);
  });
});

describe("the two whole-file refusals — the cases where no row could be read either way", () => {
  it("an empty file", () => {
    expect(planMetadataImport("", map([IGNORE], 0, "filename"), { objects: OBJECTS }).refusal).toBeTruthy();
  });
  it("a match column that isn't in the sheet", () => {
    const plan = planMetadataImport("file,Title\nplate-01,x\n", map([IGNORE, { kind: "native", field: "label" }], -1, "filename"), { objects: OBJECTS });
    expect(plan.refusal).toContain("which media item");
  });
  it("nothing mapped at all", () => {
    const plan = planMetadataImport("file,Title\nplate-01,x\n", map([IGNORE, IGNORE], 0, "filename"), { objects: OBJECTS });
    expect(plan.refusal).toContain("at least one column");
  });
});

// --- licenses, suggestions, copy ---------------------------------------------------------------

describe("resolveLicense", () => {
  it("takes a picker label, the canonical URI, or any https URI", () => {
    expect(resolveLicense("CC BY 4.0")).toBe("http://creativecommons.org/licenses/by/4.0/");
    expect(resolveLicense("cc by 4.0")).toBe("http://creativecommons.org/licenses/by/4.0/");
    expect(resolveLicense("http://creativecommons.org/licenses/by/4.0/")).toBe("http://creativecommons.org/licenses/by/4.0/");
    expect(resolveLicense("https://rightsstatements.org/page/InC/1.0/")).toBe("https://rightsstatements.org/page/InC/1.0/");
  });
  it("refuses prose and blanks", () => {
    expect(resolveLicense("Public domain, we think")).toBeUndefined();
    expect(resolveLicense("")).toBeUndefined();
    expect(resolveLicense("Unspecified")).toBeUndefined(); // the "" sentinel is not a settable license
  });
});

describe("suggestMapping opens the step filled in", () => {
  it("routes an EXCLUDED dcterms label to its native twin, never to a metadata entry", () => {
    const s = suggestMapping(["Object Title", "Description", "Rights", "Credit line"]);
    expect(s).toEqual([
      { kind: "native", field: "label" },
      { kind: "native", field: "summary" },
      { kind: "native", field: "rights" },
      { kind: "native", field: "credit" },
    ]);
  });

  it("maps a vocabulary label and an import alias to their dcterms property", () => {
    expect(suggestMapping(["Creator", "Author", "Date", "Call number"])).toEqual([
      { kind: "dcterms", property: "dcterms:creator" },
      { kind: "dcterms", property: "dcterms:creator" },
      { kind: "dcterms", property: "dcterms:date" },
      { kind: "dcterms", property: "dcterms:identifier" },
    ]);
  });

  it("leaves a column it does not recognise alone", () => {
    expect(suggestMapping(["Accession Date", ""])).toEqual([{ kind: "ignore" }, { kind: "ignore" }]);
  });

  it("suggestMatchColumn finds the usual header for each key, or -1", () => {
    const header = ["archie_id", "Filename", "Accession No.", "Notes"];
    expect(suggestMatchColumn(header, "archieId")).toBe(0);
    expect(suggestMatchColumn(header, "filename")).toBe(1);
    expect(suggestMatchColumn(header, "identifier")).toBe(2);
    expect(suggestMatchColumn(header, "path")).toBe(-1);
  });
});

describe("summarizePlan", () => {
  it("a clean run reads as a success", () => {
    const s = summarizePlan({ updates: [{ row: 2, objectId: "o1", objectLabel: "x", patch: { label: "y" }, changes: [{ field: "Title", from: "x", to: "y" }] }], unchanged: 0, skipped: [] });
    expect(s.ok).toBe(true);
    expect(s.text).toContain("Updated 1 media item");
  });
  it("a run with skips is NOT dressed as a success", () => {
    const s = summarizePlan({ updates: [], unchanged: 0, skipped: [{ row: 2, reason: "no item matches “x”" }] });
    expect(s.ok).toBe(false);
    expect(s.text).toContain("line 2");
  });
  it("a run that did nothing says so", () => {
    expect(summarizePlan({ updates: [], unchanged: 0, skipped: [] })).toEqual({ text: "That spreadsheet had nothing to update.", ok: false });
  });
});

// --- door 2: the starter CSV -------------------------------------------------------------------

describe("the starter CSV round-trips through the planner", () => {
  it("carries Archie's ids and the objects' current values", () => {
    const csv = buildMetadataCsvTemplate(OBJECTS);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("archie_id,filename,title,description,creator,date,identifier,subject,type,rights");
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain("o3");
    expect(lines[3]).toContain("ACC-003"); // the identifier it already holds
    expect(lines[3]).toContain("Unknown"); // its creator
  });

  it("quotes a value carrying a comma", () => {
    const csv = buildMetadataCsvTemplate([obj({ id: "o1", label: "Plate, first" })]);
    expect(csv).toContain('"Plate, first"');
  });

  it("downloading it and adding it back UNCHANGED updates nothing", () => {
    const csv = buildMetadataCsvTemplate(OBJECTS);
    const header = csv.split("\n")[0]!.split(",");
    const plan = planMetadataImport(csv, templateMapping(header), { objects: OBJECTS });
    expect(plan.refusal).toBeUndefined();
    expect(plan.skipped).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.unchanged).toBe(3);
  });

  it("filling a blank cell in it lands on the right object, matched by Archie id", () => {
    // Fill the `creator` column on o2's row the way a curator would — by column, not by a brittle
    // substring, so a change to the template's shape fails this loudly rather than silently no-op'ing.
    const lines = buildMetadataCsvTemplate(OBJECTS).trim().split("\n");
    const header = lines[0]!.split(",");
    const creator = header.indexOf("creator");
    expect(creator).toBeGreaterThan(-1);
    const row = lines.find((l) => l.startsWith("o2,"))!.split(",");
    expect(row[creator]).toBe(""); // the cell really was blank before we filled it
    row[creator] = "B. Curator";
    const csv = `${lines.map((l) => (l.startsWith("o2,") ? row.join(",") : l)).join("\n")}\n`;
    const plan = planMetadataImport(csv, templateMapping(header), { objects: OBJECTS });
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.objectId).toBe("o2");
    expect(plan.updates[0]!.patch.metadata).toEqual([{ property: "dcterms:creator", value: "B. Curator" }]);
  });

  it("the template's mapping points title at the NATIVE label, not at dcterms:title", () => {
    const header = METADATA_TEMPLATE_HEADER();
    const t = templateMapping(header);
    expect(t.matchKey).toBe("archieId");
    expect(t.matchColumn).toBe(0);
    expect(t.targets[2]).toEqual({ kind: "native", field: "label" });
    expect(t.targets.some((x) => x.kind === "dcterms" && x.property === "dcterms:title")).toBe(false);
  });
});

function METADATA_TEMPLATE_HEADER(): string[] {
  return buildMetadataCsvTemplate([]).trim().split(",");
}
