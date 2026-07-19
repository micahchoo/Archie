// Structure-log reconcile (Archie-42f3): turn the Studio's array-shaped section mutations into
// rev-log APPENDS. The editor UI hands App a whole next Section[] (NarrativeEditor.onchange —
// update/remove/move all emit the full array); with the archie.structureRevlog flag ON, this module
// diffs that array against the CURRENT log projection and appends the corresponding
// create / edit / reorder / delete / un-delete records (spine/structure.ts append family), so the
// log — not the array — is the source of record and the working Section[] becomes a projection.
//
// Pure and framework-free (headless-tested): no Svelte, no storage, no flag reads. The reactive
// owner (structure-session.svelte.ts) calls this and persists the result.
//
// Plural-head GATE (merge contract C4, same UI contract as annotations): a section with plural
// heads refuses edit/reorder/delete here — the append family would throw (appendEdit-refuses-
// plural-heads is a feature); we skip BEFORE appending and report the local ids in `gated` so the
// UI can disable affordances. Conflict RESOLUTION is the Studio-UX map's territory
// (Archie-d71c/90f1) — deliberately not built here.
import {
  appendDeleteSection,
  appendEditSection,
  appendNewSection,
  appendUndeleteSection,
  localSectionId,
  orderKeyBetween,
  projectSections,
  sectionKey,
  type ExhibitId,
  type ProjectedSection,
  type Section,
  type SectionKey,
  type SectionLog,
  type SectionStamp,
} from "@render/core";

/** The outcome of one reconcile: the (possibly unchanged) log, whether anything was appended, and
 *  the local ids whose requested change was REFUSED because the section has plural heads (gated). */
export interface ReconcileResult {
  log: SectionLog;
  /** Reference-inequality with the input log ⇔ at least one record was appended. */
  changed: boolean;
  /** Local ids whose edit/reorder/delete was skipped — unresolved concurrent heads (C4 gate). */
  gated: readonly string[];
}

/** Content equality between a desired working Section and a projected row's working shape. */
function sameContent(want: Section, have: Section): boolean {
  return (
    want.title === have.title &&
    want.objectId === have.objectId &&
    (want.start ?? undefined) === (have.start ?? undefined) &&
    (want.prose ?? undefined) === (have.prose ?? undefined)
  );
}

/**
 * Reconcile the desired working array `next` against `log`, appending the minimal record set:
 * - an id absent from the log → `appendNewSection` (fractional order key minted between neighbors)
 * - an id whose every head is a tombstone → `appendUndeleteSection` (+ an edit if content moved on)
 * - an id in the log but not in `next` → `appendDeleteSection`
 * - changed content or a changed position → ONE `appendEditSection` (a reorder is an ordinary edit
 *   of the child-carried `order` key — structure semantic #3)
 * Order keys are kept where the existing key already sorts correctly after the previous item
 * (minimal churn: a single ▲/▼ move appends one edit, not N).
 * Idempotent: reconciling a projection back against its own log appends nothing.
 */
