# Plan: the native folder is the canonical desktop working store

**Ticket:** Archie-623e (Phase-3 spine). **Blocked by (seeds):** Archie-cf93 (asset-store split),
Archie-fada (native-fetch-images). **Coordinates with:** Archie-cf54 (freecut storage findings),
Archie-b0b1 (rev-log enact), pending task #5 / `docs/plans/folder-av-originals.md`.
**Discipline:** /writing-plans → /executing-plans. Every phase ≤5 files, independently verifiable,
reversible. `grep -a` always (NUL bytes recur). Web build byte-identical throughout — every desktop
change is gated by `isTauri()`.

---

## 1. Decision record

### 1.1 What "canonical" means

**Desktop (Tauri):** the native folder at `defaultLibraryRoot()` (`{appDataDir}/library`, e.g.
`~/.var/app/digital.compost.archie/data/library` under Flatpak) is THE working store. Studio authors
*directly onto disk* — `library.json`, annotations, structure logs, and all asset bytes — via
`TauriFilesystem` (`packages/render-core/src/fs/tauri.ts`) with atomic temp-then-rename
(`.claude/rules/tauri-fs-seam.md`). No storage quota, no eviction.

**Web:** OPFS stays canonical — demoted from "the working store" to "the *web-only* working store."
`store.ts:38` (`openRootFs` → `FsaFilesystem` over `navigator.storage.getDirectory()`) is unchanged
on web. The folder-AV-originals design (§3) remains the web escape hatch for large media.

This completes the design the code already encodes but never wired: `fs/tauri.ts`'s header ("a native
folder on disk is the canonical store"), the dead `defaultLibraryRoot()` export (`tauri-fs.ts:37`,
**verified zero importers**), and the unused `$APPDATA/**` + `$HOME/**` `fs:scope` / `assetProtocol`
scopes (`tauri.conf.json`, `capabilities/default.json`). The desktop app has shipped OPFS-canonical, so
**existing desktop users have real OPFS libraries** — migration (§1.2) is load-bearing, not theoretical.

### 1.2 Migration story (existing desktop OPFS → folder)

One-time, sentinel-guarded, idempotent — modelled on the existing `migrateResidentStoreIds`
(`store.ts:64`) snapshot-then-marker protocol and render-core-data-integrity rule 1 (content first,
marker LAST):

1. On first Tauri boot of a folder-canonical build, before mounting: if `{folderRoot}/migrated.json`
   is absent AND an OPFS working library exists, copy the **entire OPFS tree** (library.json +
   annotations + structure + every asset subdir) into the folder.
2. Write `{folderRoot}/migrated.json` (schema/version + timestamp) **LAST** — it is the commit point.
   A crash mid-copy leaves the marker absent → next boot reads as *not migrated* → re-runs, overwriting
   partial files idempotently. A torn folder never reads as "complete."
3. **Do NOT delete OPFS in the same release.** Migration copies, never moves. This keeps rollback safe
   (revert the build → desktop reads its intact OPFS library, stale but never lost) and gives a fallback
   if the folder is later found unreadable. A separate, much-later phase (out of scope here, filed as a
   follow-up) clears the OPFS copy once the folder store has proven durable in the field.

Guard against the scheme colliding with `migrateResidentStoreIds`: object-id migration runs **on the
folder** after the OPFS→folder copy (the copied bytes carry whatever id-scheme the OPFS store had).

---

## 2. Phases

### Phase 0 — Preconditions (gate, no code)

- Confirm **Archie-cf93 merged** (asset I/O extracted to `apps/studio/src/asset-store.ts` — this plan
  assumes that seam exists; `store.ts` is currently a 4-concern module and its asset I/O uses **raw
  OPFS `FileSystemDirectoryHandle`**, not the `Filesystem` seam, so it cannot be re-pointed until split).
- Confirm **Archie-fada merged** (remote-image/IIIF native fetch — shares `tauri-fs.ts`, `ingest-flows.ts`).
- Pin base sha: `git rev-parse main`. Worktree Step 0: `git checkout -B wf/native-store <SHA>` then
  `pnpm install --prefer-offline`.

### Phase 1 — Migration engine + streaming asset write (the safety net, dormant)

