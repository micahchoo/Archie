# MIRROR — the folder mirror trusts disk it never verifies (ISSUES.md Issue 25, STUDIO-side rows c/d/e)

Rows a/b (torn-manifest read policy; marker-written-first) ride loop-readpolicy's ledgers (render-core
`publish/read.ts` + `site.ts` — owned by another agent's worktree). This ledger holds the STUDIO-side
rows c/d/e only. Discipline: fill every `actual` before fixing; one fix per commit referencing its row.

| case | actual | verdict | fix commit | retest |
|------|--------|---------|-----------|--------|
| (c) external change between autosaves — incremental mirror overwrites blind | `mirrorToFolder`'s incremental branch (`binding-store.svelte.ts:117-122`) drains the dirty-set and calls `deps.writeToFolder(fs, plan)` with NO check that the on-disk tree still matches what Archie last wrote. Once `folderResynced` (`:54,107-116`), an external writer (git pull / Dropbox / a second Archie window bound to the same folder) that rewrites the tree is silently overwritten for the dirty exhibits and silently trusted for the rest → a mixed tree, no reconciliation, no warning. | confirmed | | |
| (d) revoked/moved folder — cached `folderFs` never invalidated | `reacquireFolder` (`:85-90`) short-circuits `if (folderFs) return folderFs` unconditionally, and `mirrorToFolder` caches `folderFs` (`:104-106`). A write failure (folder deleted/moved/permission revoked) reaches `saveStatus` via the queue, but `folderFs` stays cached, so every retry hits the same dead handle and nothing tells the user the only recovery is close/reopen. | confirmed | | |
| (e) can two objects share an asset name → prune-vs-skip-asset-pass dangling manifest? | Asset names are `${id}-${safe}` (`ingest-flows.ts` AV `:181`, image `:205/:220`), where `id = nextObjectId(ex)` is UNIQUE among the exhibit's LIVE objects. **Two concurrently-live objects can therefore NEVER share an asset name** → the "surviving manifest points at a deleted file" case (`site.ts:287-293` prune deletes `{slug}/assets/{assetName}` while a sibling's write skips the asset pass) is **not-reachable**: the prune only ever names a genuinely-gone object's asset, and no live object shares that name. Grep evidence below. | **not-reachable** (with a flagged premise defect — see note) | n/a (no fix) | n/a |

## Row (e) — grep evidence + flagged premise defect

Asset naming (unique per live object):
- `ingest-flows.ts`: `const avName = \`${id}-${safe}\`;` / `let name = \`${id}-${safe}\`;` (image) / `name = \`${id}-${safe.replace(/\.[^.]+$/, "")}.png\`;` (EXIF). `id` comes from `nextObjectId(ex)`, which scans `ex.objects` and increments past any collision — unique among LIVE objects.
- `site.ts:287-293` prune keys on `{slug}/assets/{r.assetName}` per removed object.

**Verdict: not-reachable.** For the manifest to point at a deleted asset, a LIVE object and a REMOVED
object would have to share an asset name in the same write. Unique-`id` naming forbids two live objects
sharing a name; the removed object is by definition not live. Confirmed by trace: a remove-then-re-add
that reuses the freed id + same filename lands the removal and the re-add in the SAME drained plan with
`reassets` set (the re-add marks `exhibit-assets` dirt → `markAssetsDirty` → `reassets.has(slug)`), so
`site.ts` prunes the file then re-copies it in the same pass — the tree ends consistent. Across separate
drains, each drain leaves a consistent tree.

**Flagged premise defect (handed back to the render-core / site.ts owner — NO behavior change needed).**
`binding-store.svelte.ts:273-277` justifies not purging `dRemovedObj` on re-mark with: *"object ids are
minted fresh on every add, so a pending object removal always names a genuinely-gone object."* That
premise is **FALSE**: `nextObjectId` REUSES a freed trailing id — verified: from `[o1,o2,o3]`, removing
`o3` then re-adding yields `o3` again (removing a MIDDLE id does not reuse: `o2` removed → next is `o4`).
The prune's actual safety rests not on "ids are fresh" but on the re-add always setting `reassets` so the
same-drain recopy repairs the transient. The outcome is safe today, but the STATED reason is wrong; if a
future change ever lets an asset-writing re-add NOT set `reassets`, the dangling reference becomes
reachable. Recommended: correct the comment in `binding-store.svelte.ts` (studio-side, done in the (e)
row commit) and/or make `nextObjectId` monotonic. No `site.ts` edit required.
