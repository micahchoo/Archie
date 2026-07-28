// Byte-diff between two published-file-content maps (Archie-c85f prototype: object storage,
// facilitated via `rclone sync`, not a direct Archie upload — see ledgers/PROTO-object-storage-*.md).
//
// Archie's OWN publish is always a FULL rewrite of the folder/zip/GH sinks (PublishOptions.incremental
// is a SEPARATE, folder-autosave-only hot path — site.ts:119 — that the zip/GitHub/preview paths never
// pass). Since Archie-c85f's scope cut (grilling 2026-07-26) Archie does not sync to a bucket itself;
// `rclone sync` does, diffing by its own size/etag/hash compare against the bucket. So the thing that
// determines whether a second publish avoids re-uploading gigabytes is NOT anything in this codebase's
// control flow — it's whether an untouched file's BYTES come out identical across two publishes.
// computeDelta answers exactly that question for a pair of published trees: pure, no fs, cheap to
// unit-test, and reused by the probe script (scripts/probe/object-storage-publish.mts) to report real
// changed/unchanged counts on a two-publish sequence.
import type { FileContent } from "./ghpages.js";

export interface PublishDelta {
  /** Present in `next`, absent from `prev` — rclone would upload these as new objects. */
  added: string[];
  /** Present in `prev`, absent from `next` — rclone sync would DELETE these from the bucket. */
  removed: string[];
  /** Present in both, bytes differ — rclone would re-upload these. */
  changed: string[];
  /** Present in both, bytes identical — rclone's size/hash compare skips these. */
  unchanged: string[];
}

/** Comparable representation of a FileContent — text and base64 compared on their OWN encoding, so a
 *  file that changed representation (binary <-> text) counts as changed even if the encoded strings
 *  happen to collide (they can't, given the `t:`/`b:` tag, but the tag also documents the intent). */
function encodedOf(fc: FileContent): string {
  return "text" in fc ? `t:${fc.text}` : `b:${fc.base64}`;
}

/** Diff two published-tree snapshots (path -> FileContent) as `collectFiles` returns them. */
export function computeDelta(prev: Record<string, FileContent>, next: Record<string, FileContent>): PublishDelta {
  const added: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  const remaining = new Set(Object.keys(prev));
  for (const [path, fc] of Object.entries(next)) {
    const prevFc = prev[path];
    if (prevFc === undefined) {
      added.push(path);
      continue;
    }
    remaining.delete(path);
    if (encodedOf(prevFc) === encodedOf(fc)) unchanged.push(path);
    else changed.push(path);
  }
  const removed = [...remaining];
  added.sort();
  removed.sort();
  changed.sort();
  unchanged.sort();
  return { added, removed, changed, unchanged };
}
