import { describe, it, expect } from "vitest";
import { narrativeCueReducer } from "./narrative-cue-reducer.js";

// The PURE keystone crossing logic behind App.svelte's setSections (the flip corpus the staging strategy
// doc mandates "write FIRST"). prev/next are stored section counts; seen is the App-owned per-exhibit
// localStorage FIRST-ADD flag. The verdict drives commit (patchExhibit) + which inline cue is raised.
// App.svelte's thin dispatcher (localStorage + patchExhibit + $state) stays manual-smoke; the crossing
// detection — the one bit with adversarial cases — is unit-tested headless here.
describe("narrativeCueReducer", () => {
  it("0→1 (unseen): fires the FIRST-ADD cue once + marks it seen + commits", () => {
    expect(narrativeCueReducer(0, 1, false)).toEqual({ commit: true, cue: "first-add", markSeen: true });
  });

  it("0→1 (already seen): does NOT re-fire the cue — commits silently", () => {
    expect(narrativeCueReducer(0, 1, true)).toEqual({ commit: true, cue: null, markSeen: false });
  });

  it("1→2: no cue, commits (a later beat never re-announces the front-door flip)", () => {
    expect(narrativeCueReducer(1, 2, false)).toEqual({ commit: true, cue: null, markSeen: false });
    expect(narrativeCueReducer(1, 2, true)).toEqual({ commit: true, cue: null, markSeen: false });
  });

  it("last→0 (1→0): stashes the clear (commit:false) + raises the confirm cue — never silently clears", () => {
    expect(narrativeCueReducer(1, 0, false)).toEqual({ commit: false, cue: "clear", markSeen: false });
    expect(narrativeCueReducer(1, 0, true)).toEqual({ commit: false, cue: "clear", markSeen: false });
  });

  it("non-last delete (3→2): commits, no cue, no confirm (spec §7 — only last→0 confirms)", () => {
    expect(narrativeCueReducer(3, 2, false)).toEqual({ commit: true, cue: null, markSeen: false });
  });

  it("add-during-pending (MF-2): prev stays the REAL stored length (1, the empty was never committed), so 1→2 commits with no stale state", () => {
    // The last→0 stash never committed [], so currentExhibit.sections.length is still 1. Resolving by
    // ADDING is a 1→2 transition: commit, no cue. The dispatcher's pendingClear reset (MF-2) retires the
    // stale confirm strip; the reducer's job is to confirm this path COMMITS rather than re-stashing.
    expect(narrativeCueReducer(1, 2, true)).toEqual({ commit: true, cue: null, markSeen: false });
    expect(narrativeCueReducer(1, 2, false)).toEqual({ commit: true, cue: null, markSeen: false });
  });

  it("edit-in-place at count ≥1 (1→1): commits silently, never spuriously fires the 0→1 cue", () => {
    expect(narrativeCueReducer(1, 1, false)).toEqual({ commit: true, cue: null, markSeen: false });
  });
});