Build the two primitives the flip needs, *before* flipping anything. No working-store relocation yet.

- **Files (≤4):** NEW `packages/render-core/src/fs/copy-tree.ts` (a backend-agnostic recursive
  `Filesystem`→`Filesystem` copy — content first) + its test; NEW `apps/studio/src/opfs-to-folder.ts`
  (the sentinel-guarded one-time migration composing copy-tree over the OPFS `FsaFilesystem` and a
  `TauriFilesystem`, `migrated.json` written LAST) + its test.
- **Streaming asset write:** `TauriFile.writable()` (`fs/tauri.ts:67`) accumulates every chunk in a JS
  array and concatenates on `close()` — a 6.8 GB interview MOV would materialize ~2× in heap → OOM.
  Add a streaming large-write path that drives plugin-fs `open()` directly (the pattern already proven
  in `openTauriStreamingZipSave` / `writeAllToTauriHandle`, `tauri-fs.ts:99`), so asset bytes stream to
  disk in bounded memory. Small JSON keeps the buffering path (temp-then-rename atomicity matters there).
  Touches `fs/tauri.ts` (+bridge method if needed → **both** implementers per tauri-fs-seam rule) and
  the app adapter `tauri-fs.ts`.
- **Done when:** headless `copy-tree` test green (round-trips a multi-dir tree); migration test proves
  a **torn copy leaves `migrated.json` absent** and re-runs idempotently; streaming-write test proves a
  large blob never fully buffers. `cd packages/render-core && pnpm test && pnpm exec tsc --noEmit`;
  `cd apps/studio && pnpm exec vitest run && pnpm typecheck`.
- **Reversible:** purely additive; no consumer yet.

### Phase 2 — Mount the folder as the resident store on Tauri (the flip)

- **Files (≤5):** NEW `apps/studio/src/resident-store.ts` — one `residentFs(): Promise<Filesystem>`
  accessor returning `TauriFilesystem(await defaultLibraryRoot())` under `isTauri()` (running the Phase-1
  migration first, once per process), else today's OPFS `FsaFilesystem`. Re-point `store.ts` (metadata
  openers `openRootFs`/`openProjectDir`/`openExhibitAnnotationsDir`/`openExhibitStructureDir*`) and
  `asset-store.ts` (asset read/write group) at `residentFs()`. `tauri-fs.ts` gains the `defaultLibraryRoot`
  consumer (kills the dead export). Boot wiring in `App.svelte` calls migration→mount before first read.
- **Layout in the folder:** identical to the OPFS layout (`library.json`, `exhibits/{slug}/…`,
  `assets/`, `assets-thumb/`, `assets-original/`, `assets-peaks/`) — copy-tree preserves it, and keeping
  one layout means publish/export/import walk the same tree shape on every backend. Waveform peaks
  (regenerable) live in the folder too; a single source of truth beats a second cache backend (freecut
  keeps OPFS-as-cache only because OPFS `SyncAccessHandle` is fast — moot on native disk).
- **Done when:** a packaged desktop session authors to `{appDataDir}/library` and survives relaunch
  (only the packaged app proves this — **rides Archie-a09d** native smoke); migration of a real
  pre-existing OPFS library is verified in the packaged app; `cd apps/studio && pnpm exec vitest run &&
  pnpm typecheck && pnpm --filter @archie/studio run check`; **web browser-drive** (run-app skill, spare
  port, Playwright-from-/tmp) confirms OPFS path untouched.
- **Reversible:** `isTauri()`-gated; web is byte-identical. Desktop rollback safe because migration
  copied, never moved (§1.2.3).

### Phase 3 — Storage chip, persist(), quota on native fs

The web storage model does not describe native disk; make the chrome honest instead of misleading.

- **Files (≤3):** `storage-quota.svelte.ts`, its consuming chip component, `ingest-flows.ts`
  (`persistAsset` seam, `:178`).
- **Decisions:** under `isTauri()` — (a) **hide the storage chip** (`navigator.storage.estimate().usage`
  now reports only OPFS cache residue, not the real folder library — worse than nothing); (b) **skip
  `persist()`** (no eviction concept on native fs); (c) the attempt-and-catch in `persistAsset` already
  handles write failure generically — on native fs the throw is ENOSPC/EACCES, not `QuotaExceededError`,
  and surfaces through the normal save-error path, not the "storage full" chip. Cites freecut-unverified
  items 1, 2, 5 (§3).
