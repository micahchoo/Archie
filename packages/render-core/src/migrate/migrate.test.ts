import { describe, it, expect } from "vitest";
import { migrate, normalizeRecord, stamp, SCHEMA_VERSION, type Migration } from "./migrate.js";

// Schema migration runner (CONTEXT orphan gap; strategy §39 — the gate most likely to slip).
// Named-migration pattern (tldraw): a versioned doc + an ordered migration list; the runner
// applies every migration whose `to` exceeds the doc's current version, then stamps.

// A hypothetical future migration set, used to prove the runner mechanism works.
const sample: Migration[] = [
  { to: 2, description: "rename `old` -> `renamed`", up: (d) => ({ ...d, renamed: (d as { old?: unknown }).old }) },
  { to: 3, description: "add `count` default 0", up: (d) => ({ count: 0, ...d }) },
];

describe("migrate", () => {
  it("applies migrations whose `to` exceeds the doc version, in order, then stamps", () => {
    const { doc, migrated } = migrate({ schemaVersion: 1, old: 5 }, sample);
    expect(migrated).toBe(true);
    const out = doc as { schemaVersion: number; old: number; renamed: number; count: number };
    expect(out.renamed).toBe(5); // v2 ran
    expect(out.count).toBe(0); // v3 ran
    expect(out.schemaVersion).toBe(3); // stamped to the latest migration
  });

  it("treats an unversioned doc as version 0 (applies all migrations)", () => {
    const { doc, migrated } = migrate({ old: 9 }, sample);
    expect(migrated).toBe(true);
    const out = doc as { schemaVersion: number; renamed: number };
    expect(out.renamed).toBe(9);
    expect(out.schemaVersion).toBe(3);
  });

  it("is a no-op when the doc is already at the latest version (migrated: false)", () => {
    const doc = { schemaVersion: 3, renamed: 1, count: 0 };
    const result = migrate(doc, sample);
    expect(result.migrated).toBe(false);
    expect(result.doc).toEqual(doc);
  });

  it("does not re-run already-applied migrations (idempotent past the current version)", () => {
    const { doc: once } = migrate({ schemaVersion: 1, old: 2 }, sample);
    const { doc: twice, migrated } = migrate(once, sample);
    expect(migrated).toBe(false);
    expect(twice).toEqual(once);
  });
});

describe("normalizeRecord", () => {
  it("is a no-op for a record with no legacy layers", () => {
    const record = { logicalId: "a" as never, rev: "r1" as never, version: 1, parent: null, modifiedAt: "", lastEditor: "me" as never, deleted: false, target: "t" as never };
    expect(normalizeRecord(record)).toBe(record);
  });
});

describe("stamp / SCHEMA_VERSION (v1 baseline)", () => {
  it("stamps the current schema version onto a document", () => {
    expect(stamp({ a: 1 })).toEqual({ a: 1, schemaVersion: SCHEMA_VERSION });
  });
  it("SCHEMA_VERSION is a positive integer (v1 stamps so v1 files are migratable)", () => {
    expect(Number.isInteger(SCHEMA_VERSION) && SCHEMA_VERSION >= 1).toBe(true);
  });
  it("migrate with the real (v1 baseline) registry is a no-op that stamps the current version", () => {
    const { doc, migrated } = migrate({ schemaVersion: SCHEMA_VERSION, x: 1 });
    expect(migrated).toBe(false); // already at current version
    expect((doc as { schemaVersion: number }).schemaVersion).toBe(SCHEMA_VERSION);
  });
});
