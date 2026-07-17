# READPOLICY — Issue 23 (read-failure policy) + Issue 25a (torn-manifest reconcile)

**Branch:** `tend/read-staleness`. **Probes:** `packages/render-core/src/publish/probe-readpolicy.test.ts`,
`apps/viewer/src/probe-staleness.test.ts`, `packages/archie-viewer/src/probe-readpolicy.test.ts`
(all run green — the "actual" column is probe-backed, not asserted from a code read).

## The disagreement

Three published-tree readers, three `getOptional` implementations, three failure policies:

| impl | absent (404 / not-found) | failed (5xx / fetch-throw / torn JSON) |
|---|---|---|
| `fsJsonSource.getOptional` (read.ts:44) | null | **null** (swallowed — corrupt == absent) |
| `fetchJsonOptional` (published.ts:290) | null | **null** on 5xx (warns); **throws** on torn-200 |
| `httpJsonSource.getOptional` (load.ts:175) | null | **null** (all errors swallowed) |

And two *mandatory*-read policies collide on the base-annotations sidecar (read.ts:82 uses `src.get`,
which throws on absence) vs the getOptional swallow at :64/:90.

## Chosen policy (decision)

**ABSENT vs FAILED — the one rule, every surface.**
- **Absent** = HTTP 404 or fs file/dir-not-found → `getOptional` returns `null`. A genuinely-optional file
  legitimately missing (readings.json on a base-only exhibit, a per-reading page, images.json on an old
  tree). Unchanged.
- **Failed** = HTTP 5xx/other-non-OK, a fetch/network throw, OR a 200 with unparsable/torn JSON →
  `getOptional` **throws `FailedReadError`** (new, exported from read.ts, carries the path). A failed read
  is NOT "no data" — it must never be silently rendered as complete.
- **Mandatory reads** (`src.get`: manifest.json) keep throwing on any miss — a missing manifest has nothing
  to render (fatal, unchanged).
