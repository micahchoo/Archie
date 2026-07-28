# ACCEPT — 1,000 images end to end (Archie-c74e)

**Run:** 2026-07-27 · branch `accept/thousand-images` (isolated worktree, base `10c82ab`) · harness
`scripts/accept/` (committed) · artifacts under `/mnt/Ghar/archie-accept-c74e/` (not committed —
14 GB) · machine 32 cores / 122 GB RAM / md0 spinning array.

**The pipeline survives 1,000 images.** Nothing refused, nothing fell back, nothing was lost, and
both published trees verify byte-for-byte. **The web tier fits GitHub Pages** at 0.631 GB of 1 GB and
3,150 files, and a republish after an edit costs **5 uploads**. The archival tier does not fit, by
three independent limits at once, and the reason is the DZI file-count tax nobody disputes.

Two things broke, both found by measurement rather than by a gate: a **16.9 GB memory peak** in the
web tier's publish, and a **`getViewerBundle` + `fixity` type crash** that lands after the whole tree
is on disk.

---

## The numbers

### Corpus (step 1)

| | |
| --- | --- |
| masters | **1,000** — 857 JPEG q0.92 + **143 uncompressed baseline TIFF** |
| source bytes | **8.52 GB** (0.613 B/px overall; JPEG 0.220, TIFF 3.000) |
| pixels | **13.91 Gpx**, longer edge 2000–6000 px |
| above `TILE_MIN_EDGE` (4096) | **524** — deliberately straddling the threshold |
| dimension mix | 285 at 5300–6000 · 239 at 4096–5300 · 251 at 2900–4096 · 225 at 2000–2900 |
| build time | 115 s |

**Why derived from real masters.** Each output is a distinct crop-and-rescale of one of the **six real
digitization masters** `scripts/perf/webptierrun.mjs` caches (parchment folio, wide foldout, B&W film
scan, oil painting, letterpress page, herbarium sheet). `PROBE-tiling-threshold-2026-07-27.md` had to
caveat every byte figure it reported because its masters were `fillRect` noise; `PROTO-folder-probe`
closed that caveat with these six and pinned 0.1476 B/px against them. Building the corpus from the
same six is what makes this run's byte totals comparable to the estimate they reconcile against.

**Why 15% TIFF, and the scale factor.** 1,000 images at 2000–6000 px, encoded as JPEG, is under 3 GB —
so a pure-JPEG corpus cannot reach Archie-34a2's own 10–30 GB ballpark without changing the two things
this ticket pins (the count and the dimensions). That figure is a statement about **uncompressed
digitization masters**, and `PROTO-folder-probe`'s independently measured 7.7–15× raw-RGB-over-WebP
ratio says the same thing from the other side. The TIFF slice makes the byte total honest **and**
exercises `tiff-transcode.ts` — the UTIF path that exists because 375 real files died in
`createImageBitmap` on a real museum import — at a scale nobody had driven.

**Scale factor: 8.52 GB against the map's 10–30 GB — 0.85× the low end, 0.28× the high.** The pixel
population is the thing that drives every downstream number, and it is at full scale. Pushing the
bytes to 30 GB means an all-TIFF corpus (≈41 GB at 3 B/px), which would have measured UTIF's decode
rate rather than the pipeline. Stated as a limit, not hidden.

### Ingest (step 2) — 1,000 files, serial, real browser

| | |
| --- | --- |
| objects created | **1,000 / 1,000 · 0 refusals** |
| wall clock | **361 s** (6 min) · 2.77 files/s |
| phases (serial ⇒ these sum to the clock) | read 32 s · **decode+bake 260 s** · thumb 61 s · write 6 s |
| per file | p50 **122 ms** · p90 821 ms · p99 **6,392 ms** · max 8,026 ms |
| TIFF transcodes | **143**, all successful |
| worker-pool fallbacks | **0** (`bakeFallbackCount()`) |
| derivatives written | masters 2.97 GB · thumbnails 0.082 GB · 2,003 files |
| peak RSS (whole browser process tree) | **2.03 GB**, oscillating 1.2–1.8 GB with no trend |
| `library.json` | **241,086 bytes** for 1,000 objects |

