// Incremental GH-Pages push: what does GitHub ALREADY have? (Archie-53e3)
//
// The publish transport uploads one `POST /git/blobs` per binary file (`ghpages.ts`), so a republish
// of an unchanged library re-uploads every tile — measured at 4,132 blob POSTs for four 6000x8000
// scans (Archie-34a2), a ~52-minute floor against GitHub's ~80-content-writes/min secondary limit.
//
// A git tree entry can reference an EXISTING blob by sha instead of carrying its bytes, and a blob's
// sha is computable locally — it is `sha1("blob " + byteLength + "\0" + bytes)`, a content address
// with no server round-trip. So: list the target branch's tree once, compare shas, and upload only
// what GitHub cannot already name.
//
// TWO DESIGN CHOICES WORTH THE WORDS, because both are about failing in the SAFE direction:
//
// 1. NO `base_tree`, and no `sha: null` deletions. The new tree is emitted COMPLETE — every published
//    path, every time — so a path that disappeared locally is simply absent from it, and a stale
//    exhibit cannot survive a republish. That is a structural guarantee rather than a bookkeeping one.
//    (It also sidesteps the create-tree API's stated behaviour that it "Returns an error if you try to
//    delete a file that does not exist" — docs.github.com/en/rest/git/trees, "Create a tree". A
//    `base_tree` + `sha: null` design has to get the delete list exactly right or the publish FAILS;
//    this one cannot get it wrong.)
//
// 2. An unreadable or TRUNCATED remote listing degrades to a full upload, never to a skip. GitHub caps
//    a recursive tree read: "The limit for the `tree` array is 100,000 entries with a maximum size of
//    7 MB when using the `recursive` parameter", and flags the cut with `truncated: true`
//    (docs.github.com/en/rest/git/trees, "Get a tree"). A truncated listing is a statement about what
//    IS there, never about what is not — reading an absence out of it would skip an upload the push
//    needed, which corrupts the published tree. Re-uploading something GitHub already has is merely
//    slow. `RemoteTreeIndex.truncated` is the flag that keeps those two outcomes apart.
//
// The same asymmetry protects the sha computation itself: a WRONG local sha can only ever fail to
// match, which re-uploads. The only way to skip an upload wrongly is a sha1 collision between two
// different byte strings, which is not a failure mode this code has to defend against.

import type { FileContent } from "./ghpages.js";

/**
 * What the target branch's tree holds, as `path -> git blob sha`.
 *
 * `truncated` means the index is INCOMPLETE: entries in `blobs` are still trustworthy (GitHub said
 * they are there), but an absent path proves nothing. Never read a "not present" conclusion from an
 * index whose `truncated` is true — `planPush` handles that for you by uploading everything.
 */
export interface RemoteTreeIndex {
  blobs: Record<string, string>;
  truncated: boolean;
}

/** An empty, trustworthy index — a branch that does not exist yet genuinely holds nothing. */
export const EMPTY_REMOTE_TREE: RemoteTreeIndex = { blobs: {}, truncated: false };

/** An index we could not read. Trustworthy about nothing, so every path uploads. */
export const UNKNOWN_REMOTE_TREE: RemoteTreeIndex = { blobs: {}, truncated: true };

/** The push plan: which paths carry bytes, which name a sha GitHub already has, which drop out. */
export interface PushDelta {
  /** Paths whose bytes GitHub does not have — or that we cannot prove it has. Sorted. */
  toUpload: string[];
  /** Paths already present remote at the identical blob sha; the tree entry references the sha. Sorted. */
  toReference: string[];
  /**
   * Paths present remote and absent locally. These are DROPPED by omission (the tree is emitted
   * complete), so this list is a report rather than an instruction — but it is the only place the
   * push can say how much a republish removed. Empty and MEANINGLESS when `truncated` is true.
   */
  toDelete: string[];
  /** True when the remote listing could not be fully read, so this is a full re-upload. */
  truncated: boolean;
}

/**
 * PURE. Decide, per path, whether the push carries bytes or names a sha.
 *
 * `local` is `path -> git blob sha` for the tree about to be published (see {@link localBlobShas}).
 */
export function planPush(local: Readonly<Record<string, string>>, remote: RemoteTreeIndex): PushDelta {
  const localPaths = Object.keys(local).sort();
  // An index we cannot trust as a statement of absence forces every path onto the upload path. Note
  // `toDelete` is emptied rather than computed: a partial remote listing would UNDER-report deletions,
  // and a plausible-looking wrong number is worse than none.
  if (remote.truncated) return { toUpload: localPaths, toReference: [], toDelete: [], truncated: true };

  const toUpload: string[] = [];
  const toReference: string[] = [];
  for (const path of localPaths) {
    if (remote.blobs[path] === local[path]) toReference.push(path);
    else toUpload.push(path);
  }
  const toDelete = Object.keys(remote.blobs).filter((path) => !(path in local)).sort();
  return { toUpload, toReference, toDelete, truncated: false };
}

const enc = new TextEncoder();

/** The raw bytes a published file will occupy: UTF-8 for text pages, decoded base64 for assets. */
function bytesOf(fc: FileContent): Uint8Array {
  if ("text" in fc) return enc.encode(fc.text);
  const bin = atob(fc.base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The git object id of a file's contents: `sha1("blob " + byteLength + "\0" + bytes)`, hex.
 *
 * This is git's own blob format (verified against `git hash-object`: `"hello world"` →
 * `95d09f2b10159347eece71399a7e2e907ea3df4f`, an empty file →
 * `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391`). github.com repositories are sha1 today; git's sha256
 * object format exists but is not what the REST API returns, so a repo-format change is the one thing
 * that would invalidate this — and it would invalidate it into re-uploading, not into skipping.
 */
export async function gitBlobSha(fc: FileContent): Promise<string> {
  const body = bytesOf(fc);
  const header = enc.encode(`blob ${body.length}\0`);
  const framed = new Uint8Array(header.length + body.length);
  framed.set(header);
  framed.set(body, header.length);
  const digest = await crypto.subtle.digest("SHA-1", framed);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * `path -> git blob sha` for a whole published tree.
 *
 * Sequential on purpose: `crypto.subtle.digest` is compute, not I/O, so fanning it out buys nothing
 * and would hold every file's framed copy in memory at once — the opposite of what a tile-heavy
 * library needs.
 */
export async function localBlobShas(files: Record<string, FileContent>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [path, fc] of Object.entries(files)) out[path] = await gitBlobSha(fc);
  return out;
}
