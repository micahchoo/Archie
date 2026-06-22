# `<archie-viewer>` — Implementation Strategy

**Status:** compiled 2026-06-21 (grill-with-docs strategy phase). The method and sequence for building
the embeddable read-only viewer from the locked design. NOT a task list — each phase gets its own
detailed plan when it starts. This is the meta-level: ordering, phases, reducibility, the mechanical
execution system, and the first concrete move.

## Design corpus (sole inputs — nothing here is invented)

- **CONTEXT.md** — glossary term **Embeddable viewer**; section **"Embeddable read-only viewer —
  `<archie-viewer>`"**; the **Public API contract — RESOLVED** bullet.
- **ADR-0019** — embed architecture (read-only, drop Annotorious/PixiJS, DOM-SVG overlay, no
  `unsafe-eval`, two-bundle, jsDelivr/gh).
- **ADR-0020** — `.archie.zip` L1 self-identification marker (validation, not authentication; never
  crypto-sealed; hand-editable).
- **ADR-0021** — target contract (full cite-ladder native-route address + degrade-upward).
- **Prior art** — anvil ADR-0006 (Web Component + iframe, nothing else), annomea `EMBED-AUDIT.md`
  (name/attr consistency lesson), clover-iiif `preact-custom-element` (the ~40-LOC donor),
  canvas-panel `dist/bundle.js` (single-bundle distribution).
- **Probes (2026-06-21)** — `wc-feasibility` (Annotorious droppable → no `unsafe-eval`; ~110–150 KB gz
  floor; the `frame-overlay.ts` overlay donor), the attack-surface + adversarial pass (SVG XSS &
  prototype-pollution closed-by-construction; zip-bomb = the one live High), `deeplink-verify`
  (free-vs-new per rung).

## Ordering principles (derived from the design, not invented)

1. **Adopted before invented.** The read-only render path extracts a proven in-repo donor
   (`frame-overlay.ts` overlay; pure `render-core` selectors) and reuses already-built arrival
   behaviors (reading-activation, narrative-landing). Ship that proven core before gating on the
   invented surfaces (drop-screen comprehension, cross-library affordance). A slip on an invention
   must not block the core.
2. **Sources before projections.** The data contracts — the L1 zip marker (ADR-0020), the route
   grammar incl. the new Section rung (ADR-0021), the instance-scoped load context — are sources; the
   element UI that consumes them is the projection. Build the source first or the projection is rework.
3. **Highest-assumption-load first.** Within each tier, build the thing hardest to retrofit first: the
   **read-only SVG-overlay mount** (the whole no-eval/bundle premise rides on it) and the
   **instance-scoped load seam** (module-globals → per-element; retrofitting after three phases of
   consumers is the largest hidden rework). The seam interface is *designed* in Phase 1 even though the
   full refactor lands in Phase 4 — so consumers never bind to the singleton.

## Phases (serial at the phase level; parallelism lives within)

### Phase 0 — Keystone: the read-only render path
- **Builds:** a no-Annotorious mount in `render-mount` (OSD kept; `createOSDAnnotator` replaced by a
  DOM-SVG overlay rendering `xywh` + `SvgSelector` polygons geometry-only; hit-test → `selectionChanged`;
  `fitBounds`-on-select; a11y marker labels). Build items 1.1–1.7, 5.2.
- **Validates:** the entire premise — regions render read-only, the bundle drops toward ~110–150 KB gz,
  and `script-src 'unsafe-eval'` + `worker-src blob:` can be removed (browser-verified in a strict-CSP
  host page).
- **Does NOT validate:** the element packaging, hosted-URL source, deep-linking, or multi-instance.
- **Boundary:** a standalone harness page mounts the read-only path over a fixture exhibit with NO
  `@annotorious/*`/`pixi` in the bundle and NO `unsafe-eval` in its CSP.

