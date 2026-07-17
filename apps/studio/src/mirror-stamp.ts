// Folder-mirror generation stamp (ISSUES.md Issue 25 row (c), ledgers/MIRROR.md). The incremental
// folder mirror (binding-store.svelte.ts) rewrites only dirty exhibits and TRUSTS the rest of the
// on-disk tree — with no check that the tree is still the one Archie last wrote. An external writer
// (git checkout, a Dropbox sync, a SECOND Archie window bound to the same folder) can change the tree
// between autosaves; a blind incremental mirror then produces a mixed tree with no warning.
//
// This stamp is a cheap generation marker Archie OWNS: a fresh opaque token written into the bound
// folder after every successful mirror. Before an incremental mirror, Archie reads it back — if it no
// longer matches the token Archie last wrote, SOMETHING ELSE wrote to this folder, so the mirror must
// stop and warn instead of overwriting blind.
//
// Scope (honest): this reliably catches any writer that DISTURBS or REPLACES the stamp — most importantly
// a second Archie window (it writes its OWN token → guaranteed mismatch), plus tree-replacing tools that
// carry the stamp (a git checkout of a branch whose committed stamp differs, a Dropbox conflict copy). It
// does NOT catch an external edit that surgically changes an exhibit file while leaving this dotfile
// untouched (e.g. a git pull with the stamp git-ignored) — a full mtime scan would; that is deliberately
// out of scope for a "cheap" check. The next full resync (source of truth = the OPFS working copy) still
// self-heals the tree regardless.
import type { Filesystem } from "@render/core";

/** The dotfile that holds the generation token, at the bound folder's root. */
export const MIRROR_STAMP_FILE = ".archie-mirror.json";

/** A fresh opaque generation token (time-prefixed for debuggability, random tail for uniqueness). */
export function newMirrorToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Read the on-disk generation token. Null when absent, unreadable, or the backend has no root files
 *  (e.g. the memory/zip test seams) — a null read is treated by the caller as "can't verify", not
 *  "changed", so a backend without the stamp simply opts out of external-change detection. */
export async function readMirrorToken(fs: Filesystem): Promise<string | null> {
  try {
    const file = await (await fs.root()).getFile(MIRROR_STAMP_FILE);
    const parsed = JSON.parse(new TextDecoder().decode(await file.readable())) as { token?: unknown };
    return typeof parsed.token === "string" ? parsed.token : null;
  } catch {
    return null;
  }
}

/** Write the generation token into the bound folder. Best-effort: a backend that can't take a root file
 *  just no-ops (the mirror still works, only external-change detection is skipped). */
export async function writeMirrorToken(fs: Filesystem, token: string): Promise<void> {
  try {
    const file = await (await fs.root()).getFile(MIRROR_STAMP_FILE, { create: true });
    const w = await file.writable();
    await w.write(JSON.stringify({ v: 1, token }));
    await w.close();
  } catch {
    /* backend without a writable root file (or a transient) — skip; the mirror is unaffected */
  }
}
