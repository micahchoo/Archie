// Contract for the signals layer. Every assertion here has been red-greened against a
// deliberate injection — the injection is named in the test that catches it, so a future reader
// can reproduce rather than trust.
//
// The whole file runs under plain vitest with no DOM and no framework. That is not incidental:
// the reason this layer lives in render-core rather than render-svelte is that `heads.get()` has
// to be assertable in Node (`ledgers/LEARN-tldraw-merged-2026-07-22.md` §1a, "Testable without
// Svelte").

import { describe, it, expect } from "vitest";
import { atom, computed, transact, transaction, onEpochChange, unsafe__withoutCapture, isInTransaction, UNINITIALIZED } from "./index.js";

describe("atom", () => {
  it("holds and updates a value", () => {
    const a = atom("a", 1);
    expect(a.get()).toBe(1);
    a.set(2);
    expect(a.get()).toBe(2);
    a.update((n) => n + 10);
    expect(a.get()).toBe(12);
  });

  it("a set to an EQUAL value is a no-op — no epoch bump", () => {
    // Injection that fails this: drop the equality guard at the top of AtomImpl.set.
    const a = atom("a", 1);
    const before = a.lastChangedEpoch;
    a.set(1);
    expect(a.lastChangedEpoch).toBe(before);
    a.set(2);
    expect(a.lastChangedEpoch).toBeGreaterThan(before);
  });

  it("honours a custom isEqual", () => {
    const a = atom("pt", { x: 1 }, { isEqual: (p, q) => p.x === q.x });
    const before = a.lastChangedEpoch;
    a.set({ x: 1 }); // structurally equal, different identity
    expect(a.lastChangedEpoch).toBe(before);
  });
});

