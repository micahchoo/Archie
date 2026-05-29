# STEP 4 — THE DOMINO: unify the three published-tree readers behind `readExhibitTree`

## 1. Objective

Extract one source-parameterized reader, `readExhibitTree(src, slug, opts)`, into
`packages/render-core/src/publish/read.ts`; rewrite all three existing published-tree readers
(`readPublishedExhibit`, `loadPortableExhibit`, viewer `loadPublishedExhibit`) as thin adapters
over it. **Behavior-preserving.** Synthesis landing-order **step 4** (THE GLOBAL DOMINO);
collapses render-core Findings 1–3 + viewer M1.

## 2. Why this is a deliberate / separate change

The easy pass deletes dead code and routes leaks (steps 1–2, done). This one is held back for two
reasons the synthesis is explicit about:

1. **It crosses a subsystem boundary** (render-core ↔ `apps/viewer`). A render-core-only landing
   leaves the viewer's hand-rolled HTTP copy in place and the duplication persists
   (`thermo-render-core.md:86–89`, `:172–179`). Must be sequenced as one change touching both.
2. **It sits one inch from a behavior change.** `readPublishedExhibit` has *drifted* from ADR-0007:
   it omits the Readings registry that both live readers include (Finding 2). The tempting move —
   "unify, and now site reads readings too" — is **step 6**, a separate flagged behavior change with
   new I/O and new failure modes. This plan must consolidate the *traversal* while preserving each
   reader's exact current I/O and output, including site's omission. The risk that kept it out of the
   easy pass is precisely that a naive unification smuggles step 6 in for free
   (`THERMO-NUCLEAR-SYNTHESIS.md:46–48`, `:133`; `thermo-render-core.md:73–79`).

## 3. Current state (verified)

Three readers, identical traversal, confirmed line-by-line against source:

| Reader | Signature | Byte source | Readings I/O | Post-transform |
|---|---|---|---|---|
| `readPublishedExhibit(fs, slug)` | `publish/site.ts:329` → `Promise<PublishedExhibitData>` | `Filesystem` | **none** (drift) | identity |
| `loadPortableExhibit(fs, slug)` | `publish/portable.ts:134` → `Promise<PortableLoad>` | `Filesystem` | yes | blob-rewrite + revoke |
| `loadPublishedExhibit(slug)` | `apps/viewer/src/published.ts:139` (hosted branch :150–175) → `Promise<PublishedExhibit>` | HTTP `fetch` | yes | identity |

**Shared traversal** (all three): `readJson(manifest.json)` → `objectsFromManifest(manifest)` →
`canvasIdMap(manifest)` → `sectionsFromManifest(manifest)` → per-object read of
`canvas/{objId}/annotations.json` (`.items`) → `rightsFromIIIF(manifest)` → `title`/`summary` from
`manifest.label.none[0]` / `manifest.summary.none[0]` → assemble. Readers that read readings add:
`readings.json` (optional) → per-object, per-reading `annotations-${r.id}.json` (optional).

**Helpers (names/locations confirmed):**
- `objectsFromManifest`, `canvasIdMap`, `sectionsFromManifest` — `iiif/manifest.ts:102 / :95 / :144`.
- `rightsFromIIIF` — `iiif/rights.ts:74`.
- `readJson<T>(dir, name)` — copy-pasted: `site.ts:259`, `portable.ts:43`, `spine/persist.ts:24`;
  viewer's `fetchJson`/`fetchJsonOptional` — `published.ts:126 / :133`. (Finding 3 — 4 copies.)

**Filesystem seam** (`fs/seam.ts:14`): `Filesystem.root()` → `FsDirectory` with
`getDirectory`/`getFile`/`remove`/`entries`; `FsFile.readable() → ArrayBuffer`. **Backends are
Memory / Zip / FSA only** (`fs/memory.ts`, `fs/zip.ts`, `fs/fsa.ts` — confirmed via `ls fs/`; the
seam header names FSA/Download/OPFS). **There is no HTTP/fetch Filesystem backend.** The viewer's HTTP
reader is *not* a Filesystem backend — it is hand-rolled `fetch` (`published.ts:126–137`).