- **Done when:** studio vitest + typecheck green; browser-drive confirms the web chip is unchanged;
  packaged app shows no chip (rides a09d).

### Phase 4 — Asset URL serving on desktop (assetProtocol vs blob)

- **Files (≤3):** `asset-urls.svelte.ts` (read-time resolver), `asset-store.ts` (a `residentAssetUrl`
  helper), AV read sites (`AvEditor.svelte` / wavesurfer source).
- **Decision — split by media, driven by memory not preference:**
  - **Images (canvas masters + thumbnails):** keep **blob: URLs** (`readAssetUrl` → `createObjectURL`).
    Tens of MB materialized once is fine, and it leaves OpenSeadragon's mount path **unchanged** — the
    `assetProtocol` + OSD + WebKitGTK combination is flagged the "highest-risk remaining item"
    (`src-tauri/README.md:44-48`); do not put it on the load-bearing image path first.
  - **AV (`<video>`/`<audio>`/wavesurfer) on Tauri:** use **`convertFileSrc()`** (`asset://` URL) — a
    blob URL here means reading a multi-GB file fully into heap (`TauriFile.getFile` → `readFile`) →
    OOM. `convertFileSrc` streams from disk with byte-range support (native seeking). The
    `assetProtocol.scope` (`$APPDATA/**`, `$HOME/**`) and CSP (`asset:`/`http://asset.localhost` on
    `img-src`/`media-src`, `.claude/rules/tauri-csp.md`) already permit exactly this — the plan **spends
    the unused capability**, and touches neither CSP nor `script-src`.
- **Done when:** packaged app plays folder-resident AV via `asset://` and renders images via blob
  (rides a09d — only the webview proves `convertFileSrc` + WebKitGTK); studio vitest/typecheck green.

### Phase 5 — Two-instance write safety on a real folder

OPFS was serialized by `navigator.locks` across tabs of one origin. A folder on disk written by **two
app processes** has no such coordination: `navigator.locks` is per-webview-process and the
`writer-lock.svelte.ts` BroadcastChannel fallback does **not** cross OS processes. **No single-instance
plugin is configured** (verified). Freecut-unverified item 4 (platform-enforced FSA lock serialization)
underlines that the browser used to give this for free; native fs does not.

- **Files (≤4):** `src-tauri/Cargo.toml` + `src-tauri/src/lib.rs` (add `tauri-plugin-single-instance`),
  `capabilities/default.json` if a permission is needed, and a working-store generation-token guard
  (reuse `mirror-stamp.ts` at the resident-store level).
- **Decisions:** (a) **`tauri-plugin-single-instance`** — a second launch focuses the existing window
  instead of opening a second writer. Structural fix; eliminates the two-process race entirely. (b)
  **Defense-in-depth:** an on-disk generation token in the library root (the `mirror-stamp` mechanism
  binding-store already uses for external-writer detection, `binding-store.svelte.ts:79`) — before a
  save, a token mismatch means a sync tool (Dropbox/Syncthing over `$APPDATA` or `$HOME`) or an
  out-of-band writer touched the folder → pause + warn, never blind-overwrite. This is the desktop
  analogue of Issue 25 row (c).
- **Done when:** packaged app: a second launch focuses, does not open a 2nd window (rides a09d);
  rust unit/integration where feasible; the token guard has a headless studio test.
- **Reversible:** single-instance is a manifest+plugin add; the token guard is isTauri()-gated.

### Phase 6 — Reconcile FolderBinding / export-import (no double-write)

When the resident store IS already a durable folder, the existing "bind a folder and mirror to it"
machinery must not double-write or fight the resident store.

