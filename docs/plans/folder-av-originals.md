# Plan: AV originals in the bound folder (outside quota)

**Status:** designed, not built — deliberately split from the 2026-07-20 storage batch
(quota-preflight removal · storage chip · TIFF transcode · `persist()`), which shipped together.
**Why it exists:** WICG File System Access §6.3 — files written through a user-granted directory
handle are *not subject to storage quota*. Archie already owns the machinery (`folder-backend.ts`,
the FSA `Filesystem` seam, `handles-db.ts`) but uses the folder only as a **mirror of OPFS**, so
every AV byte still pays origin quota. A 6.8 GB folder of interview MOVs is the working store's
single biggest cost and the least-annotated content per byte.

## Why this was NOT bolted onto the storage batch

Three load-bearing contracts break if this is done shallowly — each needs its own design decision,
not a flag:

1. **The mirror's healing model.** `binding-store` treats a full resync as "source of truth = the
   OPFS working copy" (mirror-stamp.ts). An asset that lives *only* in the folder reads as drift and
   would be deleted or flagged by the next resync. Folder-primary AV inverts authority for a subset
   of paths — the resync algorithm must learn a second disposition ("folder-authoritative asset:
   verify presence, never overwrite from OPFS").
2. **Publish and zip export read assets from the OPFS store.** `publishLibrary` / zip flows walk the
   working store's `Filesystem`. Folder-primary bytes must be pulled through the binding fs at
   export time — and a revoked permission mid-export must fail loudly (the absent-vs-failed
   distinction from render-core's data-integrity rules), never produce a zip silently missing media.
3. **The permission lifecycle.** FSA read permission on the bound folder is re-granted by user
   gesture per session. Today a lapsed grant degrades the *mirror* (writes queue up; OPFS still has
   everything). With folder-primary AV, a lapsed grant makes objects **unopenable** — the editor
   needs a "re-connect the folder" affordance at the point of failure, not a broken `<video>`.

## Design sketch

- **Scope:** AV files (`sound`/`video`) over `LARGE_MEDIA_BYTES` (100 MB), only while
  `binding.kind === "folder"` (or Tauri, where the fs is native and quota never applies). Images
  stay in OPFS — they're small post-bake and hot (canvas/annotation).
- **Write path:** `addObjectFromFile`'s AV branch routes through a new `persistLargeAv(slug, name,
  file)` that writes via the binding `Filesystem` to the same path the mirror would have used
  (`exhibits/{slug}/assets/{name}`), through the save queue (health + single-writer gate apply
  unchanged), temp-then-rename on Tauri per the fs-seam rule.
- **Model:** the object's `source` stays `asset://{name}` — no new scheme, no render-core model
  field, no carry-sentinel ripple. Residency is *derived* (OPFS miss → try binding fs), not stored.
- **Read path:** `store.readAssetUrl` grows a fallback: OPFS miss → binding fs read → blob URL.
  Same for export walks. Absent in both = the existing missing-asset path.
- **Resync rule:** during full resync, an asset present in the folder but not OPFS is
  **folder-authoritative if its name is referenced by library.json** (verify, keep); unreferenced =
  today's drift handling. This is the one mirror-algorithm change.
- **Un-bind / zip-save:** "Save as .archie.zip" and unbinding must offer to pull folder-resident AV
  back in (or record them as links) — never silently drop.

## Open questions (decide before building)

- Should the user opt in per-import ("Keep this recording in your project folder") or is
  size+binding enough? The large-AV nudge copy is the natural place to surface it.
- Multi-tab: the writer lock covers the save queue, but a second tab's *reads* of folder AV need no
  gate — confirm no handle-contention issue in Chromium.
- Does the viewer's published-tree reader ever see these? (No — publish materializes bytes. Verify
  with a publish-with-folder-AV test before shipping.)

## Estimate

Store fallback + ingest routing + resync rule ≈ a day with tests; the permission-lapse UX is the
long pole. Recommend building behind `feature-flags.ts` and shipping the Tauri branch first (no
permission lifecycle at all).
