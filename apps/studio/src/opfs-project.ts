// The stable identity of Studio's single OPFS working project — a LEAF module (imports nothing) so
// both store.ts (id-scheme migration, dir openers, library/pending-note metadata) and asset-store.ts
// (the asset-blob I/O cluster, Archie-cf93) can import ONE copy instead of each declaring its own.
// Follow-up to the Archie-cf93 split review: a duplicated PROJECT literal is load-bearing, not
// cosmetic — store.ts also exports it as WORKING_STORE_ID, the cross-tab single-writer lock name
// (ISSUES.md Issue 22 / ledgers/TABS.md), so two copies that drift would partition assets and
// library.json into different OPFS project dirs with no error, just silent data loss. Same class of
// hazard the untrusted-archive-open-seam rule already closed for SRC_MAX_BYTES (packages/render-core/
// src/limits.ts) — one definition, importers share it instead of "identical" literals.
export const PROJECT = "archie-demo-project";

/** Structural shape of `navigator.storage` — shared so store.ts and asset-store.ts don't each
 *  declare their own copy. A pure type (`import type` erases at compile time, no runtime edge), so
 *  unlike PROJECT it was never actually at risk of a store.ts<->asset-store.ts import cycle; it lives
 *  here anyway so the two OPFS-root-shape declarations don't drift apart either. */
export type OpfsRoot = { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
