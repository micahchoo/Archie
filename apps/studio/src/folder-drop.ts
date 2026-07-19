// Folder drag-and-drop file walker (Archie-51cc). LibraryHome's page-level "drop a folder to start"
// and the create dialog's in-surface dropzone read the SAME dropped DataTransferItemList through
// this one walker — there's exactly one place that turns `webkitGetAsEntry()` into real Files with
// a usable `webkitRelativePath` (folder-import.ts's grouping/naming logic reads
// `webkitRelativePath || name` to know which first-level subfolder a file came from; a plain
// `FileSystemFileEntry.file()` doesn't set that property the way an `<input webkitdirectory>` pick
// does, so this walker assigns it by hand). DOM-only — deliberately not unit-tested (no
// FileSystemEntry implementation in the vitest/happy-dom test env); kept small and reviewed by hand,
// same treatment as bake.ts's other browser-API-only glue.
export async function readDroppedFolderFiles(items: readonly DataTransferItem[]): Promise<File[]> {
  const entries = items.map((it) => it.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  const out: File[] = [];

  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      // webkitRelativePath is a plain own property on a File instance (not a prototype-locked
      // accessor) — this is the same technique ingest-flows.test.ts's fixtures already use
      // (`Object.assign(new File(...), { webkitRelativePath })`).
      Object.assign(file, { webkitRelativePath: `${prefix}${entry.name}` });
      out.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const readBatch = () => new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      let batch: FileSystemEntry[];
      while ((batch = await readBatch()).length > 0) {
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      }
    }
  }

  for (const e of entries) await walk(e, "");
  return out;
}
