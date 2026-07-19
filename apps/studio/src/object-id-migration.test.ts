// ADR-0026 trigger 1 (studio-open) — Archie-8439. `migrateResidentStoreIds` drives the render-core
// object-id migration engine over the resident working store BEFORE the session boots. The engine's
// five-class exhaustiveness is proven in packages/render-core (object-ids.test.ts); this pins the
// STUDIO wrapper: it migrates a legacy store once, is a no-op on a store already on the current scheme,
// and returns null where there is no OPFS at all. The fs is injected (MemoryFilesystem stands in for the
// OPFS root — the headless test env has no OPFS).
import { describe, it, expect } from "vitest";
import { MemoryFilesystem, readIdScheme, CURRENT_ID_SCHEME, type Filesystem, type FsDirectory } from "@render/core";
import { migrateResidentStoreIds } from "./store.js";

const PROJECT = "archie-demo-project"; // WORKING_PROJECT — the fixed resident-store root the engine opens
const dec = (b: ArrayBuffer): string => new TextDecoder().decode(b);

async function writeJson(dir: FsDirectory, name: string, data: unknown): Promise<void> {
  const w = await (await dir.getFile(name, { create: true })).writable();
  await w.write(JSON.stringify(data));
  await w.close();
}

/** A minimal legacy (scheme-1, no marker) resident store: one exhibit with a local `o1` object + a
 *  pending-notes sidecar keyed on the same legacy id — two of the five id-bearing classes, enough to
 *  prove the wrapper drives the engine across the tree (not just library.json). */
async function buildLegacyResident(fs: Filesystem): Promise<void> {
  const proj = await (await fs.root()).getDirectory(PROJECT, { create: true });
  await writeJson(proj, "library.json", {
    exhibits: [{ id: "ex-voynich", slug: "voynich", title: "Voynich", objects: [{ id: "o1", source: "v1", label: "Folio" }] }],
  });
  await writeJson(proj, "pending-notes.json", { voynich: [{ id: "p1", objectId: "o1", comment: "", tags: [] }] });
}

async function readJson(fs: Filesystem, name: string): Promise<any> {
  const proj = await (await fs.root()).getDirectory(PROJECT);
  return JSON.parse(dec(await (await proj.getFile(name)).readable()));
}

describe("migrateResidentStoreIds — studio-open trigger (ADR-0026 trigger 1)", () => {
  it("migrates a legacy resident store once, then is a no-op on the composed scheme", async () => {
    const fs = new MemoryFilesystem();
    await buildLegacyResident(fs);

    const first = await migrateResidentStoreIds(fs);
    expect(first?.migrated).toBe(true);
    expect(await readIdScheme(fs)).toBe(CURRENT_ID_SCHEME);
    // Composed under the owning exhibit id, across BOTH classes present.
    expect((await readJson(fs, "library.json")).exhibits[0].objects[0].id).toBe("ex-voynich.o1");
    expect((await readJson(fs, "pending-notes.json")).voynich[0].objectId).toBe("ex-voynich.o1");
    // The snapshot escape-hatch was written.
    expect(first?.snapshotCreated).toBe(true);

    // Second boot: already on the current scheme — pass-through, no snapshot, no rewrites.
    const second = await migrateResidentStoreIds(fs);
    expect(second?.migrated).toBe(false);
    expect(second?.snapshotCreated).toBe(false);
    expect((await readJson(fs, "library.json")).exhibits[0].objects[0].id).toBe("ex-voynich.o1"); // unchanged (no double-compose)
  });

  it("an empty store (no working library) is a no-op, never throws", async () => {
    const result = await migrateResidentStoreIds(new MemoryFilesystem());
    expect(result?.migrated).toBe(false);
  });

  it("returns null where there is no OPFS at all (nothing to migrate)", async () => {
    // No fs injected + the headless (node) env has no navigator.storage → openRootFs() is null.
    expect(await migrateResidentStoreIds()).toBeNull();
  });
});
