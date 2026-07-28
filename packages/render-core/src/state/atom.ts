// Ported from tldraw `packages/state/src/lib/Atom.ts` (clone a91c1d1): the class shape
// (:73-88), `get` via `maybeCaptureParent` (:143-146), and `set`'s exact ordering —
// equality-check, `advanceGlobalEpoch()`, record `lastChangedEpoch`, assign, then
// `atomDidChange` (:160-190).
//
// The ordering is the load-bearing part and is easy to get subtly wrong: the epoch must be
// advanced BEFORE `lastChangedEpoch` is stamped (or the atom stamps the pre-write epoch and
// every dependent thinks it is fresh), and `atomDidChange` must run AFTER the assignment (or a
// subscriber that re-pulls synchronously reads the old value).
//
// DROPPED: `historyBuffer` / `computeDiff` / `getDiffSince` (tldraw :118, :215-224). Those feed
// tldraw's incremental sync protocol. Archie's history is the append-only version DAG in
// `spine/` — a second, unrelated notion of "what changed" would be a liability, not a feature.

import { maybeCaptureParent, equals } from "./capture.js";
import { advanceGlobalEpoch, atomDidChange, getGlobalEpoch } from "./epoch.js";
import type { Signal } from "./types.js";

export interface AtomOptions<Value> {
  /** Replaces the default equality used to decide whether a `set` is a no-op. Supply one when
   *  the atom holds a value type whose identity is structural. */
  isEqual?(a: Value, b: Value): boolean;
}

export interface Atom<Value> extends Signal<Value> {
  /** Set the value. A value equal to the current one is a NO-OP: no epoch bump, no tick. */
  set(value: Value): Value;
  /** `set(updater(current))`, without capturing the read. */
  update(updater: (value: Value) => Value): Value;
}

class AtomImpl<Value> implements Atom<Value> {
  /** Starts at the current epoch, not `GLOBAL_START_EPOCH`: an atom has a value from birth, so
   *  it is never "new" in the sense a never-evaluated computed is. */
  lastChangedEpoch = getGlobalEpoch();

  private readonly isEqual: ((a: Value, b: Value) => boolean) | null;

  constructor(
    readonly name: string,
    private current: Value,
    options?: AtomOptions<Value>,
  ) {
    this.isEqual = options?.isEqual ?? null;
  }

  __unsafe__getWithoutCapture(_ignoreErrors?: boolean): Value {
    return this.current;
  }

  get(): Value {
    maybeCaptureParent(this as Signal<unknown>);
    return this.current;
  }

  set(value: Value): Value {
    if (this.isEqual ? this.isEqual(this.current, value) : equals(this.current, value)) {
      return this.current;
    }
    advanceGlobalEpoch();
    this.lastChangedEpoch = getGlobalEpoch();
    const previous = this.current;
    this.current = value;
    atomDidChange(this as unknown as Signal<unknown> & { set(v: unknown): unknown }, previous);
    return value;
  }

  update(updater: (value: Value) => Value): Value {
    return this.set(updater(this.current));
  }
}

/**
 * A settable reactive value — the only writable node in the graph.
 *
 * @param name debug label; not unique, not load-bearing
 * @param initialValue the value the atom is born holding
 */
export function atom<Value>(name: string, initialValue: Value, options?: AtomOptions<Value>): Atom<Value> {
  return new AtomImpl(name, initialValue, options);
}

export function isAtom(value: unknown): value is Atom<unknown> {
  return value instanceof AtomImpl;
}
