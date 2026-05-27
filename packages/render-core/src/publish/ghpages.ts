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
  /** fine-grained PAT — Contents: write (push the tree) + Pages: write (auto-enable Pages).
   *  NOT persisted (paste-each-publish, CONTEXT: token not stored). */
  token: string;
}

/** Coarse publish progress for the UI — media upload is the long part (one request per asset), so it
 *  carries a count; the rest is a single labelled step. */
export type PublishProgress =
  | { phase: "uploading"; done: number; total: number }
  | { phase: "committing" }
  | { phase: "enabling-pages" };

/** The outcome of a publish, used to render an honest success screen (commit landed; Pages may not be live). */
export interface GitHubPublishResult {
  commitUrl: string;
  /** Visitor-facing site address (project- vs user-site aware). */
  pagesUrl: string;
  /** True only if Pages is now serving the published branch. False ⇒ the author must enable Pages manually. */
  pagesEnabled: boolean;
}

/** A publish failure carrying a cause the author can act on (mapped from the GitHub status). */
export class GitHubPublishError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GitHubPublishError";
  }
}

/** Map a failed GitHub response to an actionable cause — token / scope / repo, never "undefined.sha". */
async function ghError(res: Response, what: string): Promise<GitHubPublishError> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  const detail = body?.message ? ` (${body.message})` : "";
  const msg =
    res.status === 401 ? "GitHub rejected the token — it's invalid or expired."
    : res.status === 403 ? "GitHub refused the request — the token may lack “Contents: write” for this repo, or you've hit a rate limit. Wait a moment and retry."
    : res.status === 404 ? "Repository not found — check the owner and name, and that the token can access it."
    : res.status === 422 ? `GitHub couldn't process the ${what}${detail}.`
    : `GitHub error creating the ${what} (HTTP ${res.status})${detail}.`;
  return new GitHubPublishError(msg, res.status);
}

/** fetch + ok-check + JSON parse; throws a mapped GitHubPublishError on any non-2xx (no silent undefined sha). */
async function ghJson<T>(url: string, init: RequestInit, what: string): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw await ghError(res, what);
  return res.json() as Promise<T>;
}

/** Run `fn` over `items` with at most `limit` in flight, preserving order. Bounded because an unbounded
 *  Promise.all over every asset trips GitHub's secondary rate limit on media-heavy libraries. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Visitor-facing Pages URL: a `{owner}.github.io` repo is a user/org site (root); any other repo is a
 *  project site at `/{repo}/`. */
export function pagesUrlFor(owner: string, repo: string): string {
  const o = owner.trim(), r = repo.trim();
  return r.toLowerCase() === `${o.toLowerCase()}.github.io` ? `https://${o}.github.io/` : `https://${o}.github.io/${r}/`;
}

/** In-flight blob uploads — bounded to stay under GitHub's secondary rate limit. */
const BLOB_CONCURRENCY = 6;

/**
 * Push a published file tree to a GitHub Pages branch via the git-trees API: upload binary files as
 * base64 blobs (bounded concurrency → sha), create tree from the base commit → commit → update ref,
 * then best-effort enable Pages. Every network step ok-checks and throws a mapped cause on failure.
 * `onProgress` (optional) reports the long media-upload phase plus the commit/Pages steps for the UI.
 * BROWSER/NETWORK — verified in the browser, not headless. The pure tree-building above is unit-tested;
 * the sequence + error mapping are covered with a mocked fetch.
 */
export async function publishToGitHub(
  files: Record<string, FileContent>,
  target: GitHubTarget,
  onProgress?: (p: PublishProgress) => void,
): Promise<GitHubPublishResult> {
  const branch = target.branch ?? "gh-pages";
  const api = `https://api.github.com/repos/${target.owner}/${target.repo}`;
  const headers = { Authorization: `Bearer ${target.token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" };

  // Binary entries upload as blobs first (git-trees `content` is UTF-8 only); text stays inline.
  const entries = buildGitTree(files);
  const total = entries.filter((e) => "base64" in e).length; // only binaries are uploaded; text is inline.
  let done = 0;
  if (total > 0) onProgress?.({ phase: "uploading", done, total });
  const tree = await mapWithConcurrency(entries, BLOB_CONCURRENCY, async (e) => {
    if ("content" in e) return { path: e.path, mode: e.mode, type: e.type, content: e.content };
    const { sha } = await ghJson<{ sha: string }>(`${api}/git/blobs`, { method: "POST", headers, body: JSON.stringify({ content: e.base64, encoding: "base64" }) }, "image upload");
    onProgress?.({ phase: "uploading", done: ++done, total });
    return { path: e.path, mode: e.mode, type: e.type, sha };
  });
  onProgress?.({ phase: "committing" });

  // 1. base ref -> base commit. A missing branch (404) is fine (fresh branch); other failures are real.
  const refRes = await fetch(`${api}/git/ref/heads/${branch}`, { headers });
  if (!refRes.ok && refRes.status !== 404) throw await ghError(refRes, "branch lookup");
  const baseCommitSha = refRes.ok ? (await refRes.json() as { object: { sha: string } }).object.sha : undefined;
  // 2. create the tree (replace-this-tree: no base_tree => full replacement).
  const { sha: treeSha } = await ghJson<{ sha: string }>(`${api}/git/trees`, { method: "POST", headers, body: JSON.stringify({ tree }) }, "file tree");
  // 3. create the commit.
  const commit = await ghJson<{ sha: string; html_url: string }>(`${api}/git/commits`, {
    method: "POST", headers,
    body: JSON.stringify({ message: "Publish via Archie", tree: treeSha, ...(baseCommitSha ? { parents: [baseCommitSha] } : {}) }),
  }, "commit");
  // 4. point the branch at the new commit (create the ref if the branch is new).
  await ghJson(`${api}/git/refs/heads/${branch}`, {
    method: baseCommitSha ? "PATCH" : "POST", headers,
    body: JSON.stringify(baseCommitSha ? { sha: commit.sha, force: true } : { ref: `refs/heads/${branch}`, sha: commit.sha }),
  }, "branch update");
  // 5. best-effort: enable Pages (deploy-from-branch). The commit ALREADY landed, so a Pages failure
  //    (missing Pages scope, org policy, private-repo entitlement) must NOT fail the publish — report it.
  onProgress?.({ phase: "enabling-pages" });
  const pagesEnabled = await enablePages(api, headers, branch);
  return { commitUrl: commit.html_url, pagesUrl: pagesUrlFor(target.owner, target.repo), pagesEnabled };
}

/** Turn on GitHub Pages for the published branch, but NEVER touch an existing Pages config: if the repo
 *  already serves Pages from a *different* branch (e.g. a docs site on `main`), we leave it alone and
 *  return false (the author decides) rather than silently repointing it. Returns true only if Pages is
 *  now — or already was — serving the branch we published; false otherwise (incl. no Pages scope/policy). */
async function enablePages(api: string, headers: Record<string, string>, branch: string): Promise<boolean> {
  // Already configured? (200) — only "on" for us if it already serves OUR branch. Don't repoint it.
  const get = await fetch(`${api}/pages`, { headers });
  if (get.ok) {
    const cur = (await get.json().catch(() => null)) as { source?: { branch?: string } } | null;
    return cur?.source?.branch === branch;
  }
  // Not yet enabled (404) → create it for our branch. 201 created · 409 already exists ⇒ on.
  const post = await fetch(`${api}/pages`, { method: "POST", headers, body: JSON.stringify({ source: { branch, path: "/" } }) });
  return post.ok || post.status === 409;
}