- **Files (≤4):** `binding-store.svelte.ts`, `folder-backend.ts`, `binding.ts`, `publish-flows.svelte.ts`.
- **Decisions:** on Tauri — (a) the resident folder is not a *binding* (no mirror loop): the working
  store is durable already, so `mirrorToFolder`/`fullFolderWrite` autosave-to-a-bound-folder is **not
  engaged** for the resident root. (b) "Save/Open a folder" (`pickFolderBinding` / `openProjectFolder`)
  and `.archie.zip` export remain **portability/backup** operations that write to a *different*,
  user-chosen location via the existing `openStreamingZipSave` Tauri branch — never the resident root.
  (c) Import (open a folder / adopt a zip) replaces the resident store through the same
  `replaceProjectFrom` path, now writing the folder instead of OPFS. Verify no path both authors-in-place
  AND mirrors the same bytes.
- **Done when:** studio vitest + typecheck + e2e (`--config e2e/playwright.config.ts`, port 5198) green;
  packaged app: author-in-place + export-elsewhere + reopen round-trip (rides a09d).

---

## 3. Subsume-or-separate: folder-AV originals + freecut cf54 findings

**Verdict: 623e SUBSUMES the Tauri branch of `docs/plans/folder-av-originals.md`; the web (FSA) branch
remains a SEPARATE, still-valid plan.**

- folder-av-originals routes *large AV only* to a bound folder *while OPFS stays the working store*,
  with residency derived (OPFS miss → binding fs), a permission lifecycle, and a resync authority
  inversion. Its own estimate recommends **"shipping the Tauri branch first (no permission lifecycle at
  all)."** 623e delivers exactly that and more: on desktop **everything** (not just AV) is folder-resident
  by default, so the OPFS-primary-plus-folder-fallback split, the residency-derivation, and the
  permission-lapse UX **do not exist on desktop** — there is one durable folder. The three load-bearing
  contracts folder-av-originals worried about (mirror healing model, publish reading OPFS, permission
  lifecycle) are all mooted on Tauri by having no mirror and no permission gesture.
- **What stays separate:** the **web** studio keeps OPFS-canonical (§1.1), so large AV on web still pays
  quota unless pushed to a user-bound FSA folder. folder-av-originals is therefore **retargeted to
  web-only** and remains open — its Tauri mentions are now delivered here. Update its status header to
  "web-only; Tauri branch delivered by Archie-623e" when 623e lands (that edit is out of this plan's
  file scope — noted as a follow-up).

**Freecut findings carried (Archie-cf54 — verify the cited source, then this plan cites them):**

1. **`persist()` is advisory** (freecut-unverified item 1; browser-storage-quota §2) — satisfied on web
   already (`storage-quota.svelte.ts:59`); **N/A on Tauri** (Phase 3 skips it). Export stays the
   durability backstop regardless of store.
2. **WebKit evicts infrequently-opened origins under zero storage pressure** (item 2) — **the strongest
   desktop-specific motivation.** Archie's desktop webview is WebKitGTK, and Archie's use case is
   occasionally-opened local libraries — precisely WebKit's eviction target. A native folder removes the
   OPFS working store from eviction's reach entirely. Drives §1.1.
3. **Every non-OPFS FSA save pays a full temp-copy; no in-place streaming to user folders** (item 3) —
   fine for write-once AV, bad for frequently-rewritten files. On Tauri the temp-then-rename IS the
   atomic write; JSON rewrites pay a small temp-copy each save (acceptable). Reinforces Phase 1's
   streaming-write path for large AV and keeping small-JSON on the buffered atomic path.
4. **FSA locking is platform-enforced; the browser serializes concurrent writers** (item 4) — native fs
   does not. Directly motivates Phase 5's single-instance + token guard.
5. **Firefox caps non-persisted origins at min(10% disk, 10 GiB); `QuotaExceededError` is catchable**
   (item 5; browser-storage-quota §1) — a hard ceiling the native folder has no equivalent of. Confirms
   Phase 3's "no quota accounting on desktop."

**Freecut storage tiering (lessons ranks 1–2) — the shape this converges on:** "durable ≠ OPFS; OPFS =
regenerable cache; durable = a real folder." 623e is the desktop realization: native folder = durable
working store. The one deviation — we keep regenerable peaks *in* the folder rather than a separate
cache — is deliberate (§ Phase 2: no quota means no reason to segregate cache).

---

## 4. Interaction with Archie-b0b1 (rev-log enact)

Both are Phase-3, both blocked by fada, both touch `App.svelte` + `ingest-flows.ts`; b0b1 also touches
`store.ts` structure-log openers (`openExhibitStructureDir*`). Seeds encode no order between them.

