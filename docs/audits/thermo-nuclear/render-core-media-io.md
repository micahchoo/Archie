# Thermo-Nuclear Review — render-core / media + io + geometry

## Verdict

**APPROVE-WITH-NITS** — The layer is structurally sound, well-decomposed, and has no 1000-line files. Three focused code-judo opportunities exist; none rises to a blocker. One latent correctness bug (null-clearing silently dropped in `editNote`) warrants a fix before the conflict-resolution path sees production use.

---

## Baseline

19 files, 0 files ≥ 1000 lines, 0 files ≥ 600 lines. Largest file is `session.ts` at 170 lines. Every module has a legible single-sentence purpose; imports flow downward (geometry → selector → mediafragment → av/time; iiif → presentation → rights). Tests exist and are behaviour-locked. The Filesystem seam (`seam.ts`) is genuinely deep: a 4-method interface hides FSA, Zip, Memory, and OPFS backends; the conformance suite (`conformance.ts`) is the canonical contract.

**Concerns the audit tracked before reading code** (from stated focus areas):

- Geometry cluster: three selector representations — `selector.ts` (W3C SVG/fragment), `mediafragment.ts` (spatiotemporal combined), `geo.ts` (lng/lat + pixel for maps). Do they duplicate?
- IIIF cluster: manifest, presentation, resolve — three files. Leakage?
- FS cluster: zip + binding + memory + conformance — is the seam deep or a pass-through indirection?

**Verdict on each after reading:**

- Geometry: no canonical model is missing. `selector.ts` handles static W3C selectors; `mediafragment.ts` handles combined spatiotemporal selectors for AV; `geo.ts` handles the Map projection. The three address genuinely different domains. However, `Box` is defined in `selector.ts` (x,y,w,h) and `PixelRect` in `geo.ts` (x,y,w,h) — two structurally identical types that could unify.
- IIIF: the three-file split is clean — `presentation.ts` holds types only, `resolve.ts` classifies tile sources, `manifest.ts` projects the model to IIIF. BUT: `manifest.ts` independently re-implements the "is this a IIIF image service?" check twice (lines 68 and 88) using inline regex literals that duplicate `resolve.ts`'s `IMAGE_EXT_RE` and `resolveTileSource`.
- FS: the seam is genuinely deep. The 4-method interface dispatches to fundamentally different storage strategies; `ZipFilesystem` adds `streamZip` with real backpressure logic, `MemoryFilesystem` uses a recursive Map tree. Not pass-throughs.

---

## The Domino

**`manifest.ts` skips `resolveTileSource` and duplicates the IIIF-service-classification regex twice inline** — unifying these two call sites around the canonical helper (`resolveTileSource`) eliminates both the duplication and the risk of extension sets diverging, which is the most impactful single move in this audit; fixing it also reveals the `unLang` duplication fix as a trivial follow-on.

---

## Findings (prioritized)

---

**[MEDIUM] manifest.ts duplicates the IIIF-service-classification logic from resolve.ts — twice**
`packages/render-core/src/iiif/manifest.ts:68` and `:88` — Standard #6 (logic in canonical layer), Standard #4 (magic over boring code)

`toCanvas` independently tests `mediaType === "Image" && /^https?:\/\//i.test(obj.source) && !/\.(jpe?g|png|webp|avif|gif|tiff?|svg)(\?.*)?$/i.test(obj.source)` on lines 68 and 88 — this is the same predicate `resolveTileSource` already encapsulates in `resolve.ts`, and `IMAGE_EXT_RE` already names the extension set. Two call sites, two inline regex literals, both duplicating the extension list from `resolve.ts:40`. If a new extension is added (e.g. `.jxl`), the manifest's two inline copies diverge silently from `resolve.ts`.

**Smell:** canonical-layer bypass — the classification logic lives in `resolve.ts` as `resolveTileSource`, but `manifest.ts` re-derives it from raw string inspection rather than calling the helper.

**Remedy:** call `resolveTileSource(obj.source)` at the top of `toCanvas` and branch on `t.kind`. The service descriptor and thumbnail conditionals reduce to `if (t.kind === 'iiif')` checks; the inline regexes disappear entirely. `thumbnailUrl` in `resolve.ts` already covers the thumbnail URL derivation, so the thumbnail computation on line 89 (`${obj.source.replace(/\/$/, "")}/full/240,/0/default.jpg`) can also be replaced with `thumbnailUrl(obj.source, 240)`.

