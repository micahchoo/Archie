// Section deep-link landing (Phase 3, 4.6). A `#/<slug>/s/<sectionId>` cite (ADR-0021) lands the
// narrative spine on a Section. `sectionId` may be a stable section id OR a 1-based / 0-based numeric
// index (a hand-typed or older cite); either way an out-of-range target must FLOOR/DEGRADE to the
// nearest valid section rather than silently snapping to section 0 (which pairs the wrong prose with
// the wrong image). Pure + headless-tested; NarrativeReader/ExhibitView consume the resolved index.

/** Minimal shape this resolver needs from a Section — just its identity. */
export interface SectionRef {
  id: string;
}

/**
 * Resolve a route `sectionId` (id OR numeric index) to a valid section INDEX, or null when there are
 * no sections at all.
 *
 *  - exact id match           → that index.
 *  - a numeric string         → treated as an index. A 0-based or 1-based number that lands in range is
 *                               used as-is; OUT-OF-RANGE clamps to the nearest valid index (floor at 0,
 *                               ceil at len-1) — never wraps, never resets to 0 from the high end.
 *  - unknown id / unparsable  → null (caller keeps its current/landing default — honest "not found"
 *                               rather than a wrong snap).
 *  - empty section list       → null.
 */
export function resolveSectionIndex(sectionId: string | null | undefined, sections: readonly SectionRef[]): number | null {
  if (sections.length === 0) return null;
  if (!sectionId) return null;

  const byId = sections.findIndex((s) => s.id === sectionId);
  if (byId >= 0) return byId;

  // Numeric index fallback — a bare integer cite. Reject non-integers / NaN (an unknown id, not an index).
  const n = Number(sectionId);
  if (!Number.isInteger(n)) return null;
  // Clamp into range — the floor/degrade-to-nearest contract (out-of-range never resets to 0 from above).
  return Math.max(0, Math.min(sections.length - 1, n));
}
