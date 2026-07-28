// Tree-level schema migration (Archie-69f9) — bring an OLDER published tree forward AT READ TIME so a
// distributed archive keeps opening after a schema bump. The complement to `migrate.ts`, which is
// per-annotation-document and cannot touch a tree's `exhibits.json` / `collection.json` / manifests.
//
// WHY READ-TIME AND NOT REWRITE-IN-PLACE. A published tree is frequently not writable by the reader:
// the embed opens one over plain HTTP (`load.ts`), and the whole point of ADR-0020's static-publishable
// tree is that it may sit on a host with no server. So migration decorates the READ seam (`JsonSource`)
// and the tree on disk is never touched. That also makes it idempotent for free — nothing is persisted,
// so there is no half-migrated state to reason about.
//
// PRIOR ART — tldraw's store schema, read from source at
// `/mnt/Ghar/2TA/DevStuff/tldraw-mcp/node_modules/@tldraw/store/dist-esm/lib/StoreSchema.mjs`
// (the mechanism `ledgers/LEARN-tldraw-merged-2026-07-22.md` P3 recommends, verified rather than
// quoted). Three properties taken from it, each at a line:
//
//   1. `:107-109` — a persisted version NOT found in the migration sequence is
//      `Result.err("Incompatible schema?")`. Coverage is REQUIRED; a gap refuses. It does not
//      best-effort its way forward, which is what makes accepting an old version safe at all.
//   2. `:174-191` (`migrateStoreSnapshot`) — migrations carry a SCOPE. `"record"` runs per document
//      (with an optional `filter`); `"store"` runs once over the whole collection.
//   3. `:126-131` — a `"store"`-scope migration on the single-record path is a hard error
//      (`TargetVersionTooNew`), NOT a no-op. You cannot migrate one document when the change spans
//      documents, and pretending otherwise is how you get silent corruption.
//
// Point 3 is the one that shaped this file. A per-read decorator is STRUCTURALLY incapable of a
// cross-document migration: it is handed one path at a time, and over HTTP it cannot even enumerate
// the tree to find the others (`JsonSource` has no listing — deliberately, so HTTP can satisfy it).
// So `scope: "tree"` exists in the type and is REFUSED by the gate rather than silently skipped. The
// day a real one is needed, it needs an eager whole-tree pass and a decision about the HTTP case;
// refusing until then keeps a clean error instead of a subtly wrong library.

/** How much of the tree a migration needs to see. */
export type TreeMigrationScope =
  /** One document at a time, chosen by `path`. The only scope a read-time decorator can honour. */
  | "doc"
  /** The whole tree at once (data moving BETWEEN documents). Not implementable on the read seam —
   *  declared so the gate can refuse precisely instead of silently under-migrating. */
  | "tree";

/** A named, ordered tree migration. `up` takes a doc at version `to - 1` shape to `to` shape. */
export interface TreeMigration {
  to: number;
  description: string;
  scope: TreeMigrationScope;
  /** Which documents this applies to, tree-relative (`"exhibits.json"`, `"voynich/manifest.json"`).
   *  Ignored for `scope: "tree"`. */
  path: (path: string) => boolean;
  /** Pure transform. MUST NOT mutate `doc` — tldraw `structuredClone`s for the same reason
   *  (`StoreSchema.mjs:141`); here the doc is freshly parsed per read, but a migration that mutates
   *  its input is still wrong the moment anything memoizes. */
  up: (doc: unknown, path: string) => unknown;
}

/** The live tree-migration registry. EMPTY at v1 — the baseline. A schema bump appends here. */
export const TREE_MIGRATIONS: TreeMigration[] = [];

/** Why an older tree cannot be brought forward. Carried out of the planner so the marker gate can give
 *  advice specific to the cause rather than one catch-all "re-publish it". */
export type TreeMigrationGap =
  /** No migration is registered for some version in `(from, target]` — tldraw's "Incompatible schema?"
   *  (`StoreSchema.mjs:108`). This is the ordinary case for a tree older than any migration we kept. */
  | { reason: "no-path"; missing: number }
  /** A migration in the chain needs the whole tree, which the read seam cannot provide. */
  | { reason: "needs-whole-tree"; to: number; description: string };

/**
 * The migrations that bring a tree at version `from` up to `target`, or the reason it can't be done.
 *
 * Coverage is total-or-nothing on purpose (property 1 above): EVERY intermediate version needs a
 * migration, or the answer is a refusal. A partial chain would leave documents at a version the reader
 * does not understand while reporting success — the exact trade ADR-0020's clean refusal exists to
 * avoid, just moved one layer in where it would be harder to diagnose.
 */
export function treeMigrationsSince(
  from: number,
  target: number,
  migrations: TreeMigration[] = TREE_MIGRATIONS,
): { ok: true; migrations: TreeMigration[] } | { ok: false; gap: TreeMigrationGap } {
  if (from >= target) return { ok: true, migrations: [] }; // nothing to do (same version, or newer — the
  // newer direction is the caller's to refuse; it is not a migration question)
  const chain: TreeMigration[] = [];
  for (let v = from + 1; v <= target; v++) {
    const step = migrations.filter((m) => m.to === v);
    if (step.length === 0) return { ok: false, gap: { reason: "no-path", missing: v } };
    for (const m of step) {
      if (m.scope === "tree") {
        return { ok: false, gap: { reason: "needs-whole-tree", to: m.to, description: m.description } };
      }
      chain.push(m);
    }
  }
  return { ok: true, migrations: chain };
}

/**
 * The user-facing sentence for an uncoverable gap. ONE definition, because the zip gate
 * (`validateArchieMarker`) and the tree gate (`assertArchieTreeMarker`) must not drift into giving
 * different advice about the same file — that drift is what `[[untrusted-archive-open-seam]]` was
 * written about, and these two validators are deliberately separate code paths.
 *
 * The advice differs by CAUSE, which is the whole point of carrying a typed gap out of the planner:
 * "no-path" is genuinely the author's to fix by re-publishing, while "needs-whole-tree" is ours and
 * re-publishing is beside the point — so saying "re-publish" there would send them down a dead end.
 */
export function migrationGapMessage(from: number, gap: TreeMigrationGap): string {
  const head = `This library was published by an older version of Archie (schema v${from}).`;
  return gap.reason === "no-path"
    ? `${head} This reader has no migration for schema v${gap.missing}, so it can't be brought forward. Re-publish it from a current Archie.`
    : `${head} Bringing it forward needs a whole-tree migration (${gap.description}) that a reader can't run against a published tree — re-publish it from the original library.`;
}

/** Apply a resolved chain to ONE document. `path` selects which migrations apply. Pure. */
export function migrateTreeDoc(doc: unknown, path: string, chain: TreeMigration[]): unknown {
  let out = doc;
  for (const m of chain) if (m.path(path)) out = m.up(out, path);
  return out;
}
