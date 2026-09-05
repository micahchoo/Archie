# ACCEPTWIRE — the acceptance harness gets a machine path (Archie-e266)

**Run:** 2026-08-30 · shared checkout `main` worktree · machine 32 cores / 122 GB RAM.
Capped end-to-end run at **n=24 masters / 2 exhibits** under `/tmp/archie-accept-e266/` (not committed).
Every `scripts/accept/*.mjs` was classified by READING it and RUNNING it locally at least once.

**The headline: the harness had silently rotted.** No workflow ran any of it since Archie-c74e
(2026-07-27), and two post-c74e commits broke it in the meantime — the first capped rerun of this
ticket failed twice before a single image was ingested (findings 1–2 below). This ticket fixes both
breaks and wires the hermetic subset behind `.github/workflows/accept-harness.yml`
(`workflow_dispatch` only, like `scale-check.yml`), so the next drift is a red run, not a surprise.

## Classification — script | hermetic? | local run | workflow disposition | commit | rerun result

| script | hermetic? | local run | workflow disposition | commit | rerun result |
| --- | --- | --- | --- | --- | --- |
| gen-corpus.mjs | **NO** — network: downloads the six real masters (Yale IIIF / LOC / Wikimedia) into `/tmp/archie-masters`, then offline; needs Chromium + vite + sink | PASS at n=24 (2 masters downloaded this run; 25 files, 0.22 GB, 3.5 s) | **wired** — "Generate corpus (capped)", corpus size floored at 20 / capped at 48 by a guard step; masters cached (`actions/cache`, key `archie-accept-masters-v1`) | Archie-e266 | PASS (same invocation) |
| ingest.mjs | YES given a corpus — offline (loopback sinks + vite + Chromium; imports studio's real bake/tiff/folder-import modules) | first run at n=6 **FAILED** (`ingest.ts:208` annotates `NOTE_OBJECTS=20` unconditionally → undefined index, finding 1); PASS at n=24 | **wired** — "Ingest into a real folder working store" | Archie-e266 | PASS — 24/24 objects, 0 refusals, 0 worker fallbacks, 11 s, peak RSS 1.51 GB |
| publish.mjs | YES given corpus + a built `archie-viewer` dist (refuses without one, by design) | first run **FAILED** (shim lacked `TauriFilesystem` — finding 2); PASS after the harness fix | **wired** — "Publish both tiers (fixity on, folder sink, memory control)" preceded by a viewer build step | Archie-e266 | PASS — archival 5,659 files / 122 MB / 6.1 s; web 150 files / 15 MB / 1.6 s; peak RSS 2.99 GB |
| drive.mjs | YES given a published tree — bare static server + Chromium; **requires `--rewrite-origin`** (finding 4) | web **6/6 PASS** (`--walk 4 --rounds 10 --expect-tiles false`); archival **6/6 PASS** (`--walk 4 --rounds 15`, 16 tiles served 2xx); earlier runs' FAILs were missing `--rewrite-origin` + under-rounding, not product (finding 3) | **wired** — both tiers as separate steps, with the verified flag sets | Archie-e266 | PASS (both invocations re-run green) |
| reconcile.mjs | YES — reads the run's own summaries, computes expectations through render-core's real `dziPyramid` | PASS — tile arithmetic exact (analytic 5,509 = measured 5,509); web image bytes +1.5% vs the 0.1476 B/px model | **wired** — "Reconcile estimate vs measured" | Archie-e266 | PASS |
| check-selectors.mjs | YES — pure fs over the web tree + working store | PASS 12/12 examined, 10 of 12 actually rescaled by the web tier (sx 0.44–0.48 band) | **wired** — "Selector rescale holds across the library" (`--n 12`) | Archie-e266 | PASS |
| github-fit.mjs | YES — vite-node over render-core's real `planPush`/`gitBlobSha`; no network | PASS — all four FITS on the web tree (150 files, 0.015 GB, largest 0.8 MiB); republish delta 0 uploads / 150 sha references | **wired** — "GitHub Pages fit" (web tree, + identical-tree delta row) | Archie-e266 | PASS |
| sink.mjs | YES — loopback HTTP folder sink, library (no CLI) | direct protocol smoke PASS: PUT→GET roundtrip 200, `/ls`, `/stats` {writes:1, bytes:10}, `walkTree` agrees | **wired (transitive)** — executes inside every gen-corpus/ingest/publish step | Archie-e266 | PASS (transitive) |
| harness.mjs | YES — vite boot + Chromium + 1 Hz OS-RSS sampler over the browser process tree, library (no CLI) | PASS — `runPage` executed in every ingest/publish/drive run this ticket (RSS timelines in the summaries) | **wired (transitive)** — same steps | Archie-e266 | PASS (transitive) |
| probe-dom.mjs | YES given a published tree | PASS — 3 region overlays by t+300 ms on the drive's own subject (`225669AA…`), `.rc-overview` returns to the grid | **not wired** — a debug probe for the drive's region search, not an assertion; its evidence (overlays appear, overview returns) is subsumed by the drive's region + real-click rows. Manual invocation: `node scripts/accept/probe-dom.mjs --dir <web tree> --slug series-01 --port 4578` | Archie-e266 | PASS |

Not one of the ten: `scripts/accept/update-ticket.mjs` — the `sd` dispatcher's own read-modify-write
tool, not harness code; untouched, undispositioned here.

## The workflow

`.github/workflows/accept-harness.yml` — manual dispatch, two inputs (`objects` default 24, floor 20
/ cap 48 enforced by a guard step; `exhibits` default 2), `timeout-minutes: 30`, concurrency-grouped,
summary artifacts uploaded `if: always()`. Steps run the pipeline end to end: corpus (capped) →
ingest → publish (both tiers) → drive (both tiers) → check-selectors → reconcile → github-fit.

**Validation and local execution:**

- `actionlint` 1.7.7 (fetched release binary): **clean**, zero findings.
- Every step's command was executed locally once, in the workflow's order, this session: the six
  pipeline steps above (results in the table), plus `pnpm --filter @render/archie-viewer
  bundle:check` as the local proof of the workflow's viewer-build step (temp-dir build, +1.1 KB gz
  eager / +6.4 KB total, inside both ratchets). The checkout/install/Playwright steps have local
  equivalents already in place (node_modules via pnpm 11.6.0, Playwright Chromium 1217–1234 cached)
  and are exercised as-is by every other browser-driven job in this repo.
