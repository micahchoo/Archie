import { describe, it, expect } from "vitest";
import { parseCsv, planCsvImport, buildCsvTemplate } from "./csv-import.js";

const CTX = {
  objects: [{ id: "o1", label: "f1r — Herbal" }, { id: "o2", label: "f18v" }, { id: "o12", label: "Kryptogramm", mediaType: "sound" }],
  readings: [{ id: "r-cipher", name: "Cipher reading" }],
  currentObjectId: "o1",
};

describe("parseCsv — RFC 4180 essentials", () => {
  it("splits fields and rows, handling CRLF and blank lines", () => {
    expect(parseCsv("a,b\r\nc,d\n\n")).toEqual([["a", "b"], ["c", "d"]]);
  });
  it("reads quoted fields with commas, newlines, and doubled quotes", () => {
    expect(parseCsv('a,"x, y"\n"line\nbreak","he said ""hi"""')).toEqual([
      ["a", "x, y"],
      ["line\nbreak", 'he said "hi"'],
    ]);
  });
  it("treats lone CR as a row break (Excel 'CSV Macintosh')", () => {
    expect(parseCsv("a,b\rc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("planCsvImport — the dialect", () => {
  it("imports rows, resolving objects by id OR label and readings by name", () => {
    const csv = [
      "object,x,y,w,h,comment,tags,reading",
      'o1,10,20,30,40,"First note",alpha beta,',
      'f18v,1,2,3,4,"On the sonified folio",#circled,Cipher reading',
    ].join("\n");
    const plan = planCsvImport(csv, CTX);
    expect(plan.skipped).toEqual([]);
    expect(plan.notes).toEqual([
      { objectId: "o1", region: [10, 20, 30, 40], comment: "First note", tags: ["alpha", "beta"] },
      { objectId: "o2", region: [1, 2, 3, 4], comment: "On the sonified folio", tags: ["circled"], reading: "r-cipher" },
    ]);
  });
  it("a blank object cell targets the current object; column order is free (header-driven)", () => {
    const plan = planCsvImport("comment,h,w,y,x,object\nnote body,4,3,2,1,", CTX);
    expect(plan.notes).toEqual([{ objectId: "o1", region: [1, 2, 3, 4], comment: "note body", tags: [] }]);
  });
  it("skips bad rows with 1-based row numbers and reasons, never failing wholesale", () => {
    const csv = [
      "object,x,y,w,h,comment",
      "o9,1,2,3,4,unknown object",
      "o1,1,2,0,4,zero width",
      "o1,1,2,3,4,",
      "o1,5,6,7,8,good",
    ].join("\n");
    const plan = planCsvImport(csv, CTX);
    expect(plan.notes).toHaveLength(1);
    expect(plan.skipped.map((s) => s.row)).toEqual([2, 3, 4]); // spreadsheet line numbers (header = 1)
    expect(plan.skipped[0]!.reason).toMatch(/no media item named/);
  });
  it("a blank coordinate cell skips — Number('') must not place a note at the origin", () => {
    const plan = planCsvImport("object,x,y,w,h,comment\no1,,10,30,40,blank x", CTX);
    expect(plan.notes).toEqual([]);
    expect(plan.skipped[0]!.reason).toMatch(/must all be numbers/);
  });
  it("rows targeting an AV object skip — regions are image-only", () => {
    const plan = planCsvImport("object,x,y,w,h,comment\nKryptogramm,1,2,3,4,no rects on sound", CTX);
    expect(plan.notes).toEqual([]);
    expect(plan.skipped[0]!.reason).toMatch(/can't take a region/);
  });
  it("an unknown reading skips the row (don't silently drop the layer)", () => {
    const plan = planCsvImport("object,x,y,w,h,comment,reading\no1,1,2,3,4,n,Hoax", CTX);
    expect(plan.notes).toEqual([]);
    expect(plan.skipped[0]!.reason).toMatch(/no reading named/);
  });
  it("a missing required column fails up front with guidance", () => {
    const plan = planCsvImport("x,y,w,h,comment\n1,2,3,4,n", CTX);
    expect(plan.notes).toEqual([]);
    expect(plan.skipped[0]!.reason).toMatch(/Missing columns.*object/);
  });
  it("x,y,w,h are no longer required columns — object,comment alone is a valid header", () => {
    const plan = planCsvImport("object,comment\no1,just text", CTX);
    expect(plan.skipped).toEqual([]); // header passes (sub-cycle B: region optional)
  });
});

describe("planCsvImport — coordinate-free notes (sub-cycle B: pending → Set area)", () => {
  it("no region columns at all → every row is PENDING, carrying tags + reading", () => {
    const csv = [
      "object,comment,tags,reading",
      'o1,"A marginal gloss",hand-a alpha,',
      'f18v,"On the sonified folio",#circled,Cipher reading',
    ].join("\n");
    const plan = planCsvImport(csv, CTX);
    expect(plan.notes).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.pending).toEqual([
      { objectId: "o1", comment: "A marginal gloss", tags: ["hand-a", "alpha"] },
      { objectId: "o2", comment: "On the sonified folio", tags: ["circled"], reading: "r-cipher" },
    ]);
  });
  it("region columns present but all four cells blank → PENDING (not skipped)", () => {
    const plan = planCsvImport("object,x,y,w,h,comment\no1,,,,,needs a box", CTX);
    expect(plan.skipped).toEqual([]);
    expect(plan.pending).toEqual([{ objectId: "o1", comment: "needs a box", tags: [] }]);
  });
  it("a blank object cell on a pending row targets the current object", () => {
    const plan = planCsvImport("object,comment\n,current-object note", CTX);
    expect(plan.pending).toEqual([{ objectId: "o1", comment: "current-object note", tags: [] }]);
  });
  it("one file fans into all three buckets — placed, pending, skipped", () => {
    const csv = [
      "object,x,y,w,h,comment",
      "o1,10,20,30,40,placed",   // full region → notes
      "o2,,,,,pending",          // blank region → pending
      "o1,1,2,0,4,bad width",    // w=0 → skipped (malformed region, NOT pending)
      "o9,,,,,no such object",   // unknown object → skipped (before region)
    ].join("\n");
    const plan = planCsvImport(csv, CTX);
    expect(plan.notes).toEqual([{ objectId: "o1", region: [10, 20, 30, 40], comment: "placed", tags: [] }]);
    expect(plan.pending).toEqual([{ objectId: "o2", comment: "pending", tags: [] }]);
    expect(plan.skipped.map((s) => s.row)).toEqual([4, 5]); // bad width + unknown object
  });
  it("a partial region (some cells, not all) is still an ERROR, never pending", () => {
    const plan = planCsvImport("object,x,y,w,h,comment\no1,10,20,,,half a box", CTX);
    expect(plan.pending).toEqual([]);
    expect(plan.skipped[0]!.reason).toMatch(/must all be numbers/);
  });
  it("an AV object with no region is skipped, not staged (the box draw is image-only)", () => {
    const plan = planCsvImport("object,comment\nKryptogramm,no rects on sound", CTX);
    expect(plan.pending).toEqual([]);
    expect(plan.skipped[0]!.reason).toMatch(/can't take a region/);
  });
  it("an unknown reading skips a pending row too (region-independent validation)", () => {
    const plan = planCsvImport("object,comment,reading\no1,n,Hoax", CTX);
    expect(plan.pending).toEqual([]);
    expect(plan.skipped[0]!.reason).toMatch(/no reading named/);
  });
});

describe("buildCsvTemplate — the fillable starter", () => {
  it("round-trips through its own parser with zero skips (template is always valid)", () => {
    const plan = planCsvImport(buildCsvTemplate(CTX.objects), CTX);
    expect(plan.skipped).toEqual([]);
    expect(plan.notes).toHaveLength(1);   // the demo pixel-box row (object o1)
    expect(plan.pending).toHaveLength(2); // the two coordinate-free demo rows (o1, o2)
    expect(plan.pending.every((p) => p.objectId === "o1" || p.objectId === "o2")).toBe(true);
  });
  it("seeds rows with real image objects and excludes AV (regions are image-only)", () => {
    const csv = buildCsvTemplate(CTX.objects);
    expect(csv).toMatch(/^object,x,y,w,h,comment,tags,reading\n/);
    expect(csv).toContain("f1r — Herbal"); // first image object's label, quoted by the comma rule
    expect(csv).not.toContain("Kryptogramm"); // the sound object is never offered a region row
  });
  it("with no image objects, still returns a valid blank-object template", () => {
    const plan = planCsvImport(buildCsvTemplate([{ id: "o12", label: "Kryptogramm", mediaType: "sound" }]), { ...CTX, currentObjectId: "o1" });
    expect(plan.skipped).toEqual([]);
    expect(plan.pending).toEqual([{ objectId: "o1", comment: "Leave the object blank to use the item you're viewing", tags: [] }]);
  });
});
