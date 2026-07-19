// Folder drag-and-drop file walker (Archie-51cc). LibraryHome's page-level "drop a folder to start"
// and the create dialog's in-surface dropzone read the SAME dropped DataTransferItemList through
// this one walker — there's exactly one place that turns `webkitGetAsEntry()` into real Files with
// a usable `webkitRelativePath` (folder-import.ts's grouping/naming logic reads
// `webkitRelativePath || name` to know which first-level subfolder a file came from; a plain
// `FileSystemFileEntry.file()` doesn't set that property the way an `<input webkitdirectory>` pick
// does, so this walker assigns it by hand). DOM-only — deliberately not unit-tested (no
// FileSystemEntry implementation in the vitest/happy-dom test env); kept small and reviewed by hand,
// same treatment as bake.ts's other browser-API-only glue.
//
// Per-entry tolerant (code review S1): a real drop can include an unreadable entry (permissions,
// a file removed between drag and drop, a directory the OS refuses to enumerate) — one bad entry
// must skip-and-continue, never reject the whole walk and leave the caller with an unhandled
// rejection and a silently dead drop (same skip-and-tally posture as ingest-flows.ts's per-file loops).
export async function readDroppedFolderFiles(items: readonly DataTransferItem[]): Promise<File[]> {
  const entries = items.map((it) => it.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  const out: File[] = [];

  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      let file: File;
      try {
        file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      } catch (e) {
        console.warn(`[folder-drop] skipped unreadable file "${prefix}${entry.name}"`, e);
        return;
      }
      // webkitRelativePath is a plain own property on a File instance (not a prototype-locked
      // accessor) — this is the same technique ingest-flows.test.ts's fixtures already use
      // (`Object.assign(new File(...), { webkitRelativePath })`).
      Object.assign(file, { webkitRelativePath: `${prefix}${entry.name}` });
      out.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const readBatch = () => new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      for (;;) {
        let batch: FileSystemEntry[];
        try {
          batch = await readBatch();
        } catch (e) {
          // This directory's remaining entries are unreadable — stop just this branch, keep the rest.
          console.warn(`[folder-drop] stopped reading "${prefix}${entry.name}" early`, e);
          break;
        }
        if (batch.length === 0) break;
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      }
    }
  }

  for (const e of entries) {
    try {
      await walk(e, "");
    } catch (err) {
      // Defensive: walk's own promises are already caught above, but a top-level entry must not
      // abort the rest of the drop no matter what throws.
      console.warn(`[folder-drop] skipped unreadable entry "${e.name}"`, err);
    }
  }
  return out;
}
