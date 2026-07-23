# TEND EXPLORE — embed render runtime (2026-07-20)

Subsystem: the embeddable read-only render runtime.
Packages in scope: `packages/archie-viewer` (element/load/reader/av-player/note-card/target-resolve/content-state/embed-autogrow),
`packages/render-mount` (mount, read-mount, read-overlay, frame-overlay, marker-dots, zoom-band/cue, image-cap, gesture-guard, fitbounds, surface),
`packages/render-svelte` (Canvas.svelte, MarginColumn.svelte, controller.ts). render-core / apps are context only.

Method: FRICTION (fails the rung above) + SURPLUS (out-provides the rung above) at L1 Purpose / L2 Behavior /
L3 Structure / L4 Implementation. Every issue spans ≥2 rungs. Exclusions honored (Issue 17 whole-object-drop,
Directions 4/5/6/7, the do-not-resurrect decided list, incl. "embed parity").

---

## Observation ledger

### L1 — Purpose (why it exists)

**Friction**
- README §"Embed an exhibit" (README.md:282-288) advertises the FULL cite ladder on the embed:
  "Note `#/{slug}/a/<id>` (add `?xywh=x,y,w,h` for a region) · Section `#/{slug}/s/<id>`". The embed
  resolves the OBJECT correctly but does NOT apply the section's camera region nor an explicit `?xywh`
  override on the read-only image surface — it lands whole-object (element.ts:421-429, the honest
  PARTIAL doc). The documented purpose over-claims the delivered behavior. → Issue 2.

**Surplus**
- Reverse IIIF interop is MODELED but unmentioned in the purpose. `currentContentState()`
  (element.ts:450-459) encodes the open object back to a base64url IIIF Content State — the inverse of
  the inbound `iiif-content` attribute. The README's "IIIF interop" note (README.md:290) mentions ONLY
  the inbound direction. A whole round-trip is built; the stated purpose describes half. → Direction 1.

### L2 — Behavior (what it does)

**Friction**
- Deep-link fragment application is INCOMPLETE on both read surfaces. target-resolve.ts fully computes a
  `fragment` (xywh/t) and a `selectId` for every rung (lines 113-150), but:
  - image reader: `#applyFragment` (element.ts:421-429) applies ONLY `selectId` (select+fit the note's
    own shape) and drops `resolved.fragment` — so a Section `xywh` start and an explicit `?xywh` override
    have no landing path. → Issue 2.
  - AV reader: `#openAvObject` (element.ts:384-405) reads ONLY `resolved.fragment.kind === "t"` for the
    initial seek and IGNORES `resolved.selectId`; an `/a/<cueId>` cite to a timed note produces no `t`
    fragment (target-resolve `regionOfNote` recovers `xywh=` only, line 82-96) → the AV object opens at
    head 0 with no seek, no cue highlight, no note card. → Issue 3.

**Surplus**
- `currentContentState()` (element.ts:450-459) — a public method with ZERO consumers repo-wide
  (`grep -a currentContentState` hits only element.ts) and no UI affordance (no share/copy control). An
  export with no import. → Direction 1.

### L3 — Structure (how organized)

**Friction**
- `ReadOnlyMountSurface` (read-mount.ts:31-42) omits `fitRegion(fragment)` even though the sibling editor
  `MountSurface` (surface.ts:41-44) exposes it, and BOTH are backed by the SAME `applyFitBounds(viewport,
  selector)` oracle already imported into read-mount.ts (mount.ts:374-384 uses it; read-mount.ts:16
  imports `dispatchFitBounds` from the same module). The read surface is missing a capability its own
  layer already provides — the structural reason Issue 2's behavior gap exists.
- Two "clickable overlay shape → select" mechanisms with DIVERGENT a11y: read-overlay region shapes
  carry `role="button"` + `aria-label` (read-overlay.ts:129-130) while the whole-object frame-overlay
  border carries neither (frame-overlay.ts:70-88 — a bare click listener). Same concern, two shapes,
  two different (both incomplete) accessibility treatments. → Issue 1.

**Surplus**
- `labelFor` is threaded end-to-end (ReadOnlyMountOptions.labelFor → createReadOnlyOverlay options →
  `aria-label`, read-mount.ts:55/239, read-overlay.ts:63/96/130) but the SOLE caller, reader.ts
  `openObject` (reader.ts:57-74), never passes it — a parameter no caller supplies. Every embed shape
  therefore announces the fallback `annotation <rawULID>`. → Issue 1.
- `ReadOnlyMountOptions.locator` (read-mount.ts:57-58, 199) is likewise never passed by reader.ts — a
  flag that only ever holds its default (false). The full viewer (apps/viewer Reader.svelte:300) passes
  `locator`; the embed's read surface can, but doesn't. → Direction 2 / fog.

### L4 — Implementation (how built)

