# SCALE — Issue 11 execution ledger (scale & gallery plan)

Plan: `docs/plans/SCALE-GALLERY-PLAN.md` · ADR: `docs/adr/0023-library-level-image-index.md` ·
Spikes: `docs/spikes/spike-0002-incremental-folder-autosave.md`,
`docs/spikes/2026-07-open-cost-and-lazy-assets.md` · Format: phase | change | verification | commit.

| Phase | Change | Verification observed | Commit |
|---|---|---|---|
| 1.1 incremental folder autosave | `PublishOptions.incremental {exhibits, reassets}` + top-level `removedExhibits/removedObjects` pruned on EVERY publish (fixes pre-existing orphan leak); recover-from-manifest path (DZI-safe — fixed latent `asTileSourceDescriptor` round-trip bug); dirty-set with take/restore in binding store; prune-before-write-loop; missing-manifest self-heal. Deviation: `loadAllLogs` NOT narrowed (whole-library `archie:` link index needs all logs — narrowing corrupts cross-exhibit cites). | Implement→review loop: independent code review found 5 defects (removal dirt lost on full writes; remove-then-recreate prune-after-write; remote `{objId}_files` never pruned; recovery kept raw thumbnail; missing-manifest raw-source footgun) — all fixed + regression-tested. Full-tree equivalence oracle (incremental ≡ fresh full republish) asserted; `tileObject` spy = 0 calls on note-edit save; orphan-prune tests (imported, remote-baked, full-write path); binding-store drain/retry/mid-flight-dirt tests. Suites re-run by session lead: render-core 723/723 (70 files), studio 158/158 (16 files), both `tsc --noEmit` clean, studio build clean. | `1ca4733` |

Behavior change (flagged, intended): structural edits (reorder/add/remove/title) now mirror to the
bound folder continuously and incrementally; previously they waited for ⌘S or the next note-save.

Known follow-up (out of phase scope): repo has no `svelte-check`, so `.svelte` type errors are
invisible to tsc and the build — pre-existing App.svelte diagnostics observed but untouched.
