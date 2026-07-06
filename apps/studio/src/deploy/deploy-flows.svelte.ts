// The one-motion "Publish to the web" deploy — the function the Publish button ultimately calls
// (plan Task 8). It stitches four platform seams into a single flow:
//   staging → creating-repo → pushing → enabling-pages → live URL
// Deliberately a NEW module, NOT a method on publish-flows.svelte.ts: that file (and App.svelte /
// binding-store) is being churned by Issue 11, so the deploy path keeps its own home and imports the
// engine pieces (`publishLibrary` → `MemoryFilesystem` staging, `ensureRepo` / `enablePagesFor` /
// `pagesUrlFor` REST) straight from @render/core.
//
// SEAM (how the library reaches deploy, for Task 10): `createDeployFlows({ library, projectSite })`.
// `library` is the stable `{ id, title }` (id keys the remembered-target store; title is the default
// repo name upstream can derive from). `projectSite` is the SAME projection publish-flows' private
// `projectSite()` builds — the App injects it here so media tiling / thumbnails match every other sink
// and this module never has to duplicate the browser-only tiling closures. deployToPages then keeps the
// exact Task-8 contract signature `(session, target, onProgress)`.
//
// TOKEN SAFETY (Q-12): the token lives only in `session` (in memory) and is handed to `gh_push_tree`
// as a push credential. It is NEVER written to the remembered-target store — that store holds
// `{ target, url }` only, both safe to persist and log.
//
// DESKTOP-ONLY (Q-13): the pack push is Rust (`gh_push_tree`) behind Tauri; calling this on the web
// throws a typed `push` error early. The Tauri path/fs/core modules are lazy dynamic imports (like
// tauri-fs.ts) so they never load in the browser bundle.

import { collectFiles, ensureRepo, enablePagesFor, pagesUrlFor, GitHubPublishError, type FileContent, type Filesystem } from "@render/core";
import { isTauri } from "../tauri-fs.js";
import type { DeploySession, DeployTarget, DeployProgress, DeployError } from "./types.js";

/** The seam the App (Task 10) fills: the library's stable identity plus the same site projection every
 *  other publish sink uses. `projectSite` returns the populated in-memory tree; staging flattens it. */
export interface DeploySource {
  /** Stable identity. `id` keys `archie:deploy:<id>`; `title` is the human name (default repo upstream). */
  library: { id: string; title: string };
  /** Project the authored library into the static site tree (a `MemoryFilesystem`), exactly as
   *  publish-flows' `projectSite()` does — reuses the same media tiling / thumbnail path. */
  projectSite: () => Promise<Filesystem>;
}

/** A landed deploy. `manualPagesNeeded` is set (never thrown) when the commit pushed but GitHub Pages
 *  could not be auto-enabled — the author flips it on themselves (drives the `manual-pages` state). */
export type DeployResult = { url: string; commitSha: string; manualPagesNeeded?: boolean };

/** The remembered-target keys — deliberately NOT the token/session (see TOKEN SAFETY above). */
const rememberKey = (libraryId: string) => `archie:deploy:${libraryId}`;

const KNOWN_KINDS: ReadonlySet<string> = new Set<DeployError["kind"]>([
  "auth-pending", "slow-down", "expired", "denied", "device-flow-disabled", "network", "rate-limited", "push", "gh",
]);

/** A value that already IS a typed DeployError (e.g. a `gh_push_tree` invoke rejection serialized from
 *  Rust) — pass it through untouched rather than re-wrapping and losing its `kind`/`status`. */
function isDeployError(e: unknown): e is DeployError {
  return typeof e === "object" && e !== null
    && typeof (e as { kind?: unknown }).kind === "string" && KNOWN_KINDS.has((e as { kind: string }).kind)
    && typeof (e as { message?: unknown }).message === "string";
}

function deployError(kind: DeployError["kind"], message: string, status?: number): DeployError {
  return status === undefined ? { kind, message } : { kind, message, status };
}

/** Normalize any thrown value to a typed DeployError. Already-typed rejections (Rust push errors) pass
 *  through; a GitHub REST failure maps to `gh` (carrying its status); anything else is a `push`-stage
 *  fault (local staging / fs). */
function toDeployError(e: unknown): DeployError {
  if (isDeployError(e)) return e;
  if (e instanceof GitHubPublishError) return deployError("gh", e.message, e.status);
  return deployError("push", e instanceof Error ? e.message : String(e));
}

/** base64 (from `collectFiles`, for binary assets) → bytes for the Tauri fs plugin's `writeFile`. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Write the flattened site tree into a FRESH throwaway dir under the OS temp dir via the Tauri fs
 *  plugin, and return its absolute path. `gh_push_tree` stages everything under this dir into one pack;
 *  each file's parent is `mkdir -p`'d (idempotent) before the write. Text pages write as UTF-8; binary
 *  assets (base64 in the tree) decode to bytes. */
