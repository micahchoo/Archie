// Reading display state (P-2 / archie-ux Q-2 — the rail's model). TWO explicit states, never
// conflated (grill Q1): **visibility** = which readings' notes show (canvas AND margin — one
// projection), stored as a HIDDEN set so newly-created readings are visible by default; and
// **active** = the single reading new notes file into (§169's authoring context — the pen radio).
// Hiding a reading never changes the pen; deleting the active reading falls back to base.
// `comparing` = 2+ READINGS visible (base is the always-there substrate, it doesn't count) →
// marks render outline-only (grill Q2; the style function consumes this flag).
// A `.svelte.ts` rune module (cf. library-meta.svelte.ts): container never reassigned.
import type { Reading, AnnotationRecord } from "@render/core";

/** "base" = the unreaded substrate; otherwise a Reading id. */
export type ReadingKey = string;
export const BASE: ReadingKey = "base";

export function createReadingState() {
  const s = $state<{ hidden: Record<ReadingKey, true>; active: ReadingKey }>({ hidden: {}, active: BASE });

  const isVisible = (key: ReadingKey): boolean => s.hidden[key] !== true;

  return {
    /** The pen — where a new note files. Always a single key; never inferred from visibility. */
    get active(): ReadingKey { return s.active; },
    setActive(key: ReadingKey) { s.active = key; },

    isVisible,
    toggle(key: ReadingKey) {
      if (s.hidden[key]) delete s.hidden[key];
      else s.hidden[key] = true;
      // Deliberately NOT touching `active` (grill Q1: hide-the-active ≠ change-active — the pen
      // stays; the author may hide a reading's marks while still filing notes into it).
    },

    /** 2+ READINGS visible → the comparing optical regime (outline-only). Base doesn't count. */
    comparing(registry: Reading[]): boolean {
      return registry.filter((r) => isVisible(r.id)).length >= 2;
    },

    /** Does this record's note show under the current visibility? (Canvas + margin share this.) */
    noteVisible(rec: Pick<AnnotationRecord, "reading">): boolean {
      return isVisible(rec.reading ?? BASE);
    },

    /** The reading a NEW note files into (undefined = base, per the log's optional field). */
    newNoteReading(): string | undefined {
      return s.active === BASE ? undefined : s.active;
    },

    /** Registry changed (exhibit switch, reading deleted): prune stale keys; pen falls back to
     *  base when its reading is gone. Visibility of surviving readings is preserved. */
    reconcile(registry: Reading[]) {
      const ids = new Set<ReadingKey>([BASE, ...registry.map((r) => r.id)]);
      for (const k of Object.keys(s.hidden)) if (!ids.has(k)) delete s.hidden[k];
      if (!ids.has(s.active)) s.active = BASE;
    },

    /** Fresh exhibit: everything visible, pen on base. */
    resetForExhibit() {
      s.hidden = {};
      s.active = BASE;
    },

  };
}
export type ReadingState = ReturnType<typeof createReadingState>;
