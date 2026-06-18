# Thermo-Nuclear Review — render-core / publish + url

## Verdict

**APPROVE-WITH-NITS** — The pipeline has already internalized its own domino (read.ts is labeled as such in the file header); the remaining issues are real but none is a structural regression. Behavior is well-considered; the code is significantly cleaner than a typical publish pipeline of this complexity. The nits below are genuine and should be addressed before the surface grows further.

---

## Baseline

| File | LOC | Flag |
|---|---|---|
| publish/site.ts | 364 | watch — decomposition candidate (600–999 threshold approaching; currently fine by count, but the async body of `publishLibrary` is doing five distinct jobs in one function) |
| publish/ghpages.ts | 209 | ok |
| publish/working.ts | 203 | ok |
| publish/portable.ts | 153 | ok |
| publish/static-pages.ts | 123 | ok |
| publish/read.ts | 88 | ok |
| publish/merge.ts | 64 | ok |
| url/deeplink.ts | 90 | ok |
| url/route.ts | 64 | ok |
| url/breadcrumb.ts | 38 | ok |
| index.ts | 82 | ok |
| **Total scope** | **1,478** | |

No file hits the 1000-line blocker. `site.ts` at 364 is healthy by count, but its async body is the structural watch item (see Finding #1).

---

## The Domino

**None — independent.** The prior domino has already been applied: `read.ts` was extracted as the source-parameterized reader, collapsing three byte-identical traversal copies (site.ts preview, portable.ts, viewer HTTP) into one. The file header even labels it "THE DOMINO (ADR-0010 debt paid down)". The remaining findings do not subsume one another — they are independent local concerns.

---

## Findings (prioritized)

### **[Sev: major] `publishLibrary` is a five-job function with no internal seams** — `publish/site.ts:125` — standard #1 / #2

The async body of `publishLibrary` does five logically distinct things in one flat imperative cascade:

1. Write root indexes (`collection.json`, `exhibits.json`).
2. Build the library-wide link index.
3. Per-exhibit: write assets (display masters + originals).
4. Per-exhibit: write annotation trees (history sidecar + per-canvas heads pages + reading partitions).
5. Per-exhibit: write static archival pages.

These are interleaved without named phases. The `opts` shadowing at line 233 (`const opts = ...` inside the loop, shadowing the outer `opts: PublishOptions`) is a concrete symptom: there is no boundary to stop a local name from leaking into the wider scope. A reviewer tracing the asset write path must hold the entire 145-line per-exhibit loop in mind simultaneously with the root index writes.

The code-judo move: extract `writeExhibitTree(exDir, exhibit, log, manifest, readings, rw, ids, opts, brokenLinks)` as a named async helper covering steps 3–5. This eliminates the shadow, makes the root-index phase visually distinct, and lets each responsibility be read independently. Deletion test passes: extracting it REMOVES complexity from the callsite (five sequential concerns collapse to a loop over named phases). Self-check: not premature decomposition — `publishLibrary` already has more than 3 logical phases; the extract has a single caller, so no rule-of-three coupling risk.

---

### **[Sev: major] `readJson` is defined twice** — `publish/site.ts:291` and `publish/portable.ts:42` — standard #6

Both copies are identical: `dir.getFile(name)` → `file.readable()` → `JSON.parse(new TextDecoder().decode(...))`. The `read.ts` module introduced `fsJsonSource` as the canonical reader, but neither `site.ts:loadLibrary` nor `portable.ts:loadPortableGallery` uses it — they carry their own private `readJson` copies and bypass the seam entirely.

`loadLibrary` (site.ts) calls `readJson` for `exhibits.json` and each `manifest.json`; it could be replaced with `fsJsonSource(fs).get(path)`. `loadPortableGallery` (portable.ts) calls it for `exhibits.json`; same fix. The `fsJsonSource` seam was introduced explicitly to avoid this duplication (read.ts header says so) but left its two callers unreplumbed.

Preferred remedy: in `site.ts:loadLibrary`, replace `readJson` with `const src = fsJsonSource(fs)` and `src.get(...)`. In `portable.ts:loadPortableGallery`, do the same. Delete both private `readJson` definitions. This removes two near-identical 4-line blocks and locks the fs traversal to one implementation. Self-check: `readJson` is a genuine pass-through (deletion test passes — its complexity entirely reappears in `fsJsonSource.get`; the private copy adds nothing).

---

### **[Sev: major] `readAnnotations` imported in `site.ts:loadLibrary` but not in the common `readExhibitTree` path** — `publish/site.ts:316` — standard #6 / #4

`loadLibrary` reconstructs annotation logs by calling `readAnnotations` directly (spine layer), bypassing the `JsonSource` seam. The `readExhibitTree` path (used by `readPublishedExhibit` and `loadPortableExhibit`) does NOT load history logs — it only reads heads pages. This is intentional (the history sidecar is a separate concern from the viewer's heads-page read), but the import of a spine primitive into the publish/site.ts surface is a boundary concern: `site.ts` is already importing from `spine/persist.js`, `spine/serialize.js`, `spine/heads.js` — and now `readAnnotations` pulls in a fourth spine dependency for a function (`loadLibrary`) that is architecturally the inverse of `publishLibrary`, not a publish helper.

`loadLibrary` is arguably a separate seam — "read the published tree back into a Library+logs" — that belongs in `read.ts` (which owns the "read published tree" concern) or a `load.ts` sibling, rather than in `site.ts`. This is not an urgent split but a boundary that will grow messier as `site.ts` acquires more inverse operations.

Preferred remedy: move `loadLibrary` and `LoadedLibrary` out of `site.ts` into a `load.ts` sibling. This keeps `site.ts` as a write-only projection surface and `load.ts` as the read-back inverse, matching the natural seam the codebase already recognizes in its comments. Not a blocker today; becomes a blocker if `site.ts` gets a third inverse operation.

---

### **[Sev: minor] `opts` shadow inside `publishLibrary`'s per-exhibit loop** — `publish/site.ts:233` — standard #2 / #5

```ts
const opts = { historyBase: historyBaseAbs };
```

This shadows the outer `opts: PublishOptions` parameter. TypeScript does not warn on this because the inner `opts` is structurally compatible with a subset of `PublishOptions`. A reader expecting `opts.viewerBase` inside the inner block will silently get `undefined`. The fix is a rename: `const pageOpts = { historyBase: historyBaseAbs }` and update the three call sites. One-line fix; the risk is asymmetric — the shadow makes a future edit silently wrong.

---

### **[Sev: minor] Spread-of-optional-fields pattern repeated 10+ times without a helper** — `publish/working.ts:113–138` — standard #3

`workingToLibrary` builds the `Library` shape using 10+ consecutive spread-optionals:

```ts
...(ex.summary ? { summary: ex.summary } : {}),
...(ex.layout ? { layout: ex.layout } : {}),
...(ex.mode ? { mode: ex.mode } : {}),
```

The same pattern appears again for the object mapping (7 more spread-optionals). This is a style preference up to ~3 occurrences; at 10+ it becomes noise that obscures the actual field list. A `compact<T>(obj: Partial<T>): Partial<T>` helper that drops `undefined` values — or a typed `pick` that only includes defined keys — would make the shape visible at a glance. This is a legibility nit, not a correctness risk.

---

### **[Sev: minor] `rewriteNoteBodyMedia` loops over URL matches with a mutable string replacement** — `publish/portable.ts:105–110` — standard #4

```ts
for (const url of matches) {
  const blob = await rewriteAssetUrl(root, slug, url, sink);
  if (blob !== url) { out = out.split(url).join(blob); changed = true; }
}
```

`out.split(url).join(blob)` is fragile: if one matched URL is a prefix of another (e.g. `assets/photo.jpg` and `assets/photo.jpg.thumb`), the inner replacement can corrupt the outer match. The correct approach is a single-pass regex replace with an async resolver (or a sorted-descending-by-length order of replacement). This is currently safe given realistic asset names and the regex match pattern, but the brittleness is non-obvious and deserves a comment at minimum, or a sort-by-length guard.

---

### **[Sev: minor] `readExhibitTree` uses `objects0` for canvas iteration but `objects` (transformed) for the return value** — `publish/read.ts:70` — standard #5 / #4

```ts
for (const obj of objects0) {    // ← uses pre-transform ids to key annotation lookup
  ...
  annotationsByObject[obj.id] = ...
```

This is correct because the transform only rewrites `source`, not `id`. But the reason is implicit — a reader seeing `objects0` vs `objects` must verify that `transform.object` never mutates `id`. A comment stating the invariant ("transform preserves id — only source is rewritten") would make this safe without requiring a mental type-trace. Currently the `NoteTransform` interface has no documented constraint on which fields may be mutated.

---

## Code-Judo Opportunities

**1. The already-applied domino: `read.ts`.**
The best structural move in this scope has already been made. Three identical traversal copies collapsed to one source-parameterized function. This is the code-judo template for how to handle multi-path reads.

**2. `ghpages.ts:collectFiles` and `publishToGitHub` are cleanly separated.**
The pure tree-building functions (`collectFiles`, `buildGitTree`, `pagesUrlFor`) are already separated from the network layer (`publishToGitHub`). This is good architecture — the pure half is unit-testable, the network half is integration-testable with a mocked fetch. No judo opportunity here; it's already done.

**3. `merge.ts:mergePublishedIndexes` is a textbook deep module.**
Small interface (generated, existing, opts), substantial behavior (dual-index merge, slug collision resolution, order renumbering, dir-existence guard). No improvement needed.

**4. `static-pages.ts` is a pure string builder with zero dependencies on the Filesystem seam.**
Its isolation is a structural asset — it can be tested headlessly without any fs mock. Worth preserving: any future "enrich the archival page" work should stay in this file's pure-string boundary, not reach into `site.ts`.

**5. Hypothetical judo: collapse `writeJson`/`writeText` into the `FsDirectory` seam.**
`site.ts` defines two private helpers (`writeJson`, `writeText` at lines 106–118) that are called ~15 times. If other publish-adjacent modules ever need to write JSON to an `FsDirectory`, these will be duplicated. The seam (`fs/seam.ts`) could gain `writeJson(dir, name, data)` / `writeText(dir, name, text)` as convenience methods, eliminating the private helpers without changing any behavior. This is a hypothetical seam today (only one writer); defer until a second caller appears (rule of two).

---

## Self-Check

| Recommendation | Lens applied | Verdict |
|---|---|---|
| Extract `writeExhibitTree` from `publishLibrary` | Deletion test: complexity vanishes at callsite; not premature (5+ phases exist). Seam: single caller — but the extraction is a phase separator, not a port. | PASS |
| Unify `readJson` onto `fsJsonSource` | Deletion test: private `readJson` is a pass-through — identical to `fsJsonSource.get`. Not DRY-as-rule: the shared abstraction (`fsJsonSource`) already exists and is the canonical form. | PASS |
| Move `loadLibrary` to `load.ts` | Seam discriminator: currently one caller. Flag as boundary concern, not urgent split. Not recommended as immediate action — flagged as direction. | CONDITIONAL (deferred, not urgent) |
| `compact` helper for spread-optionals | Rule-of-three: 10+ occurrences in one function — rule satisfied. Not premature. | PASS |
| Sort-by-length guard in `rewriteNoteBodyMedia` | Locality: the guard stays in `portable.ts` at the same call site. Not spreading complexity. | PASS |