**Recommendation: land 623e FIRST, then rebase b0b1 onto it.** 623e relocates the resident store; b0b1's
structure-log home (`openExhibitStructureDir` → `structure/history/`) rides those same openers, so it
must build on the relocated seam, not the OPFS one. Concretely: after 623e, b0b1's structure persistence
writes into the native folder for free (the openers already route through `residentFs()`). If b0b1 must
land first for scheduling reasons, 623e's Phase 2 re-point simply includes the structure openers b0b1
added — the seam is the same. **Do not run them in parallel** (shared `App.svelte`/`ingest-flows.ts`
hot files — resolve semantically, sequential merges only, per the fleet dispatch protocol).

---

## 5. Test / verify strategy

| Phase | Gates (in-lane + merged tree) | Only the packaged app can prove |
|---|---|---|
| 1 | render-core vitest + `tsc --noEmit`; studio vitest + `pnpm typecheck` | — (headless-provable) |
| 2 | studio vitest + typecheck + svelte-check; **web browser-drive** (OPFS untouched) | folder mount + migration of a real OPFS library (**a09d**) |
| 3 | studio vitest + typecheck; web browser-drive (chip unchanged) | chip hidden on desktop (a09d) |
| 4 | studio vitest + typecheck | `convertFileSrc` AV playback + OSD-under-WebKitGTK (a09d) |
| 5 | rust build; studio headless token-guard test | second launch focuses, no 2nd writer (a09d) |
| 6 | studio vitest + typecheck + e2e (port 5198) | author-in-place + export-elsewhere + reopen (a09d) |

- **render-core** conformance (`fs/tauri.test.ts`) proves observable path/dir/file behavior over node:fs;
  the atomic-write + streaming-write guarantees need their own targeted tests (they stay green whether or
  not close() is atomic — see tauri-fs-seam rule).
- **`.ts` under apps/studio:** `pnpm typecheck` is the real strictness gate, **not** svelte-check
  (`.claude/rules/studio-ts-typecheck-gate.md`). Run both when `.svelte` changes.
- **Packaged verification is mandatory before merge** — the mount, migration, `convertFileSrc`,
  WebKitGTK OSD, and single-instance behaviors are *only* observable in the built Flatpak. Hand each to
  the **Archie-a09d** native tauri-build smoke; do not claim done on vitest alone.

---

## 6. Risks + kill criteria

- **WebKitGTK fs edge cases.** plugin-fs over WebKitGTK may differ from node:fs (the conformance
  binding). *Kill:* if atomic rename or `readDir` misbehaves in the packaged app in a way the seam can't
  paper over, stop and fix the backend before proceeding past Phase 2.
- **Path lengths / untrusted segments.** Exhibit slugs and asset names join onto a real path;
  `assertSafeName` already rejects separators/`..`/NUL (fs/tauri.ts). *Check:* every new joined segment
  goes through it (same trust boundary as untrusted-archive-open).
- **Large-AV memory (Phase 1).** If the streaming-write path can't be made to hold bounded memory for a
  multi-GB asset, folder-primary AV on desktop is not safe. *Kill criterion for AV-in-folder;* images
  still migrate.
- **Double-write via FolderBinding (Phase 6).** If any path both authors-in-place and mirrors the same
  bytes to the resident root, back out the resident-mount for that flow until it's a clean single writer.
- **Flatpak scope.** `--filesystem=home` is present (line 24) and `$APPDATA` is always writable
  in-sandbox, so the default library root needs no extra grant and user-picked folders are covered.
  *Residual:* a user-picked folder outside `$HOME` (rare) is out of scope — the picker constrains it.
- **Migration data loss.** *Non-negotiable:* migration copies, never moves; `migrated.json` is written
  LAST; OPFS is retained across the release. If any of these three can't hold, do not ship Phase 2.
- **assetProtocol regressions OSD.** If `convertFileSrc` + WebKitGTK breaks OpenSeadragon, images stay on
  blob URLs (they already do) and AV falls back to blob for small files, native-http bridge for remote
  (fada) — the folder mount does not depend on the protocol.

---

## Open questions (for Micah)

