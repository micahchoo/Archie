# tldraw Source Scout: Concrete Architectural Patterns

Scouted from GitHub `tldraw/tldraw` main branch, 2026-07-22.
Matches tldraw v5.x, focused on static single-user patterns only.

---

## 1. Signals Layer (`@tldraw/state`)

### Atom (~140 LOC, `packages/state/src/lib/Atom.ts`)

Core implementation:
```ts
class __Atom__<Value, Diff> {
  name: string                    // debugging label
  current: Value                  // the stored value
  lastChangedEpoch: number        // global epoch when last changed
  children: ArraySet<Child>       // computed/effects that depend on this
  historyBuffer?: HistoryBuffer   // optional: diffs for undo/change detection
  computeDiff?: ComputeDiff       // optional: how to diff old→new
  isEqual: null | ((a,b)=>boolean) // custom equality

  get(): Value {
    maybeCaptureParent(this)      // ← registers as dep in active reactive context
    return this.current
  }

  set(value: Value, diff?: Diff): Value {
    if (this.isEqual?.(this.current, value) ?? equals(this.current, value)) return
    advanceGlobalEpoch()          // bump global counter
    if (this.historyBuffer)       // optional: record diff for change detection
      this.historyBuffer.pushEntry(...)
    this.lastChangedEpoch = getGlobalEpoch()
    this.current = value
    atomDidChange(this, oldValue) // notify children
    return value
  }

  update(updater) { return this.set(updater(this.current)) }

  getDiffSince(epoch): RESET_VALUE | Diff[]  // incremental change detection
}
```

**Key design decisions:**
- `__unsafe__getWithoutCapture()` — read without subscribing. Critical for derived signals that need the value but shouldn't re-trigger on changes.
- Global epoch counter (`advanceGlobalEpoch`): every `set()` bumps a singleton counter. This is how Computed signals know if they're stale without dirty-checking values.
- HistoryBuffer: NOT the undo stack. It's per-atom change tracking so consumers can detect "what changed since my last read." Feeds `getDiffSince()`.
- Custom equality (`isEqual`): allows atoms holding objects to avoid spurious updates.

### Computed (~690 LOC, `packages/state/src/lib/Computed.ts`)

Lazy, memoized derived signals. Key implementation details:

```ts
class __UNSAFE__Computed<Value, Diff> {
  lastChangedEpoch = GLOBAL_START_EPOCH
  lastCheckedEpoch = GLOBAL_START_EPOCH   // ← epoch when last evaluated
  lastTraversedEpoch = GLOBAL_START_EPOCH // ← epoch when dep graph was walked
  parents: Signal[] = []                  // deps discovered during last capture
  parentEpochs: number[] = []             // epochs of deps at capture time
  children: ArraySet<Child>               // who depends on this

  __unsafe__getWithoutCapture(ignoreErrors?: boolean): Value {
    // CACHE HIT PATH — three conditions, any true = reuse cached:
    if (!isNew && (
      this.lastCheckedEpoch === globalEpoch ||           // same transaction
      (this.isActivelyListening && getIsReacting() &&    // in reaction, deps haven't changed
       this.lastTraversedEpoch < getReactionEpoch()) ||
      !haveParentsChanged(this)                          // no dep changed epoch
    )) {
      return this.state  // cached value, no recomputation needed
    }

    // RECOMPUTE PATH:
    startCapturingParents(this)   // begin tracking which signals get deref'd
    const result = this.derive(this.state, this.lastChangedEpoch)
    stopCapturingParents()        // finalize dependency graph
    // ... update state, check equality, notify children
  }
}
```

**Cache-hit conditions are the critical optimization:**
1. `lastCheckedEpoch === globalEpoch` — same transaction, nothing could have changed
2. Reacting + dep graph already traversed this cycle — no ancestors changed epoch
3. `haveParentsChanged(this)` — O(parents) scan comparing stored epochs vs current; if no parent's epoch advanced, value is still fresh

**UNINITIALIZED sentinel:**
```ts
const UNINITIALIZED = Symbol.for('com.tldraw.state/UNINITIALIZED')
// First parameter to derive() is UNINITIALIZED on first call, prevValue after
```
Used for incremental computation: "is this the first computation, or are we updating?"

### Transactions (~460 LOC, `packages/state/src/lib/transactions.ts`)

```ts
class Transaction {
  parent: Transaction | null    // nested transactions
  isSync: boolean
  initialAtomValues: Map<_Atom, any>  // snapshot for rollback

  commit() {
    if (globalIsReacting) {
      // During reaction: traverse changed atoms for cleanup (re-run effects)
      for (const atom of this.initialAtomValues.keys())
        traverseAtomForCleanup(atom)
    } else if (this.isRoot) {
      // Root transaction: flush changed atoms (run all effects)
      flushChanges(this.initialAtomValues.keys())
    } else {
      // Nested: merge changes up to parent transaction
      this.initialAtomValues.forEach((value, atom) => {
        if (!parent.initialAtomValues.has(atom))
          parent.initialAtomValues.set(atom, value)
      })
    }
  }

  abort() {
    globalEpoch++  // force consumers to re-evaluate
    // Restore each atom to its pre-transaction value
    this.initialAtomValues.forEach((value, atom) => atom.set(value))
    this.commit()
  }
}
```

