import { describe, it, expect, afterEach } from "vitest";
import { TREE_MIGRATIONS, treeMigrationsSince, migrateTreeDoc, migrationGapMessage, type TreeMigration } from "./tree.js";
import { migratingJsonSource, type JsonSource } from "../publish/read.js";
import { validateArchieMarker, NotAnArchieLibraryError } from "../publish/marker.js";
import { SCHEMA_VERSION } from "./migrate.js";
import { MemoryFilesystem } from "../fs/memory.js";

// Archie-69f9. The gate that used to refuse every older tree now accepts one iff the registry can
// carry it forward — so these tests are as much about what is still REFUSED as about what migrates.

const docMigration = (to: number, path: (p: string) => boolean, up: (d: unknown) => unknown): TreeMigration =>
  ({ to, description: `v${to}`, scope: "doc", path, up });

describe("treeMigrationsSince — the coverage planner", () => {
  const m2 = docMigration(2, () => true, (d) => d);
  const m3 = docMigration(3, () => true, (d) => d);

  it("returns the chain in ascending order when every step is covered", () => {
    const r = treeMigrationsSince(1, 3, [m3, m2]); // deliberately out of order in the registry
    expect(r.ok).toBe(true);
    expect(r.ok && r.migrations.map((m) => m.to)).toEqual([2, 3]);
  });

  it("REFUSES on a gap, naming the missing version (tldraw StoreSchema.mjs:108)", () => {
    // The property that makes accepting an old marker safe: coverage is total or it is a refusal.
    // A best-effort chain would leave docs at a version the reader doesn't understand while
    // reporting success.
    const r = treeMigrationsSince(1, 3, [m3]); // v2 missing
    expect(r.ok).toBe(false);
    expect(!r.ok && r.gap).toEqual({ reason: "no-path", missing: 2 });
  });

  it("REFUSES a whole-tree-scope migration instead of silently skipping it", () => {
    // tldraw does the same on its single-record path (StoreSchema.mjs:126-131, TargetVersionTooNew):
    // a cross-document change cannot be honoured one document at a time, and pretending otherwise is
    // how you ship a subtly wrong library.
    const treeScoped: TreeMigration = { to: 2, description: "move sections into manifests", scope: "tree", path: () => true, up: (d) => d };
    const r = treeMigrationsSince(1, 2, [treeScoped]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.gap).toEqual({ reason: "needs-whole-tree", to: 2, description: "move sections into manifests" });
  });

  it("is a no-op when the tree is already at or past the target", () => {
    expect(treeMigrationsSince(3, 3, [m2, m3])).toEqual({ ok: true, migrations: [] });
    expect(treeMigrationsSince(4, 3, [m2, m3])).toEqual({ ok: true, migrations: [] });
  });

  it("the live registry is EMPTY, so no gap can be covered today", () => {
    // Pins the baseline the marker gate's behaviour depends on. If this ever fails, the two refusal
    // tests below stop meaning what they say — read them again before changing this.
    expect(TREE_MIGRATIONS).toEqual([]);
    expect(SCHEMA_VERSION).toBe(1);
  });

  it("gives DIFFERENT advice per cause — a whole-tree gap must not say 're-publish and it'll work'", () => {
    const noPath = migrationGapMessage(1, { reason: "no-path", missing: 2 });
    const whole = migrationGapMessage(1, { reason: "needs-whole-tree", to: 2, description: "X" });
    expect(noPath).toContain("no migration for schema v2");
    expect(whole).toContain("whole-tree migration");
    expect(noPath).not.toBe(whole);
  });
});

describe("migrateTreeDoc — per-document application", () => {
  it("applies only the migrations whose path matches, in chain order", () => {
    const chain = [
      docMigration(2, (p) => p === "exhibits.json", (d) => ({ ...(d as object), a: 1 })),
      docMigration(3, (p) => p.endsWith("/manifest.json"), (d) => ({ ...(d as object), b: 2 })),
      docMigration(4, () => true, (d) => ({ ...(d as object), c: 3 })),
    ];
    expect(migrateTreeDoc({}, "exhibits.json", chain)).toEqual({ a: 1, c: 3 });
    expect(migrateTreeDoc({}, "v/manifest.json", chain)).toEqual({ b: 2, c: 3 });
    expect(migrateTreeDoc({}, "v/readings.json", chain)).toEqual({ c: 3 });
  });

  it("does not mutate its input", () => {
    const doc = { keep: true };
    migrateTreeDoc(doc, "exhibits.json", [docMigration(2, () => true, (d) => ({ ...(d as object), added: 1 }))]);
    expect(doc).toEqual({ keep: true }); // the migration returned a new object; the original is intact
  });
});

