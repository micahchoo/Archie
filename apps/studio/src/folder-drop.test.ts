// folder-drop.ts's own doc comment says the walker is "deliberately not unit-tested (no
// FileSystemEntry implementation in the vitest/happy-dom test env)" — true for a REAL browser
// FileSystemEntry, but readDroppedFolderFiles only ever calls a handful of duck-typed members
// (isFile/isDirectory/name/file()/createReader().readEntries()), so plain fake objects cast through
// the same DOM types the source file itself casts through exercise the real walk logic headlessly.
// Archie-bf5b: this file exists specifically to pin the `{ files, skipped }` skip-and-tally contract
// (ledgers/ANTIPATTERN-SWEEP-2026-07-19.md real defect 1) — before this ticket the walker silently
// dropped unreadable entries with no return-value signal at all.
import { describe, it, expect } from "vitest";
import { readDroppedFolderFiles } from "./folder-drop.js";

function fakeFileEntry(name: string, opts: { fail?: boolean } = {}): FileSystemEntry {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file(resolve: (f: File) => void, reject: (e: unknown) => void) {
      if (opts.fail) reject(new Error(`permission denied: ${name}`));
      else resolve(new File([new Uint8Array([0])], name, { type: "image/png" }));
    },
  } as unknown as FileSystemEntry;
}

function fakeDirEntry(name: string, children: FileSystemEntry[], opts: { failReadEntries?: boolean } = {}): FileSystemEntry {
  let delivered = false;
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader() {
      return {
        readEntries(resolve: (entries: FileSystemEntry[]) => void, reject: (e: unknown) => void) {
          if (opts.failReadEntries) {
            reject(new Error(`can't enumerate: ${name}`));
            return;
          }
          // Real FileSystemDirectoryReader.readEntries returns entries in batches, then [] to signal
          // done — one non-empty batch then [] reproduces that without a real batching implementation.
          if (delivered) { resolve([]); return; }
          delivered = true;
          resolve(children);
        },
      };
    },
  } as unknown as FileSystemEntry;
}

function fakeItem(entry: FileSystemEntry | null): DataTransferItem {
  return { webkitGetAsEntry: () => entry } as unknown as DataTransferItem;
}

describe("readDroppedFolderFiles — skip-and-tally (Archie-bf5b)", () => {
  it("returns every readable file with skipped: 0 when nothing fails", async () => {
    const items = [fakeItem(fakeFileEntry("a.png")), fakeItem(fakeFileEntry("b.png"))];
    const { files, skipped } = await readDroppedFolderFiles(items);
    expect(files.map((f) => f.name)).toEqual(["a.png", "b.png"]);
    expect(skipped).toBe(0);
  });

  it("tallies an unreadable top-level file entry instead of just dropping it", async () => {
    const items = [fakeItem(fakeFileEntry("good.png")), fakeItem(fakeFileEntry("bad.png", { fail: true }))];
    const { files, skipped } = await readDroppedFolderFiles(items);
    expect(files.map((f) => f.name)).toEqual(["good.png"]);
    expect(skipped).toBe(1);
  });

  it("tallies a directory whose readEntries() batch fails, keeping siblings already walked", async () => {
    const goodDir = fakeDirEntry("ok", [fakeFileEntry("keep.png")]);
    const badDir = fakeDirEntry("locked", [], { failReadEntries: true });
    const items = [fakeItem(goodDir), fakeItem(badDir)];
    const { files, skipped } = await readDroppedFolderFiles(items);
    expect(files.map((f) => f.name)).toEqual(["keep.png"]);
    expect(skipped).toBe(1);
  });

  it("tallies a file unreadable INSIDE a directory without losing its readable siblings", async () => {
    const dir = fakeDirEntry("mixed", [fakeFileEntry("keep.png"), fakeFileEntry("denied.png", { fail: true })]);
    const { files, skipped } = await readDroppedFolderFiles([fakeItem(dir)]);
    expect(files.map((f) => f.name)).toEqual(["keep.png"]);
    expect(skipped).toBe(1);
  });

  it("tallies a top-level entry whose walk throws outside the two guarded branches, continuing the rest of the drop", async () => {
    // The isFile/isDirectory branches each have their own try/catch, so the walker's outer
    // "defensive" catch (readDroppedFolderFiles's own comment: "walk's own promises are already
    // caught above, but a top-level entry must not abort the rest of the drop no matter what
    // throws") only fires if something outside those two branches throws — e.g. reading `isFile`
    // itself. A getter that throws is the smallest reproduction of that shape.
    const throwing = {
      name: "boom",
      get isFile(): boolean { throw new Error("entry became unreadable mid-drop"); },
      isDirectory: false,
    } as unknown as FileSystemEntry;
    const items = [fakeItem(throwing), fakeItem(fakeFileEntry("safe.png"))];
    const { files, skipped } = await readDroppedFolderFiles(items);
    expect(files.map((f) => f.name)).toEqual(["safe.png"]);
    expect(skipped).toBe(1);
  });

  it("sums multiple independent skips across a mixed drop", async () => {
    const items = [
      fakeItem(fakeFileEntry("good1.png")),
      fakeItem(fakeFileEntry("bad1.png", { fail: true })),
      fakeItem(fakeDirEntry("locked", [], { failReadEntries: true })),
      fakeItem(fakeFileEntry("good2.png")),
    ];
    const { files, skipped } = await readDroppedFolderFiles(items);
    expect(files.map((f) => f.name)).toEqual(["good1.png", "good2.png"]);
    expect(skipped).toBe(2);
  });
});
