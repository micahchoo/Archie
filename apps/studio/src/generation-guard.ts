// The folder generation-guard protocol (ISSUES.md Issue 25 row (c), docs/state/MIRROR.md). TWO stores
// guard against out-of-band folder writers — the binding mirror (binding-store.svelte.ts, an incremental
// mirror into a user-picked folder) and the resident working store (resident-store.ts, a native desktop
// folder authored in place) — with the SAME three-step protocol over mirror-stamp.ts's opaque token:
//
//   1. adopt-baseline — the on-disk token becomes the session baseline (or a fresh one is stamped).
//   2. verify-before-commit — before an INCREMENTAL write that trusts the rest of the tree, re-read the
//      on-disk token; a definite mismatch means something else wrote the folder since Archie last did,
//      so the caller must refuse rather than blind-overwrite.
//   3. re-stamp-after-write — after a SUCCESSFUL write, stamp a fresh token and adopt it: Archie has
//      reclaimed the folder, so the next commit's check passes.
//
// One documented baseline decision covers the two call sites' asymmetry:
//   • resident-store ADOPTS the on-disk token at MOUNT (before any write) — its very first commit can be
//     incremental (a single library.json), so it trusts the pre-existing tree immediately and the
//     baseline must exist from commit #1.
//   • binding-store RESETS the baseline at BIND and only establishes it by re-stamping after the first
//     FULL write — its first mirror of a session is always a full resync that overwrites the whole tree
//     anyway, so there is no pre-existing tree to protect; verification starts once Archie's own first
//     write is on disk.
// Both are the same rule — "the baseline is the last state Archie KNOWS it wrote or adopted" — differing
// only in when a trustworthy baseline exists.
//
// The guard is a plain (non-rune) state holder for the session baseline token. The fs is passed per
// operation, not held, because both stores resolve the folder dynamically (binding re-acquisition after a
// dead handle, the resident mount). Null semantics come from mirror-stamp: a null baseline or an
// unreadable on-disk token means "can't verify", never "changed", so a backend without the stamp opts out.
import { readMirrorToken, writeMirrorToken, newMirrorToken } from "./mirror-stamp.js";
import type { Filesystem } from "@render/core";

export interface GenerationGuard {
  /** Drop the session baseline (fresh binding / mount). Verification opts out (returns false) until the
   *  baseline is re-established by adoptBaseline or restamp. */
  reset(): void;
  /** Mount-time: ADOPT the on-disk token as the session baseline, or stamp a fresh one if absent. */
  adoptBaseline(fs: Filesystem): Promise<void>;
  /** True iff the folder's on-disk token no longer matches the session baseline — an out-of-band writer
   *  touched the folder since Archie last wrote/adopted it. Null baseline or unreadable token → false. */
  verify(fs: Filesystem): Promise<boolean>;
  /** Post-write: stamp a fresh token and adopt it (Archie reclaimed the folder), so the next verify
   *  passes. The caller runs this after a SUCCESSFUL write only. */
  restamp(fs: Filesystem): Promise<void>;
}

export function createGenerationGuard(): GenerationGuard {
  let baseline: string | null = null; // the token Archie last wrote/adopted this session (null = none yet)
  return {
    reset() { baseline = null; },
    async adoptBaseline(fs) {
      const onDisk = await readMirrorToken(fs);
      if (onDisk) { baseline = onDisk; return; }
      baseline = newMirrorToken();
      await writeMirrorToken(fs, baseline);
    },
    async verify(fs) {
      if (baseline === null) return false;
      const onDisk = await readMirrorToken(fs);
      return onDisk !== null && onDisk !== baseline;
    },
    async restamp(fs) {
      baseline = newMirrorToken();
      await writeMirrorToken(fs, baseline);
    },
  };
}