describe("migratingJsonSource — where migration actually happens on the read path", () => {
  const stub = (docs: Record<string, unknown>): JsonSource => ({
    get: async <T,>(p: string): Promise<T> => {
      if (!(p in docs)) throw new Error(`absent: ${p}`);
      return docs[p] as T;
    },
    getOptional: async <T,>(p: string): Promise<T | null> => (p in docs ? (docs[p] as T) : null),
  });

  it("returns the SAME source object when there is nothing to do — the normal path pays nothing", () => {
    const src = stub({});
    expect(migratingJsonSource(src, SCHEMA_VERSION)).toBe(src);
    expect(migratingJsonSource(src, SCHEMA_VERSION + 5)).toBe(src);
  });

  it("brings both get and getOptional forward", async () => {
    const chain = [docMigration(2, (p) => p === "exhibits.json", (d) => ({ ...(d as object), title: "migrated" }))];
    const src = migratingJsonSource(stub({ "exhibits.json": { title: "old" } }), 1, chain, 2);
    expect(await src.get("exhibits.json")).toEqual({ title: "migrated" });
    expect(await src.getOptional("exhibits.json")).toEqual({ title: "migrated" });
  });

  it("leaves an ABSENT document absent — a migration must never invent one", async () => {
    // Issue 23's absent-vs-failed distinction lives upstream of this decorator and must survive it.
    // A migration that defaulted `null` into `{}` would turn "this exhibit has no readings" into
    // "this exhibit has a readings file", which is a data-shape lie the reader can't detect.
    const chain = [docMigration(2, () => true, (d) => ({ ...(d as object), touched: true }))];
    const src = migratingJsonSource(stub({}), 1, chain, 2);
    expect(await src.getOptional("v/readings.json")).toBeNull();
  });

  it("throws (not silently passes through) when handed an uncoverable gap — that means a gate was bypassed", () => {
    expect(() => migratingJsonSource(stub({}), 1, [], 2)).toThrow(/no migration path from v1 to v2/);
  });
});

describe("validateArchieMarker — an older tree opens IFF the registry covers it (Archie-69f9)", () => {
  // These use a v0 marker against the real SCHEMA_VERSION of 1, so nothing is mocked and no constant
  // is bumped: v0 < v1 is a genuine older-than-reader tree today. When SCHEMA_VERSION rises these
  // keep working unchanged — the gap simply gets wider.
  afterEach(() => { TREE_MIGRATIONS.length = 0; }); // the registry is a module-level singleton

  const treeAt = async (version: number): Promise<MemoryFilesystem> => {
    const fs = new MemoryFilesystem();
    const root = await fs.root();
    const write = async (name: string, data: unknown): Promise<void> => {
      const w = await (await root.getFile(name, { create: true })).writable();
      await w.write(new TextEncoder().encode(JSON.stringify(data)).buffer as ArrayBuffer);
      await w.close();
    };
    await write("archie.json", { format: "archie-library", version, generator: "archie" });
    await write("exhibits.json", { exhibits: [] });
    return fs;
  };

  it("REFUSES a v0 tree while the registry is empty — the gate is not simply loosened", async () => {
    // The red half of the acceptance criterion, and the behaviour ADR-0020 depends on: accepting an
    // old marker with nothing behind it would trade a clean refusal for an undebuggable parse failure.
    await expect(validateArchieMarker(await treeAt(0))).rejects.toThrow(NotAnArchieLibraryError);
    await expect(validateArchieMarker(await treeAt(0))).rejects.toThrow(/no migration for schema v1/);
  });

  it("ACCEPTS the same v0 tree once a v1 migration is registered, and reports the version to migrate from", async () => {
    TREE_MIGRATIONS.push(docMigration(1, (p) => p === "exhibits.json", (d) => d));
    await expect(validateArchieMarker(await treeAt(0))).resolves.toBe(0);
  });

  it("still refuses a NEWER tree — that direction is not a migration question", async () => {
    TREE_MIGRATIONS.push(docMigration(1, () => true, (d) => d));
    await expect(validateArchieMarker(await treeAt(SCHEMA_VERSION + 1))).rejects.toThrow(/Update Archie/);
  });

  it("a current tree returns its version and needs no registry at all", async () => {
    await expect(validateArchieMarker(await treeAt(SCHEMA_VERSION))).resolves.toBe(SCHEMA_VERSION);
  });

  it("end to end: a v0 tree's documents come back MIGRATED through the wired seam", async () => {
    // The acceptance criterion's real shape — publish old, register the migration, read it back and
    // see the migrated value. Everything below the marker gate is the production path.
    TREE_MIGRATIONS.push(docMigration(1, (p) => p === "exhibits.json", (d) => ({ ...(d as object), migratedBy: "v1" })));
    const fs = await treeAt(0);
    const from = await validateArchieMarker(fs);
    const { fsJsonSource } = await import("../publish/read.js");
    const src = migratingJsonSource(fsJsonSource(fs), from);
    expect(await src.get("exhibits.json")).toEqual({ exhibits: [], migratedBy: "v1" });
    // And a document the migration doesn't claim is untouched.
    expect(await src.get("archie.json")).toEqual({ format: "archie-library", version: 0, generator: "archie" });
  });
});

