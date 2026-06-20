// Working-store read seam (Q-3) — proves, at the data layer: (1) a working store written in the
// Studio's persisted layout (library.json + per-exhibit annotations + assets) cold-reads back via
// `loadWorkingLibrary` — structure, logs, and asset bytes; (2) bundled EXAMPLES (seedVersion) are
// excluded from the projection, "Keep a copy" forks (no seedVersion) are included; (3) the read
// feeds straight into the publish→portable pipeline the Viewer's live source uses: working store →
// publishLibrary(MemoryFilesystem) → loadPortableGallery/loadPortableExhibit.

import { describe, it, expect } from "vitest";
import { MemoryFilesystem } from "../fs/memory.js";
import { writeAnnotations } from "../spine/persist.js";
import { appendNew } from "../spine/log.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { AnnotationLog } from "../wadm/types.js";
import { publishLibrary } from "./site.js";
import { loadPortableGallery, loadPortableExhibit } from "./portable.js";
import {
  loadWorkingLibrary, workingToLibrary, libraryToWorking, isBundledExample, WORKING_PROJECT,
  type WorkingLibraryMeta,
} from "./working.js";
import type { Library } from "../model/model.js";

const author = asClientId("curator");
const BASE = "https://u.gh.io/lib/";
const SLUG = "my-exhibit";
const ASSET_NAME = "plate.png";
// A 1x1 PNG — the exact bytes don't matter, only that the SAME bytes survive the round-trip.
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const META: WorkingLibraryMeta = {
  title: "Field Notes",
  summary: "An authored library",
  rights: "http://creativecommons.org/licenses/by/4.0/",
  exhibits: [
    {
      id: "ex-user", slug: SLUG, title: "My Exhibit", summary: "Mine", layout: "grid",
      readings: [{ id: "r1", name: "Cipher" }],
      objects: [{ id: "o1", source: `/assets/${ASSET_NAME}`, label: "Plate 1", width: 100, height: 80 }],
    },
    // A bundled EXAMPLE (seedVersion present) — a Playground, not the author's content.
    { id: "ex-tpl", slug: "voynich", title: "The Example", seedVersion: 2, objects: [{ id: "o9", source: "https://e.org/x.jpg", label: "X" }] },
  ],
};

function buildLog(target: string): AnnotationLog {
  let log: AnnotationLog = [];
  ({ log } = appendNew(log, { target, body: { type: "TextualBody", value: "a head note" }, lastEditor: author, modifiedAt: "t", now: 1 }));
  return log;
}

/** Write META + one exhibit's annotations + one asset in the Studio's persisted layout. */
async function seedWorkingStore(log: AnnotationLog): Promise<MemoryFilesystem> {
  const fs = new MemoryFilesystem();
  const project = await (await fs.root()).getDirectory(WORKING_PROJECT, { create: true });
  const lj = await project.getFile("library.json", { create: true });
  const w = await lj.writable();
  await w.write(JSON.stringify(META, null, 2));
  await w.close();
  const ex = await (await project.getDirectory("exhibits", { create: true })).getDirectory(SLUG, { create: true });
  await writeAnnotations(await ex.getDirectory("annotations", { create: true }), log);
  const af = await (await ex.getDirectory("assets", { create: true })).getFile(ASSET_NAME, { create: true });
  const aw = await af.writable();
  await aw.write(PNG_BYTES.buffer.slice(0) as ArrayBuffer);
  await aw.close();
  return fs;
}

describe("workingToLibrary", () => {
  it("maps the persisted structure, excluding bundled examples by default", () => {
    const lib = workingToLibrary(META);
    expect(lib.id).toBe("demo");
    expect(lib.title).toBe("Field Notes");
    expect(lib.rights).toBe(META.rights);
    expect(lib.exhibits.map((e) => e.slug)).toEqual([SLUG]);
    const ex = lib.exhibits[0]!;
    expect(ex).toMatchObject({ id: "ex-user", title: "My Exhibit", layout: "grid" });
    expect(ex.readings).toEqual([{ id: "r1", name: "Cipher" }]);
    expect(ex.objects[0]).toMatchObject({ id: "o1", label: "Plate 1", width: 100, height: 80 });
  });
  it("includeTemplates brings examples along; a forked copy (no seedVersion) is never a template", () => {
    expect(workingToLibrary(META, { includeTemplates: true }).exhibits).toHaveLength(2);
    expect(isBundledExample(META.exhibits[0]!)).toBe(false);
    expect(isBundledExample(META.exhibits[1]!)).toBe(true);
  });
});