1. **Multi-window vs single-instance.** Phase 5 recommends `tauri-plugin-single-instance` (a second
   launch focuses the existing window). Is single-window the intended desktop model, or is
   multi-window/multi-library a wanted product direction (which would need real cross-process locking
   instead)? Default taken: single-instance, because it structurally removes the two-writer race and no
   multi-window journey exists today.
2. **OPFS cleanup timing.** Migration retains the OPFS copy for rollback safety. When (which release) do
   we clear it — or keep it as a permanent secondary snapshot? Default taken: retain this release, file a
   follow-up to clear after the folder store proves durable in the field.
3. **Peaks in-folder vs a hidden cache dir.** Regenerable waveform peaks in the user-visible `library`
   folder are clutter but keep one backend. Acceptable, or should caches go to a hidden/`$APPDATA`
   sibling? Default taken: in-folder (regenerable → harmless, single source of truth).

## Answers to open questions (Micah, 2026-07-20)

1. **Window model: single instance.** Add tauri-plugin-single-instance; second launch focuses the first window. Generation-token guard stays as belt-and-braces.
2. **OPFS copy: keep until manual clear.** Retain indefinitely post-migration; a "reclaim space" affordance is a later ticket. Zero data-loss posture wins.
3. **Peaks/derived caches: hidden cache dir** (.archie-cache/ or appCacheDir), with schema stamps per the freecut finding — the visible library folder stays clean.

---

## a09d packaged verification (owed proofs — do NOT mark a phase "done" on these without them)

Headless gates (render-core/studio vitest + tsc, `cargo check`) prove the *logic*. None of the rows
below are observable outside a built Flatpak under WebKitGTK; every claim only the packaged webview can
prove is enumerated here and handed to **Archie-a09d** (native tauri-build smoke). This is a live
checklist — a reviewer/runner ticks each box against the packaged app.

