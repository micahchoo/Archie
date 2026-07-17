# CARRY — model-field carry boundaries (ISSUES.md Issue 21)

render-core carries model fields across ~8 hand-spread boundaries (`...(x !== undefined ? {x} : {})`
chains). None had a `keyof`/`satisfies`/`Required` exhaustiveness guard (grep-verified) — **adding a
model field compiles clean at every boundary while silently not carrying**. The class already bit four
times (sections/readings in loadLibrary; note-copy emphasis/wholeObject/geo) and is LIVE today: an
import→republish drops `Exhibit.cover` / `AObject.format`.

**Fix idiom (chosen):** a co-located compiler-checked sentinel per boundary —
`… satisfies Record<keyof Source, CarryDisposition>` (+ a `carryDefined<T>` helper for same-type
carries) in `packages/render-core/src/model/carry.ts`. Every source field is classified `"carry"` or
`{ drop: "<reason>" }`; a NEW field fails to compile until classified, turning the denylist-pretending-
to-be-an-allowlist into a compiler-owned allowlist. Deliberate drops are NAMED, not silent.

**Phase 3 live-drop decision:** add round-trip slots (`cover` on `WorkingExhibitMeta`; `format` +
`originalName` on `WorkingObjectMeta`) and carry both directions — the working↔library round trip is
lossless. `resolveConflict`'s field carry moves INSIDE the primitive (was compensated only in its sole
caller `session.resolve`).

Tests: `pnpm --filter @render/core exec vitest run`.

## Ledger

| boundary | fields dropped today | disposition / guard | fix commit | tests green |
|----------|----------------------|---------------------|-----------|-------------|
| **serialize** `recordToAnnotation`+`withDagMeta` (`spine/serialize.ts:82-119`) — history round-trip | none (all 15 `AnnotationRecord` fields carried: target/modified/body/motivation by `recordToAnnotation`, the DAG+extension fields by `withDagMeta`) | GUARDED — `_historyCarry satisfies Record<keyof AnnotationRecord, CarryDisposition>` sentinel; bite-verified (dropping `geo` → TS1360) | f7a6d95 | ✅ tsc + serialize.test.ts (12) |
| **deserialize** `recordFromHistoryAnnotation` (`spine/deserialize.ts:50-96`) — inverse | none (parses every field back; legacy `layers` folded to Tags) | GUARDED — `_historyParse satisfies Record<keyof AnnotationRecord, CarryDisposition>`; keeps serialize↔deserialize from drifting | 7052e03 | ✅ tsc + deserialize.test.ts |
| **log** `appendEdit` (`spine/log.ts:126-156`) — edit carry-forward | none live; `mergeParents` deliberately not carried (an edit is single-parent, not a merge) | GUARDED — `_editCarry satisfies Record<keyof AnnotationRecord, …>`; `mergeParents` named `{drop}`, rest carry (re-minted / forwarded) | 2fe85db | ✅ tsc + log.test.ts |
| **log** `appendDelete` (`spine/log.ts:165-181`) — tombstone | body/motivation/reading/emphasis/wholeObject/geo (a tombstone keeps ONLY target for citation) — DELIBERATE | GUARDED — `_deleteCarry` names the six content fields + `mergeParents` `{drop:"tombstone…"}`, compiler-checked; a new field forces a keep-or-drop decision | 34ed864 | ✅ tsc + log.test.ts |
| **merge** `resolveConflict` (`spine/merge.ts:194-218`) — merge node | reading/emphasis/wholeObject/geo — compensated ONLY in `session.resolve` (`session.ts:175-212`); any direct caller re-introduces the loss | FIXED — carry moved INSIDE the primitive (`ConflictResolution` gains reading/emphasis/wholeObject/geo, inherited from any head when unset); `session.resolve` now just delegates; `_mergeCarry` sentinel | b9b6a68 | ✅ resolve.test.ts (direct caller carries + override); 748 render-core, 270 studio |
| **working** `workingToLibrary` (`publish/working.ts:132-163`) — working→Library | `cover` (no working slot), `format` (no working slot); `seedVersion`→dropped (template marker, deliberate) | FIXED — added `cover`/`format`/`originalName` slots to the working types; workingToLibrary carries them (`originalName` from the slot or provenance); `_workingExhibitCarry`/`_workingObjectCarry` sentinels name `seedVersion`/`provenance` `{drop}` | `<c6>` | ✅ tsc + working.test.ts (7) |
| **working** `libraryToWorking` (`publish/working.ts:174-200`) — Library→working (**the LIVE drop**) | `cover`, `format`, `originalName` — recovered on import (`cover` via exhibits.json/loadLibrary; `format` via objectsFromManifest) then dropped here → import a covered `.archie.zip` + republish ⇒ covers the viewer renders (`Gallery.svelte:80-81`) VANISH | FIX (Phase 3) — add `cover`/`format`/`originalName` slots + carry; `bakeTiles` `{drop}` (publish-time opt-in, never on a reconstructed Library) | | |
| **manifest** `objectsFromManifest` (`iiif/manifest.ts:155-180`) — Manifest→AObject (load) | `originalName` (published to `assets-original/` but the manifest carries no recoverable ref), `bakeTiles` (publish-time opt-in) — both DELIBERATE for the manifest transport | sentinel keyed on `keyof AObject` naming the two `{drop}` with reasons | | |

## Phase 1 field diffs (source type → boundary output)

- `AnnotationRecord` (15 fields): logicalId, rev, version, parent, mergeParents?, modifiedAt, lastEditor,
  deleted, body?, target, motivation?, reading?, emphasis?, wholeObject?, geo?.
- `Exhibit` vs `WorkingExhibitMeta`: Exhibit has **`cover`**; WorkingExhibitMeta has `seedVersion`
  (template marker) but NO cover slot → add `cover?`.
- `AObject` vs `WorkingObjectMeta`: AObject has **`format`**, `originalName`, `bakeTiles`;
  WorkingObjectMeta has `provenance` (holds originalName+exif+transform) but NO `format`/standalone
  `originalName` slot → add `format?`, `originalName?`.

## Notes / deferrals

- Adding OPTIONAL fields to `WorkingExhibitMeta`/`WorkingObjectMeta` is backward-compatible: store.ts
  re-exports the types and simply won't set the new fields (verified: tsc + studio tests green). Ripple
  stays within working.ts + its tests, as scoped.
- `bakeTiles` is never present on a Library reconstructed from a published tree (toCanvas doesn't emit
  it; the DZI result is stamped as `tileSource`), so its `libraryToWorking` drop is a no-op in practice —
  named as a deliberate exclusion rather than given a slot.
