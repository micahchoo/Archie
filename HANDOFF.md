# HANDOFF — perf sweeps (2026-07-24)

Branch **`perf/spine-and-image-pipeline`** (off `main` @ `f0cacbf`). All work committed; tree clean
except unrelated pre-existing artifacts (`.hm` files, `Prior Art/`, `ledgers/UX-AUDIT-viewer-*.md`,
`.seeds/issues.jsonl`, `.claude/.skill-invocation-log`) which are NOT mine — do not sweep them in.

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

## THE NEXT THING (measured, not speculative)

**The read-only viewer ships the editing annotation stack.** `packages/render-svelte/Canvas.svelte`
calls `createMount` (`mount.ts` → `@annotorious/openseadragon` → PixiJS). `read-mount.ts`
(`createReadOnlyMount`) exists for exactly this case and its header states pixi is ABSENT from its
graph — it is what the `<archie-viewer>` embed uses.

Measured with esbuild, same aliases, minified+gz:

    createMount          932 KB raw / 268 KB gz
    createReadOnlyMount  284 KB raw /  70 KB gz     -> 3.8x, ~198 KB gz saved on object open

**The blocker to check first:** `Canvas.svelte` is shared with STUDIO, which genuinely edits, so it
cannot simply switch. Options are (a) a read-only canvas component for the viewer, or (b) Canvas
picks its mount behind a dynamic `import()` on a `readOnly` prop — (b) is cleaner and `createMount`
is already called inside `onMount`. ALSO verify the surface gap: `ReadOnlyMountSurface` may lack
methods Reader uses (ISSUES.md "Direction 5's four missing surface methods") — that gap, not the
bundling, is the real risk.

Other open items, all recorded in the ledgers: `tileObject`/`tileRemote` still decode on the main
thread just to read dimensions; the 22.4 s ingest figure is arithmetic, never a measured 70-file
import; `toZip`'s remaining 635 ms is the largest synchronous main-thread block left.

## Hard-won lessons now encoded in `.claude/rules/perf-measure-the-flow.md`

1. A primitive benchmark here is not evidence about a flow. Tiling measured 19–37x per image and is
   1.9x end-to-end, because the caller was already concurrent.
2. Worker pools must be process-wide. Per-call pools + `publishLibrary`'s uncapped fan-out = ~336
   workers, every pool dying, all 70 objects silently falling back, publish looking healthy.
3. Inject the bug before trusting a test. The first HeadIndex equivalence suite passed with THREE
   deliberate bugs; the first perf gate passed with a reverted whole-log scan; the first reader
   ratchet passed a broken page. Every gate here has been verified by injection.