**Result-type hierarchy (confirmed):**
- `PublishedExhibitData` (`site.ts:310`) extends `RightsFields`; fields:
  `slug,title,summary?,objects,annotationsByObject,sections,canvasIdByObject`. **No readings fields.**
- `PortableExhibit extends PublishedExhibitData` (`portable.ts:27`) adds exactly
  `{ readings: Reading[]; readingAnnotationsByObject }`.
- Viewer `PublishedExhibit = PortableExhibit` (`published.ts:18`) — already one source of truth.

**The transform is fs-coupled, with TWO touch points** (`portable.ts`):
- `object.source` rewrite — `:143` via `rewriteAssetUrl` → `mintAssetBlob` (`:60`) reads asset
  **bytes** off `root.getDirectory(slug)/assets`.
- note-body rewrite — `:104` `rewriteNoteBodyMedia`, applied to base notes (`:156`) and per-reading
  notes (`:161`), also via `mintAssetBlob`.
Both mint into a `blobUrls[]` sink driving `revoke()` (`:188`). **It is not `(notes)→(notes)`** — it
reads raw bytes from the fs directory, so it composes *only* with the fs-backed source.

**Existing exports** (`packages/render-core/src/index.ts`): `export * from "./publish/site.js"`
(`:17`), `"./publish/portable.js"` (`:20`), `"./fs/seam.js"` (`:62`). Viewer imports the public surface
from `@render/core` (`published.ts:8–12`).

## 4. Target design

### 4.1 The seam — `JsonSource` (read-only, NOT a Filesystem backend)

Apply the **seam discriminator**: the byte-source axis has **two real implementors** (fs-walk over an
opened `.archie.zip` / Memory / FSA dir, and HTTP `fetch` over `BASE_URL/published`). Real seam, not
hypothetical.

```ts
// publish/read.ts
export interface JsonSource {
  get<T>(path: string): Promise<T>;            // throws on missing (manifest, base page)
  getOptional<T>(path: string): Promise<T | null>; // null on missing (readings.json, reading pages)
}
```

`path` is tree-relative (`"voynich/manifest.json"`, `"voynich/canvas/o1/annotations.json"`).

**Why JsonSource, not a fourth `Filesystem` backend:** `Filesystem` has byte/write/directory/`entries`
semantics HTTP cannot satisfy (no listing, no write, no nested handles). `JsonSource` is the *narrow*
read-only slice both sources satisfy trivially — fs walks `root → getDirectory(slug) → getFile → decode
→ parse`; fetch does `GET ${BASE}/${path}`. This is the home that folds the 4× `readJson` (Finding 3)
for the three readers.

### 4.2 The transform — fs-coupled hook with two touch points (NOT pure)

The second axis (identity / blob-rewrite) also has two implementors. Model the rewrite **honestly** as
a hook the reader applies, carrying fs access in its own closure (captured `root`+`slug`+`blobUrls`),
because `mintAssetBlob` reads bytes outside `JsonSource`:

```ts
export interface NoteTransform {
  object(o: AObject): Promise<AObject>;          // portable: rewrite source via mintAssetBlob
  note(n: W3CAnnotation): Promise<W3CAnnotation>; // portable: rewrite body media
}
```

The reader applies `transform.object` / `transform.note` and stays source-agnostic. **The blob/revoke
lifecycle stays in the `loadPortableExhibit` adapter** — the reader never sees `blobUrls`. This is why
the two axes are *not orthogonal*: the coupling lives in how the portable adapter pairs an fs source
with a fs-reading transform, not in the reader signature. A naive `(notes)→(notes)` transform would be
rewritten on day one (`thermo-render-core.md:64–71`).