| # | Phase | Claim only the packaged app proves | Status |
|---|---|---|---|
| P1-a | 1 | A multi-GB AV asset streams to the folder via `TauriFile.writable()` → plugin-fs `open()` in **bounded memory** (no ~2× heap spike); byte-exact on read-back. Node-bridge streaming is proven headless (`tauri.test.ts`), but WebKitGTK plugin-fs `open()`/`write()` short-write behaviour is not. | ☐ pending build |
| P1-b | 1 | `copyTree` over a REAL OPFS `FsaFilesystem` source → `TauriFilesystem` folder target round-trips a real library (the migration's read leg over OPFS). | ☐ pending build |
| P2-a | 2 | A desktop session authors `library.json` + annotations + assets directly to `{appDataDir}/library` and the tree **survives relaunch**. | ☐ blocked — Phase 2 not implemented (see stop report) |
| P2-b | 2 | Migration of a REAL pre-existing OPFS library (a shipped OPFS-canonical desktop user) copies into the folder, marker written LAST, OPFS retained. | ☐ blocked |
| P3-a | 3 | The storage chip is **hidden** on desktop and `persist()` is skipped (native fs has no quota/eviction). | ☐ blocked |
| P4-a | 4 | Folder-resident **AV** plays via `convertFileSrc()` (`asset://`) under WebKitGTK with native byte-range seeking; **images** still render via blob: URL; OpenSeadragon unaffected (highest-risk item, `src-tauri/README.md`). | ☐ blocked |
| P5-a | 5 | A **second launch focuses** the existing window and does NOT open a second webview/writer. Plugin + wiring compile-verified (`cargo check`, this branch); the focus behaviour + Flatpak single-instance lock (app-id match) are packaged-only. | ☐ pending build (plugin landed) |
| P5-b | 5 | The on-disk generation-token guard pauses+warns when an out-of-band writer (sync tool) touched the folder. | ☐ blocked — token guard deferred with Phase 2 |
| P6-a | 6 | Author-in-place + export-elsewhere (`.archie.zip` to a picked path) + reopen round-trip; no path both authors-in-place AND mirrors the same bytes to the resident root. | ☐ blocked |

---

## Execution status — branch `wf/native-store` (2026-07-20, agent a09d-lane native-store)

**Base:** `ee50c2e` (per Step 0). **Landed this pass:**

- **Phase 1 — DONE & committed.** Migration engine + streaming asset write, the dormant safety net.
  `packages/render-core/src/fs/copy-tree.ts` (+test), `apps/studio/src/opfs-to-folder.ts` (+test), the
  streaming-Blob write path + `TauriFsBridge.open()` in `fs/tauri.ts` (both implementers updated:
  `apps/studio/src/tauri-fs.ts` real adapter + `fs/tauri.test.ts` node bridge). Gates: render-core
  **1092** vitest + tsc 0; studio **909** vitest + tsc 0. No consumer yet (correct — the flip is Phase 2).
- **Phase 5 (single-instance plugin ONLY) — committed.** `tauri-plugin-single-instance` (Cargo.lock pins
  **2.4.3**; `"2"` in Cargo.toml matches the sibling plugins) registered FIRST in `lib.rs` with a
  focus-existing-window callback. No capability entry needed (no JS commands). Gate: `cargo check`.
  Landed ahead of plan order because it is genuinely flip-independent (window/process management, not
  storage); the plan's Phase-5 **token-guard** half is deferred (it binds to the Phase-2 resident mount).

### STOP report — Phase 2 (the flip) and the phases gated behind it (3, 4, 6, Phase-5 token guard)

Halted deliberately per the dispatch rule ("if a plan phase proves wrong against reality, STOP that
phase, report, and continue with independent phases rather than improvising the spine"). The spine flip
collides with reality in a way that needs a design decision a reviewer should make, not an agent
improvising the most load-bearing data path unverified.

**The collision:** Phase 2 says *"re-point `store.ts` (metadata openers) and `asset-store.ts` (asset
read/write) at `residentFs()`."* But:

1. **`asset-store.ts` does NOT use the `Filesystem` seam.** It talks to raw OPFS
   `FileSystemDirectoryHandle` (`navigator.storage.getDirectory()` → `getDirectoryHandle` /
   `getFileHandle` / `createWritable`) — its own header comment says so. There is no `residentFs()`
   handle to point it at without first re-writing its I/O.
2. **The generic seam can't serve the asset read contracts.** `TauriFilesystem.getFile()` does
   `readFile().slice()` → `new File([bytes])` — it **fully materializes**. But `readAssetBlob` must stay
   a **lazy** File for the streaming `.archie.zip` publish (LARGE-MEDIA-MEMORY-CEILING), and Phase 4's
   AV `convertFileSrc()` needs the **absolute path**, which the seam deliberately hides (backend-agnostic).
   `assetSize` needs a **stat** the seam has no method for.
3. So a faithful Phase 2+4 for assets needs ONE of: **(a)** extend the `Filesystem` seam with a lazy-file
   / stat / path accessor — a seam-contract change rippling to all 5 backends; or **(b)** give
   `asset-store.ts` an `isTauri()`-gated native branch (plugin-fs directly: streaming write, `convertFileSrc`
   AV read, blob image read, stat) beside the raw-OPFS web path — the plan's *implied* model (Phase 4's
   `residentAssetUrl`), but a multi-file rewrite of the hottest data path.
4. **Phase 2 is all-or-nothing.** `store.ts`'s metadata openers ARE already on the seam and could be
   re-pointed cleanly — but moving `library.json` to the folder while asset bytes stay in OPFS is a
   **split store** (metadata references `/assets/…` bytes that live on a different backend): a
   data-integrity hazard worse than not flipping. Metadata cannot move without assets.
5. **Phase 2's acceptance is packaged-only** (author to `{appDataDir}`, survive relaunch, migrate a real
   OPFS library — P2-a/P2-b above). Unbuildable here (no `tauri build`/Flatpak). Even a complete
   implementation would be an *unverified* spine change riding entirely on a09d.

**What the reviewer must decide before Phase 2 proceeds:** option (a) seam extension vs (b) `isTauri`
asset branch. Phase 1 (this branch) already provides the streaming-write + migration primitives *either*
path needs, so that decision is unblocked. Phases **3** (chip honesty is only correct once native is the
store), **4** (`convertFileSrc` needs the native asset path from the decision), **6** (FolderBinding
reconcile needs the resident mount), and the **Phase-5 token guard** (binds to the resident root) are all
gated behind it — none can land coherently ahead of the (a)/(b) choice.