The p50/p99 spread is the whole ingest story: a JPEG under the cap is ~120 ms, a TIFF is ~6.4 s. UTIF
is pure JS and it is 72% of the decode phase for 14% of the files.

**`library.json` at 1,000 objects: 241 KB.** Decision 5 predicted the monolithic file is fine and
**this run agrees** — `store.ts:182` reads it whole and `:217` writes it whole, and a 241 KB
`JSON.stringify` + write is not a hazard at any plausible save cadence. Refuted only in the limit:
this scales linearly, so 10,000 objects is ~2.4 MB per save.

### Publish (step 4) — both tiers, folder sink, fixity ON

| | archival | web |
| --- | --- | --- |
| wall clock (through the folder sink) | **322 s** | **59 s** |
| files written | **246,650** | **3,150** |
| bytes | **5.489 GB** | **0.631 GB** |
| fixity entries | 246,648 | 3,148 |
| objects rescaled | 0 | **902** of 1,000 |
| unscaled selectors / tier fallbacks | 0 / 0 | **0 / 0** |
| brokenLinks · incompleteCanvases · missingAssets | 0 · 0 · 0 | 0 · 0 · 0 |
| largest single file | 7.3 MB master (`manifest-sha256.txt` is 31.9 MB) | 1.1 MB master |

**Transport, attributed by DIFFERENCE** rather than guessed (`.claude/rules/perf-measure-the-flow.md`):
the same 50-object archival publish into an in-page `MemoryFilesystem` took **6.9 s** and into the
folder sink **15.7 s** — the loopback transport is **56%** of the folder-sink wall clock. So the
publish's own compute is ≈142 s (archival) and ≈26 s (web); the figures in the table are what a
folder sink actually costs, which is the number a user experiences.

### Verify (step 5)

```
$ node scripts/verify-publish.mjs /mnt/Ghar/archie-accept-c74e/pub-web
PASS  fixity: every listed file re-hashes to its manifest checksum — 3148/3148 verified, 0 bad
67/67 checks passed

$ node scripts/verify-publish.mjs /mnt/Ghar/archie-accept-c74e/pub-archival
PASS  fixity: every listed file re-hashes to its manifest checksum — 246648/246648 verified, 0 bad
67/67 checks passed
```

**246,648 SHA-256 re-hashes, zero bad.** The fixity manifest is correct at scale.

### Drive (step 5) — a real browser against a bare static host

```
$ node scripts/accept/drive.mjs --dir …/pub-web --slug series-01 --walk 10 --rounds 5 --expect-tiles false
PASS  gallery renders at library scale — 20 exhibit card(s) in 36 ms (cold)
PASS  an exhibit's object grid renders — 50 object(s) in 26 ms
PASS  an object opens onto a deep-zoom canvas — painted in 107 ms
PASS  a real mouse click on an annotation region opens its note WITH ITS BODY — hit-test at region
      centre = rect.; ".archie-note-card" x1 carrying 69 chars of body
PASS  retention … BOUNDED — r1=1.01GB@10 … r5=1.54GB@50 · 23.4 MB/object first half vs 3.2 second
      (ratio 0.14, bar ≤0.40)
PASS  this tier serves NO tiles, as its cap requires — subject 5050x2841 — 0 tile(s) served
RESULT: PASS  (6/6)

$ node scripts/accept/drive.mjs --dir …/pub-archival --slug series-01 --walk 10 --rounds 5
PASS  deep zoom is TILED on an object above the threshold — subject 5050x2841 — 16 tile(s) served
      2xx, e.g. …_files/11/2_1.jpg
RESULT: PASS  (6/6)
```

Cold-open times at 1,000 objects are **36–79 ms to the first gallery card, 26–44 ms to a 50-object
grid, 107–123 ms to a painted deep-zoom canvas** — from a bare static server with no SPA rewrite. The
gallery is not the scale problem anyone feared.

