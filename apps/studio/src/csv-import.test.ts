import { describe, it, expect } from "vitest";
import { parseCsv, planCsvImport } from "./csv-import.js";

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
});