- **First green remote dispatch: PENDING.** Why: (a) the available GitHub tool exposes no
  `workflow_dispatch` operation (repo_view/file_read/pr_*/search_*/run_watch only), and (b) a
  dispatch must name a ref that already CARRIES this workflow file — triggering "on current HEAD"
  is impossible until the commit lands on the remote, and pushing to the live repo needs explicit
  go-ahead (HANDOFF.md finding 8: the `.nojekyll` counterfactual push was permission-refused). Once
  merged, `gh workflow run accept-harness.yml` (or the Actions UI) is the whole invocation.

## Harness repairs carried by this commit

Both are consequences of finding 2; both keep the shim's one rule — real shipped modules, only
module-evaluation scope changed.

1. `scripts/accept/harness.mjs` — the vite alias now covers the `@render/core/worker` subpath
   (→ `packages/render-core/src/worker.ts`), which Archie-ea14 moved the bake worker onto. The old
   single-entry alias either missed the subpath or collapsed it onto the barrel shim.
2. `scripts/accept/render-core-shim.ts` — added `TauriFilesystem` (fs/tauri.ts) and
   `ZipStreamFilesystem` (fs/zip-stream.ts). The publish page graph grew a video-transcode leg
   (`video-transcode.ts` → `tauri-fs.ts`) that value-imports both from the barrel; both source
   modules are pure/headless.

## Open findings

1. **`ingest.ts:208` crashes below 20 objects** — `for (let k = 0; k < NOTE_OBJECTS; k++)` with
   `NOTE_OBJECTS = 20` and `stride = max(1, floor(flat.length / 20))` indexes `flat[6..19]` =
   undefined at n=6 (`TypeError: Cannot read properties of undefined (reading 'slug')` at the
   `canvasId` line, after all bytes landed). A harness-scale bug, not a product one. NOT fixed here
   (`ingest.ts` is outside this ticket's named files); the workflow's floor-20 guard documents and
   enforces the constraint instead. Whoever owns the harness should clamp the loop to
   `min(NOTE_OBJECTS, flat.length)`.
2. **The harness rotted silently for 34 days** — `git log` dates the breaks: 91c71f7 (Archie-ea14,
   worker subpath) and the video-transcode→tauri-fs import chain. Nothing could notice because no
   workflow referenced any accept script (this ticket's premise). The dispatch workflow is the fix
   for the class; the first red run it produces will be cheap instead of a surprise.
3. **The retention slope bar is under-powered at capped scale** — the bar (marginal MB/object,
   second half ≤ 0.40 × first half) only means something once the walk's revisits dominate. At n=24
   (12 objects/exhibit): web passed at 40 opens (ratio 0.25, plateau 1.33 GB); archival needed 60
   (plateau 1.39→1.40 GB over its last three rounds). The wired round counts (10 and 15) are the
   verified-green values; the full-scale authority remains ACCEPT-thousand-images-2026-07-27
   (ratio 0.14 over 50 opens at 1,000 objects).
4. **`GET series-01/readings.json` → 404 in BOTH published trees** during every drive. The ingest
   harness authors no readings, so the viewer requests a file the tree legitimately does not carry.
   Either the request should tolerate absence (the drive treats it as non-fatal today — RESULT still
   6/6) or the site writer should emit an empty readings.json. Observed, cause [INFERENCE]; needs an
   owner to decide which side is the contract.
