// The KEYSTONE matched-pair cue, as PURE logic (extracted from App.svelte's setSections per the Phase-2
// thermo-nuclear review S-1). The leading published surface is a function of sections.length (ADR-0016
// contract): 0→1 flips the front door TO the narrative; last→0 flips it BACK to the grid. setSections is
// the one funnel for every section mutation, so it owns detecting both crossings and raising the paired cue.
// Kept plain (no runes, no localStorage, no DOM) — same idiom as library-meta-reducers.ts — so the crossing
// detection is unit-testable headless; App.svelte stays a thin dispatcher (it owns the localStorage "seen"
// flag, patchExhibit, and the $state cue vars the reducer's verdict drives).
//
// Inputs:  prev = stored sections.length BEFORE this write, next = sections.length of the incoming write,
//          seen = whether the per-exhibit FIRST-ADD cue has already been shown (localStorage flag, App-owned).
// Outputs: commit   — write the sections now? (false ONLY for last→0, which stashes pending an inline confirm)
//          cue      — which inline cue to raise ("first-add" once per exhibit | "clear" stash-confirm | null)
//          markSeen — persist the FIRST-ADD "shown" flag? (true exactly when cue === "first-add")

export interface NarrativeCueVerdict {
  /** Commit this write to ExhibitMeta.sections now. false ONLY for last→0 (stash pending the inline confirm). */
  commit: boolean;
  /** The inline cue this crossing raises, if any. */
  cue: "first-add" | "clear" | null;
  /** Persist the per-exhibit FIRST-ADD "shown" flag (true iff cue === "first-add"). */
  markSeen: boolean;
}

/** Decide the cue + commit-intent for a section-count transition. Pure: no Svelte, no storage, no DOM. */
export function narrativeCueReducer(prev: number, next: number, seen: boolean): NarrativeCueVerdict {
  // last→0: reverting the front door is consequential — DON'T commit; stash the (empty) intent and raise the
  // inline confirm strip ("Remove the last section?…"). The caller's confirm commits []; cancel discards.
  if (prev > 0 && next === 0) return { commit: false, cue: "clear", markSeen: false };
  // 0→1: the exhibit just became narrative-led. Announce the front-door flip ONCE per exhibit (the caller's
  // `seen` is the persisted flag) — markSeen at fire-time so a refresh before dismiss won't re-fire.
  if (prev === 0 && next === 1 && !seen) return { commit: true, cue: "first-add", markSeen: true };
  // Every other write (1→2, 2→1 non-last delete, edit-in-place, add-during-pending) commits silently — no cue.
  return { commit: true, cue: null, markSeen: false };
}