**Friction**
- The embed image annotation layer is a KEYBOARD / assistive-tech DEAD END. read-overlay region shapes
  set `role="button"` but NO `tabindex` and NO keydown handler (read-overlay.ts:128-146) — `role=button`
  alone is not focusable, and there is no Enter/Space activation, so a keyboard user cannot select any
  region note. The whole-object frame (frame-overlay.ts:80-85) has no role/label/tabindex/keydown at all.
  By contrast the AV cue band (av-player.ts:234-253) and the gallery/exhibit grids (element.ts:520-527,
  565-578) use real `<button>` elements — keyboard-fine. Only the image annotation overlay is unreachable.
  → Issue 1.

**Surplus**
- `locator`/`labelFor` never actuated (see L3 surplus) — options whose code path in the embed only ever
  runs the default branch.

### None-found / clean cells
- render-mount pure geometry (marker-dots.ts, image-cap.ts, zoom-band.ts, fitbounds.ts) and the
  degenerate-gesture guard are well-scoped, unit-tested, single-caller-justified — no L3/L4 surplus worth
  a ticket. image-cap MAX_DECODE_DIM correctly anchors to the author-side MAX_MASTER_DIM (no divergent
  magic number).
- The untrusted-archive open seam is canonical (load.ts composes `@render/core` open.ts; the
  `openSrcAsZipIfBytesAreZip` fallback is the sanctioned exception per the installed rule) — not re-reported.

### Fog (seen, not ticket-sharp)
- embed-autogrow.ts:18-19 doc says the height message `id` falls back to `src` then `""`; element.ts:154
  passes `this.id || ""` only and its comment explicitly says "NOT `src`". Minor doc-vs-code drift.
- The read-only surface exposes NONE of MountSurface's spatial-overview aids (locator opt-in, navigator
  note-dots via setNavigatorDots, far-band dots via markerScreenRects+dotsVisibleForBand). A visitor
  zoomed out in the embed on a large image sees near-invisible outlines with no location cue. Adjacent to
  the decided "embed parity" theme — held as a direction with that caveat, not a hard issue.
- Region shapes and the whole-object frame both stroke `currentColor` in the read path (read-overlay.ts:137,
  read-mount.ts:273) — the Reading-hue the editor renders via setStyle is flattened to monochrome in the
  embed. Reading is a modeled domain concept; the embed drops its colour. Parity-adjacent; fog.

---

## Issues / Directions — see the returned JSON for the paste-ready set.

## Adversarial verification — 2026-07-20 (workflow wf_19aab265-c48; one independent skeptic per finding)

- issues[0] "The embed image annotation overlay is a keyboard/AT dead end and announces raw ULIDs" — confirmed (Strong) → seeds Archie-9413.
- issues[1] "The embed drops Section-region and explicit ?xywh deep-link fragments (README advertises them)" — corrected (Strong) → seeds Archie-69a7. Corrections: Finding says fitRegion delegates to "the SAME applyFitBounds(viewport, selector) oracle already imported into read-mount.ts". read-mount.ts:16 actually imports dispatchFitBounds (the id-keyed sibling) from fitbounds.js — applyFitBounds itself is not currently imported there; a fitRegion port would add that import. Same shared oracle module, so the substance (thin wiring, not new machinery) holds. All other cited evidence is accurate: README:~282 advertises ?xywh and Section deep-links; target-resolve.ts:113-150 computes section-start and explicit-xywh fragments; element.ts:421-429 #applyFragment applies only selectId and drops resolved.fragment (self-documented PARTIAL at 414-419); ReadOnlyMountSurface (read-mount.ts:31-42) lacks fitRegion while surface.ts:44 / mount.ts:374-384 have it.
- issues[2] "AV deep-link to a timed note doesn't seek to or surface that note" — confirmed (Strong) → seeds Archie-a9f4.
- directions[0] "Reverse IIIF interop (currentContentState) is built but has no consumer, UI, or docs" — DROPPED (corrected). excluded — expose-or-delete already adjudicated not-pursued in ledgers/CAPABILITY.md (orphaned by category, not by gap); re-opening needs new evidence. Full refutation: (1) "grep -a currentContentState hits ONLY element.ts — zero callers" is overstated: a repo-wide grep (excluding node_modules/dist/worktrees) also hits packages/archie-viewer/src/element.test.ts (two unit tests call it, lines ~460-476), docs/adr/0022-iiif-content-state-interop.md:46, and ledgers/CAPABILITY.md:70,96. Zero PRODUCTION/host callers and zero UI affordance is true. (2) "no docs" in the title is wrong for internal docs: ADR-0022 "Reverse interop" bullet documents the method explicitly; correct only for user-facing docs — README.md:290's IIIF-interop note covers only the inbound iiif-content attribute. (3) The finding's "Decide: expose or delete" was already adjudicated: ledgers/CAPABILITY.md logs currentContentState() as "orphaned by category, not by gap — not pursued, no commission" (would need a separate 'copy live location' affordance). The direction re-opens a decision an existing ledger already made and doesn't cite it.
- directions[1] "The read-only surface exposes none of MountSurface's spatial-overview aids" — confirmed (Strong) → seeds Archie-d3a1. Corrections: Reader.svelte passes `locator` at line 305, not 300 (within stated tolerance). All other citations accurate.