### Selector rescale at scale (step 4)

```
$ node scripts/accept/check-selectors.mjs --web …/pub-web --work …/work --n 20
subject: 20 object(s) examined of 20 annotated · 18 of them were actually RESCALED by the web tier
RESULT: PASS  (20/20)
```

Twenty randomly sampled annotated objects, reconciled **three ways** — the authored selector from the
working store, the served canvas dimensions from the published manifest, and the published selector
from the heads page — with a 1.5 px tolerance for `fitWithin`'s independent per-axis rounding.
Archie-4b0a's fix holds across 902 rescaled objects at factors from 0.41 to 1.00.

---

## Estimate vs measured

| what | estimate | measured | delta |
| --- | --- | --- | --- |
| **archival: DZI tile files** | **243,500** | **243,500** | **0.0%** |
| archival: total file count | 247,091 | 246,650 | −0.2% |
| web tier: image bytes | 0.599 GB | 0.627 GB | +4.7% |
| web tier: whole tree | 0.599 GB | 0.631 GB | +5.3% |
| web tier: file count | 3,067 | 3,150 | +2.7% |

**The tile arithmetic is exact.** `dziPyramid` over the 1,000 ingested dimensions predicts 243,500 tile
files and the tree carries 243,500. `PROBE-tiling-threshold` claimed the analytic figure matched the
real slicer at every dimension it swept; it matches over a whole library too.