describe("computed", () => {
  it("(a) auto-invalidates when its source changes, and recomputes ONLY then", () => {
    // The headline claim. Injection that fails it: make the cache-hit condition
    // `!isNew` alone (i.e. never re-derive) — count stays 1 and the value goes stale.
    let count = 0;
    const a = atom("a", 1);
    const doubled = computed("doubled", () => {
      count += 1;
      return a.get() * 2;
    });

    expect(count).toBe(0); // lazy: not computed until read
    expect(doubled.get()).toBe(2);
    expect(count).toBe(1);

    expect(doubled.get()).toBe(2); // repeat read: cached
    expect(doubled.get()).toBe(2);
    expect(count).toBe(1);

    a.set(5);
    expect(doubled.get()).toBe(10); // invalidated by the write
    expect(count).toBe(2);
  });

  it("does NOT recompute when an unrelated atom changes", () => {
    // Exercises cache-hit condition 2 (haveParentsChanged) specifically: the global epoch HAS
    // moved, so condition 1 cannot save us. Injection that fails it: replace
    // `!haveParentsChanged(this)` with `false`.
    let count = 0;
    const mine = atom("mine", 1);
    const theirs = atom("theirs", 1);
    const c = computed("c", () => {
      count += 1;
      return mine.get();
    });
    expect(c.get()).toBe(1);
    expect(count).toBe(1);

    theirs.set(99);
    expect(c.get()).toBe(1);
    expect(count).toBe(1);
  });

  it("chains, and an unchanged intermediate value stops the cascade", () => {
    // Why the `isEqual` check before bumping lastChangedEpoch is load-bearing: `isEven` does not
    // change when 2 -> 4, so `label` must not re-run. Injection that fails it: bump
    // `lastChangedEpoch` unconditionally in the recompute path.
    let labelRuns = 0;
    const n = atom("n", 2);
    const isEven = computed("isEven", () => n.get() % 2 === 0);
    const label = computed("label", () => {
      labelRuns += 1;
      return isEven.get() ? "even" : "odd";
    });

    expect(label.get()).toBe("even");
    expect(labelRuns).toBe(1);

    n.set(4);
    expect(label.get()).toBe("even");
    expect(labelRuns).toBe(1); // isEven unchanged -> label not re-derived

    n.set(5);
    expect(label.get()).toBe("odd");
    expect(labelRuns).toBe(2);
  });

  it("tracks a dependency set that SWAPS between evaluations", () => {
    // The reason capture is dynamic rather than declared.
    //
    // NOTE WHAT THIS DOES NOT COVER, because the first draft claimed it did and was wrong.
    // Deleting the truncation in `stopCapturingParents` leaves this test GREEN (measured:
    // 21/21). The dependency COUNT here is 2 before and after, so the dropped parent is
    // overwritten in its slot by the positional write in `maybeCaptureParent` and never needs
    // truncating. Truncation only matters when the set SHRINKS — the test below.
    let runs = 0;
    const useA = atom("useA", true);
    const a = atom("a", "A");
    const b = atom("b", "B");
    const pick = computed("pick", () => {
      runs += 1;
      return useA.get() ? a.get() : b.get();
    });

    expect(pick.get()).toBe("A");
    expect(runs).toBe(1);
    b.set("B2"); // not a dependency on this branch
    expect(pick.get()).toBe("A");
    expect(runs).toBe(1);

    useA.set(false);
    expect(pick.get()).toBe("B2");
    expect(runs).toBe(2);

    a.set("A2"); // `a` is no longer a dependency
    expect(pick.get()).toBe("B2");
    expect(runs).toBe(2);
  });

  it("drops a parent when the dependency set SHRINKS", () => {
    // The truncation test the swap test above cannot be. `sum` reads 3 signals, then 2 — so
    // `b` sits past the write cursor and must be cut, not overwritten. Injection that fails it:
    // delete the `frame.offset < parents.length` truncation in stopCapturingParents; `b` stays
    // a phantom parent and the final read re-derives. Proven red-green.
    let runs = 0;
    const both = atom("both", true);
    const a = atom("a", 1);
    const b = atom("b", 10);
    const sum = computed("sum", () => {
      runs += 1;
      return both.get() ? a.get() + b.get() : a.get();
    });

    expect(sum.get()).toBe(11);
    expect(runs).toBe(1);

    both.set(false); // dependency set goes 3 -> 2
    expect(sum.get()).toBe(1);
    expect(runs).toBe(2);

    b.set(999); // no longer a dependency
    expect(sum.get()).toBe(1);
    expect(runs).toBe(2);
  });

  it("receives UNINITIALIZED as previousValue on the first run, then the previous value", () => {
    const seen: unknown[] = [];
    const a = atom("a", 1);
    const c = computed<number>("c", (prev) => {
      seen.push(prev);
      return a.get();
    });
    c.get();
    a.set(2);
    c.get();
    expect(seen[0]).toBe(UNINITIALIZED);
    expect(seen[1]).toBe(1);
  });

  it("re-throws a stashed error on every read until a dependency changes", () => {
    let runs = 0;
    const boom = atom("boom", true);
    const c = computed("c", () => {
      runs += 1;
      if (boom.get()) throw new Error("nope");
      return "ok";
    });
    expect(() => c.get()).toThrow("nope");
    expect(() => c.get()).toThrow("nope");
    expect(runs).toBe(2); // an errored computed has no cached value to serve, so it retries
    boom.set(false);
    expect(c.get()).toBe("ok");
  });

  it("unsafe__withoutCapture reads without subscribing", () => {
    let runs = 0;
    const tracked = atom("tracked", 1);
    const untracked = atom("untracked", 1);
    const c = computed("c", () => {
      runs += 1;
      return tracked.get() + unsafe__withoutCapture(() => untracked.get());
    });
    expect(c.get()).toBe(2);
    untracked.set(100);
    expect(c.get()).toBe(2); // stale ON PURPOSE — that is what withoutCapture means
    expect(runs).toBe(1);
  });
});

