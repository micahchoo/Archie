// The save queue (worklist 0.1 "loud saves"): every persist path routes through here so writes to
// one destination serialize (no interleaved OPFS writables) and NO failure is silent — the queue is
// the single owner of save health, projected into the savestate span (App) and the project bar
// (LibraryHome). A `.svelte.ts` rune module like library-meta.svelte.ts: the $state container is
// never reassigned, so reads stay live across modules.
//
// Contract: enqueueSave NEVER throws/rejects — it returns `true` on success, `false` on failure
// (recorded in `saveStatus.error`). Callers branch on the boolean when they must not proceed
// (e.g. keep `dirty` set); fire-and-forget callers may still `void` it safely.

export type SaveHealth = "idle" | "saving" | "saved" | "error";

const s = $state<{ pending: number; everSaved: boolean; errors: Record<string, string> }>({
  pending: 0,
  everSaved: false,
  errors: {},
});

/** Reactive save health for the chrome. `error` is the most recent failure's message (null = none). */
export const saveStatus = {
  get health(): SaveHealth {
    if (s.pending > 0) return "saving";
    const msgs = Object.values(s.errors);
    if (msgs.length > 0) return "error";
    return s.everSaved ? "saved" : "idle";
  },
  get error(): string | null {
    const msgs = Object.values(s.errors);
    return msgs.length > 0 ? msgs[msgs.length - 1]! : null;
  },
  get pending(): number {
    return s.pending;
  },
};

// Per-destination tails: jobs with the same key run strictly in order (a failed job does not stall
// the chain); different keys (library.json vs an exhibit's annotations) stay concurrent.
const tails = new Map<string, Promise<unknown>>();

// Single-writer gate (ISSUES.md Issue 22 / ledgers/TABS.md). Every OPFS/folder persist routes through
// enqueueSave, so ONE gate here enforces cross-tab single-writer discipline for library.json, annotations,
// assets, AND the folder mirror: when this tab is not the writer (another tab holds the Web Lock), a
// persist is refused instead of silently overwriting the writer's edits. Injected by the writer-lock
// store so the queue stays framework-free. null = no gate (single-tab / not yet wired) → never blocks.
const READ_ONLY_KEY = "read-only";
let writerGate: (() => boolean) | null = null;
/** Install (or clear, with null) the single-writer gate. `gate()` returns true when THIS tab may write. */
export function setWriterGate(gate: (() => boolean) | null): void { writerGate = gate; }

// Archie-198c: names the tab holding the writer role in the refusal message, when known. Read via a
// getter (not a captured value) so it's live at refusal time — mirrors writer-lock.svelte.ts's own
// lazy read of the display name, one hop further down the plumbing.
let writerOtherName: (() => string | null) | null = null;
/** Install (or clear, with null) the "who holds the writer role" getter for the read-only message. */
export function setWriterOtherName(getter: (() => string | null) | null): void { writerOtherName = getter; }

/**
 * Serialize `job` after all prior jobs for `key`, recording health. `label` is the human name used
 * in the error surface ("Notes", "Library details"). Resolves `true` on success, `false` on failure.
 */
export function enqueueSave(key: string, label: string, job: () => Promise<void>): Promise<boolean> {
  // Single-writer gate: a non-writer tab is read-only — refuse the persist (never run the job) and record
  // a clear read-only status. The write is dropped ON PURPOSE, so the writer tab's edits are never
  // overwritten. Returning false lets boolean-branching callers keep `dirty` set (they'll persist once
  // this tab takes over). A gate that passes clears any stale read-only status.
  if (writerGate && !writerGate()) {
    const who = writerOtherName?.() ?? null;
    s.errors[READ_ONLY_KEY] = who
      ? `This tab is read-only — ${who} is editing this library in another tab. Choose “Take over editing” to make changes here.`
      : "This tab is read-only — another tab is editing this library. Choose “Take over editing” to make changes here.";
    return Promise.resolve(false);
  }
  delete s.errors[READ_ONLY_KEY];
  const tail = tails.get(key) ?? Promise.resolve();
  const run = tail.then(() => job());
  tails.set(key, run.catch(() => {})); // keep the chain alive past a failure
  s.pending += 1;
  return run.then(
    () => {
      delete s.errors[key];
      s.everSaved = true;
      s.pending -= 1;
      return true;
    },
    (err: unknown) => {
      console.error(`Save failed for "${key}" (${label}):`, err);
      s.errors[key] = `${label} couldn't be stored. Try again, or save your library as a new copy to be safe.`;
      s.pending -= 1;
      return false;
    },
  );
}

/** Test seam: drop status + chains (NOT for app code — the queue is a process-lifetime singleton). */
export function resetSaveQueueForTests(): void {
  s.pending = 0;
  s.everSaved = false;
  s.errors = {};
  tails.clear();
  writerGate = null;
  writerOtherName = null;
}
