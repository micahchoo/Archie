// Dependency capture. Ported from tldraw `packages/state/src/lib/capture.ts` (clone a91c1d1):
// the `CaptureStackFrame` + `offset` protocol (:5-14, :70-81, :100-128, :150-182) and
// `unsafe__withoutCapture` (:41-49).
//
// DIVERGENCE — no `attach`/`detach`, and therefore no `maybeRemoved`. tldraw's
// `maybeCaptureParent` (:163) attaches a back-edge when the child `isActivelyListening`, and
// `stopCapturingParents` (:104-123) exists mostly to detach parents that dropped out of the
// dependency set between evaluations. Both are push-side bookkeeping. Pull-only, a dropped
// parent needs nothing but to stop being in the array — so truncating to `offset` is the whole
// cleanup, and a computed that stops reading an atom stops being reachable from it immediately
// rather than at the next detach.
//
// The positional reuse IS kept, because it is what makes a stable dependency set allocation-free
// across re-evaluations (tldraw capture.ts:167 comment): parents that keep their slot are
// overwritten in place, so no array is reallocated per recompute.

import type { Child, Signal } from "./types.js";

class CaptureStackFrame {
  /** How many parents this evaluation has captured so far — the write cursor into
   *  `child.parents` / `child.parentEpochs`. */
  offset = 0;
  constructor(
    readonly below: CaptureStackFrame | null,
    readonly child: Child,
  ) {}
}

/** A stack, not a single value: a computed's derive can read another computed, which starts its
 *  own capture. Each frame's parents belong to its own child. */
let stack: CaptureStackFrame | null = null;

/** Begin recording which signals get read, as dependencies of `child`. @internal */
export function startCapturingParents(child: Child): void {
  stack = new CaptureStackFrame(stack, child);
  child.parentSet.clear();
}

/** Finish recording. Parents beyond the write cursor were not read this time — drop them. @internal */
export function stopCapturingParents(): void {
  const frame = stack!;
  stack = frame.below;
  if (frame.offset < frame.child.parents.length) {
    frame.child.parents.length = frame.offset;
    frame.child.parentEpochs.length = frame.offset;
  }
}

/**
 * Register `p` as a dependency of whatever is currently capturing. No-op outside a capture,
 * which is what makes `atom.get()` safe to call from ordinary code.
 *
 * MUST be called AFTER the parent is up to date, or `parentEpochs` records a stale epoch and the
 * child will believe it is fresh when it is not. `computed.get()` satisfies this by capturing in
 * a `finally` after the recompute (tldraw `Computed.ts:335-342`).
 * @internal
 */
export function maybeCaptureParent(p: Signal<unknown>): void {
  if (!stack) return;
  const child = stack.child;
  // Already read during THIS evaluation — one edge per parent, whatever the read count.
  if (child.parentSet.has(p)) return;
  child.parentSet.add(p);
  child.parents[stack.offset] = p;
  child.parentEpochs[stack.offset] = p.lastChangedEpoch;
  stack.offset++;
}

/**
 * Run `fn` with capture suspended: signals read inside do NOT become dependencies of the
 * enclosing computed. For reading a value you want without subscribing to its changes.
 */
export function unsafe__withoutCapture<T>(fn: () => T): T {
  const old = stack;
  stack = null;
  try {
    return fn();
  } finally {
    stack = old;
  }
}

/**
 * Has any parent's value changed since this child last looked at it?
 *
 * Ported from tldraw `packages/state/src/lib/helpers.ts:33-45`. The deref on each parent is not
 * incidental — a parent that is itself a computed may be stale, and `lastChangedEpoch` is only
 * trustworthy after it has recomputed. `ignoreErrors` keeps a throwing parent from surfacing its
 * error here, where we are only asking about freshness.
 * @internal
 */
export function haveParentsChanged(child: Child): boolean {
  for (let i = 0, n = child.parents.length; i < n; i++) {
    child.parents[i]!.__unsafe__getWithoutCapture(true);
    if (child.parents[i]!.lastChangedEpoch !== child.parentEpochs[i]) return true;
  }
  return false;
}

/** tldraw `helpers.ts:137-141`. `Object.is` so `NaN` settles; the `.equals` hook so a value
 *  object can declare its own identity without every atom needing a custom comparator. */
export function equals(a: unknown, b: unknown): boolean {
  return (
    a === b ||
    Object.is(a, b) ||
    Boolean(
      a && b && typeof (a as { equals?: unknown }).equals === "function" &&
        (a as { equals(other: unknown): boolean }).equals(b),
    )
  );
}
