import { describe, it, expect } from "vitest";
import { MemoryFilesystem } from "../fs/memory.js";
import { publishLibrary } from "./site.js";
import { readExhibitTree, fsJsonSource, type NoteTransform } from "./read.js";
import { appendNew } from "../spine/log.js";
import { asClientId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";

// The domino's unit: one source-parameterized traversal behind a JsonSource seam. The three readers
// (site/portable/viewer) are thin adapters over this — characterized by their own suites; this pins
// the shared traversal + the fs-coupled transform hook directly.
const author = asClientId("curator");
const base = "https://u.gh.io/lib/";
const canvas = `${base}rd/canvas/o1`;
const lib: Library = {
  id: "L",
  title: "Lib",
  exhibits: [{
    id: "e1",
    slug: "rd",
    title: "Readings",
    objects: [{ id: "o1", source: "https://img/1.jpg", label: "one" }],
    readings: [{ id: "cipher", name: "Cipher" }],
  }],
};
let log = appendNew([], { target: canvas, body: { type: "TextualBody", value: "ciph" }, lastEditor: author, modifiedAt: "t", now: 1, reading: "cipher" }).log;
log = appendNew(log, { target: canvas, body: { type: "TextualBody", value: "base" }, lastEditor: author, modifiedAt: "t", now: 2 }).log;
const published = async () => {
  const fs = new MemoryFilesystem();
  await publishLibrary(fs, lib, (id) => (id === "e1" ? log : []), { baseUrl: base });
  return fs;
};

describe("readExhibitTree (source-parameterized published-tree reader)", () => {
  it("reads manifest/objects/sections/canvas IRIs + readings + per-reading pages over a JsonSource", async () => {
    const ex = await readExhibitTree(fsJsonSource(await published()), "rd");
    expect(ex.title).toBe("Readings");
    expect(ex.objects.map((o) => o.id)).toEqual(["o1"]);
    expect(ex.canvasIdByObject.o1).toBe(canvas); // IRI from the manifest
    expect(ex.annotationsByObject.o1?.length).toBe(1); // the base (reading-less) note
    expect(ex.readings.map((r) => r.id)).toEqual(["cipher"]);
    expect(ex.readingAnnotationsByObject.o1?.cipher?.length).toBe(1); // per-reading page
  });

  it("applies the NoteTransform hook to objects and notes (base + per-reading)", async () => {
    const t: NoteTransform = {
      object: async (o) => ({ ...o, source: `X:${o.source}` }),
      note: async (n) => ({ ...n, _t: true }) as typeof n,
    };
    const ex = await readExhibitTree(fsJsonSource(await published()), "rd", t);
    expect(ex.objects[0]!.source.startsWith("X:")).toBe(true); // object hook ran
    expect((ex.annotationsByObject.o1![0] as { _t?: boolean })._t).toBe(true); // note hook ran on base
    expect((ex.readingAnnotationsByObject.o1!.cipher![0] as { _t?: boolean })._t).toBe(true); // and per-reading
  });
});
