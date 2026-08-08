// tryResolveFile — the ONE classified absent-vs-failed traversal across the read stack (Phase 1 Wave 1).
// read.ts's fsJsonSource, portable.ts's mint helpers, and working.ts's getAsset/getThumbnail each
// hand-rolled the same getDirectory→…→getFile walk with their own try/catch isNotFound. This collapses
// them onto a single seam-level primitive: ABSENT (isNotFound — the seam's canonical `no such
// (file|directory)` error or a DOMException NotFoundError) → `null`; FAILED (anything else — EACCES,
// ENOSPC, a torn body, a decode error) → rethrown unchanged, never silently read as "no data"
// (data-integrity contract #2). Callers keep their own domain decision on the null: an optional read
// returns it as-is, a hard read turns it back into the canonical absent error.

import type { Filesystem, FsFile } from "./seam.js";
import { isNotFound } from "./seam.js";

/** Walk `segments` from the filesystem root (every segment but the last via `getDirectory`, the last
 *  via `getFile`). Returns `null` iff the walk failed with an ABSENT signal; a failed (non-absent)
 *  walk error is rethrown for the caller to classify. The ONE classified traversal — readers must not
 *  hand-roll getDirectory/getFile chains with their own try/catch. */
export async function tryResolveFile(fs: Filesystem, segments: string[]): Promise<FsFile | null> {
  try {
    let dir = await fs.root();
    for (let i = 0; i < segments.length - 1; i++) dir = await dir.getDirectory(segments[i]!);
    return await dir.getFile(segments[segments.length - 1]!);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