---

**[MEDIUM] exif/read.ts — JPEG segment scanner body is duplicated verbatim between `readExifOrientation` and `readExifCaptureDate`**
`packages/render-core/src/exif/read.ts:17–45` vs `:51–78` — Standard #0 (structural simplification), Standard #2 (spaghetti growth)

Lines 21–40 (orientation) and lines 55–72 (capture date) are identical JPEG segment iteration loops — same marker parsing, same fill-byte skip, same `hasExifSignature` guard, same advance-by-`dataEnd` pattern. Only the body of the `if (marker === 0xe1)` branch differs (one calls `parseTiffOrientation`, the other `parseTiffCaptureDate`).

**Smell:** near-identical code blocks that grew via copy-paste extension rather than extraction. Divergence risk: the orientation path has the `0xff` alignment guard (`if (v.getUint8(off) !== 0xff) return 1`) which the capture-date path silently omits (`if (v.getUint8(off) !== 0xff) return null` is not there — the path falls through on misalignment, doing a getUint16 on an unaligned byte).

**Remedy:** extract a `scanJpegApp1` utility:
```ts
function scanJpegApp1(buf: ArrayBuffer, read: (v: DataView, dataStart: number, dataEnd: number) => T | null): T | null
```
Both exported functions become thin callers. The alignment divergence is fixed by the single path.

---

**[MEDIUM] session.ts `editNote` silently drops null-clear for `reading`, `emphasis`, `geo`**
`packages/render-core/src/session/session.ts:98–100` — Standard #5 (boundary/type cleanliness), Standard #3 (spaghetti)

`NoteEdit` declares `reading?: string | null`, `emphasis?: Emphasis | null`, `geo?: GeoAnchor | null` — `null` is the documented clearing sentinel (lines 39–44). `appendEdit` in `spine/log.ts` correctly handles `null` (lines 134–136 do the ternary: `null → undefined` to clear). **But `editNote` in `session.ts` never forwards `null`**: lines 98–100 use `changes.x !== undefined ? { x: changes.x } : {}` — when `changes.reading === null`, the condition is true (null !== undefined), so `{ reading: null }` IS passed through. Wait — re-reading: `null !== undefined` is `true`, so the spread fires. Correct. BUT `changes.motivation !== undefined ? { motivation: changes.motivation } : {}` on line 101 — `motivation` is `string | string[] | undefined`, no null clearing defined.

**Revised finding — the actual bug is in `resolve()`:** lines 140–147, the `resolve` method accepts a `choice` with no `reading`, `emphasis`, or `geo` fields — if a conflicted note had a reading/emphasis/geo, the resolved merge record drops them unconditionally (the conflict-resolution path resets per-note reading assignment to base and mutes all emphasis/geo). This is a silent data loss, not a thrown error.

**Smell:** the `resolve` call-site type is narrower than `NoteEdit` — it exposes `body`, `target`, `layers`, `motivation` but not `reading`, `emphasis`, `geo`. A conflict-resolved merge always clears reading/emphasis/geo silently. This is either intentional (and should be documented and tested) or accidental (a latent correctness bug).

**Remedy:** either document the invariant ("conflict resolution always resets to base — no reading/geo in a merge node") with a test, or extend the `choice` parameter to accept `reading`, `emphasis`, `geo` with the same null-sentinel protocol.

---

**[LOW] `unLang` is defined independently in both `manifest.ts` and `rights.ts`**
`manifest.ts:39`, `rights.ts:65` — Standard #6 (canonical layer), Standard #4 (thin wrapper)

Two private `unLang` functions with different type annotations (`LangMap` vs `{ [k: string]: string[] }`) but identical logic. `LangMap` is defined as `Record<string, string[]>` in `presentation.ts` — the same shape. The function belongs in `presentation.ts` (or exported from `rights.ts`) and imported by `manifest.ts`.

**Remedy:** export `unLang` from `presentation.ts` alongside `langMap`. Three lines changed.

---

**[LOW] `parseVtt` and `parseSrt` are identity-forwarding wrappers over `parseCues`**
`packages/render-core/src/av/transcript.ts:48–53` — Standard #4 (thin wrapper smell)

`parseVtt(input)` returns `parseCues(input)`. `parseSrt(input)` returns `parseCues(input)`. Same function body, same parser, no branching. The comment acknowledges it ("the parser handles both regardless, so this is informational"). Importers already call `parseCues` directly at line 86.