### 4.3 The reader — readings gated at the I/O level (behavior-preservation crux)

```ts
export interface ReadExhibitOpts {
  readReadings?: boolean;      // default false — gates the ENTIRE readings I/O block
  transform?: NoteTransform;   // default identity
}
// Returns the SUPERSET shape; readings fields are [] / {} when readReadings is false.
export async function readExhibitTree(
  src: JsonSource, slug: string, opts?: ReadExhibitOpts
): Promise<PortableExhibit>;
```

**Critical:** `readReadings` gates the *I/O*, not just the output. When `false`, the reader does **not**
fetch `readings.json` and does **not** read any `annotations-${r.id}.json` page — exactly site's
current zero-readings I/O (`site.ts:329–346` reads neither). Returning the superset with empty
`readings: []` / `readingAnnotationsByObject: {}` is fine *as long as no extra reads happen*. The adapter
that needs `PublishedExhibitData` (site) narrows the return (see §5).

**Adapters become 3–6 lines each:**
- `readPublishedExhibit(fs, slug)` → build fs-backed `JsonSource`, call
  `readExhibitTree(src, slug, { readReadings: false })`, return as `PublishedExhibitData`
  (readings fields not exposed — return type unchanged).
- `loadPortableExhibit(fs, slug)` → build fs-backed `JsonSource` + a `NoteTransform` closure over
  `root`+`slug`+`blobUrls`, call `readExhibitTree(src, slug, { readReadings: true, transform })`, wrap
  in `{ exhibit, blobUrls, revoke }` — signature + lifecycle unchanged.
- viewer `loadPublishedExhibit(slug)` hosted branch → build a fetch-backed `JsonSource` (over
  `${BASE_URL}published`), call `readExhibitTree(src, slug, { readReadings: true })`. The `if(portableFs)`
  branch (`published.ts:142`) is **untouched** — still delegates to `loadPortableExhibit`.

**Deletion test (confirmed):** delete any one reader and its read sequence *reappears* in the next
caller — genuinely shared behavior, not a pass-through. So consolidate, do not delete; the win is a
deep module (lots of read behavior behind a small `(source, opts)` interface).

**Two variants per axis, stated:** byte source = {fs-walk, HTTP fetch}; transform = {identity,
fs-coupled blob-rewrite}. Both ≥2 → discriminator passes.

## 5. Behavior changes

**None (behavior-preserving).** Explicitly preserved:

- **site keeps omitting readings.** `readReadings: false` ⇒ no `readings.json` read, no per-reading
  page reads — byte-for-byte the same I/O as today. The ADR-0007 drift fix is **step 6**, NOT here.
- **site's return shape stays `PublishedExhibitData`.** Confirmed `preview.test.ts` reads only
  `.title/.objects/.canvasIdByObject/.annotationsByObject` — no readings fields. **Decision (stated, not
  silent):** the `readPublishedExhibit` adapter's declared return type stays `PublishedExhibitData`, so
  the empty readings fields are **not** part of its contract. (Narrow at the adapter via return type;
  do not widen site's public type to the superset. This keeps the "no new fields on the preview shape"
  property and matches today exactly.)
- **portable:** same blob minting, same `blobUrls` order, same `revoke()`, same `PortableLoad` shape.
- **viewer:** same HTTP paths, same `fetchJsonOptional`→null-on-404 semantics, same `PublishedExhibit`
  return; the portable branch unchanged.

No latent-bug-fix rides along. (The `MediaPlayer.bodyText` lossy-read fix is step 3, separate.)

## 6. Blast radius & test impact

**Guarding tests (must stay green, ZERO edits):**
- render-core publish suite — `publish/{site,voynich-readings,portable,interop,ghpages,preview}.test.ts`
  (6 files). `preview.test.ts:25+` pins `readPublishedExhibit` returns objects/heads/canvas IRIs;
  `portable.test.ts` pins blob URLs + readings; `voynich-readings.test.ts` + `site.test.ts` pin the
  write+readings projection.