- **`readExhibitTree` degrades per-layer, not per-exhibit.** Each *optional* authored layer (readings.json,
  the base-annotations sidecar fallback, per-reading pages) is read through a local wrapper: a
  `FailedReadError` is caught, flips `exhibit.incomplete = true`, and the layer falls back to empty — the
  exhibit still renders, but flagged partial. The base sidecar moves from `src.get` (fatal) to this
  optional-with-distinction path (404 → empty object; 5xx/torn → partial). The flag rides on the loaded
  exhibit (`PublishedExhibit.incomplete`). **The visible indicator is SHIPPED** (`rp5`): `ExhibitView.svelte`
  renders a quiet, non-blocking top-right status strip — "Some notes couldn't load — showing what's
  available." — gated on `{#if data.incomplete}`, so a transient failure is never *presented* as a complete
  exhibit (the loop's done-when). The `<archie-viewer>` EMBED's equivalent indicator is deliberately NOT
  built here — it rides the embed-parity UI rework tracked in `ledgers/CAPABILITY.md` (the `<archie-viewer>`
  parity work, which reworks the embed's read UI wholesale); the embed's read layer already sets `incomplete`
  identically, so that rework only needs to render it.

**SCHEMA GATE — lenient-on-absent, present-must-be-current, UNIFORM (ADR-0020, read first).**
ADR-0020 names all three surfaces (file-drop/zip, embed-tree, and — per its own "gate like the embed"
option — the hosted tree) as marker-check sites and mandates ONE policy. The embed (load.ts:201-214) and
zip (`validateArchieMarker`) already do this; the hosted apps/viewer **never read `archie.json`** — the
gap. Decision: **gate the hosted path like the embed**, not migrate-on-read: a `version !== SCHEMA_VERSION`
tree must refuse cleanly ("made with a different version of Archie") rather than render garbage, and a
present-but-foreign marker is rejected. The lenient-on-absent branch (accept iff `exhibits.json` parses)
is preserved so pre-marker and dot-file-stripping static hosts still open (ADR-0020's own regression note).
The duplicated HTTP marker-check (embed inline + a new hosted copy) is de-duplicated into ONE
`assertArchieTreeMarker(src: JsonSource)` in read.ts, composed by both surfaces (the zip seam in open.ts
is untouched — the HTTP validator is ADR-0020's deliberately-separate tree validator).

## Matrix — surface × case

Surfaces: **hosted** = apps/viewer HTTP (published.ts); **embed** = archie-viewer tree path (load.ts);
**zip** = fsJsonSource over an opened `.archie.zip` (read.ts).

| surface | case | actual (probe) | should be | fix commit | retest |
|---|---|---|---|---|---|
| hosted | readings.json 404 | null → readings:[] | absent → [] (ok) | (no change) | pass |
| hosted | readings.json 5xx | **null → readings:[] silent** (warns only) | failed → throw→partial flag | `rp1` | pass |
| hosted | readings.json torn-200 | **parse throws → aborts whole exhibit** | failed → throw→partial flag | `rp1` | pass |
| hosted | one reading sidecar 404 | null → [] | absent → [] (ok) | (no change) | pass |
| hosted | one reading sidecar 5xx | **null → [] silent** | failed → throw→partial flag | `rp1` | pass |
| hosted | base sidecar 404 | **src.get throws → aborts exhibit** ("Couldn't load this exhibit") | absent → empty object, render | `rp1` | pass |
| hosted | base sidecar 5xx | **src.get throws → aborts exhibit** | failed → partial flag, render | `rp1` | pass |
| hosted | archie.json absent | **never read** | lenient-accept (exhibits.json parses) | `rp2` | pass |
| hosted | archie.json version mismatch | **never read → renders garbage** | reject cleanly (version msg) | `rp2` | pass |
| embed | readings.json 5xx | **null → readings:[] silent** | failed → throw→partial flag | `rp1` | pass |
| embed | one reading sidecar 5xx | null → [] silent | failed → throw→partial flag | `rp1` | pass |
| embed | base sidecar 404 | src.get throws → aborts exhibit | absent → empty object, render | `rp1` | pass |
| embed | archie.json absent | lenient-accept (exhibits.json parses) | same (ok) | (no change) | pass |
| embed | archie.json version mismatch | rejected (version msg) | same (ok) | (via `rp2` de-dup) | pass |
| zip | readings/base/per-reading torn | **fsJsonSource swallows corrupt → null silent** | failed → throw→partial flag | `rp1` | pass |
| zip | archie.json absent / mismatch | lenient-accept / reject (validateArchieMarker) | same (ok) | (no change) | pass |
| all | **25a** torn manifest.json | buildImageIndex **silently omits exhibit** (slugs=["a"]); loadLibrary **hard-throws** — one file, two policies | torn (failed) manifest → propagate loud on BOTH; genuinely-absent manifest → omit (buildImageIndex) | `rp1` | pass |
| hosted | partial exhibit → VISIBLE indicator | (pre-fix) no signal — a degraded exhibit looked complete | ExhibitView renders a quiet non-blocking strip on `data.incomplete` | `rp5` | pass (astro check + viewer suite) |
| embed | partial exhibit → visible indicator | no signal | deferred to the embed-parity rework (CAPABILITY.md); read layer already sets `incomplete` | — (rides embed-parity) | n/a |

## Issue 25a — image-index consumes the new getOptional semantics

`buildImageIndex` (image-index.ts:45) reads each `{slug}/manifest.json` via `getOptional`. Under the new
rule: a **genuinely-absent** manifest → `null` → the exhibit contributes nothing (the documented
empty-library case, kept). A **torn/failed** manifest → `getOptional` now **throws `FailedReadError`**, so
`buildImageIndex` propagates it — a torn tree fails the publish/wall loudly instead of silently shipping a
wall missing an exhibit. This reconciles with `loadLibrary`'s hard-throw (site.ts:582): both now treat a
torn (failed) manifest as fatal-loud, and the divergence ("one corrupt file, two policies") is closed. The
choice is made *explicit* in image-index.ts with a comment; `buildImageIndex`'s absent→omit is retained
deliberately (an empty/never-written exhibit is not a corruption).

## Partial indicator — SHIPPED (hosted) + embed deferral

`loadPublishedExhibit(slug)` returns `PublishedExhibit.incomplete?: boolean` (from `@render/core`'s
`readExhibitTree`) — `true` when an OPTIONAL authored layer (readings, a base/per-reading annotation
sidecar) FAILED to load (5xx / torn JSON), omitted on a clean read. `ExhibitView.svelte` (`rp5`) renders a
quiet top-right `role="status"` strip, `pointer-events:none`, gated on `{#if data.incomplete}` — "Some notes
couldn't load — showing what's available." Verified: `astro check` 0 errors (it typechecks `.svelte`, so
`data.incomplete` is validated), viewer suite green. This closes the loop's done-when for the hosted surface.

The `<archie-viewer>` EMBED indicator is intentionally NOT built here: it rides the embed-parity UI rework
in `ledgers/CAPABILITY.md` (the `<archie-viewer>` read-UI parity work), which reworks that surface wholesale.
The embed's read layer already sets `incomplete` identically across the zip + tree paths, so the parity
rework only needs to render it — no data-layer work is owed there.
