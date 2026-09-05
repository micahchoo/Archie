# DESTNEG — the negative-space matrix over the four publish destinations (Archie-848c)

Decision on record (user, 2026-08-30): run the FULL negative-space loop. `export-surface.ts:184`
classifying object-storage as a SITE destination is CORRECT per Archie-c85f — its delivery is the
two rclone commands the author runs themselves (`export-surface.ts:236-240`, "Archie never sees your
keys"), not the finding. The findings: **(a)** the learn deck never mentioned object storage or
rclone (`docs/learn/0007-publish.html` listed three of four destinations) — **FIXED in this
ticket**; **(b)** the destination journeys' unexamined dead ends — judged below, 6 cases × 4
destinations.

Probe (all local fixtures, simulated dependency failures, never a real bucket or remote):
`pnpm --filter @archie/viewer exec vite-node ../../scripts/probe/destneg-journeys-2026-08-30.mts`
→ 13 checks: 11 pass, 2 are the matrix's findings (F6/O6) judged as FAILs; 0 unexpected.
Supporting targeted tests run green: `export-surface.test.ts` (20), `site.test.ts` (44),
`marker.test.ts` (20). The deck fix lives in `docs/learn/0007-publish.html` — the canonical
source (.gitignore:17-19: `apps/studio/public/learn/` is the sync-learn.mjs artifact, never
committed); synced with `node apps/studio/scripts/sync-learn.mjs`.

| destination | case | actual | verdict | fix commit | retest |
|---|---|---|---|---|---|
| github-pages | author without rclone | n/a — delivery is Archie's own GitHub push (device flow or token → `publishToGitHub`); no rclone anywhere in this journey | pass | — | n/a by construction (ROW_ORDER delivery paths, export-surface.ts:92) |
| github-pages | rclone remote misconfigured | n/a — no `remote:bucket` involved; nearest analog (auth expiry / push failure) lands on loud machine error states with Try again / Sign in again | pass | — | Publish.svelte:860-873, 1075-1088 |
| github-pages | bucket CORS unset | n/a — Pages serves the tree same-origin; no cross-origin read exists | pass | — | n/a by construction |
| github-pages | marker-first partial sync visible to readers | delivery is a branch push: the old site stays served until the new commit lands atomically; within the tree `archie.json` is written strictly LAST (commit point) | pass | — | site.test.ts "commits archie.json strictly after every exhibit's content" + site-fixity.test.ts second-to-last order (green) |
| github-pages | empty library | the chooser refuses before ANY destination flow: "There's nothing to publish yet" explains and offers two ways on | pass | — | probe O5-surface-gate-precedes-all-destinations (Publish.svelte:602-616 precedes sheet/setup flow); probeArchive([]) survives (8/8 fit, no crash) |
| github-pages | re-publish after deletions | the branch is replaced wholesale ("Publishing replaces everything on this branch"; single-pack force-push), so a deleted exhibit's files are gone from the new commit | pass | — | Publish.svelte:1235 note; pack_push.rs force-push contract |
| object-storage | author without rclone | the panel hands over commands the author runs themselves; on a machine without rclone the shell fails loud (ENOENT) before any bytes move — and the panel already says what rclone is, that it's free, and where its docs are; the learn deck now too | pass | Archie-848c (deck) | probe O1-no-rclone-loud (ENOENT observed); Publish.svelte:795; deck aside "For a very large library" |
| object-storage | rclone remote misconfigured | wrong `remote:bucket` → rclone exits non-zero with "didn't find section in config file" (simulated stub on PATH); the panel states the remote:bucket shape and that it's the name set up in rclone | pass | — | probe O2-misconfigured-remote-loud (exit 1 + stderr observed); Publish.svelte:780 |
| object-storage | bucket CORS unset | reader-side the failure is silent (browser refuses the tree's files), but the author is told BEFORE hosting: BUCKET_CORS_NOTE renders on done-object, and the learn deck now carries it | pass | Archie-848c (deck) | probe E1-deck-covers-object-storage; Publish.svelte:793 |
| object-storage | marker-first partial sync visible to readers | the two-pass protocol holds: pass 1 excludes `archie.json`, pass 2 copies it alone (tested); a simulated mid-sync reader through the REAL read seam sees NO marker (no false complete signal) and a valid marker only after pass 2. Residue on RE-publish: the old marker survives pass 1 (excluded from deletion), so mixed-generation reads are possible mid-sync — transient, self-heals at pass 2, inherent to non-atomic static storage | pass | — | probe O4-two-pass-protocol / O4-mid-sync-no-false-complete-signal / O4-after-pass2-marker-valid / O4-republish-old-marker-residue-documented; export-surface.test.ts:151 |
| object-storage | empty library | same chooser gate as github-pages — one refusal screen covers all four destinations | pass | — | probe O5-* |
| object-storage | re-publish after deletions | **FAIL** — the journey writes the local folder with NO removal plan (`localPublishFolder` → `writeTree` without `removedExhibits`; site.ts:592 "a full republish overwrites but never removes"), then `rclone sync` faithfully mirrors the stale folder to the bucket: the deletion is silently forfeited and the removed exhibit stays publicly served | FAIL | copy claim corrected by PublishCopy (5dcdf34, ledgers/PUBLISH-COPY.md); the prune fix (compute removals for the one-shot publish path, publish-flows) is owed outside this ticket — my write scope is the ledger, the deck, and probe fixtures | probe F6-control-prune-works-when-asked proves `removedExhibits:["b"]` removes them; recheck = re-publish after deleting an exhibit, observe the orphan |
| folder | author without rclone | n/a — a folder write involves no upload tool | pass | — | n/a by construction |
| folder | rclone remote misconfigured | n/a — no remote involved; a failed write lands on the error phase with the message and an in-surface Back | pass | — | Publish.svelte:1269-1274 (chooseFolder catch → error phase) |
| folder | bucket CORS unset | n/a — local files, no cross-origin reader | pass | — | n/a by construction |
| folder | marker-first partial sync visible to readers | `publishLibrary` writes `archie.json` LAST into the folder (same commit-point discipline as every sink); a torn write leaves a tree with no current marker rather than a valid marker over half a library; re-publish residue = same transient old-marker case as object-storage, self-heals on the next publish | pass | — | site.test.ts / site-fixity.test.ts write-order assertions (green); probe O4 residue documented |
| folder | empty library | same chooser gate — one refusal screen covers all four destinations | pass | — | probe O5-* |
| folder | re-publish after deletions | **FAIL** — re-publishing into the same folder after deleting exhibit b left 4 stale files under `b/` (probe-observed): the writer never prunes, while the done-folder copy claimed "clears out what you deleted" — a stated behavior the code does not deliver | FAIL | copy corrected by PublishCopy (5dcdf34): the line now reads "an exhibit you deleted stays in the folder until you remove it yourself (publishing to GitHub Pages does clear deleted ones out)" — verified landed at Publish.svelte:752; the prune code fix is owed outside this ticket | probe F6-republish-stale-files (4 stale files) + F6-control-prune-works-when-asked; recheck = same scenario after the prune fix lands |
| zip | author without rclone | n/a — a file save involves no upload tool | pass | — | n/a by construction |
| zip | rclone remote misconfigured | n/a — no remote involved | pass | — | n/a by construction |
| zip | bucket CORS unset | n/a — a local file the Viewer opens directly | pass | — | n/a by construction |
| zip | marker-first partial sync visible to readers | the zip is assembled fully BEFORE the save; a failed/cancelled streaming save discards the partial file (`target.abort()`), a truncated zip fails to open loudly, and the marker is the last file inside the archive — a reader either gets the whole file or an error | pass | — | publish-flows saveProjectZip abort path; Issue 25b marker-last (site.test.ts, green) |
| zip | empty library | the chooser gate blocks the surface before the destination rows, so the zip-options panel is unreachable; the panel's own export button additionally disables on an empty selection | pass | — | probe O5-surface-gate-precedes-all-destinations; Publish.svelte:602-616 comment |
| zip | re-publish after deletions | each save is a fresh artifact — the deleted exhibit is simply absent from the new file; nothing stale can carry over | pass | — | saveProjectZip builds from the live library projection |

## Dispositions

- **O6/F6 (re-publish after deletions): FAIL, recorded.** Root cause is ONE shared defect: the
  one-shot folder publish (`publish-flows.localPublishFolder` → `writeTree(fb.fs, { withViewer:
  true })`) never computes `removedExhibits`/`removedObjects`, and `publishLibrary` deliberately
  never removes on a full write (site.ts:592, fixity.ts "publish-never-removes" contract). The
  pruning mechanism exists and works when handed the plan (probe control proves it) — the journey
  just never computes it. Object-storage inherits the residue through `rclone sync`. The code fix
  lives outside this ticket's write scope (publish-flows / publish-flows callers); PublishCopy
  corrected the false done-folder claim (5dcdf34, verified landed) and logged it in
  ledgers/PUBLISH-COPY.md.
- **PublishCopy coordination (hub, 2026-08-30):** they had already landed the copy correction before
  my message ran the same diff; disposition confirmed on both sides.
- **SignalsAdopt coordination (hub):** no overlap — they own the render-core barrel; I only read.
- **Main commit rule acknowledged:** no amend/history rewrite; staged-file check before commit;
  add only my Target paths.

## Finding (a) — the learn deck

The deck fix is NOT a matrix row (the matrix is 4 destinations × 6 cases = 24). `docs/learn/
0007-publish.html` listed only web / folder / portable-file. FIXED in this ticket: the standfirst
now names all four destinations and a "For a very large library" aside covers the rclone
two-command hand-off, "Archie never sees your keys", the bucket GET/HEAD CORS setting, and the
folder option as the no-upload alternative. Fix commit: Archie-848c. Retest: probe
E1-deck-covers-object-storage.
