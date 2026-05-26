import { describe, it, expect } from "vitest";
import { libraryToZip } from "./site.js";
import { ZipFilesystem } from "../fs/zip.js";
import type { FsDirectory } from "../fs/seam.js";
import { appendNew } from "../spine/log.js";
import { asClientId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";
import type { AnnotationLog } from "../wadm/types.js";

// ════════════════════════════════════════════════════════════════════════════════════
// THE PHASE-2 INTEROP GATE: a pure consumer must be able to traverse the published site
// collection.json -> {slug}/manifest.json -> canvas.annotations[0].id -> the actual file ->
// an AnnotationPage of the heads targeting THAT canvas. The manifest's per-canvas annotation
// URL MUST resolve to a real file containing exactly that canvas's notes.
// ════════════════════════════════════════════════════════════════════════════════════

const base = "https://u.gh.io/lib/";
const alice = asClientId("alice");
const slug = "show";
const canvasA = `${base}${slug}/canvas/oA`;
const canvasB = `${base}${slug}/canvas/oB`;
const sel = { type: "FragmentSelector" as const, value: "xywh=pixel:0,0,5,5" };

function buildLog(): AnnotationLog {
  let log: AnnotationLog = [];
  ({ log } = appendNew(log, { target: { type: "SpecificResource", source: canvasA, selector: sel }, body: { type: "TextualBody", value: "A1" }, lastEditor: alice, modifiedAt: "t", now: 1 }));
  ({ log } = appendNew(log, { target: { type: "SpecificResource", source: canvasA, selector: sel }, body: { type: "TextualBody", value: "A2" }, lastEditor: alice, modifiedAt: "t", now: 2 }));
  ({ log } = appendNew(log, { target: { type: "SpecificResource", source: canvasB, selector: sel }, body: { type: "TextualBody", value: "B1" }, lastEditor: alice, modifiedAt: "t", now: 3 }));
  return log;
}

const library: Library = {
  id: "lib",
  exhibits: [
    {
      id: "ex",
      slug,
      title: "Show",
      objects: [
        { id: "oA", source: "https://img/a.jpg", label: "A", width: 10, height: 10 },
        { id: "oB", source: "https://img/b.jpg", label: "B", width: 10, height: 10 },
      ],
    },
  ],
};

/** Resolve a published absolute URL to a file inside the zip (strip baseUrl, walk dirs). */
async function fetchJson(root: FsDirectory, url: string): Promise<Record<string, unknown>> {
  const rel = url.startsWith(base) ? url.slice(base.length) : url;
  const parts = rel.split("/");
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!);
  const file = await dir.getFile(parts[parts.length - 1]!);
  return JSON.parse(new TextDecoder().decode(await file.readable())) as Record<string, unknown>;
}

describe("Phase-2 interop gate: consumer traversal collection -> manifest -> canvas annotations", () => {
  it("every canvas's annotations[].id resolves to a page of exactly that canvas's heads", async () => {
    const reopened = ZipFilesystem.fromZip((await libraryToZip(library, () => buildLog(), { baseUrl: base })).zip);
    const root = await reopened.root();

    const collection = await fetchJson(root, `${base}collection.json`);
    const manifestRef = (collection.items as Array<{ id: string }>)[0]!;
    const manifest = await fetchJson(root, manifestRef.id);

    const canvases = manifest.items as Array<{ id: string; annotations?: Array<{ id: string }> }>;
    expect(canvases).toHaveLength(2);

    const counts: Record<string, number> = {};
    for (const canvas of canvases) {
      const annUrl = canvas.annotations?.[0]?.id;
      expect(annUrl, `canvas ${canvas.id} must reference an annotation page`).toBeDefined();
      const page = await fetchJson(root, annUrl!); // MUST resolve to a real file (the bug: it didn't)
      expect(page.type).toBe("AnnotationPage");
      const items = page.items as Array<{ target: { source: string } }>;
      // every item on this page targets THIS canvas
      for (const it of items) expect(it.target.source).toBe(canvas.id);
      counts[canvas.id] = items.length;
    }
    expect(counts[canvasA]).toBe(2); // A1, A2
    expect(counts[canvasB]).toBe(1); // B1
  });
});
