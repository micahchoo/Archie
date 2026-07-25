# HANDOFF — perf sweeps (2026-07-24)

Branch **`perf/spine-and-image-pipeline`** (off `main` @ `f0cacbf`). All work committed; tree clean
except unrelated pre-existing artifacts (`.hm` files, `Prior Art/`, `ledgers/UX-AUDIT-viewer-*.md`,
`.seeds/issues.jsonl`, `.claude/.skill-invocation-log`) which are NOT mine — do not sweep them in.

> **Concurrent workstream, same repo.** The Viewer UX audit's implementation wave has its own
> handoff at `ledgers/HANDOFF-viewer-ux-2026-07-25.md` — viewer e2e gate, the canvas-selection
> decision, the embed pointer fix. This file remains the perf/read-only-mount handoff. Neither
> supersedes the other; check both before picking up work.

## Where things stand

Started from "I am looking for 10x perf runtime gains", target chosen by measurement. Three sweeps,
each with its own ledger:

- `ledgers/PERF-image-pipeline-2026-07-24.md` (+ ADDENDUM) — DZI tiling, ingest bake
- `ledgers/PERF-annotation-spine-2026-07-24.md` — the editing spine, zip serialize, Open-path probe
- `ledgers/PERF-reader-2026-07-24.md` — the viewer's reader path

**Measured end-to-end** (not primitives): publish tiling 1.9–4.7x · Save (`toZip`) 9.0x · per-edit
130x · bulk create 10.4x · reader arrival JS 7.8x.

## Gates (all green as of the last commit)

render-core **1143/1143** · studio **925/925** · viewer **136/136** · svelte-check 0/0 both apps ·
`pnpm typecheck` clean everywhere · `pnpm build` clean · `worker-smoke.mjs` both workers boot ·
`archie-viewer build.mjs --check` within budget · `readerrun.mjs --check` within budget.

Run tests PER APP (`pnpm exec vitest` inside the package) — the root binary fails rune tests.
Typecheck is `node ../../node_modules/typescript-native/bin/tsc --noEmit` (TS7); never bare `tsc`.

## Perf harnesses (scripts/perf/)

| script | what |
|---|---|
| `run.mjs` + `bench.ts` | tile encode variants, byte-compared against the serial baseline |
| `fsrun.mjs` + `fsbench.ts` | publish WRITE path over real OPFS / zip-stream / memory |
| `publishrun.mjs` + `publishbench.ts` | END-TO-END publish; the one that found the pool bug |
| `readerrun.mjs` (+ `--check`) | built-viewer reader path; **ratchet** vs `reader-budget.json` |
| `worker-smoke.mjs` | the built workers actually boot (they fall back SILENTLY otherwise) |

## Read-only mount — SPIKED, and it is a project (do not start it casually)

`ReadOnlyMountSurface` exposes **6** methods (`setAnnotations`, `setSelected`, `fitBounds`,
`fitRegion`, `onSelect`, `destroy`). `Canvas.svelte` calls **18**, and the viewer genuinely needs
~12 — missing are `setStyle` (per-reading marker styling), `setFrame` (whole-object frames),
`setNavigatorDots`, `getZoomRatio` + `onViewportChange` (the zoom cue/band), and
`markerScreenRect`/`markerScreenRects` (the floating note card's positioning). Porting those onto the
DOM-SVG overlay is the work; the bundling is the easy half. Some groundwork exists (`read-mount.ts`
already imports `createFrameOverlay`; `marker-dots.ts` exists).

The prize is unchanged and still worth it eventually:

**The read-only viewer ships the editing annotation stack.** `packages/render-svelte/Canvas.svelte`
calls `createMount` (`mount.ts` → `@annotorious/openseadragon` → PixiJS). `read-mount.ts`
(`createReadOnlyMount`) exists for exactly this case and its header states pixi is ABSENT from its
graph — it is what the `<archie-viewer>` embed uses.

Measured with esbuild, same aliases, minified+gz:

    createMount          932 KB raw / 268 KB gz
    createReadOnlyMount  284 KB raw /  70 KB gz     -> 3.8x, ~198 KB gz saved on object open

`Canvas.svelte` is shared with STUDIO, which genuinely edits, so it cannot simply switch: either a
read-only canvas component for the viewer, or Canvas picks its mount behind a dynamic `import()` on a
`readOnly` prop (cleaner — `createMount` is already called inside `onMount`).

## Other open items

- **Concurrent `addFiles` — 3.8x on a 70-file import** (20.05 s → 5.60 s), measured, using the worker
  pool that already ships. Blocked by three real things (terminal storage-refusal `break` assumes
  sequential order; `run.tick` reports a sequential index; `AppendBatch` appends in file order, so
  concurrency reorders objects in the exhibit) and capped at ~x4 — x6 crashed under memory pressure.
  See ADDENDUM 2 in the image-pipeline ledger.
- `toZip`'s remaining 635 ms is the largest synchronous main-thread block left (worker or streaming).
- `tileObject`/`tileRemote` still decode on the main thread purely to read dimensions.
- The `/sampler` route still 404s `readings.json` on every load (absent-optional, by design, but a
  wasted round trip), and `/` 404s a screenshots PNG — a content bug, not perf.

## Hard-won lessons now encoded in `.claude/rules/perf-measure-the-flow.md`

1. A primitive benchmark here is not evidence about a flow. Tiling measured 19–37x per image and is
   1.9x end-to-end, because the caller was already concurrent.
2. Worker pools must be process-wide. Per-call pools + `publishLibrary`'s uncapped fan-out = ~336
   workers, every pool dying, all 70 objects silently falling back, publish looking healthy.
3. Inject the bug before trusting a test. The first HeadIndex equivalence suite passed with THREE
   deliberate bugs; the first perf gate passed with a reverted whole-log scan; the first reader
   ratchet passed a broken page. Every gate here has been verified by injection.