describe("libraryToWorking (inverse of workingToLibrary)", () => {
  it("round-trips the round-trippable fields via workingToLibrary(libraryToWorking(...))", () => {
    const lib = workingToLibrary(META); // projection drops the bundled example
    const round = workingToLibrary(libraryToWorking(lib));
    expect(round.title).toBe("Field Notes");
    expect(round.summary).toBe("An authored library");
    expect(round.rights).toBe(META.rights);
    expect(round.exhibits.map((e) => e.slug)).toEqual([SLUG]);
    const ex = round.exhibits[0]!;
    expect(ex).toMatchObject({ id: "ex-user", title: "My Exhibit", layout: "grid" });
    expect(ex.summary).toBe("Mine");
    expect(ex.readings).toEqual([{ id: "r1", name: "Cipher" }]);
    expect(ex.objects[0]).toMatchObject({ id: "o1", label: "Plate 1", width: 100, height: 80 });
  });

  it("carries tileSource (the Map basemap) — the field the studio inline version dropped", () => {
    const lib: Library = {
      id: asLibraryId("demo"),
      exhibits: [{
        id: asExhibitId("ex-map"), slug: "atlas", title: "Atlas",
        objects: [{
          id: asObjectId("m1"), source: "world", label: "Basemap",
          tileSource: { kind: "xyz", template: "https://t/{z}/{x}/{y}.png", maxZoom: 5, attribution: "© OSM" },
        }],
      }],
    };
    const working = libraryToWorking(lib);
    expect(working.exhibits[0]!.objects[0]!.tileSource).toEqual({
      kind: "xyz", template: "https://t/{z}/{x}/{y}.png", maxZoom: 5, attribution: "© OSM",
    });
  });
});

describe("loadWorkingLibrary", () => {
  it("returns null when no working store exists (the fall-back-to-published signal)", async () => {
    expect(await loadWorkingLibrary(new MemoryFilesystem())).toBeNull();
  });

  it("cold-reads structure, logs (keyed by exhibit id), and asset bytes", async () => {
    const log = buildLog(`${BASE}${SLUG}/canvas/o1`);
    const fs = await seedWorkingStore(log);
    const w = await loadWorkingLibrary(fs);
    expect(w).not.toBeNull();
    expect(w!.meta.exhibits).toHaveLength(2); // meta is the store as written — templates included
    expect(w!.library.exhibits.map((e) => e.slug)).toEqual([SLUG]); // projection excludes the example
    expect(w!.getLog("ex-user")).toEqual(log); // the round-trip: written log === read log
    expect(w!.getLog("ex-tpl")).toEqual([]); // template logs aren't read (excluded from projection)
    expect(w!.getLog("nope")).toEqual([]);
    const bytes = await w!.getAsset(SLUG, ASSET_NAME);
    expect(bytes).not.toBeNull();
    expect(new Uint8Array(bytes!)).toEqual(PNG_BYTES);
    expect(await w!.getAsset(SLUG, "missing.png")).toBeNull();
  });

  it("feeds the live-source pipeline: working store → publishLibrary → portable readers", async () => {
    const fs = await seedWorkingStore(buildLog(`${BASE}${SLUG}/canvas/o1`));
    const w = (await loadWorkingLibrary(fs))!;
    const mem = new MemoryFilesystem();
    await publishLibrary(mem, w.library, w.getLog, { baseUrl: BASE, getAsset: w.getAsset });
    const gallery = await loadPortableGallery(mem);
    expect(gallery.library.title).toBe("Field Notes");
    expect(gallery.exhibits.map((e) => e.slug)).toEqual([SLUG]); // the example never reaches the hall
    const { exhibit, revoke } = await loadPortableExhibit(mem, SLUG);
    expect(exhibit.objects.map((o) => o.id)).toEqual(["o1"]);
    expect(exhibit.objects[0]!.source.startsWith("blob:")).toBe(true); // embedded asset minted
    revoke();
  });
});