**The web-tier byte model is 4.7% low, and honestly so.** 0.1476 B/px was pooled over 6 masters × 3
dimensions at q0.80; the per-object range it reported was 4.7× wide (0.050–0.235). A 4.7% error over
1,000 objects is the model working exactly as `PROTO-folder-probe` said it would ("the bpp range is
the honest uncertainty on any single-object estimate; it narrows fast over a library").

**The file-count model is 2.7% low for a knowable reason**: 7 fixed + 3/exhibit + 3/object predates
both the bundled viewer (Archie-e09d: `_viewer/` ×10, `viewer.html`, `.nojekyll`) and the fixity
manifest (Archie-039e). The probe's ledger flags the viewer as a known omission; the fixity manifest
is a second one. Adding 13 fixed files closes it to +2.3%; the residue is the per-canvas heads pages
for annotated objects, which the 3/object term does not carry.

**The map's 592,000 vs this run's 243,500.** Both are right. 592 tiles is the analytic figure for a
6000×4500 master and this run reproduces it exactly; the map multiplied it by 1,000 because it assumed
every image sits at the cap. A realistic 2000–6000 px folder has **524 tileable objects at a mean of
465 tiles**, because 476 images never cross the threshold at all and the ones that do are mostly not
at 6000 px. **The map's figure is the right order of magnitude and 2.4× pessimistic for a mixed
folder** — which does not change its conclusion, since 243,500 files refuses GitHub just as firmly.

---

## The GitHub-fit verdict

### Web tier — **FITS, comfortably**

| check | verdict | measured |
| --- | --- | --- |
| published site ≤ 1 GB | **FITS** | **0.631 GB — 63% used, 0.369 GB spare** |
| repo ≤ 1 GB ideal | **FITS** | 0.631 GB |
| no file above the 100 MiB block | **FITS** | 0 over 100 MiB, 0 over the 50 MiB warning; largest 1.1 MiB |
| file count vs the ~4,800 practical ceiling | **FITS** | **3,150 files — a first publish is ~39 min at ~80 writes/min** |
| Pages build ≤ 10 min | note | that cap is on GitHub's build of a pushed tree, not the upload |

### Republish is nearly free, and the probe's ledger is out of date on this

`PROTO-folder-probe` records "`ghpages.ts:202` uses no `base_tree`, so every republish re-uploads every
blob at ~80 content-writes/min. 4,800 files is an hour of uploading, which is a refusal in practice."
**Archie-53e3 has since landed the incremental push**, and `ghpages.ts`'s own header now states the
tree is still emitted complete but "an unchanged file contributes a `sha` reference to a blob GitHub
already stores rather than its bytes, so a republish costs one blob POST per CHANGED asset."

Measured through render-core's real `planPush` + `gitBlobSha` over two real trees:

| republish | toUpload | toReference | minutes at ~80/min |
| --- | --- | --- | --- |
| identical tree (no edit) | **0** | 3,150 | 0 |
| **after editing ONE note body** | **5** | 3,145 | **~4 seconds** |

The five: `manifest-sha256.txt`, `series-01/annotations/history/<id>.json`,
`series-01/canvas/<obj>/annotations.json`, `series-01/index.html`, `series-01/manifest.json`. Exactly
the files a one-note edit should touch, and nothing else — which also proves the tree is **byte-stable**
across republish (the 0-upload row), the property the fixed `publishedAt` is there to give.

**So the real GitHub story at 1,000 images is: ~39 minutes once, then seconds forever.** The 4,800-file
practical ceiling is a first-publish constraint, and the incremental push means it is not a recurring
one. That is a materially better answer than the map assumed.

*Caveat, stated because the delta is 0 in one row:* an identical-tree delta proves byte-stability and
proves **nothing** about the push's ability to notice a change — that is what the one-note-edit row is
for, and it is why both were run.

### Archival tier — **NO, three ways at once**

| check | verdict | measured |
| --- | --- | --- |
| published site ≤ 1 GB | **NO** | **5.489 GB — 549% of the limit** |
| repo ≤ 1 GB ideal / 5 GB recommended | **NO** | 5.489 GB, past both |
| file count vs the ~4,800 ceiling | **NO** | **246,650 files — a first publish is 3,083 min (51 hours)** |
| no file above 100 MiB | fits | largest is the 31.9 MB fixity manifest |

51 hours of uploading is the binding refusal, and it is the DZI file-count tax rather than fidelity:
243,500 of those 246,650 files are tiles. This is precisely the trade `archive-probe.ts`'s file-blow-up
rule already refuses (its 10× ceiling; here the ratio is **78×**), and precisely what Archie-53e3's
recommendation — deriving the local tiling threshold from `MAX_MASTER_DIM` — would make inert.

---

## What broke

### 1. Peak memory 16.9 GB, and it is the WEB tier, not archival

| phase | peak RSS (whole browser process tree) |
| --- | --- |
| ingest, 1,000 files | 2.03 GB |
| publish, archival (t=0–322 s) | 3.0–6.3 GB |
| **publish, web (t=322–381 s)** | **16.89 GB, peaking at t=349 s** |

The sampled timeline is unambiguous: `…{"t":305,"gb":4.43},{"t":321,"gb":4.25},{"t":337,"gb":14.97},
{"t":353,"gb":14.69},{"t":369,"gb":14.69},{"t":385,"gb":4.46}…` — the spike opens and closes inside
the web tier's window and nothing else runs there.

**The mechanism, read from the source rather than inferred from the shape.** `publishLibrary` fans out
`mapLimit(exhibits, 6)` over an **uncapped `Promise.all` per exhibit**. This library is 20 exhibits ×
50 objects, so up to **300 objects are in flight at once**. At the archival tier each one is a byte
copy. At the web tier each one runs `getAsset` → `applyTier` → `bakeDisplayMasterAsync`, which
**decodes a 6000 px master to a full RGBA surface**: ~100 MB each, 300 concurrently.

This is the shape `.claude/rules/perf-measure-the-flow.md` §2 already names — "a per-call worker pool
will destroy itself at library scale, silently" — with the concurrency living in `publishLibrary`'s
own fan-out rather than in the pool. The pool behaved: `bakeFallbackCount()` and `tierFallbackCount()`
were both **0**, so nothing degraded. It simply asked for 16.9 GB and this machine had it.

**Why it matters, and it is the run's most important finding.** Archie's target is a small institution
on a laptop. A 16 GB machine has perhaps 8–10 GB of headroom; an 8 GB machine has ~4. A web-tier
publish of 1,000 images would put the tab into swap or kill it outright, and it would do so **after
several minutes of apparently-healthy work**. Note also which way round this is: the web tier is the
*cheap* one on every other axis — 59 s against 322 s, 3,150 files against 246,650, 0.631 GB against
5.489 — and it is the one that cannot run on a small machine.

**Not fixed here.** This ticket says measure, and a concurrency cap inside `publishLibrary` is a change
to the publish engine's fan-out with its own throughput trade-off. It graduates as a ticket. Untested
here: whether the peak scales with objects-per-exhibit (the `Promise.all` width) or with the
`mapLimit(6)` — 20×50 cannot separate them, and a 6×300 library would.

### 2. `getViewerBundle` + `fixity: true` throws after the whole tree is written

Hit on the first real publish attempt:

```
TypeError: data.arrayBuffer is not a function
  at Object.write (packages/render-core/src/fs/hashing.ts:102)
  at writeTreeViewer (packages/render-core/src/publish/site.ts:87)
  at publishLibrary (packages/render-core/src/publish/site.ts:382)
```

`ViewerBundleFiles` is `ReadonlyMap<string, string | ArrayBuffer | Blob>` (`site.ts:215`) and the
harness handed it a `Uint8Array`. **That is the harness's bug, not the product's** — but the failure
mode is worth recording, because a `Uint8Array` is the obvious thing to reach for and every fs backend
accepts one. `HashingFilesystem` (`fs/hashing.ts:170-173`) normalises exactly those three types and
calls `.arrayBuffer()` on anything else, so:

- with `fixity: false` a `Uint8Array` works everywhere;
- with `fixity: true` it throws — **at `writeTreeViewer`, the last write of the publish**, after the
  entire tree is already on disk.

A caller gets a failed publish over a complete tree, and only when fixity is on. Widening
`HashingFilesystem`'s normalisation to `ArrayBufferView` would cost one line and remove the trap; not
done here (out of this ticket's lane), recorded for whoever owns that seam.

### 3. `scripts/drive-published-tree.mjs` scores a FALSE FAIL on tiling, on both trees

It reports `deep zoom is TILED … ZERO tiles served` against the archival tree, which carries **243,500
tiles**. The assertion is fine; its **subject** is not. The drive opens grid object #0, which here is a
3312 px plate — below `TILE_MIN_EDGE(4096)`, so no pyramid exists for it and no tile can be served.

This is `.claude/rules/post-review-fixes-are-unreviewed.md` 1a exactly: a confident verdict over a
subject incapable of producing the thing being looked for. `scripts/accept/drive.mjs` fixes it by
reading `library.json`, picking an object whose **own** dimensions clear the threshold, and printing
those dimensions beside the count — so a reader can tell "tiling is broken" from "this tier does not
tile", which are different findings and only one is a defect. With a tileable subject the archival tree
serves 16 tiles for that object and 333 across the drive.

On the web tier zero tiles is **correct**: the tier caps a master at 2400 px, below the threshold, so
no pyramid is ever written. `PROBE-tiling-threshold` already concluded "on the web tier, no plausible
threshold ever fires" — this run confirms it end to end. The drive takes `--expect-tiles false` so
that correct behaviour is asserted rather than merely absent.

---

## Red-green — what these instruments can actually catch

Every new assertion was made to fail before being trusted. The harness was **committed first**, and
the one source injection was restored from a `/tmp` copy (`.claude/rules/drive-must-not-recreate-the-thing-under-test.md`).

| injection | result |
| --- | --- |
| `scaleSelectors: () => null` — Archie-4b0a's actual defect, republished | `check-selectors` **2/20**, and the 2 passes are exactly the 2 objects that were never rescaled |
| region geometry `pointer-events: all` → `none` in the shipped `_viewer/` chunk | drive **FAIL**, `hit-test at region centre = DIV` — the diagnostic signature from `[[osd-overlay-wrapper]]` |
| walk with `--rounds 1` | retention verdict **refused as INCONCLUSIVE** rather than granted on a flat line |
| `neutraliseOverlayWrapper` forced to `pointer-events: auto` | **stayed green** — see below |

**The last row is a finding about the assertion's scope, not a failure of the injection.** It reached
the right function (`function zn(t){…e.style.pointerEvents="auto"}` is verbatim in the served chunk)
and had no effect, because these objects have no *overlapping* wrapper — `[[osd-overlay-wrapper]]`'s
scenario is a neighbour's wrapper or the whole-object frame shielding a region, and this fixture draws
neither. The hit-test still returned `rect.`. So the click assertion covers the geometry seam and does
**not** cover wrapper shielding; that stays `recipes/smoke.mjs`'s job.

**The `pointer-events: none` injection also caught a real weakness in my own assertion.** With the hit
seam cut, a note card still opened — carrying nothing but its two chrome glyphs, `"⤢×"` — and the
original assertion ("a `.archie-note-card` node appeared") **passed**. It now requires ≥20 characters
of body. A gate proves the code compiled, never that the output carries anything; this one was
asserting presence and calling it content.

**A green run is one sample.** The retention series was measured four times across two trees and
reproduces: ratios 0.14 / 0.22 / 0.22 / 0.27, series within ±0.06 GB per round. The click assertion
passed on four independent runs and failed on the one injected tree.

---

## The absorbed Archie-b9c4 verdict: **bounded — no byte-budgeted LRU is needed**

The question was whether studio/viewer's in-memory caches need byte-budgeted LRUs on freecut's
precedent (128 MB waveform / 200 MB gif). Measured, on the instrument that can actually see decoded
surfaces and GPU memory — **OS RSS summed over the whole browser process tree**, not
`Runtime.getHeapUsage`, which the ticket itself disqualifies in advance.

**The experiment had to be fixed before it meant anything.** The first walk re-opened the *same*
twelve objects each round and produced a beautifully flat line — which cannot distinguish a bounded
cache from one that never evicts, because with a constant working set both plateau. Retention is a
question about how memory scales with **distinct** objects, so each round now walks a fresh window.

Fifty distinct objects, five rounds of ten, web tier:

| after | 10 | 20 | 30 | 40 | 50 objects |
| --- | --- | --- | --- | --- | --- |
| RSS | 1.01 GB | 1.28 | 1.48 | 1.51 | **1.54 GB** |

Marginal cost: **23.4 MB per object over the first half, 3.2 MB over the second** — a ratio of 0.14.
A cache that never evicted would pay roughly the same for every fresh object and land near 2.2 GB;
it lands at 1.54 and is still flattening. The archival tree gives 21.3 → 5.8 MB/object (ratio 0.27)
over the same walk, with far heavier tiled masters.

**Verdict: retention is bounded. Nothing here needs a byte-budgeted LRU, and freecut's constants
should not be copied in.** Peak steady-state RSS for a reader browsing 50 objects is ~1.5 GB, which is
a normal browser tab.

**What this does NOT cover**, because a verdict stated without its edges is worth less: one exhibit's
50 objects on one machine at one viewport; no zoom-in (OSD's tile texture cache is barely exercised by
an opening view); no AV objects, so no waveform cache — which is the case freecut's 128 MB constant was
actually about. The bounded verdict is for **image objects on the read path**.

---

## Not proven — the honest list

- **Nobody dragged a 1,000-file folder onto the running Studio.** The bake ladder, the serial loop
  shape, the classification and the byte writes are the shipped ones (`ingest.ts` imports
  `bake-async.ts`, `tiff-transcode.ts`, `folder-import.ts` and transcribes ~60 lines of
  `ingest-flows.ts:445-566`, cited inline). What is untested: the `<input webkitdirectory>` pick,
  `createImportRunTracker`'s progress arbitration across overlapping runs, and whatever a 1,000-object
  `library.json` does to Svelte's re-render. Those are `IngestContext`'s 40+ members of App.svelte's
  reactive scope, unreachable from a bare vite page — the same reason
  `scripts/perf/publishbench.ts:84` transcribes `tileObject`.
- **The progress model the ticket asks about is untested, because it does not exist yet.** Pause,
  cancel, resume and a time estimate were the grilling's decided UI; none is implemented, so there was
  nothing to drive. What this run contributes is the input that model needs: ingest is **2.77 files/s
  with a p50 of 122 ms and a p99 of 6.4 s**, so a naive files-remaining × mean estimate will be wrong
  by 50× on any TIFF run — an estimator here must be byte- or format-weighted, not count-weighted.
- **No death at file #800.** Nothing failed, so the "what happens when it dies" half — no progress
  model, no resume — is still un-exercised. It should be provoked deliberately (a mid-run storage
  refusal), not waited for.
- **No EXIF path.** Canvas-encoded JPEGs carry no orientation tag, so the upright-PNG-master branch and
  its preserved-original write never ran. `assets-original/` is empty in this run and `getOriginal` was
  deliberately not passed.
- **No AV.** No audio, no video, so no `audio-opus` decision, no `no-audio-encoder` fallback count, and
  nothing about the waveform cache.
- **Desktop is not where this ran.** The ticket says run on desktop, over the native folder store. This
  ran in headless Chromium with the folder sink over loopback — structurally `fs/tauri.ts` (a
  browser-side `Filesystem` whose every write crosses IPC to a native process owning the real fs) with
  HTTP for Tauri's IPC. Its cost is measured, not assumed (56% of folder-sink wall clock, by
  difference). What that does **not** cover: `TauriFilesystem`'s temp-then-rename atomicity, its
  `assertSafeName` containment, and Tauri's real IPC throughput at 246,650 writes.
- **Object ids are deterministic here, note ids are not.** The harness mints ULID-shaped ids from the
  file index so a re-run produces the same library and the republish delta measures content rather than
  id churn. `AnnotationSession.createNote` mints with an unseeded `Math.random` suffix (the mechanism
  `[[a-green-run-is-one-sample]]` traced), so heads-page ORDER is not stable — nothing in this run keys
  on note order; `check-selectors` matches on the authored box's identity.
- **The memory instrument over-counts.** RSS summed per process double-counts shared mappings and
  cannot attribute a byte to a cache. It answers "what was the peak" and "does it grow", which is what
  was asked, and not "which cache".
- **`manifest-sha256.txt` is 31.9 MB in the archival tree** and changes on every content change. Not a
  problem at web scale (402 KB) and not investigated further.

---

## Reproducing

```sh
node scripts/accept/gen-corpus.mjs --n 1000                    # 115 s, 8.5 GB
node scripts/accept/ingest.mjs   --n 1000 --exhibits 20        # 361 s
node scripts/accept/publish.mjs  --control 50                  # 322 s + 59 s
node scripts/verify-publish.mjs  /mnt/Ghar/archie-accept-c74e/pub-web
node scripts/verify-publish.mjs  /mnt/Ghar/archie-accept-c74e/pub-archival
node scripts/accept/check-selectors.mjs --web …/pub-web --work …/work --n 20
node scripts/accept/drive.mjs --dir …/pub-web --work …/work --port 4589 \
     --slug series-01 --rewrite-origin https://accept.example/thousand/ \
     --walk 10 --rounds 5 --expect-tiles false
node scripts/accept/github-fit.mjs …/pub-web …/pub-web-republished
node scripts/accept/reconcile.mjs --root /mnt/Ghar/archie-accept-c74e   # via vite-node
```

Every server binds its own port and **fails** if it is taken, rather than reusing one
(`.claude/rules/viewer-e2e-shared-port.md`); every one was stopped at the end of its run.
`--rewrite-origin` is not optional when driving a local copy: a published tree's canvas ids and
`tileSource.filesPath` are absolute at the deploy base, so without it the drive measures whatever
`accept.example` would have served.
