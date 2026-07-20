// ADR-0026 trigger 2 (untrusted-archive ADOPTION boundary) — Archie-8439. The open seam (open.ts) hands
// back a published-tree-shaped zip the working-store engine can't read, so migration runs where the
// archive's data LANDS in the resident working store: `replaceProjectFrom`. This pins that wiring — after
// a legacy `.archie.zip` is adopted, the resident store carries ZERO legacy ids (marker flipped, object
// ids composed) AND the in-memory library meta is reloaded to match disk (so the next save can't write a
// legacy id back over the migrated store). The OPFS store primitives are routed onto a MemoryFilesystem.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryFilesystem, readIdScheme, asClientId, type Filesystem, type FsDirectory } from "@render/core";
import { createIngestFlows, type IngestContext } from "./ingest-flows.js";

const PROJECT = "archie-demo-project";
const dec = (b: ArrayBuffer): string => new TextDecoder().decode(b);

// The resident OPFS store stand-in — a fresh MemoryFilesystem per test, shared by the store mock + ctx.lib.
// `order` records the sequence of marker-reset vs incoming-write ops to pin the crash-window ordering.
const h = vi.hoisted(() => ({ resident: null as unknown as Filesystem, order: [] as string[] }));

async function projDir(): Promise<FsDirectory> {
  return (await h.resident.root()).getDirectory(PROJECT, { create: true });
}

// Route the OPFS-bound store functions replaceProjectFrom touches onto `h.resident`. migrateResidentStoreIds
// runs the REAL render-core engine over the resident memfs (ignoring its OPFS default); resetIdSchemeState
// and loadLibraryMeta operate on the same tree. Everything else stays real (importOriginal).
vi.mock("./store.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./store.js")>();
  const proj = async () => (await h.resident.root()).getDirectory(PROJECT, { create: true });
  return {
    ...orig,
    openExhibitAnnotationsDir: async (slug: string) => {
      h.order.push(`write:${slug}`); // an INCOMING write — must land AFTER the marker reset
      return (await (await (await proj()).getDirectory("exhibits", { create: true })).getDirectory(slug, { create: true })).getDirectory("annotations", { create: true });
    },
    clearExhibitAnnotations: async () => {},
    migrateResidentStoreIds: async () => orig.migrateResidentStoreIds(h.resident),
    resetIdSchemeState: async () => {
      h.order.push("reset");
      const d = await proj();
      await d.remove("id-scheme.json").catch(() => {});
      await d.remove("pre-migration").catch(() => {});
    },
    loadLibraryMeta: async () => {
      try {
        return JSON.parse(dec(await (await (await proj()).getFile("library.json")).readable()));
      } catch {
        return null;
      }
    },
  };
});

const alice = asClientId("alice");

/** A minimal IngestContext whose lib persists library.json into the resident memfs (as the real store does). */
function makeCtx(over: Partial<IngestContext> = {}): { ctx: IngestContext; meta: () => any } {
  let meta: any = { exhibits: [] };
  const ctx = {
    baseUrl: "/",
    lib: {
      get meta() { return meta; },
      setMeta: (m: any) => { meta = m; },
      persist: async () => {
        const d = await projDir();
        const w = await (await d.getFile("library.json", { create: true })).writable();
        await w.write(JSON.stringify(meta));
        await w.close();
      },
    },
    author: () => alice,
    cancelPendingSave: () => {},
    finishReplace: () => {},
    ...over,
  } as unknown as IngestContext;
  return { ctx, meta: () => meta };
}

/** A loaded library (loadLibrary's return) for one exhibit whose sole object carries a LEGACY id. */
const legacyLoaded = () =>
  ({
    library: { id: "lib", exhibits: [{ id: "ex-voynich", slug: "voynich", title: "Voynich", objects: [{ id: "o1", source: "v1", label: "Folio" }] }] },
    logs: { "ex-voynich": [] },
  }) as never;

beforeEach(() => { h.resident = new MemoryFilesystem(); h.order = []; });

describe("replaceProjectFrom — object-id adoption (ADR-0026 trigger 2)", () => {
  it("adopting a legacy library migrates the resident store — zero legacy ids on disk AND in memory", async () => {
    const { ctx, meta } = makeCtx({ structureRevlog: false });
    await createIngestFlows(ctx).replaceProjectFrom(legacyLoaded());

    // Resident store flipped to the composed scheme…
    expect(await readIdScheme(h.resident)).toBe(2);
    // …with the object id composed on disk…
    const disk = JSON.parse(dec(await (await (await projDir()).getFile("library.json")).readable()));
    expect(disk.exhibits[0].objects[0].id).toBe("ex-voynich.o1");
    // …and the in-memory meta reloaded to match (so the next persist won't clobber it with a legacy id).
    expect(meta().exhibits[0].objects[0].id).toBe("ex-voynich.o1");
  });

  it("crash-window ordering: the outgoing marker is cleared BEFORE any incoming write lands", async () => {
    // Review of f344114: resetIdSchemeState must run first so that a crash anywhere mid-replace leaves a
    // MARKERLESS store (re-migrated on next boot), never legacy content under a stale scheme-2 marker.
    const { ctx } = makeCtx({ structureRevlog: false });
    await createIngestFlows(ctx).replaceProjectFrom(legacyLoaded());

    expect(h.order[0]).toBe("reset"); // the reset is the very first store op
    expect(h.order.indexOf("reset")).toBeLessThan(h.order.findIndex((o) => o.startsWith("write:")));
  });

  it("adopting an already-composed library is a marker-writing no-op (idempotent, ids unchanged)", async () => {
    const composedLoaded = () =>
      ({
        library: { id: "lib", exhibits: [{ id: "ex-voynich", slug: "voynich", title: "Voynich", objects: [{ id: "ex-voynich.o1", source: "v1", label: "Folio" }] }] },
        logs: { "ex-voynich": [] },
      }) as never;

    const { ctx, meta } = makeCtx({ structureRevlog: false });
    await createIngestFlows(ctx).replaceProjectFrom(composedLoaded());

    expect(await readIdScheme(h.resident)).toBe(2);
    expect(meta().exhibits[0].objects[0].id).toBe("ex-voynich.o1"); // untouched
  });
});
