# PLAN — Phase 1: Extract `@render/core` + `@render/mount` from anvil

> **STATUS: COMPLETE at logic level (2026-05-25).** P1-1..P1-4 closed; 117 tests green workspace-wide;
> typecheck clean; `@render/svelte` 117 LOC (<500 budget). The fitBounds-on-select LOGIC gate is
> green (new path == anvil-stock oracle). OWED: real-OSD visual equivalence in a browser (human
> verification — P1-4 closed `outcome:partial`). Next: Phase 2 decomposer pass. See `HANDOFF.md`.


Decomposer pass (strong-model writing-plans). Phase 1 is **mostly serial** (core → mount →
svelte), NOT parallel dispatch (strategy §44). Dominant skill: **`characterization-testing`**
— pin anvil's CURRENT behavior as the oracle BEFORE refactoring (strategy §134).

Implements: ADR-0002 (Q-2), spike-0001 (module 1 delamination — the one ~1-week piece).
Precondition VERIFIED: anvil's suite runs here (304 tests green, `../anvil/app`).

## What Phase 0 already did (so Phase 1 is smaller than the spike's full list)
The CLEAN-LIFT pure modules (spike modules 4/5/6: URL↔selector, geometry/selectorBBox, WADM
types) are ALREADY in `@render/core` (P0-8). Phase 1 is therefore dominated by the **one**
NEEDS-DELAMINATION piece: the OSD+Annotorious mount lifecycle (spike module 1).

## Donor grounding (confirmed file:line)
- `anvil/app/src/lib/viewer.ts` — `AnvilViewer` factory (`:13`), `createOSDAnnotator` (`:105`),
  imperative surface `setDrawingTool/setDrawingEnabled/destroy` (`:200-207`), the
  degenerate-guard store-cast (`:124`, warn fallback `:155` — carry verbatim).
- `fitBounds` is on the Annotorious `annotator`, invoked from `.svelte` reactivity:
  `App.svelte:1115`, `EmbeddedReader.svelte:326` (`annotator.fitBounds(id)`) + `:337`
  (`viewport.fitBounds(rect, false)` with sidebar expansion `w/(1-f)`, formula at `:314-337`).
- Polygon→bbox: anvil reads Annotorious `geometry.bounds`; the pure WADM-selector→bbox is
  already `@render/core::selectorBBox` (P0-8) — mount de-dupes onto it.
- NO existing fitBounds test in anvil → the gate spec is WRITTEN as a characterization test.

## The acceptance gate (the spike's gate, not a gesture)
anvil's editor mounted via the new `@render/mount` + `@render/svelte` passes the **same**
fitBounds-on-select behavioral test as anvil-stock. If it doesn't, the delamination isn't done.

## Testing strategy (DOM caveat)
OSD needs a DOM/canvas; full render-tests are out of headless scope (memory: do NOT
lightpanda-verify Svelte UI here — it wedges; use happy-dom mount tests, leave visuals to the
human). So characterize at the SEAM: `fitBounds(id)` computes the region rect (via core
`selectorBBox` + the sidebar-expansion formula) and calls an injected `viewport.fitBounds(rect)`.
Assert the rect with a mock viewport — that is the behavioral oracle both paths must satisfy.
Real OSD render verification is a human/Phase-2 step.

## Leaf tasks (serial; characterize → mount → adapter → gate)

```
TASK P1-1  characterization oracle (the gate spec)        [characterization-testing]
  implements:    ADR-0002, spike-0001 module 1
  donor:         anvil EmbeddedReader.svelte:288-338 (boundsToScreenRect, fitForSidebar)
  write-targets: packages/render-mount/src/fitbounds.ts + fitbounds.test.ts
  change:        pure fitBoundsRect(selector, opts{containerW,sidebarW,sidebarIsSheet,detailOpen})
                 -> viewport rect; encodes anvil's sidebar-expansion (w/(1-f)) + plain-center
                 fallback. Uses core selectorBBox. Test pins anvil's exact behavior (rect+polygon,
                 sidebar-open vs sheet/closed).
  acceptance:    RUN `pnpm --filter @render/mount test fitbounds` → MUST pass (the oracle).

TASK P1-2  @render/mount OSD+Annotorious wiring             [executing-plans]
  implements:    ADR-0002 (Q-2), spike-0001 module 1+2
  donor:         anvil viewer.ts:90-210 (createViewer factory)
  write-targets: packages/render-mount/{package.json(+deps), src/mount.ts, src/mount.test.ts}
  change:        createMount(container, {source, onSelect}) -> MountSurface. Wire OSD viewer +
                 createOSDAnnotator + stock W3CImageFormat + plugin-tools; fitBounds(id) uses
                 fitbounds.ts (P1-1) -> viewport.fitBounds; setSelected -> annotator; onSelect
                 from annotator 'selectionChanged'; destroy tears both down. Carry the
                 degenerate-guard store-cast + warn (viewer.ts:124,155) verbatim.
  acceptance:    RUN `pnpm --filter @render/mount test` → mount tests (mock viewport/annotator)
                 satisfy the P1-1 oracle; surface methods callable; destroy idempotent.

TASK P1-3  @render/svelte adapter (<500 LOC leak budget)    [executing-plans]
  implements:    ADR-0002 (Q-2)
  donor:         anvil App.svelte:69-75,308 ($state viewer/selectedId/annotations; $effect)
  write-targets: packages/render-svelte/{src/Canvas.svelte | useMount.svelte.ts, *.test.ts}
  change:        Svelte adapter owns reactivity: bind selectedId -> surface.setSelected;
                 subscribe surface.onSelect -> set selectedId. The inversion the spike flagged.
  acceptance:    RUN `pnpm --filter @render/svelte test` (happy-dom) → selection round-trips
                 through the surface; adapter source < 500 LOC.

TASK P1-4  THE GATE — same fitBounds test, both paths       [verification + gate-enforcer]
  implements:    spike-0001 acceptance criterion
  donor:         —
  write-targets: packages/render-mount/src/gate.test.ts
  change:        Assert anvil-stock's fitBounds behavior (the P1-1 oracle, derived from anvil
                 donor logic) is satisfied by the new @render/mount path. Same spec, both sources.
  acceptance:    RUN `pnpm --filter @render/mount test gate` → MUST pass. Phase 1 done = green.
```

## Sequence & gate
Serial P1-1 → P1-4. Each: characterize/test RED → implement → GREEN. Phase 1 closes when P1-4
(the gate) is green AND `@render/svelte` is under 500 LOC. Then Phase 2 decomposer pass.
Capture `[SNAG]` when the delamination surprises (it's the riskiest piece). Close = mulch +
HANDOFF write-back.
```