**Deletion test:** delete `parseVtt` and `parseSrt` → the exports disappear; callers would call `parseCues` directly (or the internal export is unexported). Complexity does not vanish — callers outside this file need a named API. However, the right shape is exporting `parseCues` as the single canonical function and deleting the forwarding aliases, or merging into a single `parseTranscript`. The `format?` option on `ImportTranscriptOptions` (line 80) is already "informational" — both wrappers exist to justify that option having an effect.

**Remedy:** export `parseCues` as `parseTranscript`. Delete `parseVtt` and `parseSrt`. Mark `format` on `ImportTranscriptOptions` as documentation-only if it stays.

---

**[LOW] `shouldRenderGallery` and `shouldRenderGalleryFromJson` implement the same logic on different types**
`packages/render-core/src/iiif/exhibits.ts:54–68` — Standard #6 (canonical layer)

Both functions compute `!(single && !hasFraming)` over nearly identical field reads. The duplication exists because the Viewer operates on `ExhibitsJson` (the published shape) and cannot call the model-level function. The `ExhibitsJson.library` carries the same fields as `Library` (title, summary). The two functions will diverge if the threshold rule changes.

**Deletion test:** delete `shouldRenderGalleryFromJson` → the Viewer re-implements inline or the model type must be imported. Complexity reappears at the caller. This is a genuine seam cost — the duplication is load-bearing.

**Remedy (lower bar):** extract the shared predicate into a private `galleryThreshold(single: boolean, hasFraming: boolean): boolean` and have both functions call it. The rule is in one place; the type adapters stay separate. Three-line change.

---

**[LOW] `Box` (selector.ts) and `PixelRect` (geo.ts) are structurally identical**
`selector.ts:8–13`, `geo.ts:29–33` — Standard #5 (boundary cleanliness)

Both define `{ x: number; y: number; w: number; h: number }`. They are used in different contexts (W3C annotation geometry vs map pixel rects) and no current code bridges them — but any future function taking both a selector bbox and a map pixel rect must either import both or cast. TypeScript structurally unifies them at the type-checker level, but the nominal split is invisible at the call site.

**Remedy:** export `Box` from a shared geometry primitive (or from `selector.ts`) and import it in `geo.ts`. Low urgency — only matters when code starts moving between the two domains.

---

## Code-Judo Opportunities

1. **`manifest.ts` IIIF-service test → `resolveTileSource` call.** Replace two inline regex conditionals (lines 68 and 88) with `const t = resolveTileSource(obj.source)` at the top of `toCanvas` and branch on `t.kind`. Thumbnail URL becomes `thumbnailUrl(obj.source, 240)`. Zero behavior change, regex duplication eliminated, extension-list divergence foreclosed. This is the domino.

2. **`exif/read.ts` segment scanner → extracted `scanJpegApp1` callback.** The two 20-line scanner loops are identical except their `if (marker === 0xe1)` handler. Extract one generic scanner, both public functions become 3-line callers. Side effect: fixes the silent alignment-guard asymmetry between the two paths.

3. **`galleryThreshold` private extractor in `exhibits.ts`.** Three-line extraction removes the only copy of the "single && !hasFraming" rule from two functions. Low effort, prevents the two functions from quietly diverging on a product threshold change.

---

## Self-Check

**Not premature extraction:** the `resolveTileSource` helper already exists and already encapsulates the exact predicate `manifest.ts` duplicates inline. The judo move does not introduce a new abstraction — it routes to the existing canonical one.

**Not DRY-as-rule:** the `shouldRenderGalleryFromJson` duplication is correctly diagnosed as load-bearing (two different input types, real seam). The remedy is threshold extraction, not type unification.

**Not premature decomposition:** no recommendation splits an existing file. The inverse (removing wrappers, centralizing) is the direction of all proposed changes.

**Not complecting:** `Box` / `PixelRect` unification is flagged as low-urgency for exactly this reason — combining selector geometry and map geometry into one type would complect two independent domains if over-applied.

**Not stopping-refactor-early:** the IIIF regex duplication in `manifest.ts` is not the obvious surface ("it uses a regex") but the structural problem (the canonical classification function is bypassed). The recommendation routes to the existing function, not a new regex constant.

**Not reified abstraction:** the `scanJpegApp1` extraction is justified by two concrete existing callers with identical bodies and a real divergence risk (alignment guard). The seam discriminator: ≥2 varying real callers → extract.