**`transact(fn)` behavior:**
- Creates a new Transaction, pushes it as current
- Runs `fn` — all `atom.set()` calls are buffered (no effect scheduling yet)
- On success: `commit()` → `flushChanges()` → traverse dep graph, run reactors
- On throw: `abort()` → restore all atoms to pre-transaction values, then commit the restore
- `rollback` callback: same as throw but explicit

**Rollback strategy:**
- `initialAtomValues` acts as a pre-transaction snapshot of every atom touched
- On abort: iterate the map, call `atom.set(originalValue)` for each, clear history buffers
- Then commit the restore (which triggers effects with restored values)
- Guarantees complete reversal — even partial mutations inside a failed transaction are undone

### Dependency Tracking (~200 LOC, `packages/state/src/lib/capture.ts`)

```ts
class CaptureStackFrame {
  offset = 0               // how many parents captured so far this frame
  maybeRemoved?: Signal[]  // parents that changed position/removed
  below: CaptureStackFrame | null
  child: Child             // the computed/effect being captured
}
```

**The capture protocol, step by step:**

1. `startCapturingParents(child)`: push new frame, clear `child.parentSet`
2. During `derive()` execution, each `signal.get()` → `maybeCaptureParent(signal)`:
   - If already captured this evaluation: no-op
   - Otherwise: add to `parentSet`, attach signal→child edge (if child actively listening)
   - Update `child.parents[offset]` and `child.parentEpochs[offset]` with signal's current epoch
   - If the slot was previously occupied by a different parent, mark the displaced parent as `maybeRemoved`
3. `stopCapturingParents()`:
   - Any parents beyond `offset` that are no longer in `parentSet` → `detach()`
   - Any `maybeRemoved` parents not in `parentSet` → `detach()`
   - Truncate `parents` and `parentEpochs` arrays to `offset`

**Optimization:** parents array is reused across re-evaluations. Parents that remain in the same position keep their slot; new parents fill later slots; displaced parents move to `maybeRemoved`. This avoids allocating new arrays on every re-evaluation when the dependency set is stable.

### What Archie Needs (minimal signals API)

From this source analysis, the minimal API is:

| Primitive | LOC estimate | Essential |
|-----------|-------------|-----------|
| `atom(name, initialValue, options?)` | ~140 | Yes — single mutable signal |
| `computed(name, deriveFn, options?)` | ~200 (core logic) | Yes — derived state, testable without framework |
| `transact(fn)` | ~100 (core logic) | Yes — batching for bulk operations |
| Transaction class + rollback | ~150 | Yes — atomic multi-signal updates |
| `react/effect` | ~80 | No for Archie — Svelte $effect handles this |
| `HistoryBuffer` | ~80 | No — Archie has its own DAG-based history |
| `getDiffSince` / incremental diff | ~100 | No — not needed without tldraw's sync model |
| Capture system | ~200 | Yes — powers dependency tracking |
| `whyAmIRunning()` debug | ~60 | Nice-to-have |

**Total ~500-600 LOC for a minimal, Archie-appropriate signals layer.** Not 500 lines of tldraw's full system; the tldraw state package is ~2,500 LOC including tests.

---

## 2. History + RecordsDiff

### RecordsDiff (`packages/store/src/lib/RecordsDiff.ts`)

```ts
interface RecordsDiff<R extends UnknownRecord> {
  added: Record<IdOf<R>, R>                    // records created
  updated: Record<IdOf<R>, [from: R, to: R]>   // records modified (from→to tuple)
  removed: Record<IdOf<R>, R>                   // records deleted
}
```

**Key primitives:**

```ts
reverseRecordsDiff(diff) → RecordsDiff
  // added ↔ removed swap; updated [from,to] → [to,from]
  // O(updated) only — added/removed are swapped by reference

squashRecordDiffs(diffs[], {mutateFirstDiff}) → RecordsDiff
  // Combines N diffs into one. Handles:
  // - added then updated → added with final state
  // - added then removed → cancelled (neither)
  // - removed then re-added → becomes an update [original, latest]
  // - multiple updates → chained [first-from, last-to]

squashRecordDiffsMutable(target, diffs[])
  // In-place variant for performance. Performance notes in source:
  // "This runs on every history interceptor call — e.g. once per input tick
  //  while resizing N shapes, with N entries in diff.updated — so the
  //  updated loop must not allocate per entry."
```

**Performance-critical design:**
- Uses `for-in` instead of `Object.entries()` to avoid per-entry allocation
- Mutates `updated` tuples in-place (the target exclusively owns them)
- Uses `hasAnyKey()` (for-in with early return) instead of `Object.keys().length`
- Comment warns: "avoid calling this on large diffs in per-frame hot paths" — for-in still pays O(N) key-collection prologue on dictionary-mode objects

