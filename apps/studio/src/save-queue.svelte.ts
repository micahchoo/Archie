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
    return msgs.length > 0 ? msgs[msgs.length - 1] : null;
  },
  get pending(): number {
    return s.pending;
  },
};

// Per-destination tails: jobs with the same key run strictly in order (a failed job does not stall
// the chain); different keys (library.json vs an exhibit's annotations) stay concurrent.
const tails = new Map<string, Promise<unknown>>();

/**
 * Serialize `job` after all prior jobs for `key`, recording health. `label` is the human name used
 * in the error surface ("Notes", "Library details"). Resolves `true` on success, `false` on failure.
 */
export function enqueueSave(key: string, label: string, job: () => Promise<void>): Promise<boolean> {
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
      s.errors[key] = `${label} didn't save: ${err instanceof Error ? err.message : String(err)}`;
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
}
