// Ported from tldraw `packages/state/src/lib/Computed.ts` (clone a91c1d1): the
// `UNINITIALIZED` sentinel (:29), the class fields (:212-244), and the cache-hit /
// recompute / error paths of `__unsafe__getWithoutCapture` (:267-333) with `get`'s
// capture-in-`finally` (:335-342).
//
// CACHE-HIT CONDITIONS — tldraw has three (:272-278); this has two. Dropped:
//
//     (this.isActivelyListening && getIsReacting() && this.lastTraversedEpoch < getReactionEpoch())
//
// That one is meaningful only DURING an effect flush, where the scheduler has already walked
// the graph and knows no ancestor moved. With no effect scheduler there is no reaction phase,
// so the condition could never be true — keeping it would be dead code that reads like a
// safeguard. The two that remain are the ones that do the work:
//
//   1. `lastCheckedEpoch === globalEpoch` — nothing anywhere has changed since we last looked.
//      O(1), and the common case for repeated reads inside one frame.
//   2. `!haveParentsChanged(this)` — O(parents), each a deref plus an epoch compare. Catches
//      "something changed, but not anything WE depend on".
//
// LAZINESS IS THE BATCHING. Worth stating because it is easy to attribute to the wrong
// primitive: a computed recomputes on READ, never on write, so N writes followed by one read
// cost one recompute whether or not they were wrapped in `transact`. What `transact` batches is
// the SUBSCRIBER tick (`epoch.ts` `notifyListeners`) — i.e. how many times an interested party
// is prompted to re-read. See `state.test.ts`, which measures both halves separately.

import {
  haveParentsChanged,
  maybeCaptureParent,
  startCapturingParents,
  stopCapturingParents,
  equals,
} from "./capture.js";
import { GLOBAL_START_EPOCH, getGlobalEpoch } from "./epoch.js";
import type { Child, Signal } from "./types.js";

/** Handed to `derive` as `previousValue` on the first evaluation (and after an error reset), so
 *  an incremental deriver can tell "start from scratch" from "update what you had".
 *  tldraw `Computed.ts:29`. */
export const UNINITIALIZED = Symbol.for("archie.state/UNINITIALIZED");
export type UNINITIALIZED = typeof UNINITIALIZED;

export interface ComputedOptions<Value> {
  isEqual?(a: Value, b: Value): boolean;
}

export type Computed<Value> = Signal<Value>;

class ComputedImpl<Value> implements Computed<Value>, Child {
  /** Stays at the start epoch until the first successful evaluation — that is how `isNew` is
   *  detected without a separate flag. */
  lastChangedEpoch = GLOBAL_START_EPOCH;
  /** When we last CONFIRMED the value is current — moves on a cache hit as well as a recompute.
   *  Distinct from `lastChangedEpoch`, which only moves when the value differs. */
  private lastCheckedEpoch = GLOBAL_START_EPOCH;

  parents: Signal<unknown>[] = [];
  parentEpochs: number[] = [];
  parentSet = new Set<Signal<unknown>>();

  private state: Value | UNINITIALIZED = UNINITIALIZED;
  /** A thrown error is stashed and re-thrown on every subsequent read until a parent changes —
   *  so a failing derive fails identically for every reader, rather than only the first. */
  private error: null | { thrownValue: unknown } = null;

  private readonly isEqual: (a: Value, b: Value) => boolean;

  constructor(
    readonly name: string,
    private readonly derive: (previousValue: Value | UNINITIALIZED, lastComputedEpoch: number) => Value,
    options?: ComputedOptions<Value>,
  ) {
    this.isEqual = options?.isEqual ?? ((a, b) => equals(a, b));
  }

  __unsafe__getWithoutCapture(ignoreErrors?: boolean): Value {
    const isNew = this.lastChangedEpoch === GLOBAL_START_EPOCH;
    const globalEpoch = getGlobalEpoch();

    if (!isNew && (this.lastCheckedEpoch === globalEpoch || !haveParentsChanged(this))) {
      this.lastCheckedEpoch = globalEpoch;
      if (this.error && !ignoreErrors) throw this.error.thrownValue;
      return this.state as Value;
    }

    try {
      startCapturingParents(this);
      const newState = this.derive(this.state, this.lastCheckedEpoch);
      const wasUninitialized = this.state === UNINITIALIZED;
      if (wasUninitialized || !this.isEqual(newState, this.state as Value)) {
        // Only bump on a real change: an unchanged recompute must not invalidate OUR children.
        // This is what stops a churny upstream atom from cascading through the whole graph.
        this.lastChangedEpoch = getGlobalEpoch();
        this.state = newState;
      } else if (isNew) {
        // First evaluation that happened to equal UNINITIALIZED's stand-in can't occur (the
        // branch above covers it), but a first evaluation still has to leave `isNew` false.
        this.lastChangedEpoch = getGlobalEpoch();
      }
      this.error = null;
      this.lastCheckedEpoch = getGlobalEpoch();
      return this.state as Value;
    } catch (e) {
      if (this.state !== UNINITIALIZED) {
        this.state = UNINITIALIZED;
        this.lastChangedEpoch = getGlobalEpoch();
      }
      this.lastCheckedEpoch = getGlobalEpoch();
      this.error = { thrownValue: e };
      if (!ignoreErrors) throw e;
      return this.state as Value;
    } finally {
      stopCapturingParents();
    }
  }

  get(): Value {
    try {
      return this.__unsafe__getWithoutCapture();
    } finally {
      // In `finally` so a throwing derive still registers this computed with ITS parent — else a
      // reader that catches the error would never be re-run when the error clears.
      maybeCaptureParent(this as Signal<unknown>);
    }
  }
}

/**
 * A lazily-evaluated, memoized value derived from other signals.
 *
 * Dependencies are discovered by running `derive` and watching which signals it reads, so they
 * may differ between evaluations (a branch that reads a different atom is tracked correctly).
 *
 * @param name debug label; not unique, not load-bearing
 * @param derive called with the previous value (or `UNINITIALIZED`) and the epoch at which it
 *   was computed. Must be pure with respect to signals — reading is fine, writing is not.
 */
export function computed<Value>(
  name: string,
  derive: (previousValue: Value | UNINITIALIZED, lastComputedEpoch: number) => Value,
  options?: ComputedOptions<Value>,
): Computed<Value> {
  return new ComputedImpl(name, derive, options);
}

export function isComputed(value: unknown): value is Computed<unknown> {
  return value instanceof ComputedImpl;
}

export function isUninitialized(value: unknown): value is UNINITIALIZED {
  return value === UNINITIALIZED;
}