### HistoryManager Pattern (from tldraw docs + source structure)

```
HistoryManager {
  stacks = atom('stacks', { undos: stack(), redos: stack() })
  pendingDiff: PendingDiff  // accumulates store mutations between marks

  // Lifecycle:
  store.onChange(source:'user', diff) → pendingDiff.accumulate(diff)

  mark(id) → flush pendingDiff to undo stack as one entry
  undo()   → reverseRecordsDiff(top undo entry) → apply to store
  redo()   → replay diff → apply to store
  bail()   → reverseRecordsDiff(pendingDiff) → discard (no redo push)
  bailToMark(id) → undo to mark, discard changes (no redo)
  squashToMark(id) → collapse all entries since mark into one

  batch(fn) → transact wrapper, all mutations = one undo entry

  // Three modes:
  Recording                   → capture changes, clear redo stack
  RecordingPreserveRedoStack  → capture changes, keep redo stack
  Paused                      → ignore changes (during undo/redo replay)
}
```

**Key insight: the mark system.**
- Marks are named stopping points. Every user interaction begins with `mark('start-drag')`.
- Between marks, all store mutations accumulate in a `PendingDiff`.
- When the next mark or user action fires, the pending diff is flushed as ONE undo entry.
- `bailToMark(id)`: cancel an in-progress interaction — reverse and discard all changes since the mark, no redo.
- `squashToMark(id)`: collapse a multi-step operation into one undo entry (e.g. 3 nudge operations → 1 "move shape").
- `batch(fn)`: equivalent to wrapping in a mark, running fn, then squashing — one logical undo step.

### Concrete Archie Application

The RecordsDiff pattern maps surprisingly well to Archie's append-only log:

```ts
// Archie's RecordsDiff over annotations:
interface AnnotationDiff {
  added: Record<LogicalId, AnnotationRecord>
  updated: Record<LogicalId, [old: AnnotationRecord, new: AnnotationRecord]>
  removed: Record<LogicalId, AnnotationRecord>       // tombstones
}

// The key: log is immutable; diff-based undo sits ON TOP:
class AnnotationUndoManager {
  #stack: AnnotationDiff[] = []
  #pendingDiff: AnnotationDiff = emptyDiff()

  // When a note is created (pushed to log):
  onAppendNew(record: AnnotationRecord) {
    this.#pendingDiff.added[record.logicalId] = record
  }

  // On mark (e.g., user starts drawing a region):
  mark(id: string) {
    this.#stack.push(this.#pendingDiff)
    this.#pendingDiff = emptyDiff()
  }

  undo() {
    const diff = this.#stack.pop()!
    // Apply reverse: re-add deleted, re-delete added, revert updated
    // The log is never touched — this is a UI projection undo
    this.#applyReverseToUI(diff)
  }

  bail() {
    // Discard pending changes — no redo push
    const diff = this.#pendingDiff
    this.#pendingDiff = emptyDiff()
    this.#applyReverseToUI(diff)
  }
}
```

**Why this works with the append-only log:**
The log retains everything. The undo stack operates on the *projection* — what the UI shows. Undo removes a note from the projection (adds its logicalId to an exclusion set), but the log still has the record. This is the same pattern as Archie's tombstone model, just at the UI layer.

---

## 3. Priority Matrix (Updated)

| When | What | Lines | Concrete tldraw reference |
|------|------|-------|--------------------------|
| `session.ts` > 500 LOC | Signals layer | ~500 | `Atom` (140 LOC) + `Computed` core (200 LOC) + `transact` (100 LOC) + capture (60 LOC) |
| User-facing undo needed | Diff-based undo stack | ~400 | `RecordsDiff` (180 LOC) + manager (200 LOC) |
| `session.ts` > 800 LOC | Manager decomposition | refactor | 15 managers in Editor.ts, each ~100-500 LOC |
| Next schema change | Schema version in marker | ~20 | tldraw's `SerializedSchema` in every snapshot |
| 3rd annotation shape | Geometry objects | ~400 | `Geometry2d` hierarchy: 8 shape types, each ~50-150 LOC |
| Single-file export | Self-contained HTML pipeline | ~800 | `exportToSvg.tsx` — StyleEmbedder + FontEmbedder + embedMedia |

---

## 4. Verbatim Source References

All source URLs (main branch, 2026-07-22):
- Signals: `github.com/tldraw/tldraw/blob/main/packages/state/src/lib/Atom.ts` (205 lines)
- Signals: `github.com/tldraw/tldraw/blob/main/packages/state/src/lib/Computed.ts` (689 lines)
- Signals: `github.com/tldraw/tldraw/blob/main/packages/state/src/lib/transactions.ts` (458 lines)
- Signals: `github.com/tldraw/tldraw/blob/main/packages/state/src/lib/capture.ts` (179 lines)
- Store: `github.com/tldraw/tldraw/blob/main/packages/store/src/lib/RecordsDiff.ts` (181 lines)
- Editor: `github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/editor/Editor.ts` (11,805 lines — the facade)
- History docs: `tldraw.dev/sdk-features/history`
