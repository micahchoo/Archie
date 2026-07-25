// Lazy island components — the app-side equivalent of the embed's eager-closure split.
//
// WHY: `ExhibitView.svelte` renders Reader / MediaPlayer / SearchOverlay / NarrativeReader behind
// `{#if}` blocks, but IMPORTED them statically — so every exhibit page downloaded and parsed all of
// them before showing a grid of cards. Measured on the built viewer (scripts/perf/readerrun.mjs):
// the `/sampler` route pulled 1149 KB raw / **302 KB gz** of JS, dominated by one
// `ExhibitView-*.js` chunk carrying OpenSeadragon + pixi — the canvas engine, on a page whose whole
// visible content is an object grid.
//
// This is precisely the failure `.claude/rules/archie-viewer-eager-closure.md` documents (and gates)
// for the `<archie-viewer>` embed, which does the same job in 32.9 KB gz eager. The app never got
// the same treatment.
//
// The rule that makes this work: a `{#if}` gates RENDERING, not the import graph. Only a dynamic
// `import()` moves code out of the entry chunk.

import type { Component } from "svelte";

/**
 * Memoized dynamic import of a component module.
 *
 * Returns a getter whose value is `null` until the chunk lands, then the component. The import is
 * started ONCE per loader regardless of how many times the getter is read — a bare
 * `{#await import(…)}` in markup re-invokes on every re-render, which turns a lazy chunk into a
 * per-keystroke promise churn (the module cache makes it cheap, but the re-render thrash is real).
 */
export function lazyComponent<T extends Component<never>>(load: () => Promise<{ default: T }>) {
  let mod = $state<T | null>(null);
  let started = false;
  return {
    /** Begin loading (idempotent). Safe to call from render — it never sets state synchronously. */
    preload(): void {
      if (started) return;
      started = true;
      void load().then((m) => { mod = m.default; });
    },
    /** The component once loaded, else null. Reading it also starts the load. */
    get current(): T | null {
      this.preload();
      return mod;
    },
  };
}
