---
status: accepted
date: 2026-05-24
---

# Rendering is a three-layer headless core with thin adapters; Svelte is the framework for both surfaces

**Context & decision.** Shared rendering (`@render`) is structured in three layers: **`@render/core`** (pure TS — selector types, URL↔selector serialization, IIIF resolution, geometry/hit-test, OPFS adapter, scroll-sync controller; donor logic adopted as plain modules), **`@render/mount`** (framework-free vanilla mount functions wiring OpenSeadragon + Annotorious headless core + Wavesurfer), and **thin per-framework adapters** (`@render/svelte`) budgeted under ~500 LOC each — the budget doubling as a logic-leak detector. **Both** surfaces are Svelte: the **Studio** is a Svelte SPA (adopting anvil's editor shell, AnnotationForm/List, NarrativeEditor, PublishDialog, keyboard registry, lifecycle cleanup as *running* code); the **Viewer** is Astro + Svelte islands (adopting annomea's 3-state narrative pane + popup/drawer). One adapter (`@render/svelte`), zero `@render/react`.

**Why one ADR for two questions.** The three-layer structure and Svelte-everywhere are **not independently reversible**: the three-layer split makes sense *because* Svelte-everywhere lets the adapters be thin, and Svelte-everywhere makes sense *because* the three-layer structure absorbs the framework-neutral logic into `core`/`mount`. Splitting them into two ADRs would imply they can be revisited separately. They can't.

**The premise we rejected.** v4 framed `@render` as a package of *shared components* consumed by both surfaces — which doesn't compose, because components don't cross UI frameworks. The valuable shared things are **logic, not components**. Once named correctly (headless core + adapters), the framework choice per surface decouples from the sharing story.

**The evidence correction worth pinning** (it lives in conversation memory and disappears with it): an earlier read counted **Juncture** as prior-art evidence favoring React-friendly islands. **Juncture is Vue**, and is therefore *neutral* on React-vs-Svelte — its valuable logic is PURE and lands in `@render/core` regardless of framework. Correcting that read removed the last donor argument for a second adapter. The read-side donors that are adopted *as components* (annomea's pane + popup/drawer) are all Svelte; the lone React donor (liiive) contributes only a PURE CSS one-liner.

## Considered options

- **One framework + true shared components (subsumed):** correct instinct, realized here as core+adapters rather than literal shared components.
- **React end-to-end (v4 literal, rejected):** would re-derive every Svelte read-side donor from scratch and pay an unpaid-for two-adapter + cross-framework hiring/third-surface tax — buying nothing, since no React read-side donor or React-only Viewer need exists.
- **Split (Svelte Studio + React Viewer) (rejected):** the two-adapter cost is unpaid-for once Juncture is corrected to Vue; erased by going Svelte-everywhere.

## Consequences

- A future heavy interactive widget with a best-in-class React-only implementation is handled case-by-case (port / web-component-wrap / do without), not by adopting React platform-wide.
- Astro's Svelte island support is first-party with framework-agnostic hydration directives — no second-class penalty on the Viewer.
