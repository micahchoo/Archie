import type { PendingNote } from "./store.js";

export interface PendingNotesPersistenceDeps {
  load: () => Promise<Record<string, PendingNote[]>>;
  save: (map: Record<string, PendingNote[]>) => Promise<void>;
  enqueue: (key: string, label: string, job: () => Promise<void>) => Promise<boolean>;
}

/** Serialize the whole sidecar read-modify-write and keep the mutation's exhibit snapshot stable. */
export function persistPendingNotes(
  deps: PendingNotesPersistenceDeps,
  slug: string,
  notes: readonly PendingNote[],
): Promise<boolean> {
  return deps.enqueue("pending-notes", "Pending notes", async () => {
    const map = await deps.load();
    if (notes.length > 0) map[slug] = [...notes];
    else delete map[slug];
    await deps.save(map);
  });
}
