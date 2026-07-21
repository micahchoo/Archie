// Feature flags (Archie-42f3). A flag is a localStorage boolean — the same metadata idiom as
// IDENTITY_KEY / archie.lastPlace.v1 (App.svelte), not authored content, read via persisted.ts's
// safeGet (Archie-3148). structureRevlogEnabled() reads storage live; the boot-stability that matters
// (a flip applies on the next load, so one session never runs half its writes down one code path and
// half down the other) comes from CALLERS caching the value once at startup — App.svelte's
// `STRUCTURE_REVLOG` const. New call sites must follow that pattern: read once at boot, never mid-session.
import { safeGet } from "./persisted.js";

/** The structure rev-log: section create/edit/reorder/delete/un-delete append to a rev-logged
 *  structure store (spine/structure.ts) and the working Section[] becomes a projection of it. This is
 *  the DEFAULT authoring path now (Archie-b0b1 enact — was default-off, console-only opt-in). */
export const STRUCTURE_REVLOG_KEY = "archie.structureRevlog";

/**
 * Read the flag — DEFAULT ON. The rev-log is Studio's normal section-authoring path; the flag survives
 * only as an emergency KILL-SWITCH: set `localStorage["archie.structureRevlog"] = "0"` and reload to
 * force the pre-revlog, array-only behavior (library.json stays the only structure write). Absent, any
 * value but the literal `"0"`, or a storage-denied environment all read as ON — failure falls toward
 * the shipped default, never toward the retired path.
 */
export function structureRevlogEnabled(): boolean {
  return safeGet(STRUCTURE_REVLOG_KEY) !== "0";
}
