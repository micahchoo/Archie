# TABS — two Studio tabs on one library, zero cross-tab write coordination (ISSUES.md Issue 22)

Verified facts (this run): OPFS is origin-shared; the working store writes the fixed path
`archie-demo-project` (`store.ts:23`); the save-queue serializes per TAB (module singleton,
`save-queue.svelte.ts:13`); no `navigator.locks` anywhere in `apps/studio`; the only `BroadcastChannel`
was the viewer live-preview signal (`library-meta.svelte.ts:17-18`). Two tabs interleave full-projection
writes over the same files: last-writer-wins at file granularity, no lock, no generation counter, no
detection, no warning.

Discipline: fill every `actual` before fixing; one fix per commit referencing its row.

| # | case | actual | verdict | fix commit | retest |
|---|------|--------|---------|-----------|--------|
| T1 | two tabs editing DIFFERENT exhibits | Per-exhibit annotation files live at distinct paths (`exhibits/{slug}/annotations/`) so those don't collide — BUT both tabs rewrite the SHARED `library.json` (the whole authored structure) via `saveLibraryMeta` (`store.ts:95`). Tab A adds exhibit X (writes library.json incl. X); tab B, from its stale boot snapshot lacking X, saves library.json → X's row is gone. Silent, file-granularity last-writer-wins on library.json. No lock, no detection. | confirmed | | |
| T2 | two tabs editing the SAME exhibit | Both tabs write the same `{slug}/annotations/` log AND `library.json`. The per-tab save-queue serializes WITHIN a tab but not ACROSS tabs; the two OPFS writables interleave → last-writer-wins, silent note loss. | confirmed | | |
| T3 | tab A boots, tab B adds a recent, tab A saves — recents lost-update | `saveRecents` (`binding.ts:124`) overwrote the whole `archie.recentProjects.v1` key from the calling tab's in-memory list; a recent added by tab B between A's boot and A's next save was silently dropped (last-writer-wins on the localStorage key). | confirmed | (T3 commit) | `binding.test.ts` "adopts another tab's recents write via the storage event": a simulated tab-B write + `storage` event makes this tab adopt B's list before it can save over it. PASS |
| T4 | a folder bound in TWO windows (FSA + the Tauri webview) | Two Chromium windows can each hold an FSA handle to the SAME folder; both mirror the published tree there with no coordination → last-writer-wins on the folder tree (a full/incremental publish from window B overwrites window A's just-written files). The Tauri webview is normally single-window but a second instance has the same exposure. NB: the OPFS working copy underneath is the SAME origin store, so T1/T2's OPFS lock also covers two windows of the SAME browser; the DISTINCT folder-tree exposure is now DETECTED by the mirror generation stamp (Issue 25 row c / ledgers/MIRROR.md) — a second Archie writes its own token, so the first pauses with "changed outside Archie". | confirmed | (covered: OPFS by T1/T2 lock; folder-tree by MIRROR row c stamp) | see below |

## Design decision — read-only default, explicit take-over (with reasons)

Single-writer discipline via `navigator.locks`: the first tab to open the library acquires an EXCLUSIVE
Web Lock (`archie.writer.archie-demo-project`) held for the tab's lifetime and becomes the WRITER. A
second tab requests the lock `{ ifAvailable: true }`; getting `null` means another tab holds it → the
second tab is a READER (read-only).

**Why read-only default over auto-take-over:** auto-take-over (newest tab silently wins) just re-creates
last-writer-wins at TAB granularity — the exact bug. Read-only-by-default makes the single writer
explicit and puts a human in the loop: the reader sees "another tab is editing" and can press **Take over
editing**, which `steal`s the lock; the former writer's `onLost` fires and it flips to read-only with
"Editing was taken over — Take it back". No write ever lands from a non-holder.

**Enforcement chokepoint:** every OPFS/folder persist already routes through `enqueueSave`
(`save-queue.svelte.ts`) — including assets after ledgers/ASSETQ.md. A single writer gate on `enqueueSave`
(refuse + record a read-only status when this tab isn't the writer) covers library.json, annotations,
assets, AND the folder mirror in one place, so a reader tab cannot silently overwrite.

**Tauri / Web Locks availability:** `navigator.locks` is feature-detected. Where it is absent (an older
WebKitGTK webview), the module falls back to a `BroadcastChannel` claim protocol: on open a tab
broadcasts a claim; an existing holder replies "held" (→ the newcomer is a reader) and heartbeats so a
closed holder's claim expires and the survivor is promoted. Same read-only/take-over UX either way.

`needs-manual-verify` (T1/T2/T4 real two-tab walk — `navigator.locks` in the node test env is
per-process, so the unit tests exercise the real lock logic in-process but the genuine two-TAB race needs
a browser): on a local dev run (`node scripts/start.mjs`), open the app in two tabs; tab 2 shows the
read-only banner; edit + save in tab 2 is refused (read-only status) until **Take over**; after take-over
tab 1 flips to read-only. Repeat with `navigator.locks` disabled (to exercise the BroadcastChannel
fallback) and with a folder bound in two windows (folder case → MIRROR row c "changed outside Archie").
