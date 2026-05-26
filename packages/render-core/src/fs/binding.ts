// Library-binding model (CONTEXT "Persistence = three configs behind the Q4 Filesystem seam;
// user-facing model is ONLY Playground vs Project"). This is the PURE, capability-independent core
// of invention #3 (three-persistence-configs-as-one-"Project"): the data shapes + the recent-projects
// list algebra + the tolerant localStorage (de)serialize. The BROWSER glue (showDirectoryPicker,
// IndexedDB handle store, download) lives in apps/studio/src/binding.ts — never here (this stays headless-testable).
//
// A Library always has a working copy in OPFS; a Binding records WHERE its canonical bytes live:
//   - unbound — OPFS only (this browser). (The per-exhibit "Example" model carries §115's ephemeral half.)
//   - folder  — a Chromium FSA directory: autosave-in-place, the git / GH-Pages on-ramp.
//   - file    — a `.archie.zip` on disk IS the canonical artifact ("Word-doc 2003"): Save writes it, Open picks it.
// Capability (folder vs file) is selected by the browser, NEVER exposed to the user (CONTEXT principle #5).

/** Where a Library's canonical bytes live. `unbound` = OPFS-only (this browser). */
export type BindingKind = "unbound" | "folder" | "file";

/** The Library's current canonical-location binding. */
export interface Binding {
  kind: BindingKind;
  /** Display name (folder name / file name); absent when unbound. */
  name?: string;
  /** Opaque key into the browser handle store (IndexedDB) for re-opening across sessions.
   *  Absent when unbound, or when the browser lacks FSA (zip-as-file recents = re-pick hints). */
  handleKey?: string;
}

/** A remembered project the user can return to (metadata, not content — CONTEXT carves this out as
 *  "a fine use of invisible storage"). Persisted in localStorage; folder/file only (unbound is never recent). */
export interface RecentProject {
  /** Stable dedupe id — the handleKey when one exists, else a synthetic id. */
  id: string;
  name: string;
  kind: "folder" | "file";
  /** epoch ms of last open/save. */
  lastOpened: number;
  /** True = re-openable directly (an FSA handle is stored); false = "re-pick required" (no FSA). */
  reopenable: boolean;
}

/** Max recent projects kept (older ones drop off). */
export const RECENTS_CAP = 8;

/** The user-facing label for a binding's location. Capability stays hidden — only the place shows. */
export function bindingLabel(b: Binding): string {
  if (b.kind === "unbound" || !b.name) return "This browser only";
  return b.name;
}

/** A RecentProject derived from a (bound) binding, stamped `now`. Null for an unbound binding. */
export function recentFromBinding(b: Binding, now: number): RecentProject | null {
  if (b.kind === "unbound" || !b.name) return null;
  return {
    id: b.handleKey ?? `${b.kind}:${b.name}`,
    name: b.name,
    kind: b.kind,
    lastOpened: now,
    reopenable: b.handleKey !== undefined,
  };
}

/** Insert/refresh `entry` at the front (most-recent-first), dedupe by id, cap the list. Pure. */
export function addRecent(list: RecentProject[], entry: RecentProject, cap = RECENTS_CAP): RecentProject[] {
  return [entry, ...list.filter((r) => r.id !== entry.id)].slice(0, cap);
}

/** Refresh an existing entry's `lastOpened` and move it to the front. Unchanged if id is absent. Pure. */
export function touchRecent(list: RecentProject[], id: string, now: number): RecentProject[] {
  const found = list.find((r) => r.id === id);
  if (!found) return list;
  return addRecent(list, { ...found, lastOpened: now }, RECENTS_CAP);
}

/** Drop an entry (e.g. a binding whose handle was lost and the user chose "forget"). Pure. */
export function removeRecent(list: RecentProject[], id: string): RecentProject[] {
  return list.filter((r) => r.id !== id);
}

/** Serialize the recents list for localStorage. */
export function serializeRecents(list: RecentProject[]): string {
  return JSON.stringify(list);
}

/**
 * Parse a recents list from localStorage — TOLERANT of absent/malformed/hand-edited data (the store
 * is user-visible; never throw on junk). Drops any entry missing a required field; sorts most-recent-first.
 */
export function parseRecents(raw: string | null | undefined): RecentProject[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const ok: RecentProject[] = [];
  for (const r of parsed) {
    if (
      r && typeof r === "object" &&
      typeof (r as RecentProject).id === "string" &&
      typeof (r as RecentProject).name === "string" &&
      ((r as RecentProject).kind === "folder" || (r as RecentProject).kind === "file") &&
      typeof (r as RecentProject).lastOpened === "number"
    ) {
      const e = r as RecentProject;
      ok.push({ id: e.id, name: e.name, kind: e.kind, lastOpened: e.lastOpened, reopenable: e.reopenable === true });
    }
  }
  return ok.sort((a, b) => b.lastOpened - a.lastOpened);
}
