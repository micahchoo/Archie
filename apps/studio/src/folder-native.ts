// Native (desktop) folder walker — the Tauri counterpart to folder-drop.ts (Archie-ce7a).
//
// WHY THIS EXISTS. The create dialog's folder picker is an `<input type="file" webkitdirectory>`.
// `webkitdirectory` is a Chromium/WebKit-*browser* affordance that WebKitGTK's file chooser does not
// implement, so in the packaged desktop app the control silently degrades to an ordinary single-FILE
// picker: the user picks a folder, gets one file, and the import sits at `Adding "x" 1 of 1` forever.
// The app already owns the right door — `pickTauriFolder()` (tauri-fs.ts) wraps the native directory
// dialog, and folder-backend.ts:39 is the in-repo precedent for branching on `isTauri()`. This module
// supplies the missing half: turning a native path into the same `File[]` the browser paths yield.
//
// THE CONTRACT IT MUST MATCH. folder-import.ts's grouping/naming logic reads
// `webkitRelativePath || name` to know which first-level subfolder a file came from, and
// `folderNameFrom` takes the exhibit title from the FIRST path segment. So the paths this walker
// assigns must be root-prefixed exactly as a `webkitdirectory` pick is — "MyFolder/scans/page-2.jpg",
// never "scans/page-2.jpg". The stamping itself goes through webkit-relative-path.ts, shared with the
// drop walker — do NOT assign the property directly (it throws on WebKitGTK; that module explains).
//
// MEMORY — the one place this genuinely differs from the browser, and it is deliberate.
// A browser `File` (from a drop or an <input>) is a LAZY, disk-backed Blob reference: its bytes are
// not read until something calls .arrayBuffer()/FileReader. `bridge.readFile` has no such laziness —
// it returns bytes. A naive port that read every entry would hold an entire media folder in RAM
// (a 500-photo folder at ~10 MB each is ~5 GB), which the browser path never does.
//
// The mitigation is to FILTER BEFORE READING, which is why this walker applies folder-import.ts's own
// `isHiddenPath` / `isImportableMedia` predicates during the walk instead of reading first and letting
// the planner discard afterwards. Hidden files, OS junk (.thumbnails, __MACOSX, Thumbs.db) and every
// non-media file therefore cost one readDir entry and zero bytes. What remains in memory is exactly
// the media the user asked to import — the same set the ingest is about to consume anyway.
//
// That bound is real but it is not zero: importing a genuinely huge media folder still peaks at the
// size of that media. Removing the peak entirely means teaching the ingest to take lazy descriptors
// and resolve bytes one file at a time (the `convertFileSrc` asset:// URL in tauri-fs.ts's
// `resolveUrl` is the seam for it, and the ingest already processes files sequentially). That is a
// change to the ingest contract shared by three call sites, not to this walker, so it is deliberately
// NOT done here — see Archie-ce7a. Do not "optimise" this file by reading lazily without moving that
// contract; File cannot be constructed without its bytes.
//
// PER-ENTRY TOLERANCE. Same skip-and-tally posture as folder-drop.ts: one unreadable file or one
// directory the OS refuses to enumerate skips and continues, incrementing `skipped`, never rejecting
// the whole walk. Callers fold `skipped` into the same "N couldn't be added" surfacing every other
// batch-import path in Studio uses.

import { isHiddenPath, isImportableMedia } from "./folder-import.js";
import { withRelativePath } from "./webkit-relative-path.js";

/** The slice of TauriFsBridge this walker needs — narrowed so unit tests need no Tauri runtime. */
export interface NativeFolderBridge {
  readDir(path: string): Promise<{ name: string; isDirectory: boolean }[]>;
  readFile(path: string): Promise<Uint8Array>;
}

export interface NativeFolderResult {
  files: File[];
  skipped: number;
}

/** The final segment of a native path — the picked folder's own name, which becomes the root
 *  prefix on every relative path (and hence the prefilled exhibit title). Tolerates a trailing
 *  separator and both separators, since the dialog hands back an OS-shaped path. */
export function folderNameFromPath(rootPath: string): string {
  const segs = rootPath.replace(/[/\\]+$/, "").split(/[/\\]/);
  return segs[segs.length - 1] ?? "";
}

/**
 * Walk a native directory into the `File[]` the folder-import planner already understands.
 *
 * `join` is injected because path joining is the platform's business (tauri's api/path on desktop);
 * the default is a plain "/" join, which is what the walk's own relative bookkeeping needs and what
 * the tests exercise.
 */
export async function readNativeFolderFiles(
  rootPath: string,
  bridge: NativeFolderBridge,
  join: (...parts: string[]) => string = (...parts) => parts.join("/"),
): Promise<NativeFolderResult> {
  const out: File[] = [];
  let skipped = 0;

  const root = folderNameFromPath(rootPath);

  async function walk(dirPath: string, prefix: string): Promise<void> {
    let entries: { name: string; isDirectory: boolean }[];
    try {
      entries = await bridge.readDir(dirPath);
    } catch (e) {
      // This directory is unreadable — drop just this branch, keep the rest of the walk.
      console.warn(`[folder-native] stopped reading "${prefix}" early`, e);
      skipped++;
      return;
    }
    // Sorted so the walk is deterministic across platforms; the planner sorts again by its own
    // natural-order rule, but a stable input keeps `folderNameFrom`'s "first file" honest.
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    for (const entry of sorted) {
      const relativePath = `${prefix}${entry.name}`;
      if (entry.isDirectory) {
        // Prune a hidden DIRECTORY before descending — otherwise a ".thumbnails" tree costs a readDir
        // per level to produce files the planner would discard anyway.
        if (isHiddenPath(relativePath)) continue;
        await walk(join(dirPath, entry.name), `${relativePath}/`);
        continue;
      }
      // THE FILTER THAT BOUNDS MEMORY — both predicates run before a single byte is read.
      // `type: ""` is honest: a native listing carries no MIME, so importability is decided by
      // folder-import's extension table (inferredMime). A media file with an extension outside that
      // table is skipped here where a browser might have typed it — the table is the shared
      // definition of "importable", so widening it fixes both paths at once.
      const probe = { name: entry.name, relativePath, type: "" };
      if (isHiddenPath(relativePath) || !isImportableMedia(probe)) continue;

      let bytes: Uint8Array;
      try {
        bytes = await bridge.readFile(join(dirPath, entry.name));
      } catch (e) {
        console.warn(`[folder-native] skipped unreadable file "${relativePath}"`, e);
        skipped++;
        continue;
      }
      // MUST go through withRelativePath — a bare assign throws on WebKitGTK (see that module).
      out.push(withRelativePath(new File([bytes as BlobPart], entry.name), relativePath));
    }
  }

  // The root prefix mirrors a webkitdirectory pick: every path starts with the picked folder's name.
  await walk(rootPath, root === "" ? "" : `${root}/`);
  return { files: out, skipped };
}
