// The global epoch, transactions, and the one push edge this layer has.
//
// Ported from tldraw `packages/state/src/lib/transactions.ts` (clone a91c1d1):
//   - the global epoch counter and `advanceGlobalEpoch`      :74-83, :227-229
//   - `Transaction` with `initialAtomValues` as the rollback snapshot :11-72
//   - `atomDidChange`'s three-way branch                      :196-214
//   - `transaction` / `transact`                              :305-340, :367-372
//
// DIVERGENCE — the reactor half is gone. tldraw's `flushChanges` (:145) walks each changed
// atom's `children` to collect effect schedulers, with `globalIsReacting` / `cleanupReactors`
// coordinating writes that happen DURING a reaction. Archie has no effect schedulers, so
// there is nothing to traverse and the whole apparatus collapses into `notifyListeners()`
// below: one flat, un-routed "something changed" tick.
//
// That is a real trade, stated rather than hidden. A tick tells a subscriber THAT the world
// moved, never WHICH signal moved, so every subscriber re-pulls. It is the right shape here
// only because re-pulling is cheap: a computed whose parents' epochs are unchanged returns its
// cached value by reference (`computed.ts`, cache-hit path), so a subscriber that re-reads and
// finds `===` does no downstream work. If this layer ever grows N independent subscribers with
// expensive pulls, routing has to come back — and that means back-edges.

import type { Signal } from "./types.js";

/** The epoch a signal has before it has ever been computed. `atom` starts at the CURRENT epoch
 *  (it has a value immediately); `computed` starts here, which is how it recognises "never run"
 *  (tldraw `Computed.ts:268` `isNew`). */
export const GLOBAL_START_EPOCH = 0;

let globalEpoch = GLOBAL_START_EPOCH + 1;

export function getGlobalEpoch(): number {
  return globalEpoch;
}

/** Bumped by every atom write that passes the equality check. Monotonic; never reset. */
export function advanceGlobalEpoch(): void {
  globalEpoch++;
}

/** The subset of an atom this module needs. Avoids importing the class (which imports this). */
interface WritableAtom extends Signal<unknown> {
  set(value: unknown): unknown;
}

class Transaction {
  /** Pre-transaction value of every atom written inside this transaction — the rollback
   *  snapshot. First write wins, so an atom set three times still restores to its ORIGINAL. */
  readonly initialAtomValues = new Map<WritableAtom, unknown>();

  constructor(readonly parent: Transaction | null) {}

  get isRoot(): boolean {
    return this.parent === null;
  }

  commit(): void {
    if (this.isRoot) {
      // Only tick if something actually changed — an empty transact must not wake subscribers.
      if (this.initialAtomValues.size > 0) notifyListeners();
      return;
    }
    // Nested: hand our snapshot up, so an outer abort can still undo our writes. First writer
    // wins for the same reason as above — the OUTER transaction's earlier value is the older one.
    const parent = this.parent!;
    this.initialAtomValues.forEach((value, atom) => {
      if (!parent.initialAtomValues.has(atom)) parent.initialAtomValues.set(atom, value);
    });
  }

  abort(): void {
    // Tick the epoch even though we are about to restore: consumers that already read a
    // mid-transaction value must be forced to re-derive. (tldraw transactions.ts:61.)
    advanceGlobalEpoch();
    // `atom.set` re-enters `atomDidChange` with this transaction still current, but every atom
    // here is already in `initialAtomValues`, so the snapshot is not overwritten by the restore.
    this.initialAtomValues.forEach((value, atom) => {
      atom.set(value);
    });
    this.commit();
  }
}

let currentTransaction: Transaction | null = null;

// ── The push edge ──

export type EpochListener = () => void;

const listeners = new Set<EpochListener>();

/**
 * Run `fn` once after every committed change (one call per root `transact`, one per bare
 * `atom.set` outside a transaction). Returns an unsubscribe function.
 *
 * This is the seam a UI framework binds to — see `state/README` note in `index.ts`. It is
 * deliberately the ONLY push in the layer.
 */
export function onEpochChange(fn: EpochListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let notifying = false;
let notifyAgain = false;

function notifyListeners(): void {
  // Zero-subscriber fast path. Load-bearing for the spine's per-edit hot path
  // (`.claude/rules/perf-measure-the-flow.md` §3): `head-index.perf.test.ts` drives
  // `createNote` 20 000 times with nobody subscribed, and this must not allocate.
  if (listeners.size === 0) return;
  if (notifying) {
    // A listener wrote to an atom. Don't recurse — drain in the loop below instead, so the
    // stack depth is bounded no matter how many times listeners bounce off each other.
    notifyAgain = true;
    return;
  }
  notifying = true;
  try {
    do {
      notifyAgain = false;
      // Snapshot: a listener may unsubscribe itself or another during the pass.
      for (const fn of Array.from(listeners)) fn();
    } while (notifyAgain);
  } finally {
    notifying = false;
    notifyAgain = false;
  }
}

/**
 * Called by `atom.set` after the value has changed. Either records the rollback value (inside
 * a transaction, deferring the tick to commit) or ticks immediately.
 * @internal
 */
export function atomDidChange(atom: WritableAtom, previousValue: unknown): void {
  if (currentTransaction) {
    if (!currentTransaction.initialAtomValues.has(atom)) {
      currentTransaction.initialAtomValues.set(atom, previousValue);
    }
    return;
  }
  notifyListeners();
}

/**
 * Run `fn` inside a NEW transaction, nesting if one is already open.
 *
 * Every atom write inside is batched: subscribers see one tick on commit rather than one per
 * write. If `fn` throws, or calls the `rollback` callback it is passed, every atom written
 * inside is restored to the value it had when the transaction opened, and the throw propagates.
 */
export function transaction<T>(fn: (rollback: () => void) => T): T {
  const txn = new Transaction(currentTransaction);
  currentTransaction = txn;
  try {
    let rollback = false;
    let result: T;
    try {
      result = fn(() => {
        rollback = true;
      });
    } catch (e) {
      txn.abort();
      throw e;
    }
    if (currentTransaction !== txn) throw new Error("Transaction boundaries overlap");
    if (rollback) txn.abort();
    else txn.commit();
    return result;
  } finally {
    currentTransaction = txn.parent;
  }
}

/**
 * Like {@link transaction}, but joins an already-open transaction instead of nesting inside it.
 * The default choice for batching; reach for `transaction` only when you need an inner
 * rollback boundary that does not abort the outer one.
 */
export function transact<T>(fn: () => T): T {
  if (currentTransaction) return fn();
  return transaction(fn);
}

/** True while a transaction is open. For assertions and tests. */
export function isInTransaction(): boolean {
  return currentTransaction !== null;
}
