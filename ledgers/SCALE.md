# SCALE — Issue 11 execution ledger (scale & gallery plan)

Plan: `docs/plans/SCALE-GALLERY-PLAN.md` · ADR: `docs/adr/0023-library-level-image-index.md` ·
Spikes: `docs/spikes/spike-0002-incremental-folder-autosave.md`,
`docs/spikes/2026-07-open-cost-and-lazy-assets.md` · Format: phase | change | verification | commit.

| Phase | Change | Verification observed | Commit |
|---|---|---|---|
| 1.1 incremental folder autosave | `PublishOptions.incremental {exhibits, reassets}` + top-level `removedExhibits/removedObjects` pruned on EVERY publish (fixes pre-existing orphan leak); recover-from-manifest path (DZI-safe — fixed latent `asTileSourceDescriptor` round-trip bug); dirty-set with take/restore in binding store; prune-before-write-loop; missing-manifest self-heal. Deviation: `loadAllLogs` NOT narrowed (whole-library `archie:` link index needs all logs — narrowing corrupts cross-exhibit cites). | Implement→review loop: independent code review found 5 defects (removal dirt lost on full writes; remove-then-recreate prune-after-write; remote `{objId}_files` never pruned; recovery kept raw thumbnail; missing-manifest raw-source footgun) — all fixed + regression-tested. Full-tree equivalence oracle (incremental ≡ fresh full republish) asserted; `tileObject` spy = 0 calls on note-edit save; orphan-prune tests (imported, remote-baked, full-write path); binding-store drain/retry/mid-flight-dirt tests. Suites re-run by session lead: render-core 723/723 (70 files), studio 158/158 (16 files), both `tsc --noEmit` clean, studio build clean. | `1ca4733` |

| 1.2/1.3a masters-on-demand + list virtualization | New `asset-urls.svelte.ts` store: thumbs eager, current master minted on demand into a (slug,id)-keyed single slot (mint-seq race guards; null-slot-on-failure → raw-source fallback, no stuck Loading); `seedMaster`/`setPlate` ingest split (rail plate = baked thumb now); AV assets skip fallback-master minting; overview list mode virtualized (`content-visibility:auto` + `contain-intrinsic-size:auto 3.5rem`, scoped off drop sentinels). Canvas mode untouched (measure-first per spike S2). | Review found 2 latent defects (cross-exhibit object-id collision in the slot key — every exhibit's first object is "o1"; in-flight mint not invalidated by fast paths → revoke-while-displayed flash) — both fixed with pinned tests (13 asset-urls lifecycle tests incl. leak-tracked revoke assertions, controlled-promise interleavings). Suites re-run by session lead: studio 171/171 (17 files), tsc clean, build clean. | `9ac6218` |

| 4 viewer navigation | Filmstrip (shared, ExhibitView shell, existing cursors — narrative jump opens the object's own reader); ←/→ stepping (cedes via `defaultPrevented` to OSD arrow-pan + VIDEO/AUDIO gate); "Object N of M" + narrative "Section N of M" (§146 extension, existing `activeIndex`); grid density toggle (2-step, drives `--grid-min` + `--grid-intrinsic` together, localStorage, SSR-safe). Embed parity flagged as follow-up (separate mount impl). | Review verdict fix-first: arrow double-handling with OSD pan proven from vendored OSD source (canvas tabIndex=0, pan+preventDefault, still propagates) — fixed; all other items verified (multi-section trap sidestepped — zero section lookups in diff; density coupling structurally enforced; a11y pass). Two manual-QA notes appended to spike-0005 browser-verify list. viewer 75/75, astro check clean, build clean (lead re-run). | `e272a0f` |

Behavior change (flagged, intended): structural edits (reorder/add/remove/title) now mirror to the
bound folder continuously and incrementally; previously they waited for ⌘S or the next note-save.
Behavior change (1.2, minor): object switching has a sub-frame mint gate (one OPFS handle lookup,
no byte read); exhibit open blanks the canvas until the new master commits (matches old semantics).

Known follow-up (out of phase scope): repo has no `svelte-check`, so `.svelte` type errors are
invisible to tsc and the build — pre-existing App.svelte diagnostics observed but untouched.
