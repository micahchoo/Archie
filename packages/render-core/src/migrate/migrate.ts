// Schema migration runner (CONTEXT orphan gap "Schema migration"; strategy §39 — the orphan
// gate most likely to slip). Stamp a `schemaVersion` on persisted v1 docs so they are
// migratable, and run named migrations (the tldraw pattern) to bring old docs forward.
//
// The DISCIPLINE this establishes: the runner exists from day one, so the first real schema
// change just appends a Migration entry — never a retrofit. (rev / layers / archie: metadata
// were the schema edits that triggered owing this — strategy §39 "the first schema edit is the trigger".)

/** Current on-disk schema version. v1 docs are stamped so a future runner can migrate them. */
export const SCHEMA_VERSION = 1;

/** A named, ordered schema migration. `up` transforms a doc from version `to-1`-shape to `to`-shape. */
export interface Migration {
  to: number;
  description: string;
  up: (doc: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * The live migration registry. EMPTY in v1 (no migrations needed yet — the baseline). The first
 * real schema change appends `{ to: 2, description, up }` here; the runner does the rest.
 */
export const MIGRATIONS: Migration[] = [];

function versionOf(doc: Record<string, unknown>): number {
  const v = doc["schemaVersion"];
  return typeof v === "number" ? v : 0;
}

/** Stamp the current schema version onto a document (call when writing). */
export function stamp<T extends object>(doc: T): T & { schemaVersion: number } {
  return { ...doc, schemaVersion: SCHEMA_VERSION };
}

/**
 * Bring `doc` forward by applying every migration whose `to` exceeds the doc's current version,
 * in ascending order, then stamp it to at least SCHEMA_VERSION. Idempotent past the current
 * version. Pass an explicit `migrations` list in tests; defaults to the live registry.
 */
export function migrate(doc: Record<string, unknown>, migrations: Migration[] = MIGRATIONS): Record<string, unknown> {
  const from = versionOf(doc);
  let data: Record<string, unknown> = doc;
  let applied = false;
  for (const m of [...migrations].sort((a, b) => a.to - b.to)) {
    if (m.to > versionOf(data)) {
      data = { ...m.up(data), schemaVersion: m.to };
      applied = true;
    }
  }
  const targetVersion = Math.max(SCHEMA_VERSION, ...migrations.map((m) => m.to), from);
  if (versionOf(data) < targetVersion) {
    data = { ...data, schemaVersion: targetVersion };
    applied = true;
  }
  return applied ? data : doc;
}
