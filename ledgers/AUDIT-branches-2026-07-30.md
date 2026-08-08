# AUDIT: branch consolidation, 2026-07-30

Follow-up to `ledgers/AUDIT-worktrees-2026-07-27.md` (Archie-1a47). That audit pruned the
checkouts; this one prunes the branches they left behind. Same prune criterion:
`git merge-base --is-ancestor <branch> main` — a merged branch's commits stay reachable
from main, so every sha citation in ledgers/tickets survives the deletion.

## Deleted: 32 local branches, all verified merged (`git branch -d`, which refuses unmerged)

Tips at deletion (all reachable from main; listed for the record, not for recovery need):

| branch | tip |
| --- | --- |
| accept/thousand-images | ca551a1 |
| feat/bulk-metadata-import | f4cf946 |
| feat/export-surface | 640d099 |
| feat/incremental-push | 18f9b73 |
| feat/tier-engine | 203d3c1 |
| feat/video-complete | 85fccbf |
| feat/video-transcode | a94ec23 |
| feat/zip64-bytes | c27aa95 |
| fix/web-tier-selector-rescale | 6c18c94 |
| probe/01c9-signals | f263a08 |
| probe/027c-export-fidelity | 25e12f1 |
| probe/69a6-undo | 0c2f4ea |
| probe/b5c2-fsa-measure | 2914920 |
| proto/bagit-fixity | 306372d |
| proto/folder-probe | 865ad66 |
| proto/object-storage | d4b25ac |
| proto/self-replicating-publish | c6deb52 |
| task/republish-test | dadb030 |
| worktree-agent-a0cc…/-a94b…/-aa5f…/-ac07…/-ac46… (×6 incl. a2f1's siblings) | dff139b |
| worktree-agent-a2f1f580923fdf919 | 84bab01 |
| worktree-agent-a3893d0d2eb7619ee, -ab762… | c2f1ade |
| worktree-agent-a4a34…, -ab5ef… | 10c82ab |
| worktree-agent-ac212b892a0584cd2 | bb76f9a |
| worktree-agent-acddbc6a1238a1252 | d7ae26f |
| worktree-agent-aeb8a10e3f3cb894a | f63a90f |
| worktree-agent-af5a0cc858130db4f | 1074795 |

## Deleted with preservation: the one UNMERGED local branch

`spike/self-contained-studio-wiring` @ 10f0aa0 ("NOT for merge" by its own commit message).
Its sha is cited by open ticket **Archie-bb81** as the parked implementation, so the head is
preserved as tag **`archive/spike-self-contained-studio-wiring`** before deletion — the
citation stays resolvable, `git branch` stays clean. Context: Archie-e09d later landed
64c8f62 on main wiring the same site sinks through the shared single-file IIFE, removing the
+304.9KB duplication the spike was parked on; bb81's description now carries a note to
re-check whether its remaining ask is live (updated this audit, via sd).

## Remote (origin): 8 merged branches NOT deleted — push was permission-blocked

All verified `merge-base --is-ancestor <br> origin/main`. To finish the consolidation:

```sh
git push origin --delete feat/archie-viewer-embed fix/flaky-gates fix/studio-eager-ratchet \
  integrate/a5b1 integrate/dock integrate/finder integrate/tokens integrate/wave2
```

Tips for the record: e45f38b, 73791cc, 875bc86, 09e8921, dfe7ab4, 8d1b403, 2b6b7cc, c1e8f9e.
(`origin/ci/wire-checks` was already gone upstream; `git fetch --prune` cleared the stale ref.)

## `origin/feat/archie-smoke-fixes-and-features` — first kept, then refuted (same day)

First pass called it "a pre-history-restart lineage, unrecoverable if deleted — keep." Re-checked
on request and **refuted**: it is the PRE-REWRITE COPY of main's own first 44 commits. Its tip
`7d51ce0` twins main's `105fd09` (identical message + author timestamp, 44 commits behind each,
different shas only because the rewrite re-hashed the line); the tree diff between the two is one
line (`.gitattributes` +1, main's side). Main is a strict superset — the branch preserves nothing
and is safe to delete:

```sh
git push origin --delete feat/archie-smoke-fixes-and-features
```

The lesson: "no merge base" reads as "disjoint history" but is equally the signature of a
**history rewrite** — before archiving such a branch, look for a timestamp-twin of its tip in
main (`git log --since/--until` around the tip's date) and diff the trees.
- `archie-loop-adAtKv/` — not a worktree; regenerable publish-loop output kept per its own
  README (2026-07-27).

## End state

`git worktree list` → the main checkout only. `git branch` → `main` only.
One tag added: `archive/spike-self-contained-studio-wiring`.
