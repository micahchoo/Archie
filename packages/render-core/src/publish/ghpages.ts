// GH-Pages publish adapter (CONTEXT: "Publish = zip-primitive + per-host adapters"; the GH
// adapter uses the GitHub git-trees API — "replace this tree" matches our regenerated site).
// The file-tree builder is PURE + testable here; the createBlob/tree/commit/ref fetch sequence
// is a thin browser/network layer (sketched in publishToGitHub, browser-verified — not headless).
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

/** A git-trees entry: inline `content` for text, or `base64` for binary (uploaded as a blob first). */
export type GitTreeEntry =
  | { path: string; mode: "100644"; type: "blob"; content: string }
  | { path: string; mode: "100644"; type: "blob"; base64: string };

/** Build the GitHub git-trees payload (one entry per file), sorted by path for determinism. */
export function buildGitTree(files: Record<string, FileContent>): GitTreeEntry[] {
  return Object.entries(files)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, fc]) =>
      "text" in fc
        ? { path, mode: "100644", type: "blob", content: fc.text }
        : { path, mode: "100644", type: "blob", base64: fc.base64 },
    );
}

export interface GitHubTarget {
  owner: string;
  repo: string;
  branch?: string;
  /** fine-grained PAT (contents:write + pages:write) — NOT persisted (paste-each-publish, CONTEXT). */
  token: string;
}

/**
 * Push a published file tree to a GitHub Pages branch via the git-trees API: upload binary files
 * as base64 blobs (→ sha), then create tree from the base commit → create commit → update ref.
 * BROWSER/NETWORK — sketched here; verified in the browser, not headless. The pure tree-building
 * above is what the tests cover.
 */
export async function publishToGitHub(files: Record<string, FileContent>, target: GitHubTarget): Promise<{ commitUrl: string }> {
  const branch = target.branch ?? "gh-pages";
  const api = `https://api.github.com/repos/${target.owner}/${target.repo}`;
  const headers = { Authorization: `Bearer ${target.token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" };

  // Binary entries must be uploaded as blobs first (git-trees `content` is UTF-8 only); text stays inline.
  const tree = await Promise.all(
    buildGitTree(files).map(async (e) => {
      if ("content" in e) return { path: e.path, mode: e.mode, type: e.type, content: e.content };
      const blobRes = await fetch(`${api}/git/blobs`, { method: "POST", headers, body: JSON.stringify({ content: e.base64, encoding: "base64" }) });
      const sha = (await blobRes.json() as { sha: string }).sha;
      return { path: e.path, mode: e.mode, type: e.type, sha };
    }),
  );

  // 1. base ref -> base commit (tolerate a fresh branch).
  const refRes = await fetch(`${api}/git/ref/heads/${branch}`, { headers });
  const baseCommitSha = refRes.ok ? (await refRes.json() as { object: { sha: string } }).object.sha : undefined;
  // 2. create the tree (replace-this-tree: no base_tree => full replacement).
  const treeRes = await fetch(`${api}/git/trees`, { method: "POST", headers, body: JSON.stringify({ tree }) });
  const treeSha = (await treeRes.json() as { sha: string }).sha;
  // 3. create the commit.
  const commitRes = await fetch(`${api}/git/commits`, {
    method: "POST", headers,
    body: JSON.stringify({ message: "Publish via Archie", tree: treeSha, ...(baseCommitSha ? { parents: [baseCommitSha] } : {}) }),
  });
  const commit = await commitRes.json() as { sha: string; html_url: string };
  // 4. point the branch at the new commit (create the ref if the branch is new).
  await fetch(`${api}/git/refs/heads/${branch}`, { method: baseCommitSha ? "PATCH" : "POST", headers, body: JSON.stringify(baseCommitSha ? { sha: commit.sha, force: true } : { ref: `refs/heads/${branch}`, sha: commit.sha }) });
  return { commitUrl: commit.html_url };
}
