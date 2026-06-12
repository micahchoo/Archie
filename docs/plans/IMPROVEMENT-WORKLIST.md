# Archie improvement worklist

> **Status ledger (2026-06-11 session — implemented with per-item plan/review gates):**
> - **0.1 DONE** — `save-queue.svelte.ts` (per-key serialized writes, reactive health), wired into
>   `library-meta.svelte.ts` persist, `save()`, folder autosave, `saveProject` (catch → recovery
>   card). Error surfaces: savestate span, project-bar line, bindingError. 8 queue tests.
> - **0.2 DONE** — log is the only writer: `isDegenerateTarget` guard in core session (throws at the
>   log boundary, 3 tests), `GestureGuard` in render-mount (public-API event guard with echo
>   suppression, 7 tests; verified Origin semantics on @annotorious/core 3.8.2), `state.store`
>   monkey-patch DELETED, loud legacy filter in setAnnotations.
> - **0.3 DONE (cuts 1–2)** — `binding-store.svelte.ts` + `publish-flows.svelte.ts` extracted;
>   App.svelte 2013 → ~1792 lines; ASSET_PREFIX/isAsset unified in store.ts. Cut 3 (view-state
>   store) deferred WITH marginalia → **Archie-6a16**.
> - **0.4 DONE (in-session scope)** — 10 binding-seam characterization tests; playwright litter
>   deleted + gitignored. Browser loop suite → **Archie-c9ac**.
> - **1.1 DONE (in-session scope)** — OSD navigator locator (opt-in `locator` mount option, on in
>   Reader + Studio), zoom-band stamping (`zoomBand()`, 4 tests) + screen-space CSS weights.
>   Pin-morphing + locator note dots → **Archie-c1d9** (browser-verify).
> - **1.2 DONE** — drawing-armed banner (framing-banner idiom) + canvas accent ring + crosshair.
> - **1.3 DONE** — arrival pulse in Reader (two breaths on mount/object-switch, reduced-motion safe).
> - **Phases 2–4 NOT STARTED** — marginalia (2.1), edit-at-locus (2.2), readings rail (2.3, needs a
>   Q5 decision record for overlap), surfaces-follow-attention (3.1), validation (4.x).
> All review gates green at session end: render-core 442, render-mount 28, studio 87 tests; both
> apps build. UI changes are browser-verify pending per project convention.
>
> **Second-pass ledger (2026-06-11, same day — "organise and implement the honest map"):**
> - **Organised:** every untouched item now has a tracker (index below); 11 new seeds issues.
> - **Marginalia cut B DONE** — `layoutMarginalia` solver in render-core (1-D placement, gutter
>   overflow, deterministic; 13 tests).
> - **Marginalia cut A DONE** — `MountSurface.markerScreenRects(ids)` batched rect read (one
>   offset read + one list pass; shared math with the singular path).
> - **Archie-788e FIXED** — pending debounced save flushed in `openExhibit`; timer cancelled in
>   `replaceProjectFrom`. Seed closed.
> - **Hygiene DONE** — csvEl/wadmEl now $state, dead saveIdentity/mintRevId/.swatch/.you removed;
>   App.svelte diagnostics down to 3 minor pre-existing items.
> - **4.3 Bundle ratchet DONE** — `pnpm bundle:baseline` / `pnpm bundle:check` (fail on
>   >max(10%,10KB) gz growth). First honest baseline: studio 388.3KB gz, viewer 319.3KB gz —
>   the 240KB budget is formally retired from bundle-size.json.
> - **Decision proposals DRAFTED (user-gate)** — `docs/decisions/PROPOSALS.md`: P-1 archivability
>   (noscript/sitemap projection) + P-2 readings display-composition (rail prerequisite; separates
>   membership- from display-exclusivity, Q5 untouched). In triage as Archie-125f / Archie-6b65.
> - Gates at second-pass close: 602 tests green (core 455 · mount 28 · svelte 19 · viewer 13 ·
>   studio 87), `pnpm typecheck` 0 errors, all builds + bundle check pass.
>
> **Third-pass ledger (2026-06-11, same day — marginalia cuts C–F, Playwright-verified):**
> - **Cut D SHIPPED** — `MarginColumn.svelte` (@render/svelte, exported; adapter still 407/500 LOC):
>   measures column + card heights, projects core's solver, hover leader, gutter overflow chips,
>   degrade-to-list. Studio aside (image objects, non-narrative layouts) renders notes as margin
>   cards via the rect stream (`Canvas rectIds/onmarkerrects`, rAF-throttled batched reads).
> - **Cut E SHIPPED** — the WADM form renders INSIDE the focused margin card (52vh cap, scrolls);
>   the detached popover remains the AV/narrative surface by design. Archie-c03a closed.
> - **Cut F SHIPPED** — Viewer Reader list state is margin cards (read-only previews; detail-on-click
>   and zoom unchanged).
> - **Cut C consciously NARROWED** — the seam marginalia needed turned out to be props (the margin
>   is a pure projection); the full view-state store stays Archie-6a16, unblocked, lower urgency.
> - **Solver hardened by the browser**: Playwright found the self-eviction loop (focused card's
>   editor balloons height → capacity check evicts the card being edited). Fix = `pinId` guaranteed
>   placement (oversized pin clamps to top; neighbours band around it) — 18 solver tests now.
> - **Verification harness**: `scripts/verify-marginalia.mjs` (playwright workspace devDep; system-
>   chromium fallback) — 9 assertions incl. reflow-on-pan and in-card-edit-lands-in-preview, all
>   PASS; screenshots at docs/screenshots/auto/marginalia-{studio,viewer}.desktop.png. Test hooks
>   added: aside data-selected/-editing, margin-card data-id.
> - Gates: 607 tests (core 460 · mount 28 · svelte 19 · viewer 13 · studio 87), typecheck 0 errors,
>   builds pass, bundle ratchet ok (+2.7KB studio / +2.5KB viewer gz — marginalia's whole cost).
>
> **REVERT (2026-06-11, later the same day):** the user reviewed the live marginalia and rejected
> the presentation ("does not look good"). Cuts D/E/F UI wiring removed from BOTH apps — classic
> list + popover restored and Playwright-confirmed (no margin column, list renders, note click →
> popover editor). Archie-c03a reopened. **Engine retained** (headless-tested, inert): core
> `layoutMarginalia` + pinId, mount `markerScreenRects`, Canvas `rectIds`/`onmarkerrects`,
> `MarginColumn.svelte` (unconsumed → tree-shaken), `verify-marginalia.mjs` (parked, fails until
> re-wired). Redesign tracker: **Archie-f411** — next attempt starts from a design pass on what
> specifically read wrong (card chrome / leader / motion / density), not from re-wiring.
>
> **Fourth-pass ledger (2026-06-11, same day — P1-P2-IMPLEMENTATION-STRATEGY executed):**
> - **Track A (ADR-0014) SHIPPED** — `publish/static-pages.ts`: every publish now emits
>   `index.html` (library landing), `{slug}/index.html` (FULL heads projection, per-note anchors
>   `note-<logicalId>` = the durable ref), `sitemap.txt`. Contract corpus written RED first
>   (12 tests, frozen grammar incl. hostile-body escape + idempotence). Studio injects the live
>   Viewer's snarkdown+DOMPurify pipeline (`STATIC_PAGE_OPTS`) + canonical viewerBase; non-DOM
>   publishes fall back to escape-only. A1 narrowed: emitter as its own module + thin slot; deep
>   site.ts split stays with the anti-pattern backlog.
> - **Track B (archie-ux Q-2) SHIPPED** — `reading-state.svelte.ts` (visible set + active pen,
>   11 tests), `readingMarkerStyle` in core (comparing/solo regimes, 6 tests — ONE style source,
>   Viewer's copy deduplicated), `ReadingsRail.svelte` (toggles + pen radio + counts + solo +
>   manage…), dropdown RETIRED, modal = edit annex. Harness `verify-readings-rail.mjs` 9/9
>   (Q1 pen-independence, comparing flag, Viewer-legend-still-radio); comparing/solo/single
>   screenshots await the **B3 human comprehension gate** — note the marginalia-revert precedent
>   above: the rail is likewise a canvas-overlay UI and ships PENDING that gate.
> - **Real bug found by the harness:** Studio passed a STABLE `styleOf` identity → Canvas never
>   re-applied styles on display-state change; fixed with an identity-minting derived.
> - **SNAG → Archie-a6fb (P1 bug):** Annotorious 3 renders marks to WebGL canvas — the 1.1
>   zoom-band and 1.3 arrival-pulse CSS target `.a9s-annotation` and are INERT; redo via the
>   style-expression channel. (Comparing regime unaffected — it rides DrawingStyleExpression.)
> - Synthetic-draw simulation is a non-gating WARN (hardening → Archie-c9ac). A stale 4321
>   viewer server from a prior session was masking the Viewer checks — killed.
> - Gates: **636 tests** (core 478 · mount 28 · svelte 19 · viewer 13 · studio 98), typecheck 0,
>   builds pass, ratchet ok (+3.5KB studio / +0.3KB viewer gz — emitter + rail together).
>
> **Honest-map index (2026-06-11, second pass — every untouched item now tracked):**
> | Item | Tracker |
> |---|---|
> | Marginalia build (2.1, cuts A–F) | `MARGINALIA-PLAN.md` + Archie-6a16 (view-state) |
> | Edit at the locus (2.2) | Archie-c03a |
> | Readings rail (2.3) + overlap decision | Archie-113b (blocked on decision proposal) |
> | Surfaces follow attention (3.1) | Archie-e640 |
> | Real-exhibit validation (4.1) | Archie-87ba (human-gate) |
> | Bundle ratchet (4.3) | this session (see ledger update below) |
> | Browser loop suite (0.4c) | Archie-c9ac |
> | Pin LOD + locator note dots (1.1 rem.) | Archie-c1d9 |
> | Scale cue (zoom magnitude) | Archie-93fd |
> | Touch design pass | Archie-cf4a |
> | Accessibility / SR pass + overlay contrast | Archie-eec7 |
> | Library-scoped Object IDs (ADR-0001 drift) | Archie-8a45 |
> | CONTEXT.md glossary/ledger split | Archie-35fe (user-gate) |
> | Hash-routing vs archivability decision | proposal drafted this session (user-gate) |
> | Pending-save flush on exhibit switch | Archie-788e (fixed this session) |
> | site.ts hotspot / anti-pattern backlog | Archie-fe6c · 7382 · 2478 · fddf (needs-triage) |
> | Merge-UI pilot before further investment | policy (4.2) — needs a real two-author exchange |

*2026-06-11. Synthesizes two reviews: the architecture/affordance retrospective
(`docs/reviews/2026-06-11-architecture-affordance-retrospective.md`) and the
entity-split affordance critique (annotation dismembered across canvas + sidebar;
zoom illegible; edit-at-locus unbuilt; readings as filter not layers; invisible
drawing mode; no arrival moment; surfaces mapped to geography not attention).*

**Ordering rule:** foundations → legibility → signature rebuilds → visual
re-derivation → validation. Each phase unlocks the next; nothing in a later
phase is safe to build on an earlier phase left undone.

---

## Phase 0 — Make the ground solid

The affordance redesign touches the Studio shell everywhere. Right now that
shell is risky to change: saves fail silently, annotation state has two owners,
and App.svelte is 2,013 lines doing seven jobs. Fix the ground first or every
UI task below carries hidden risk.

### 0.1 Loud saves (small, first)
Route every persist call through one serialized write queue. Surface success/
failure in the save indicator that already exists in the project bar. Kills the
150 fire-and-forget findings at the root instead of patching 150 call sites.
**Why first:** cheapest item with the highest trust payoff; every later change
is safer when a failed save is visible.

### 0.2 One writer for annotation state
Make the append-only log the only writer; Annotorious becomes a pure renderer
of the heads projection (gesture → append to log → re-render from projection).
**Why now:** the marginalia system (2.1) and scale-aware markers (1.1) both
need one observable annotation-state stream to position cards and style marks.
Two diverging sources make those features unbuildable.

### 0.3 Decompose App.svelte
Extract a canonical app store (log + library meta + view state) and named
side-effect modules (persist, publish, binding). Components become projections.
**Why now:** phases 1–3 all modify the shell. Doing them inside a god component
means each one re-risks the others; doing them against a store means they land
as independent projections.

### 0.4 Regression net on the loop
A small always-green browser suite on author → save → publish → read, plus
characterization tests on the storage binding seam. Harvest or delete the 30+
stray playwright-artifact dirs at repo root.
**Why now:** phases 1–3 deliberately rebuild core interactions. The net catches
what the rebuild breaks.

---

## Phase 1 — Make the canvas legible

Cheap, independent, high-payoff. None of these change the data model; all
attack "the canvas affords looking but not finding."

### 1.1 Scale-aware marks + locator
Marks render as pins/dots at far zoom, bloom into outlines as you approach
(cartographic level-of-detail). Add a small locator: viewport-within-image with
note positions. Solves both invisible-at-fit-width and inside-a-mark-at-8×.

### 1.2 Visible drawing mode
When drawing is armed, show it somewhere besides the cursor: a banner
("Drawing a region — Esc to cancel"), dimmed chrome, accent canvas border.
Eliminates the drag-means-draw-or-pan mode error.

### 1.3 Arrival moment in the Viewer
On exhibit load: marks pulse once, or a momentary show-all reveal, and the note
list works as thumbnailed entry points. Answers "where do I start?" and gives
touch users (who can't hover-discover) a way in.

---

## Phase 2 — Rebuild the two signature interactions

The expensive, differentiating work. Sequenced after Phase 0 because both need
the single state stream and the decomposed shell.

### 2.1 Notes as marginalia (the big one)
Cards in the right column position themselves against the vertical position of
their region in the current viewport; hairline leaders on hover; reflow on pan
and zoom. The sidebar stops being an independent ordering of the same set and
becomes a true margin. This re-joins the dismembered entity — region and body
become one thing in space again. No competitor ships this.
**Depends on:** 0.2 (state stream), 0.3 (store), 1.1 (viewport math is shared
with the locator).

### 2.2 Edit at the locus (finish ADR-0006)
The popup becomes the editor: select mark → write there, beside the pixels.
The sidebar becomes purely an index/browse surface — no more three tools
fighting over 352px, no more editing destroying browsing context.
**Depends on:** 0.3; pairs naturally with 2.1 (a marginalia card in focus IS
the editor).

### 2.3 Readings rail
Replace the dropdown/legend with a layers panel: swatch, name, count,
independent visibility toggles, solo-on-hover. Allow overlap — viewing where
two readings disagree about the same region is the most scholarly moment the
product can offer, and the radio currently forecloses it. Three reworks of the
Readings UI in one week of commits = the system saying Readings have no home;
this is the home.
**Note:** Viewer-side exclusivity (Q5/Q10, base-only arrival) is a *published*
default and can stay; the Studio rail and an opt-in Viewer compare/overlap mode
need a decision record since they touch the locked mutual-exclusivity frame.

---

## Phase 3 — Re-derive the surfaces

### 3.1 Surfaces follow attention, not geography
Ambient → dark and quiet; the attended thing (selected card, open editor) →
warm paper, brightest object on screen after the image itself. Amber = the dark
world's accent; green = paper's ink. This is explicitly *after* 2.1/2.2 because
once notes are marginalia and editing is at the locus, paper stops being a
352px territory and becomes the material of the note in hand — the palette
problems (luminance seam, green-on-grey) dissolve as corollaries rather than
being patched.

---

## Phase 4 — Validate and re-scope

### 4.1 One real exhibit, outside readers
Push a genuine authored exhibit through author → publish → read → cite with
real visitors. Every invention above gets its prototype gate against this, not
against the bundled templates.

### 4.2 Freeze merge-UI investment until a pilot
The merge surface is built; don't extend it until a real two-author exchange
exercises it. The Readings rail (2.3) absorbs the rival-interpretation case,
which was merge's strongest scenario.

### 4.3 Real bundle baseline
Measure the actual gz bundle (docs/bundle-size.json exists — wire it into CI as
a ratchet, not a fiction). No numeric budget appears in a decision without a
measurement beside it.

---

## Dependency sketch

```
0.1 loud saves ──┐
0.2 one writer ──┼─→ 1.1 LOD+locator ─→ 2.1 marginalia ─→ 2.2 locus editor ─→ 3.1 surfaces
0.3 decompose ───┤    1.2 mode banner      2.3 readings rail ─┘
0.4 test net ────┘    1.3 arrival                              ↓
                                                    4.1 real exhibit → 4.2 / 4.3
```

Phase 1 items are parallel-safe. 2.1/2.2/2.3 should land serially (same shell
territory). Phase 3 is a sweep after the structure settles.
