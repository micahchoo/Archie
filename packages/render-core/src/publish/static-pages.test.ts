import { describe, it, expect } from "vitest";
import { publishLibrary } from "./site.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { appendNew, appendDelete } from "../spine/log.js";
import { asClientId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";
import type { AnnotationLog } from "../wadm/types.js";

// THE FROZEN CONTRACT (ADR-0014 / archie-linkability Q-2, written RED before the emitter exists):
// publishLibrary makes the published artifact SELF-DESCRIBING — static HTML with per-note anchors
// (the durable ref `{slug}/index.html#note-<logicalId>`). The anchor grammar freezes the day a
// citation circulates; this corpus is the contract, the implementation follows it.

const BASE = "https://u.gh.io/lib/";
const alice = asClientId("alice");

// Targets matching publish's canvas IRI grammar + one exhibit-level (non-canvas) note.
const canvas = (slug: string, objId: string) => ({ type: "SpecificResource" as const, source: `${BASE}${slug}/canvas/${objId}` });

function fixture() {
  let log: AnnotationLog = [];
  let r = appendNew(log, { target: canvas("a", "o1"), body: { type: "TextualBody", value: "First note **bold** words" }, lastEditor: alice, modifiedAt: "t1", now: 1 });
  log = r.log;
  const l1 = r.record.logicalId;
  r = appendNew(log, { target: canvas("a", "o1"), body: { type: "TextualBody", value: "<script>alert(1)</script> hostile <img src=x onerror=alert(2)>" }, lastEditor: alice, modifiedAt: "t2", now: 2, reading: "cipher" });
  log = r.log;
  const l2 = r.record.logicalId;
  r = appendNew(log, { target: `${BASE}a/manifest.json`, body: { type: "TextualBody", value: "Curatorial exhibit-level prose" }, lastEditor: alice, modifiedAt: "t3", now: 3 });
  log = r.log;
  const l3 = r.record.logicalId;
  // A deleted note: must NOT appear on the page (heads projection excludes tombstones).
  r = appendNew(log, { target: canvas("a", "o1"), body: { type: "TextualBody", value: "DELETED-WORDS-MUST-NOT-APPEAR" }, lastEditor: alice, modifiedAt: "t4", now: 4 });
  log = appendDelete(r.log, r.record.logicalId, { lastEditor: alice, modifiedAt: "t5", now: 5 }).log;

  const library: Library = {
    id: "lib",
    title: "The Library",
    summary: "A library summary",
    requiredStatement: { label: "Attribution", value: "Library credit line — Beinecke" },
    exhibits: [
      {
        id: "exA", slug: "a", title: "Exhibit Alpha", summary: "Alpha summary",
        requiredStatement: { label: "Attribution", value: "Alpha exhibit credit" },
        objects: [{ id: "o1", source: "https://img/a.jpg", label: "Folio 1", width: 10, height: 10 }],
        readings: [{ id: "cipher", name: "Cipher", colour: "#aa3333" }],
      },
      { id: "exB", slug: "b", title: "Exhibit Beta", objects: [] },
    ],
  };
  const logs: Record<string, AnnotationLog> = { exA: log, exB: [] };
  return { library, getLog: (id: string) => logs[id] ?? [], l1, l2, l3 };
}

async function readText(fs: MemoryFilesystem, path: string[]): Promise<string> {
  let dir = await fs.root();
  for (const seg of path.slice(0, -1)) dir = await dir.getDirectory(seg);
  const file = await dir.getFile(path[path.length - 1]!);
  return new TextDecoder().decode(await file.readable());
}

async function publishToMem(opts: Record<string, unknown> = {}) {
  const { library, getLog, l1, l2, l3 } = fixture();
  const fs = new MemoryFilesystem();
  await publishLibrary(fs, library, getLog, { baseUrl: BASE, ...opts });
  return { fs, l1, l2, l3 };
}

describe("static pages — the self-describing artifact (ADR-0014, frozen contract)", () => {
  it("emits index.html, {slug}/index.html for every exhibit, and sitemap.txt", async () => {
    const { fs } = await publishToMem();
    expect(await readText(fs, ["index.html"])).toContain("The Library");
    expect(await readText(fs, ["a", "index.html"])).toContain("Exhibit Alpha");
    expect(await readText(fs, ["b", "index.html"])).toContain("Exhibit Beta");
    expect(await readText(fs, ["sitemap.txt"])).toBeTruthy();
  });

  it("anchors EVERY head note — base, reading-scoped, and non-canvas targets — as note-<logicalId>", async () => {
    const { fs, l1, l2, l3 } = await publishToMem();
    const html = await readText(fs, ["a", "index.html"]);
    expect(html).toContain(`id="note-${l1}"`);
    expect(html).toContain(`id="note-${l2}"`); // reading-scoped: FULL heads projection, not base-only
    expect(html).toContain(`id="note-${l3}"`); // exhibit-level prose: anchored too
    expect(html).toContain("First note");
    expect(html).toContain("Curatorial exhibit-level prose");
  });

  it("logicalIds are anchor-safe (the ULID charset assertion the grammar relies on)", async () => {
    const { l1, l2, l3 } = await publishToMem();
    for (const id of [l1, l2, l3]) expect(id).toMatch(/^[0-9A-Za-z_-]+$/);
  });

  it("a hostile body arrives ENTITY-ESCAPED under the default renderer (the XSS boundary)", async () => {
    const { fs } = await publishToMem();
    const html = await readText(fs, ["a", "index.html"]);
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<img src=x");
  });

  it("a tombstoned note's words do NOT appear (heads projection, not the raw log)", async () => {
    const { fs } = await publishToMem();
    expect(await readText(fs, ["a", "index.html"])).not.toContain("DELETED-WORDS-MUST-NOT-APPEAR");
  });

  it("renders the MUST-display credit (requiredStatement) at each level", async () => {
    const { fs } = await publishToMem();
    expect(await readText(fs, ["index.html"])).toContain("Library credit line — Beinecke");
    expect(await readText(fs, ["a", "index.html"])).toContain("Alpha exhibit credit");
  });

  it("names the note's Reading beside it (interpretation context survives archiving)", async () => {
    const { fs } = await publishToMem();
    expect(await readText(fs, ["a", "index.html"])).toContain("Cipher");
  });

  it("sitemap.txt lists exactly the emitted pages, library first then exhibits in order", async () => {
    const { fs } = await publishToMem();
    expect(await readText(fs, ["sitemap.txt"])).toBe(`${BASE}index.html\n${BASE}a/index.html\n${BASE}b/index.html\n`);
  });

  it("is idempotent — republishing the SAME library/log produces byte-identical pages", async () => {
    const { library, getLog } = fixture();
    const fs1 = new MemoryFilesystem();
    const fs2 = new MemoryFilesystem();
    await publishLibrary(fs1, library, getLog, { baseUrl: BASE });
    await publishLibrary(fs2, library, getLog, { baseUrl: BASE });
    expect(await readText(fs1, ["a", "index.html"])).toBe(await readText(fs2, ["a", "index.html"]));
    expect(await readText(fs1, ["index.html"])).toBe(await readText(fs2, ["index.html"]));
  });

  it("links out to the interactive Viewer when viewerBase is supplied (and omits it otherwise)", async () => {
    const { fs, l1 } = await publishToMem({ viewerBase: "https://host/viewer/" });
    const html = await readText(fs, ["a", "index.html"]);
    expect(html).toContain(`https://host/viewer/#/a/a/${l1}`); // per-note interactive ref
    expect(html).toContain("https://host/viewer/#/a"); // exhibit-level link
    const bare = await readText((await publishToMem()).fs, ["a", "index.html"]);
    expect(bare).not.toContain("https://host/viewer/");
  });

  it("an injected renderBody is used for note bodies (the A3 pipeline seam) — chrome stays escaped", async () => {
    const { fs, l1 } = await publishToMem({ renderBody: (md: string) => `<em data-injected>${md.length}</em>` });
    const html = await readText(fs, ["a", "index.html"]);
    expect(html).toContain("<em data-injected>"); // bodies went through the injected renderer
    expect(html).toContain(`id="note-${l1}"`); // grammar unchanged by the renderer choice
    expect(html).toContain("Exhibit Alpha"); // chrome (titles/credits) never passes through renderBody
  });

  it("the landing page links every exhibit page (the human entry the data repo never had)", async () => {
    const { fs } = await publishToMem();
    const html = await readText(fs, ["index.html"]);
    expect(html).toContain('href="a/index.html"');
    expect(html).toContain('href="b/index.html"');
    expect(html).toContain("A library summary");
  });
});
