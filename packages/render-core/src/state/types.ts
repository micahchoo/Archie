// Shared shapes for the signals layer. Ported from tldraw's `@tldraw/state`
// (`packages/state/src/lib/types.ts`, clone at a91c1d1), stripped to what a PULL-ONLY
// system needs.
//
// WHAT WAS DROPPED AND WHY. tldraw's `Signal` carries `children: ArraySet<Child>` and
// `getDiffSince(epoch)`; `Child` carries `isActivelyListening`. All three exist to serve
// PUSH: back-edges so a changed atom can walk down to effect schedulers
// (`transactions.ts:216 traverseAtomForCleanup` visits `atom.children`), and history
// buffers so an incremental consumer can ask what changed. Archie has neither an effect
// scheduler nor a sync protocol, so back-edges would be pure bookkeeping — and bookkeeping
// that leaks, since a back-edge keeps a dead computed reachable from a live atom.
// Staleness here is decided entirely by comparing epochs on the way UP (`haveParentsChanged`).

/** A readable reactive value. The `Value` type is covariant here by intent — a `Signal<T>` is
 *  only ever read. */
export interface Signal<Value> {
  /** Debug label. Not unique, not load-bearing. */
  readonly name: string;
  /** Read, registering this signal as a dependency of the enclosing computed (if any). */
  get(): Value;
  /**
   * Read WITHOUT registering as a dependency.
   *
   * `ignoreErrors` exists for `haveParentsChanged`, which derefs parents purely to refresh
   * their epochs and must not resurface an error it is not the consumer of
   * (tldraw `Computed.ts:328` — "we don't wish to propagate errors when derefed via
   * haveParentsChanged()").
   */
  __unsafe__getWithoutCapture(ignoreErrors?: boolean): Value;
  /** The global epoch at which this signal's value last actually CHANGED (not merely was checked). */
  readonly lastChangedEpoch: number;
}

/** A node that depends on other signals — i.e. a computed. In tldraw this is also implemented
 *  by effect schedulers; here `computed` is the only implementer. */
export interface Child {
  /** Parents in DEREF ORDER of the last evaluation. Positional: `parentEpochs[i]` is the epoch
   *  `parents[i]` carried when it was captured. */
  parents: Signal<unknown>[];
  parentEpochs: number[];
  /** Membership index over `parents`, so a repeat deref inside one evaluation is a no-op. */
  parentSet: Set<Signal<unknown>>;
}