describe("the WIRING carries a migration through a real production read path (Archie-69f9)", () => {
  // Everything above tests the mechanism. This tests that it is actually PLUGGED IN — the distinction
  // that `[[svelte-no-typecheck-net]]` is about, and that bit this very ticket's sibling earlier today:
  // a gate can be correct and measure nothing. Red-green: reverting either `migratedFsJsonSource` call
  // site to a plain `fsJsonSource` turns these red.
  afterEach(() => { TREE_MIGRATIONS.length = 0; });

  const publishedThenDowngraded = async (): Promise<MemoryFilesystem> => {
    const { publishLibrary } = await import("../publish/site.js");
    const { asExhibitId, asLibraryId, asObjectId } = await import("../wadm/brand.js");
    const fs = new MemoryFilesystem();
    await publishLibrary(
      fs,
      {
        id: asLibraryId("lib"),
        title: "Lib",
        exhibits: [{
          id: asExhibitId("exA"), slug: "a", title: "A",
          objects: [{ id: asObjectId("o1"), source: "https://img/a.jpg", label: "A1", width: 10, height: 10 }],
        }],
      },
      () => [],
      { baseUrl: "https://u/lib/" },
    );
    // Rewrite the marker to v0 — an "older tree" without touching SCHEMA_VERSION. This is the
    // acceptance criterion's shape (publish current, make the reader newer, re-open) with the version
    // gap created on the file rather than in the constant, so nothing is mocked.
    const root = await fs.root();
    const w = await (await root.getFile("archie.json", { create: true })).writable();
    await w.write(new TextEncoder().encode(JSON.stringify({ format: "archie-library", version: 0, generator: "archie" })).buffer as ArrayBuffer);
    await w.close();
    return fs;
  };

  it("loadPortableGallery migrates exhibits.json on an older tree", async () => {
    const { loadPortableGallery } = await import("../publish/portable.js");
    const fs = await publishedThenDowngraded();
    // An ungated reader on an OLDER tree with nothing registered gets the reader-facing refusal, not
    // an internal invariant error — the distinction the wiring test forced into existence.
    await expect(loadPortableGallery(fs)).rejects.toThrow(NotAnArchieLibraryError);

    TREE_MIGRATIONS.push(docMigration(1, (p) => p === "exhibits.json", (d) => {
      const g = d as { exhibits: Array<{ title: string }> };
      return { ...g, exhibits: g.exhibits.map((e) => ({ ...e, title: `${e.title} (migrated)` })) };
    }));
    const gallery = await loadPortableGallery(fs);
    expect(gallery.exhibits[0]!.title).toBe("A (migrated)");
  });

  it("readPublishedExhibit migrates a per-exhibit manifest on an older tree", async () => {
    // A different seam AND a different document kind (a path-matched manifest, not the root index) —
    // so this doesn't merely re-test the previous line through another name.
    const { readPublishedExhibit } = await import("../publish/site.js");
    const fs = await publishedThenDowngraded();

    TREE_MIGRATIONS.push(docMigration(1, (p) => p === "a/manifest.json", (d) => {
      const m = d as { label?: unknown; items?: unknown[] };
      return { ...m, label: { none: ["Migrated title"] } };
    }));
    const read = await readPublishedExhibit(fs, "a");
    expect(read.title).toBe("Migrated title");
    // Assert the SUBJECT is non-empty too: a reader that returned an empty exhibit would satisfy a
    // title check on its own and prove nothing about the manifest actually being read.
    expect(read.objects).toHaveLength(1);
  });

  it("a CURRENT tree is untouched by a registered migration — the version, not the registry, decides", async () => {
    // The other direction. Without this, a wiring that migrated unconditionally would pass both tests
    // above while corrupting every normal library.
    const { loadPortableGallery } = await import("../publish/portable.js");
    const fs = await publishedThenDowngraded();
    const root = await fs.root();
    const w = await (await root.getFile("archie.json", { create: true })).writable();
    await w.write(new TextEncoder().encode(JSON.stringify({ format: "archie-library", version: SCHEMA_VERSION, generator: "archie" })).buffer as ArrayBuffer);
    await w.close();
    TREE_MIGRATIONS.push(docMigration(1, () => true, () => ({ exhibits: [] })));
    expect((await loadPortableGallery(fs)).exhibits).toHaveLength(1); // migration NOT applied
  });
});
