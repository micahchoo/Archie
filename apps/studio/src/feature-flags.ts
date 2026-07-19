// Feature flags (Archie-42f3). A flag is a localStorage boolean read ONCE at module init — the
// same metadata idiom as IDENTITY_KEY / archie.lastPlace.v1 (App.svelte), not authored content.
// Read-once on purpose: a flag flip applies on the next load, so one session never runs half of
// its writes down one code path and half down the other.

/** The structure rev-log flag: section create/edit/reorder/delete/un-delete append to a
 *  rev-logged structure store (spine/structure.ts) and the working Section[] becomes a
 *  projection of it. DEFAULT OFF — absent/anything-but-"1" means Studio behaves byte-identically
 *  to the pre-revlog build (library.json stays the only structure write). Flip on from the
 *  console: `localStorage.setItem("archie.structureRevlog", "1")`, then reload. */
export const STRUCTURE_REVLOG_KEY = "archie.structureRevlog";

/** Read the flag (default OFF; storage-denied environments read as OFF). */
export function structureRevlogEnabled(): boolean {
  try {
    return localStorage.getItem(STRUCTURE_REVLOG_KEY) === "1";
  } catch {
    return false; // private mode / no storage — the flag simply stays off
  }
}