- viewer — `apps/viewer/src/published.test.ts:54` pins portable-mode `loadPublishedExhibit` returns
  `readings: array` and `objects[0].source.startsWith("blob:")`. This is the **guardrail**: a naive
  unification that drops readings from the portable path fails this line.

**Litmus (bake into acceptance):** step 4 requires **zero test-file edits**. All three external
signatures stay identical, which simultaneously satisfies ADR-0010's "zero viewer-component changes,"
the `published.test.ts:54` guardrail, and the 6 publish tests. If the plan proposes editing any publish
test or `published.test.ts`, the design has drifted into a behavior change — stop and re-check.

**No fixture changes.** The project fixture rule (`never modify a shared fixture to fix one test`) is
**not triggered** — `sample-data.ts`, `voynich.ts` untouched.

**No coverage:** the fetch-backed `JsonSource` over real HTTP is not unit-tested (viewer test exercises
only the portable branch). Acceptable — the hosted path's traversal is now the *same code* the
portable/preview tests cover; only the ~3-line fetch source is new and trivial. Optionally add a tiny
`read.test.ts` driving `readExhibitTree` over a `MemoryFilesystem`-backed `JsonSource` with
`readReadings:false` vs `true` to pin the gating directly (recommended, not required).

**Verification commands:**
```
pnpm --filter @render/core test    # 46 files / 402 tests — all green
pnpm --filter @render/core build   # types: superset return + narrowed site adapter compile
pnpm --filter viewer test          # published.test.ts green (esp. :54)
pnpm --filter viewer build         # viewer compiles against new @render/core export
pnpm -r typecheck                  # cross-package: viewer sees JsonSource/readExhibitTree
```
(Use the repo's actual script names; confirm in root `package.json` at execution time. Node v24 via fnm
per project memory.)

## 7. ADR alignment

- **ADR-0010 (portable read seam)** — its own Consequences (`:16`) names this debt:
  *"Core's `readPublishedExhibit` omits the Readings registry, so the portable reader re-implements the
  readings read (~30 LOC)."* This plan **pays that down** — aligns, does not contradict. ADR-0010's
  load-bearing virtue is **zero viewer-component changes**: only the data-read *layer* changes,
  `published.ts` keeps its `if(portableFs)` branch shape and all external signatures, so no component
  touches anything. Preserved by design (§5, §6 litmus).
- **ADR-0007 (readings as AnnotationPages)** — the readings drift in `readPublishedExhibit` (Finding 2)
  is **acknowledged and deliberately NOT fixed here**. Surfacing readings in preview is **step 6**, a
  separate flagged behavior change. This plan keeps the drift exactly as-is (`readReadings:false`), so
  it neither deepens nor resolves the ADR-0007 gap — it is orthogonal.
- **ADR-0003 (Filesystem seam / source-before-projection)** — `JsonSource` is a *narrower* read-only
  seam, not a new `Filesystem` backend (§4.1). It does not alter the storage row; the fs-backed
  `JsonSource` is a thin projection *over* an existing `Filesystem`.
- **ADR-0008 (viewer one shell, dual mode)** — the `if(portableFs)` dual-mode seam is untouched; both
  branches still return the same shapes. Aligned.

No contradiction; no intended drift-correction in this step.

## 8. Implementation steps

**Phase 1 — core seam + reader (≤3 files: new `read.ts`, edit `site.ts`, edit `index.ts`).**
1. Create `packages/render-core/src/publish/read.ts`: `JsonSource`, `NoteTransform`, `ReadExhibitOpts`,
   `readExhibitTree` (gated-readings traversal, applies transform). Include a `fsJsonSource(fs)` factory
   folding `readJson`/`readJsonOptional` (Finding 3, the three-reader copies).