async function stageToTempDir(files: Record<string, FileContent>): Promise<string> {
  const { tempDir, join } = await import("@tauri-apps/api/path");
  const fsp = await import("@tauri-apps/plugin-fs");
  const root = await join(await tempDir(), `archie-deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await fsp.mkdir(root, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const segments = path.split("/");
    const name = segments.pop()!;
    const dir = segments.length ? await join(root, ...segments) : root;
    await fsp.mkdir(dir, { recursive: true }); // recursive → nested + already-exists are both no-ops
    const abs = await join(dir, name);
    if ("text" in content) await fsp.writeTextFile(abs, content.text);
    else await fsp.writeFile(abs, base64ToBytes(content.base64));
  }
  return root;
}

/** Best-effort removal of the staged temp dir — a cleanup failure must never mask the deploy outcome. */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    const fsp = await import("@tauri-apps/plugin-fs");
    await fsp.remove(dir, { recursive: true });
  } catch {
    // leaving a temp dir behind is harmless; swallow so success/failure surfaces cleanly.
  }
}

/** The single-pack push (Q-13): hand the staged dir + target + token to the Rust `gh_push_tree` command,
 *  which stages, root-commits, and force-pushes `gh-pages` in one pack. Rejections are already typed
 *  DeployErrors (serialized from Rust). */
async function pushTree(dir: string, target: DeployTarget, token: string): Promise<{ commitSha: string }> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<{ commitSha: string }>("gh_push_tree", { dir, owner: target.owner, repo: target.repo, branch: target.branch, token });
}

/** Remember where this library last deployed, for the update-confirm return visit. Stores `{ target, url }`
 *  ONLY — never the token/session. */
function rememberTarget(libraryId: string, target: DeployTarget, url: string): void {
  try {
    localStorage.setItem(rememberKey(libraryId), JSON.stringify({ target, url }));
  } catch {
    // a persist failure is not worth failing a landed deploy over; the remembered target is a convenience.
  }
}

/** The remembered target for a library, or null if it has never deployed (or the store is unreadable).
 *  Task 12 (update-confirm) reads this to pre-fill the return visit. */
export function rememberedTarget(libraryId: string): { target: DeployTarget; url: string } | null {
  try {
    const raw = localStorage.getItem(rememberKey(libraryId));
    return raw ? (JSON.parse(raw) as { target: DeployTarget; url: string }) : null;
  } catch {
    return null;
  }
}

/**
 * Build the deploy half of the publish flow over a given source. Returned `deployToPages` keeps the
 * Task-8 contract signature; `session`/`target` come from the sign-in + naming steps (Tasks 9-11).
 */
export function createDeployFlows(source: DeploySource) {
  /**
   * Stage the projected library to a temp dir, ensure the repo, pack-push it, and enable Pages — then
   * return the live URL. Phases emit in order `staging → creating-repo → pushing → enabling-pages`. The
   * temp dir is cleaned up on both success and failure. A Pages-enable failure resolves with
   * `manualPagesNeeded: true` (the commit already landed) rather than throwing.
   */
  async function deployToPages(
    session: DeploySession,
    target: DeployTarget,
    onProgress: (p: DeployProgress) => void,
  ): Promise<DeployResult> {
    // Desktop-only: the pack push is Rust behind Tauri. The UI (Task 10) never routes here on web.
    if (!isTauri()) {
      throw deployError("push", "Publishing to the web is only available in the Archie desktop app.");
    }

    let tempDir: string | undefined;
    try {
      // 1. staging — project the library, flatten to a path→content map, write it to a fresh temp dir.
      onProgress({ phase: "staging" });
      const projected = await source.projectSite();
      const files = await collectFiles(await projected.root());
      tempDir = await stageToTempDir(files);

      // 2. creating-repo — create the repo if absent; 'exists' (422) is fine, we push into it.
      onProgress({ phase: "creating-repo" });
      await ensureRepo(target.owner, target.repo, session.token);

      // 3. pushing — one pack replaces gh-pages (Q-13).
      onProgress({ phase: "pushing" });
      const { commitSha } = await pushTree(tempDir, target, session.token);

      // 4. enabling-pages — best-effort; false means the commit landed but the author enables Pages.
      onProgress({ phase: "enabling-pages" });
      const pagesEnabled = await enablePagesFor(target.owner, target.repo, session.token, target.branch);

      const url = pagesUrlFor(target.owner, target.repo);
      rememberTarget(source.library.id, target, url);
      return pagesEnabled ? { url, commitSha } : { url, commitSha, manualPagesNeeded: true };
    } catch (e) {
      throw toDeployError(e);
    } finally {
      if (tempDir) await cleanupTempDir(tempDir);
    }
  }

  return { deployToPages };
}