### Phase 1 — The `<archie-viewer>` element + local-zip drop
- **Builds:** the custom element (Shadow DOM, attr↔prop engine — clover donor), two-bundle split,
  `EmptyHall` drop-zone, render-core read path, grid + lazy reader; the L1 marker gate (6.1–6.2) and
  the **decompression cap** (5.1) at ingest; image-decode cap (5.5); the **instance-context seam**
  (the interface, wrapping today's globals). Build items 2.1–2.4, 6.x, 5.1/5.3/5.5, plus the 9.1 bundle.
- **Validates:** a drop-a-zip read-only embed works as a custom element in a third-party page under a
  strict CSP; hostile/junk zips are rejected before parsing.
- **Does NOT validate:** hosted-URL source, deep-link targets, or two embeds on one page.
- **Boundary:** `<archie-viewer></archie-viewer>` on a bare HTML page → drop a `.archie.zip` → grid +
  reader; a non-Archie or zip-bomb file is refused.

### Phase 2 — Source: hosted URL
- **Builds:** remote-zip `src` (reuse `openLibraryFromSrc`, 3.1) + remote-tree `src` (generalize the
  hosted fetch to an arbitrary cross-origin base, 3.2); `offline` mode (5.4); CORS/HTTPS docs (3.3).
- **Validates:** `<archie-viewer src="https://…/lib.zip|/tree/">` renders from a hosted library;
  `offline` blocks remote egress.
- **Does NOT validate:** deep-linking or multi-instance.
- **Boundary:** the element renders from a GitHub-Pages-hosted tree and from a hosted zip, cross-origin.

### Phase 3 — Target: full ladder + degrade-upward
- **Builds:** Section route grammar (4.1); **widen the route→reader seam** (4.2 — one fix unlocks
  region/time/section); slug-level degrade-upward (4.3); object/section/region/AV handling
  (4.4–4.7); the §258 id-collision fix (8.1); reading-activation + narrative-landing reused free (4.8).
- **Validates:** `target=` opens any rung and a missing/out-of-bounds target degrades upward, never
  errors.
- **Does NOT validate:** multi-instance.
- **Boundary:** every rung opens correctly; a deleted note → its exhibit; a bad region → whole object;
  a missing exhibit → gallery.

### Phase 4 — Multi-instance
- **Builds:** complete the instance-scoped refactor of `published.ts` module-globals → per-element
  context (7.1); decoded-library-by-URL cache, ref-counted vs blob-revoke (7.2); explicit
  pending-target state machine (7.3).
- **Validates:** several `<archie-viewer>`s on one page (same or different libraries) coexist without
  clobbering, and a shared `src` fetches/decodes once.
- **Boundary:** three embeds on one page, two sharing a `src`, all correct; one closing doesn't revoke
  another's blobs.

### Continuous / cross-cutting (fire at their condition, not a phase)
- Hardening invariants (5.1–5.6) attach at their seams as they're built; the **SVG-never-`innerHTML`**
  assertion (5.2) is a standing test from Phase 0.
- **Deferred, named:** cross-library miss → §96 "open it?" affordance (10.1) is **blocked** on
  cross-library authoring not existing in Studio yet; `iiif-content` interop target (10.2) is additive.

## Reducibility classification (drives model-tiering + gating)

- **Adopted** (donor exists, binary done-test) → small-model mechanical: 1.4, 1.6, 2.1, 2.3, 3.1, 4.8,
  5.6, 9.1.
- **Greenfield-specifiable** (no donor, but test-corpus-first) → small-model mechanical AFTER the
  corpus: the bulk — 1.1–1.3, 1.5, 2.2, 3.2, 4.1–4.7, 4.9, 5.1, 5.3–5.5, 6.1–6.2, 7.1–7.3, 8.1.
- **Invented** (no donor, "does a user grok it" isn't a unit test) → **human gate**: 2.4 (the frozen
  attribute UX / drop-screen comprehension), 10.1 (cross-library affordance).

For the data-/route-shaped greenfield work the corpus is read off the contracts: each ladder rung →
one open-test; each degrade-upward edge → one fallback-test; each lifecycle/identity rule (ADR-0020) →
one marker-test. The contracts ARE the corpus enumeration.

## Deceptively-simple items (write the corpus BEFORE a small model touches them)

Each sounds like a one-liner but hides an invariant / cross-environment / state-transition edge:

- **Region out-of-bounds clamp (4.5)** — negative coords, oversized boxes, polygon→bbox, image-vs-map
  surfaces; empty intersection must degrade, not pan-to-blank.
- **AV `t=` landing (4.7)** — clamp + seek-**without**-play (the existing `seekTo` couples `play()` →
  §142 trap); garbage `t=` → `t=0` paused.
- **Decompression cap (5.1)** — ratio vs absolute vs entry-count; the drop path is the uncapped entry.
- **Instance-scoped refactor (7.1/7.2)** — module-global → per-element distributed state; blob-URL
  ref-counting so one close doesn't revoke another's live blobs.
- **L1 marker assert (6.2)** — version-compat: a pinned-`@v1` element reading a `v2` zip must refuse
  cleanly, not render garbage.
- **Degrade-upward cascade (4.3)** — note→exhibit→library; single-exhibit libraries have no gallery to
  degrade TO; fix in boot, not deep in the reader.

## Mechanical execution system

- **Decomposer** (strong model, once per phase) — turns the phase into an ordered DAG of leaf tasks,
  writes each task's acceptance test FIRST (corpus from the contracts above). For Phase 0/1 UI it
  invokes `interface-design` so the drop-screen/grid/overlay cite the design system.
- **Wave-builder** (mechanical) — groups ready leaf tasks with disjoint write-targets into parallel
  waves.
- **Executor** (small model, mechanical) — one leaf task: make its pre-written test green; report
  pass/fail; no scope expansion.
- **Verifier** (mid-tier, wave/phase close) — green tests are meaningful (not gamed); cross-worker
  seams cohere; Pre-Ship Gate at phase close.

Leaf-task schema (fill mechanically, execute mechanically):

```
TASK <id>
  implements:    <ADR-0019/0020/0021 / build-item #>
  blocked-by:    [<task ids>]
  donor:         <file:line> | greenfield-per <ADR/contract>
  write-targets: [<exact paths>]
  change:        <one precise instruction; no design choice open>
  acceptance:    RUN <command> → MUST <binary pass condition>
  on-block:      STOP + escalate; do NOT improvise or relitigate
```

A task a small model can't execute mechanically is under-specified → back to the decomposer.

## Enumeration strategy (just-in-time, not waterfall)

- **Enumerable now:** all Adopted + Greenfield items — each phase's decomposer writes the corpus, one
  test per rung/edge/rule.
- **Discovered later:** the invented gates (2.4 drop-screen UX, 10.1 cross-library) — downstream of a
  design pass + human gate; the cross-library producer (Studio authoring) must exist first. New tasks
  cite what birthed them. The live frontier is always the next wave + the phase skeleton.

## First concrete move

**Build the read-only SVG-overlay mount path (Phase 0, items 1.1–1.3) with its test corpus first** —
the `render-core` selectors (`xywh` Fragment + `SvgSelector` polygon) → expected overlay geometry, plus
the standing security assertion that selector values never reach `innerHTML` — then measure the bundle
and confirm `unsafe-eval` is gone in a strict-CSP harness page. This is the keystone every other
projection depends on and the most expensive to retrofit: if a read-only DOM-SVG overlay can't
faithfully replace Annotorious, the whole lightweight/no-eval premise (and ADR-0019) is wrong, and we
learn it in the cheapest possible phase before any element/packaging/deep-link work is built on top.
