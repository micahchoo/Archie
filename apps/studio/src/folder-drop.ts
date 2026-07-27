// Folder drag-and-drop file walker (Archie-51cc). LibraryHome's page-level "drop a folder to start"
// and the create dialog's in-surface dropzone read the SAME dropped DataTransferItemList through
// this one walker — there's exactly one place that turns `webkitGetAsEntry()` into real Files with
// a usable `webkitRelativePath` (folder-import.ts's grouping/naming logic reads
// `webkitRelativePath || name` to know which first-level subfolder a file came from; a plain
// `FileSystemFileEntry.file()` doesn't set that property the way an `<input webkitdirectory>` pick
// does, so this walker assigns it by hand). DOM-only, but unit-tested via duck-typed fakes cast
// through the same DOM types this file casts through (folder-drop.test.ts) — the walker only
// touches a handful of FileSystemEntry members, so no real browser implementation is needed.
//
// Per-entry tolerant (code review S1): a real drop can include an unreadable entry (permissions,
// a file removed between drag and drop, a directory the OS refuses to enumerate) — one bad entry
// must skip-and-continue, never reject the whole walk and leave the caller with an unhandled
// rejection and a silently dead drop (same skip-and-tally posture as ingest-flows.ts's per-file loops).
//
// Skip-and-tally (Archie-bf5b): the three catch sites below each drop an unreadable entry AND
// increment `skipped` — one count per failure *event* (an unreadable file, a directory whose
// remaining batch couldn't be read, or a top-level entry that threw), not per underlying file,
// since an unreadable directory batch doesn't reveal how many files it would have yielded. Callers
// fold `skipped` into their own "N couldn't be added" surfacing so a drag-drop failure reads the
// same as any other batch-import path in Studio.
import { withRelativePath } from "./webkit-relative-path.js";

export interface DroppedFolderResult {
  files: File[];
  skipped: number;
}

export async function readDroppedFolderFiles(items: readonly DataTransferItem[]): Promise<DroppedFolderResult> {
  const entries = items.map((it) => it.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  const out: File[] = [];
  let skipped = 0;

  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      let file: File;
      try {
        file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      } catch (e) {
        console.warn(`[folder-drop] skipped unreadable file "${prefix}${entry.name}"`, e);
        skipped++;
        return;
      }
      // webkitRelativePath goes through withRelativePath, NOT Object.assign. This comment used to
      // claim it was "a plain own property, not a prototype-locked accessor" — true in Chromium,
      // FALSE in JavaScriptCore, where an assign throws TypeError and broke this walker in the
      // packaged desktop app (Archie-ce7a). See webkit-relative-path.ts.
      out.push(withRelativePath(file, `${prefix}${entry.name}`));
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
          skipped++;
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
      skipped++;
    }
  }
  return { files: out, skipped };
}