2. Rewrite `readPublishedExhibit` (`site.ts:329`) as the fs adapter, `readReadings:false`, return typed
   `PublishedExhibitData`. Keep `site.ts`'s local `readJson` only if still used elsewhere (it's used by
   `loadLibrary` :277,283 — leave that; do not touch `loadLibrary`/`publishLibrary`).
3. Export `readExhibitTree` + `JsonSource` + `fsJsonSource` from `index.ts` (barrel).
4. **Verify gate:** `pnpm --filter @render/core test && build` — 6 publish tests green, no edits.

**Phase 2 — portable adapter (1 file: `portable.ts`).**
5. Rewrite `loadPortableExhibit` (`:134`) as the fs adapter: build `JsonSource` + the `NoteTransform`
   closure (move `rewriteAssetUrl`/`rewriteNoteBodyMedia`/`mintAssetBlob` into the closure or keep as
   module helpers the closure calls), `readReadings:true`, wrap `{exhibit,blobUrls,revoke}`. Keep
   `loadPortableGallery` as-is.
6. **Verify gate:** `pnpm --filter @render/core test` — `portable.test.ts`, `voynich-readings.test.ts`
   green, no edits.

**Phase 3 — viewer rewire (1 file: `apps/viewer/src/published.ts`).**
7. Add a `fetchJsonSource(base)` (wrapping existing `fetchJson`/`fetchJsonOptional`). Rewrite the hosted
   branch of `loadPublishedExhibit` (`:150–175`) to `readExhibitTree(fetchJsonSource(...), slug,
   {readReadings:true})`. Leave the `if(portableFs)` branch (`:142–147`) untouched. Import
   `readExhibitTree`/`JsonSource` from `@render/core`.
8. **Verify gate:** `pnpm --filter viewer test && build` — `published.test.ts:54` green, no edits;
   then `pnpm -r typecheck`.

**Out of scope (flag as follow-on, keep out of this diff):** folding `spine/persist.ts:24`'s `readJson`
into the fs `JsonSource` (different concern — persist reads history sidecars, not the publish tree).
The ADR-0007 readings fix (step 6). The published-side annotation accessor (step 3).

## 9. Acceptance criteria

- [ ] `packages/render-core/src/publish/read.ts` exists exporting `readExhibitTree`, `JsonSource`,
      `NoteTransform`, `fsJsonSource`; barrel re-exports them.
- [ ] `readPublishedExhibit`, `loadPortableExhibit`, viewer `loadPublishedExhibit` are each ≤~8-line
      adapters with **byte-identical external signatures and return types**.
- [ ] `readExhibitTree` performs **no** readings I/O when `readReadings` is falsy (verify by reading the
      code path: no `readings.json` / `annotations-*.json` reads).
- [ ] `pnpm --filter @render/core test` — all 402 tests green; **zero** publish test files edited.
- [ ] `pnpm --filter viewer test` — `published.test.ts` green incl. `:54` readings-array +
      `source.startsWith("blob:")`; **zero** edits.
- [ ] `pnpm -r typecheck` + both builds green; viewer resolves `readExhibitTree`/`JsonSource` from
      `@render/core`.
- [ ] No shared fixture modified (`sample-data.ts`, `voynich.ts` unchanged).
- [ ] `git diff` shows changes confined to: new `read.ts`, `site.ts`, `portable.ts`, `index.ts`,
      `apps/viewer/src/published.ts` — and **no test files**.

## 10. Rollback

Single-commit, self-contained, no migrations or data changes. Revert with `git revert <sha>` (or reset
the branch). The five touched files restore to their prior bodies; external signatures never changed, so
no consumer needs reverting. If a phase gate fails, the prior phase's commit is independently green —
roll back to the last passing verify gate. Because every external signature is preserved, a partial
landing (e.g. core done, viewer not) still compiles and passes its own suite — the viewer simply keeps
its hand-rolled hosted branch until phase 3 lands.
