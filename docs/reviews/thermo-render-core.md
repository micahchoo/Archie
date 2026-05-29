# Thermo-Nuclear Review — `packages/render-core` (@render/core)

Reviewer pass: whole-package, cross-module domino hunt. 89 files / ~8330 LOC across 15 dirs.
Prior art read first: ADR-0003, 0005, 0006, 0007, 0009, 0010; `docs/architecture/subsystems.md` + `overview.md` (render-core sections).

## 1. Verdict

**Pragmatic Partial.** The canonical layer is, on the whole, genuinely well-built: the
producer→consumer split between the spine (owns the Note→WADM conversion), `wadm/` (owns
the W3C/IIIF *types*), and `iiif/` (builds the Presentation envelope) is clean and
single-sourced. The suspected "two serializers" duplication does **not** exist — see §4.
But there is one real, ADR-acknowledged structural duplication that spans render-core and
the viewer, plus an ADR-0007 *drift* hiding inside it. Fixing the domino is behavior-preserving
and collapses four findings. Hence Partial, not Full Coherence.

## 2. The Domino

**Unify the three published-tree readers behind one source-parameterized reader.**

There are **three** functions that read a published Archie tree, and they share an
*identical* read algorithm:

| Reader | File | Byte source | Reads readings? | Post-transform |
|---|---|---|---|---|
| `readPublishedExhibit` | `publish/site.ts:329` | `Filesystem` seam | **NO (drift)** | none |
| `loadPortableExhibit` | `publish/portable.ts:134` | `Filesystem` seam | yes | blob-URL rewrite |
| `loadPublishedExhibit` | `apps/viewer/src/published.ts:139` | HTTP `fetch` | yes | none |

Every one of them does the same sequence:
`readJson(manifest)` → `objectsFromManifest` → `canvasIdMap` → `sectionsFromManifest` →
loop objects reading `annotations.json` (+ `annotations-${readingId}.json`) →
`rightsFromIIIF` → assemble the result struct. `readJson` itself is **copy-pasted four times**
(`site.ts:259`, `portable.ts:43`, `spine/persist.ts:24`, and the viewer's `fetchJson`).

The algorithm varies on exactly **two axes**, and only two:
1. **Byte source** — a `Filesystem` directory vs an HTTP `fetch`. Two real variants → a real seam.
2. **A post-read transform** — identity (site/viewer) vs blob-URL rewrite (portable). Two real variants → a real seam.

Both axes have ≥2 concrete implementers, so the seam discriminator passes (this is *not* a
hypothetical port). The remedy:

```
type JsonSource = {
  get<T>(path: string): Promise<T>;          // readJson | fetchJson
  getOptional<T>(path: string): Promise<T|null>;
};
readExhibitTree(src: JsonSource, slug: string, transform?: NoteTransform): PublishedExhibitData & {readings, readingAnnotationsByObject}
```

- `readPublishedExhibit`, `loadPortableExhibit`, and the viewer's `loadPublishedExhibit`
  become 3–6-line adapters: construct a `JsonSource` (fs-backed or fetch-backed), pass the
  blob-rewrite transform only in the portable case.
- The result shapes ALREADY form a clean hierarchy — `PortableExhibit extends
  PublishedExhibitData` adding exactly `{readings, readingAnnotationsByObject}`
  (`portable.ts:27`), and the viewer's `PublishedExhibit` returns those same two fields.
  So the unified reader returns the superset; site's preview path simply ignores the
  readings fields (or — better — stops ignoring them; see Finding 2).

**This collapses:** Finding 1 (triplicated read), Finding 2 (ADR-0007 readings drift in
`readPublishedExhibit`), Finding 3 (4× `readJson`), and the portable/viewer
near-duplication that ADR-0010's own Consequences section flags as owed tech-debt
("the portable reader re-implements the readings read (~30 LOC, mirroring published.ts:50,60)").

**Sharpening — the two axes are NOT orthogonal (implementer must know this).** The blob
transform is *not* a pure `(notes)→(notes)` post-step: `portable.ts`'s rewrite calls
`mintAssetBlob(root, slug, name, …)`, reading raw asset **bytes** from the archive's
`FsDirectory` — not from the parsed JSON. So the transform is coupled to the *fs-backed*
source specifically and cannot run over the HTTP source. The signature must give the
transform access to the source handle, e.g. `transform?: (src, slug, notes) => Promise<notes>`,
and the blob transform composes only with the fs-backed `JsonSource`. A naive
`(notes)→(notes)` transform gets rewritten on day one.

**Behavior-preservation boundary (do not let the two changes ride together).** Split this
cleanly: **(a)** the *consolidation* is behavior-preserving — the unified reader returns the
superset type and `site.ts`'s adapter ignores the readings fields exactly as today (no new
I/O on the preview path); **(b)** fixing the ADR-0007 drift so the preview path *actually*
reads `readings.json` + per-reading pages is a **separate, flagged behavior change** (new
I/O, new failure modes where there were none). Land (a) freely; gate (b) explicitly.
Synthesis must not treat (b) as a free rider on (a).

