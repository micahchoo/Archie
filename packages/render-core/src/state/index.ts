// A minimal PULL-BASED signals layer: `atom` (settable), `computed` (lazy + memoized),
// `transact` (batch + rollback), `onEpochChange` (the single push edge a UI framework binds to).
//
// Ported from tldraw's `@tldraw/state` — clone at
// `Annotators/Image/canvases-annotations-sharing/tldraw`, commit a91c1d1, `packages/state/src/lib/`.
// Each file names the tldraw file:line it took each pattern from, and — more usefully — the
// tldraw machinery it deliberately did NOT take, with the reason. The short version: everything
// that exists to serve an EFFECT SCHEDULER is gone (back-edges, attach/detach, reaction-phase
// bookkeeping, history buffers), because Archie's consumers are frameworks that already have
// their own scheduler. What remains is the epoch-comparison core.
//
// Sizes for scale: tldraw's four files are 291 + 682 + 451 + 276 = 1700 LOC (plus ArraySet,
// HistoryBuffer, EffectScheduler, helpers). This is under 500 including comments.
//
// USING IT FROM A FRAMEWORK. There is no Svelte/React adapter here and there should not be one —
// the layer stays framework-free (that is the whole reason it is in `render-core` and not
// `render-svelte`). The binding is three lines at the consumer:
//
//   let tick = $state(0);
//   $effect(() => onEpochChange(() => { tick += 1; }));   // returns the unsubscribe
//   const notes = $derived.by(() => (void tick, session.workingAnnotations()));
//
// The `computed` behind `workingAnnotations()` is what makes the coarse tick affordable: an
// unchanged read returns the SAME array reference, so a `$derived` chained off it does not
// re-run downstream work.

export { atom, isAtom, type Atom, type AtomOptions } from "./atom.js";
export {
  computed,
  isComputed,
  isUninitialized,
  UNINITIALIZED,
  type Computed,
  type ComputedOptions,
} from "./computed.js";
export {
  transact,
  transaction,
  onEpochChange,
  getGlobalEpoch,
  isInTransaction,
  type EpochListener,
} from "./epoch.js";
export { unsafe__withoutCapture } from "./capture.js";
export type { Signal } from "./types.js";
