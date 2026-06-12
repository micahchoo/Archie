# Live Viewer Projection — implementation sketch

**Decision:** Q-3 (archie-persistence), user-gated 2026-06-11.
**Goal:** a newly created exhibit appears in the co-deployed Viewer with no publish/import step. One canonical store, two same-origin apps; Publish is reserved for durability ("on the web, citable").

**Caveman:** Studio writes store. Viewer reads same store. Publish makes it public, not visible.

---

## Phase 1 — Store-reader moves into render-core

The OPFS working-store layout (`library.json` + `exhibits/{slug}/annotations/` + `assets/`) is the *project* format; `loadLibrary` reads the *published* format. The Viewer needs the project reader.

- Extract Studio's working-store load path (`apps/studio/src/store.ts` read side) into `packages/render-core` (e.g. `loadWorkingLibrary(fs: Filesystem)`), keeping Studio as first consumer — no behavior change.
- It must return the same shapes the publish projection consumes (`Library`, `getLog`), so the Viewer can project to `PublishedExhibit` in memory.
- Acceptance: Studio still loads/saves identically; new core function covered by a round-trip test (save via Studio path → load via core reader → deep-equal).

## Phase 2 — Viewer probes the working store (live mode)

- `apps/viewer/src/published.ts` `probeViewerMode()` gains a third probe: open OPFS (`navigator.storage.getDirectory()`), look for the working-store root. Same-origin co-deploy makes this Just Work on GH Pages.
- On hit: `loadWorkingLibrary` → in-memory `publishLibrary` projection (or direct `PublishedExhibit` construction) → exhibits flow through the existing source-agnostic seam (ADR-0010) into the same `ExhibitView`.
- Merge into the hall alongside hosted exhibits; working-store version wins on slug collision. Playground exhibits excluded (per-exhibit flag, mx-6c5c48).
- Badge language: **Local — only you can see this, in this browser** vs **Published — on the web, citable**.
- Liveness v1: probe on Viewer load only. No BroadcastChannel.
- Graceful degradation is a hard requirement: probe failure (cross-origin deploy, no store, permission) → exactly today's hosted/portable behavior. Live mode is never load-bearing.

## Phase 3 — Single-origin local dev

- Root `pnpm dev`: run Studio (Vite) + Viewer (Astro) behind a thin proxy mounting `/studio/` and `/viewer/` on one port, mirroring the GH Pages layout. Set dev base paths to match (`--base=/studio/`, `SITE_BASE=/viewer/`).
- Known fiddly spot: forwarding both HMR websockets through the proxy.
- Side benefit (part of the point): dev now mirrors prod base paths — kills the deploy-only broken-link bug class.
- Acceptance: author an exhibit in Studio at `localhost:PORT/studio/`, open `localhost:PORT/viewer/`, exhibit appears with Local badge — no gen, no publish.

## Out of scope (this plan)

- BroadcastChannel live sync while both tabs open (liveness v2).
- FSA-folder-bound and zip-bound configs as live sources (unbound/OPFS only in v1; folder/zip users still see exhibits after Save-to-folder + gen, unchanged).
- The CI prebuild-clobber fix for the durable publish path (separate issue — `prebuild` regenerates `public/published/` from sample-data, wiping committed exhibits).

## Risks

- **OPFS namespace collision in dev:** anything else served on the same localhost port shares the origin's OPFS. Acceptable; the store root is namespaced (`archie-demo-project/`).
- **Projection cost:** in-memory `publishLibrary` per Viewer load; fine at current library sizes, measure if halls grow.
- **Pre-ship invariables:** state lives in ONE place (working store) — the projection is derived, never written back. Feedback: probe outcome must be observable (console/diagnostic line), not silent, so "empty hall" is debuggable.