**Deletion test:** delete any one reader and the read logic *reappears* in the next caller —
it is genuinely shared behavior, not a pass-through. So we consolidate (don't delete), and
the consolidation is the deep-module win: lots of read behavior behind a small
`(source, transform)` interface.

**Cross-subsystem caveat:** the third implementer lives in `apps/viewer`, so the unified
`readExhibitTree` must be *exported from render-core* and the viewer rewired to it. That
makes this a cross-subsystem change, flagged in §5 — it is the highest-leverage item but
should be sequenced with the viewer reviewer, not landed render-core-only.

## 3. Findings (prioritized)

### Finding 1 — [major] Triplicated published-tree read algorithm
`publish/site.ts:329`, `publish/portable.ts:134`, `apps/viewer/src/published.ts:139`.
Same read sequence three times; see §2. Remedy = the domino. Standard 0/3/6.

### Finding 2 — [major] `readPublishedExhibit` has DRIFTED from ADR-0007 (readings)
`publish/site.ts:329`. The canonical filesystem reader **omits the Readings registry and
the per-reading annotation pages** that ADR-0007 made first-class — while *both* live
consumers (viewer HTTP reader, portable reader) read them. The omission is documented in
the code's own comments and tests (`portable.ts:7,26,132`; `published.test.ts:54`:
"the readings field core's readPublishedExhibit omits"). This is exactly the case the
shared brief calls a finding: **code that has drifted from an ADR.** Today it is masked
because `readPublishedExhibit` is consumed *only by tests* (`preview.test.ts`) — the
"local preview" path — so the drift is latent. The moment preview is used to render a
readings-bearing exhibit, the legend silently disappears. **Note the behavior boundary:**
the *domino consolidation* (§2a) does not fix this — it keeps site's adapter ignoring
readings to stay behavior-preserving. Actually surfacing readings in preview (§2b) is a
deliberate, separately-flagged behavior change. ADR-0007.

### Finding 3 — [minor] `readJson` copy-pasted four times
`site.ts:259`, `portable.ts:43`, `spine/persist.ts:24`, viewer `fetchJson`. Five-line
`getFile → TextDecoder → JSON.parse`. Folds into the `JsonSource` seam (domino) for the
three publish/viewer copies; `spine/persist.ts` can share the fs-backed one. Standard 4.

### Finding 4 — [minor] Two near-duplicate xywh regexes
`geometry/selector.ts:19` (`XYWH_RE`, pixel-only) vs `geometry/mediafragment.ts:24`
(`XYWH_UNIT_RE`, pixel|percent). `mediafragment.ts` already imports `av/time.ts` for the
`t=` half, so the fragment grammar is *mostly* centralized; the 2-D-only path just kept its
own stricter regex. ADR-0006 explicitly **stages** the selector work (Wave 1 = `t=` /
`xywh=` separately; Wave 2 = combined `xywh&t` in mediafragment.ts), so this split is
*partly* sanctioned. Recommend `selector.ts` delegate its parse to `parseMediaFragment` and
keep only the "reject non-pixel / reject temporal" guard. Low priority — do not block.
ADR-0006.