describe("transact", () => {
  it("(b) batches N writes into ONE subscriber tick — and laziness, not transact, is what collapses the RECOMPUTES", () => {
    // The distinction this test exists to pin, because the ledger's summary
    // ("Batched edits (transact) — multiple appends -> one recomputation") attributes the win to
    // the wrong primitive. Measured separately below:
    //   ticks     — how many times a subscriber is PROMPTED. transact collapses these: 3 -> 1.
    //   recomputes — how many times derive RUNS. Already 1 either way, because a computed is
    //                lazy and nobody read it in between.
    let ticks = 0;
    let recomputes = 0;
    const log = atom<number[]>("log", []);
    const size = computed("size", () => {
      recomputes += 1;
      return log.get().length;
    });
    const unsubscribe = onEpochChange(() => {
      ticks += 1;
    });

    try {
      log.update((l) => [...l, 1]);
      log.update((l) => [...l, 2]);
      log.update((l) => [...l, 3]);
      expect(ticks).toBe(3);
      expect(size.get()).toBe(3);
      expect(recomputes).toBe(1);

      ticks = 0;
      recomputes = 0;
      transact(() => {
        log.update((l) => [...l, 4]);
        log.update((l) => [...l, 5]);
        log.update((l) => [...l, 6]);
      });
      expect(ticks).toBe(1); // <- the batching transact actually provides
      expect(size.get()).toBe(6);
      expect(recomputes).toBe(1);
    } finally {
      unsubscribe();
    }
  });

  it("a subscriber that re-reads inside the batch sees ONE recompute, not N", () => {
    // The realistic version of the claim above: with someone actually watching, un-batched
    // writes DO cost N recomputes. This is the case a bulk import hits.
    // Injection that fails it: make transact a passthrough (`return fn()`).
    let recomputes = 0;
    const log = atom<number[]>("log", []);
    const size = computed("size", () => {
      recomputes += 1;
      return log.get().length;
    });
    const unsubscribe = onEpochChange(() => {
      size.get();
    });

    try {
      size.get();
      recomputes = 0;
      for (let i = 0; i < 5; i++) log.update((l) => [...l, i]);
      expect(recomputes).toBe(5);

      recomputes = 0;
      transact(() => {
        for (let i = 0; i < 5; i++) log.update((l) => [...l, i]);
      });
      expect(recomputes).toBe(1);
    } finally {
      unsubscribe();
    }
  });

  it("an empty transact does not tick", () => {
    let ticks = 0;
    const unsubscribe = onEpochChange(() => {
      ticks += 1;
    });
    try {
      transact(() => {});
      expect(ticks).toBe(0);
    } finally {
      unsubscribe();
    }
  });

  it("rolls every atom back when the body throws, and re-throws", () => {
    const a = atom("a", "a0");
    const b = atom("b", "b0");
    expect(() =>
      transact(() => {
        a.set("a1");
        b.set("b1");
        throw new Error("abort me");
      }),
    ).toThrow("abort me");
    expect(a.get()).toBe("a0");
    expect(b.get()).toBe("b0");
  });

  it("restores the value from BEFORE the transaction, not the previous write in it", () => {
    // Injection that fails it: drop the `if (!has(atom))` guard in atomDidChange — the snapshot
    // then records the last mid-transaction value and rollback lands on "a1".
    const a = atom("a", "a0");
    expect(() =>
      transact(() => {
        a.set("a1");
        a.set("a2");
        throw new Error("x");
      }),
    ).toThrow();
    expect(a.get()).toBe("a0");
  });

  it("an explicit rollback() reverts without throwing", () => {
    const a = atom("a", 1);
    const result = transaction((rollback) => {
      a.set(2);
      rollback();
      return "returned anyway";
    });
    expect(result).toBe("returned anyway");
    expect(a.get()).toBe(1);
  });

  it("nests: transact joins an open transaction, transaction opens an inner one", () => {
    const a = atom("a", 0);
    let ticks = 0;
    const unsubscribe = onEpochChange(() => {
      ticks += 1;
    });
    try {
      transact(() => {
        expect(isInTransaction()).toBe(true);
        a.set(1);
        transact(() => {
          a.set(2);
        });
        expect(ticks).toBe(0); // nothing has committed to the root yet
      });
      expect(ticks).toBe(1);
      expect(a.get()).toBe(2);
    } finally {
      unsubscribe();
    }
  });

  it("an inner transaction's rollback does not abort the outer one", () => {
    const a = atom("a", "a0");
    const b = atom("b", "b0");
    transact(() => {
      a.set("a1");
      transaction((rollback) => {
        b.set("b1");
        rollback();
      });
    });
    expect(a.get()).toBe("a1");
    expect(b.get()).toBe("b0");
  });

  it("an OUTER rollback undoes writes made in a committed inner transaction", () => {
    // What `commit()`'s parent-merge branch buys. Injection that fails it: drop the
    // non-root branch of Transaction.commit.
    const a = atom("a", "a0");
    expect(() =>
      transact(() => {
        transaction(() => {
          a.set("a1");
        });
        throw new Error("outer boom");
      }),
    ).toThrow("outer boom");
    expect(a.get()).toBe("a0");
  });
});

describe("onEpochChange", () => {
  it("unsubscribes, and a listener unsubscribing mid-pass does not disturb the others", () => {
    const a = atom("a", 0);
    const calls: string[] = [];
    const offOne = onEpochChange(() => {
      calls.push("one");
      offOne();
    });
    const offTwo = onEpochChange(() => {
      calls.push("two");
    });
    try {
      a.set(1);
      a.set(2);
      expect(calls).toEqual(["one", "two", "two"]);
    } finally {
      offTwo();
    }
  });

  it("a listener that writes is drained without recursing", () => {
    const a = atom("a", 0);
    const mirror = atom("mirror", 0);
    let depth = 0;
    let maxDepth = 0;
    const off = onEpochChange(() => {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
      if (mirror.get() !== a.get()) mirror.set(a.get());
      depth -= 1;
    });
    try {
      a.set(7);
      expect(mirror.get()).toBe(7);
      expect(maxDepth).toBe(1); // drained in a loop, not re-entered
    } finally {
      off();
    }
  });
});
