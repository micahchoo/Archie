// Neutral home for the published-tree snapshot the pure publish planners share (Phase 3, slice C):
// the `path -> FileContent` shape and the walker that builds it. PURE — no transport, no network —
// so delta.ts and push-delta.ts can depend on the tree's shape without importing the GitHub adapter.
// ghpages.ts re-exports both for compatibility: the barrel reaches them through its star-export, and
// deep importers of ghpages.ts keep working unchanged.
//
// Binary-aware (P2-X): JSON pages are text (inline tree `content`); imported image assets are
// binary → base64 (uploaded as git blobs, referenced by sha). collectFiles classifies by extension.

import type { FsDirectory } from "../fs/seam.js";

/** One published file: UTF-8 text (JSON pages) or base64-encoded bytes (image assets). */
export type FileContent = { text: string } | { base64: string };

const BINARY_EXT_RE = /\.(jpe?g|png|webp|avif|gif|tiff?|bmp|ico|mp4|webm|m4a|mp3|wav|ogg|pdf)$/i;

/** Base64-encode an ArrayBuffer in chunks (avoids call-stack blowups on large images). */
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/** Recursively flatten a published directory into a `path -> FileContent` map (text or base64). */
export async function collectFiles(dir: FsDirectory, prefix = ""): Promise<Record<string, FileContent>> {
  const out: Record<string, FileContent> = {};
  for await (const entry of dir.entries()) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.kind === "file") {
      const file = await dir.getFile(entry.name);
      const buf = await file.readable();
      out[path] = BINARY_EXT_RE.test(entry.name) ? { base64: toBase64(buf) } : { text: new TextDecoder().decode(buf) };
    } else {
      Object.assign(out, await collectFiles(await dir.getDirectory(entry.name), path));
    }
  }
  return out;
}