### Finding 5 — [minor] `partOf?: unknown` and `creator?: unknown` on the canonical WADM types
`wadm/types.ts` (`W3CAnnotationPage.partOf`, `W3CAnnotation.creator`). These are the
canonical type contract for the whole package; `unknown` here pushes casts onto every
consumer. `partOf` has a known shape (`{id, type:"AnnotationCollection"}[]` — it is written
concretely in `iiif/presentation.ts`'s inline `annotations[]` type and in `site.ts`). Tighten
to the real shape; the inline literal in `presentation.ts` is the de-facto definition already.
Standard 5. Minor because it is contained to two fields on otherwise-clean types.

## 4. What earns its keep (considered, passed the deletion test — do not re-litigate)

- **`spine/serialize.ts` is the ONE annotation serializer.** `recordToAnnotation` is
  single-sourced (`serialize.ts:80`); everything else (`headsPageFromRecords`,
  `headsPagesByReading`, `toHistory`, `session.ts`) composes it. **There is no second
  serializer.** The hypothesized "iiif/ vs wadm/ both hand-roll annotation shaping" does
  **not** hold: `wadm/` defines *types only* (`types.ts`, `brand.ts`), `iiif/` builds the
  Presentation 3 *envelope* (Collection/Manifest/Canvas) and references annotation pages by
  id, and the spine produces the annotation *bodies*. Clean producer→consumer. Cleared.
- **`publish/site.ts` (346 LOC) is NOT three duplicate pipelines.** `site.ts` is the single
  *write* projection (`publishLibrary`); `ghpages.ts` is a distinct concern (GitHub Contents
  API transport + bounded concurrency + HTTP error mapping); `portable.ts` is a *read* path.
  They are not near-duplicate publish pipelines — they are write / transport / read. The
  only real overlap is the *read* triplication (Finding 1), which is portable+viewer, not
  the three "site/ghpages/portable" files the brief hypothesized. Cleared on the file-trio
  framing; redirected to the real reader trio.
- **`wadm/brand.ts` branded ids + ULID.** Phantom-brand pattern, dependency-free ULID.
  Deletion → type-safety across the whole DAG reappears as runtime string confusion under
  concurrency. Deep. ADR-0003 Refinement (rev vs version) justifies the `RevId`/`VersionId`
  distinction. Keep.
- **`spine/` (757 LOC, log/merge/heads/serialize/persist/deserialize).** Append-only log →
  version-DAG → three-way merge → heads/history WADM projection. Every layer is justified
  one-for-one in ADR-0003's "Rejected alternatives" (each is information that would be
  re-derived). Not over-engineering — a locked data-model decision. Keep.
- **`headsPagesByReading` partition + base page.** Looks like branchy special-casing
  (base page has no `partOf`; zero-note readings emit no page). It is the literal ADR-0007
  projection ("N pages per Object partitioned by reading + a base page"). Earns its keep.
- **`publish/` does NOT re-derive `model/` or `query/filter.ts` (the third contracted
  verdict).** `publish/` imports `model/` *type-only* and consumes the `iiif/manifest.ts`
  derivation helpers (`objectsFromManifest`, `sectionsFromManifest`, `toManifest`,
  `canvasIdMap`) rather than hand-rolling object/section/layout derivation. It does not
  touch `query/filter.ts` — and correctly so: `filter.ts` is the **reader-side**
  (records→filtered selection at *load* time), whereas publish partitions the log into
  per-reading pages at *write* time via the spine's `headsPagesByReading`. Opposite sides
  of the read/write seam; no shared logic to dedupe. Cleared — no publish/model duplication.
- **`fs/` seam + 3 backends + conformance suite.** Memory/Zip/FSA behind one interface, with
  a shared conformance test. Textbook deep seam; ≥2 real backends. Keep.

## 5. Cross-subsystem hooks (for synthesis)

- **The domino crosses into `apps/viewer`.** The third reader (`loadPublishedExhibit`,
  `apps/viewer/src/published.ts:139`) is the HTTP variant of the same algorithm. The unified
  `readExhibitTree` + `JsonSource` seam should be **exported from render-core** and the
  viewer rewired to construct a fetch-backed `JsonSource`. Coordinate with the viewer
  reviewer — do not land render-core-only, or the viewer keeps its hand-rolled copy and the
  duplication persists. ADR-0010 already names this as owed work.
- **`PublishedExhibitData` / `PortableExhibit` / viewer `PublishedExhibit` are three names
  for one extends-hierarchy.** The unified reader should return the superset type from
  render-core; the viewer and portable paths should consume it rather than redeclaring. This
  is the type half of the same domino.
- **ADR-0007 drift is render-core-internal but visible to the viewer's tests** — the viewer
  test (`published.test.ts:54`) asserts the readings field that core's reader omits, which is
  how the divergence has stayed latent rather than caught.