export function reconcileSections(log: SectionLog, exhibitId: ExhibitId, next: readonly Section[], stamp: SectionStamp): ReconcileResult {
  const proj = projectSections(log, new Set<string>()); // liveObjectIds only feeds missingObject — not read here
  const rowByLocal = new Map<string, ProjectedSection>();
  const conflicted = new Set<string>();
  for (const row of proj.sections) {
    if (!rowByLocal.has(row.section.id)) rowByLocal.set(row.section.id, row); // first row (sorted) represents a plural-head key
    if (row.conflicted) conflicted.add(row.section.id);
  }
  const tombstonedLocals = new Set<string>();
  for (const key of proj.tombstoned) tombstonedLocals.add(localSectionId(key));

  const gated: string[] = [];
  let out = log;

  // Deletes: live in the log, absent from `next`. Conflicted keys are gated (C4), not tombstoned.
  const nextIds = new Set(next.map((s) => s.id));
  for (const [local, row] of rowByLocal) {
    if (nextIds.has(local)) continue;
    if (conflicted.has(local)) {
      gated.push(local);
      continue;
    }
    out = appendDeleteSection(out, row.key, stamp).log;
  }

  // Creates / un-deletes / edits / reorders, walking `next` in display order and assigning
  // ascending fractional keys greedily (keep an existing key whenever it already fits).
  const seen = new Set<string>();
  let lastKey: string | null = null;
  for (let i = 0; i < next.length; i++) {
    const want = next[i]!;
    if (seen.has(want.id)) continue; // defensive: a duplicated id reconciles once
    seen.add(want.id);

    if (conflicted.has(want.id)) {
      // GATED (plural heads): no append of any kind. Its existing key still occupies the order
      // space — advance the cursor past it when it sorts forward, so neighbors aren't squeezed
      // into reassignments the gate then can't honor.
      gated.push(want.id);
      const cur = rowByLocal.get(want.id);
      if (cur && (lastKey === null || cur.order > lastKey)) lastKey = cur.order;
      continue;
    }

    // The upper bound for a minted key: the nearest LATER item that will keep its existing key
    // (the smallest existing order among remaining items that sorts after the cursor).
    let upper: string | null = null;
    for (let j = i + 1; j < next.length; j++) {
      const later = rowByLocal.get(next[j]!.id);
      if (later && (lastKey === null || later.order > lastKey) && (upper === null || later.order < upper)) upper = later.order;
    }

    if (tombstonedLocals.has(want.id)) {
      // Un-delete (semantic #6): ONE lossless append restores the tombstone-carried content; a
      // follow-up edit below only lands if the desired content/position moved on since.
      const key = sectionKey(exhibitId, want.id);
      out = appendUndeleteSection(out, key, stamp).log;
      const restored = projectSections(out, new Set<string>()).sections.find((r) => r.section.id === want.id)!;
      rowByLocal.set(want.id, restored);
      tombstonedLocals.delete(want.id);
    }

    const have = rowByLocal.get(want.id);
    if (have === undefined) {
      // Create: mint a key strictly between the cursor and the next kept key.
      const order = orderKeyBetween(lastKey, upper);
      out = appendNewSection(out, {
        key: sectionKey(exhibitId, want.id),
        order,
        objectId: want.objectId,
        title: want.title,
        ...(want.start !== undefined ? { start: want.start } : {}),
        ...(want.prose !== undefined ? { prose: want.prose } : {}),
        ...stamp,
      }).log;
      lastKey = order;
      continue;
    }

    const keepKey: boolean = (lastKey === null || have.order > lastKey) && (upper === null || have.order < upper);
    const order: string = keepKey ? have.order : orderKeyBetween(lastKey, upper);
    if (!keepKey || !sameContent(want, have.section)) {
      // ONE edit append carries the full desired content (+ the new order when the position moved);
      // start/prose use the tri-state explicitly (null clears) so the log lands exactly on `want`.
      out = appendEditSection(out, have.key, {
        ...(order !== have.order ? { order } : {}),
        objectId: want.objectId,
        title: want.title,
        start: want.start ?? null,
        prose: want.prose ?? null,
        ...stamp,
      }).log;
    }
    lastKey = order;
  }

  return { log: out, changed: out !== log, gated };
}

/** The working-model view of a structure log for the Studio UI: ONE Section row per key (a
 *  plural-head key is deduped to its first projected row — deterministic, and honest via
 *  `conflicted`, which gates that row's edit affordances), plus the tombstoned-key set that drives
 *  hide-by-ancestry note filtering (spine/visibility.ts). */
export interface WorkingStructure {
  sections: Section[];
  /** Local ids with plural heads — editing is gated until resolved (resolve UI: Archie-d71c/90f1). */
  conflicted: ReadonlySet<string>;
  /** Keys whose every head is a tombstone — feed `hiddenNoteIds` for note filtering. */
  tombstoned: ReadonlySet<SectionKey>;
}

/** Project the log into the Studio's working structure (see {@link WorkingStructure}). NOTE the
 *  dedupe: `toWorkingSections` would emit one row PER plural head — duplicate `Section.id`s, which
 *  the keyed `{#each}` in NarrativeEditor (and library.json consumers) cannot hold. */
export function workingStructure(log: SectionLog, liveObjectIds: ReadonlySet<string>): WorkingStructure {
  const proj = projectSections(log, liveObjectIds);
  const sections: Section[] = [];
  const conflicted = new Set<string>();
  const emitted = new Set<string>();
  for (const row of proj.sections) {
    if (row.conflicted) conflicted.add(row.section.id);
    if (emitted.has(row.section.id)) continue;
    emitted.add(row.section.id);
    sections.push(row.section);
  }
  return { sections, conflicted, tombstoned: proj.tombstoned };
}
