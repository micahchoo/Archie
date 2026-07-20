// The Studio metadata editor's entry-building logic (Archie-458e) — headless, so the pick-from-vocab
// behaviour the prototype settled (prototypes/metadata-editor, Archie-e100) is unit-testable without a
// DOM. MetadataEditor.svelte is the thin shell over these functions.
//
// The one idea that earns this module: a ROW is not an ENTRY. Rows are what the curator sees, including
// the empty scaffolding the default field set puts on screen; entries are what persists. `toEntries` is
// the only crossing, and it drops every empty row — "Empty fields aren't saved" is enforced here, not
// promised in copy.
//
// The vocabulary itself is NEVER re-declared here (fixed decision): properties, labels, the exclusion
// list and the per-level default sets all come from render-core's model/dcterms.ts.
import {
  DCTERMS_PROPERTIES,
  DEFAULT_METADATA_FIELDS,
  METADATA_EXCLUDED_PROPERTIES,
  dctermsLabel,
  type DctermsProperty,
  type MetadataEntry,
} from "@render/core";

/** The three levels that have a default field set — the same nouns DetailsEditor's `scope` uses. */
export type MetadataLevel = keyof typeof DEFAULT_METADATA_FIELDS;

/**
 * One editable row. Structurally a {@link MetadataEntry} plus a stable `id` — the `{#each}` key, so a
 * reorder moves the DOM node instead of rewriting every row's value (which would drop focus mid-edit).
 * A row may be blank; an entry may not.
 */
export interface MetadataRow {
  id: string;
  /** dcterms:-prefixed property, absent for a custom (label-only) row. */
  property?: string;
  /** Display-label override, or the sole label of a custom row. */
  label?: string;
  value: string;
}

let rowSeq = 0;
/** Mint a row id. Module-local counter — ids are ephemeral view keys, never persisted. */
export function newRowId(): string {
  rowSeq += 1;
  return `mr${rowSeq}`;
}

const row = (fields: Omit<MetadataRow, "id">): MetadataRow => ({ id: newRowId(), ...fields });

/** Narrow a DetailsEditor `scope` string to a level; anything unexpected reads as "object" (the widest
 *  default set), so a new scope noun degrades to a sensible picker rather than an empty one. */
export function levelOf(scope: string): MetadataLevel {
  return scope === "library" || scope === "exhibit" ? scope : "object";
}

/** The label to show for a row: an override wins, else the vocabulary's preferred label, else the raw
 *  property (an unknown `dcterms:` name reads as itself rather than silently becoming "Field"). */
export function displayLabelOf(r: Pick<MetadataRow, "property" | "label">): string {
  const override = r.label?.trim();
  if (override) return override;
  if (r.property) return dctermsLabel(r.property) ?? r.property;
  return "Field";
}

/** The row's persisted `label`, or undefined when there is nothing to persist: blank, or (for a vocab
 *  row) merely a restatement of the vocabulary's own label. Keeps a no-op "override" out of the store. */
export function overrideLabelOf(r: Pick<MetadataRow, "property" | "label">): string | undefined {
  const override = r.label?.trim();
  if (!override) return undefined;
  if (r.property) {
    const preferred = dctermsLabel(r.property);
    if (preferred && preferred.toLowerCase() === override.toLowerCase()) return undefined;
  }
  return override;
}

/** Is this row's label a real departure from the vocabulary? Only then does the amber `dcterms:` spine
 *  mark + reset appear (prototype reaction: the mark is a state indicator, not decoration). */
export function isRelabelled(r: Pick<MetadataRow, "property" | "label">): boolean {
  return !!r.property && overrideLabelOf(r) !== undefined;
}

/**
 * Seed the editor's rows. Authored entries render as themselves; an empty/absent set falls back to the
 * level's default field set as BLANK rows — the curator sees the shape of the form before typing, and
 * blank rows persist nothing. Deliberately does NOT top up an authored set with the missing defaults:
 * once entries exist, injecting blanks the curator already declined would be noise.
 */
export function seedRows(entries: readonly MetadataEntry[] | undefined, level: MetadataLevel): MetadataRow[] {
  if (entries && entries.length > 0) {
    return entries.map((e) =>
      row({
        ...(e.property !== undefined ? { property: e.property } : {}),
        ...(e.label !== undefined ? { label: e.label } : {}),
        value: e.value,
      }),
    );
  }
  return DEFAULT_METADATA_FIELDS[level].map((property) => row({ property, value: "" }));
}

/**
 * Sanitize on write — the ONE row→entry crossing. Drops blank values, trims, drops a label that only
 * restates the vocabulary, and drops a row that would carry neither property nor label (which
 * `isMetadataEntry` rejects at the read boundary, so writing one would be authoring garbage). Array
 * order is preserved: display order IS the persisted order.
 */
export function toEntries(rows: readonly MetadataRow[]): MetadataEntry[] {
  const out: MetadataEntry[] = [];
  for (const r of rows) {
    const value = r.value.trim();
    if (value === "") continue;
    const label = overrideLabelOf(r);
    if (r.property === undefined && label === undefined) continue;
    out.push({
      ...(r.property !== undefined ? { property: r.property } : {}),
      ...(label !== undefined ? { label } : {}),
      value,
    });
  }
  return out;
}

/** Field-wise equality of two entry lists — used to tell an external change (object switch, undo, a
 *  collaborator's edit) from the echo of our own write, so re-seeding never eats in-progress rows. */
export function sameEntries(a: readonly MetadataEntry[], b: readonly MetadataEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i]!;
    return x.property === y.property && x.label === y.label && x.value === y.value;
  });
}

/** A contiguous stretch of rows sharing one property (or, for custom rows, one label). */
export interface MetadataRun {
  key: string;
  start: number;
  end: number;
}

// A property key can only ever start with "dcterms:", so the "label:" prefix cannot collide with one.
const runKeyOf = (r: MetadataRow): string => r.property ?? `label:${displayLabelOf(r).toLowerCase()}`;

/** Split rows into contiguous same-property runs. A run is the unit repeats live in: three Creators in
 *  a row are one run, and that is what keeps reordering from interleaving them with the Date. */
export function runsOf(rows: readonly MetadataRow[]): MetadataRun[] {
  const runs: MetadataRun[] = [];
  rows.forEach((r, i) => {
    const key = runKeyOf(r);
    const last = runs[runs.length - 1];
    if (last && last.key === key && last.end === i - 1) last.end = i;
    else runs.push({ key, start: i, end: i });
  });
  return runs;
}

/** The run containing `index`. */
export function runAt(rows: readonly MetadataRow[], index: number): MetadataRun {
  return runsOf(rows).find((r) => index >= r.start && index <= r.end)!;
}

/**
 * Move a row one step. Two granularities behind one control:
 *   - inside its run, the row swaps with its sibling — this reorders repeated values;
 *   - at the run's edge, the WHOLE RUN hops the neighbouring run — this reorders fields.
 * Returns the next rows plus the moved row's new index (for refocusing), or null at the list's ends.
 *
 * The run-hop is what keeps reordering from FRAGMENTING a field: from contiguous rows, no sequence of
 * steps splits a property into two runs (prototype review: Creator/Date/Creator is model-legal and
 * curator-hostile). That is a property of this function, NOT an invariant of the row list — interleaved
 * rows are reachable without moveRow, via `addCustom` (which does not dedupe custom labels, so
 * Note/Other/Note fragments), `relabelRow`, and `seedRows` (which renders authored entries verbatim, so
 * an imported IIIF manifest ordered Creator/Date/Creator seeds interleaved). moveRow is data-safe on
 * such rows — it moves whichever run it lands in, losing, duplicating and smearing nothing — it simply
 * does not promise to repair a fragmentation it did not create.
 */
export function moveRow(
  rows: readonly MetadataRow[],
  index: number,
  delta: -1 | 1,
): { rows: MetadataRow[]; index: number } | null {
  if (index < 0 || index >= rows.length) return null;
  const runs = runsOf(rows);
  const ri = runs.findIndex((r) => index >= r.start && index <= r.end);
  const run = runs[ri]!;

  // Within the run: a plain swap with the adjacent sibling value.
  if (delta === -1 ? index > run.start : index < run.end) {
    const next = [...rows];
    const j = index + delta;
    [next[index], next[j]] = [next[j]!, next[index]!];
    return { rows: next, index: j };
  }

  // At the run's edge: lift the whole run over its neighbour.
  const neighbour = runs[ri + delta];
  if (!neighbour) return null;
  const block = rows.slice(run.start, run.end + 1);
  const rest = [...rows.slice(0, run.start), ...rows.slice(run.end + 1)];
  const insertAt = delta === -1 ? neighbour.start : neighbour.end + 1 - block.length;
  const next = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
  return { rows: next, index: insertAt + (index - run.start) };
}

/** Can this row move that way at all? Equivalent to `moveRow(...) !== null` (a row at either end of the
 *  list is stuck; anywhere else either the row or its run has somewhere to go) — cheap enough for a
 *  disabled attribute on every row. */
export function canMove(rows: readonly MetadataRow[], index: number, delta: -1 | 1): boolean {
  return delta === -1 ? index > 0 : index < rows.length - 1;
}

/** A second value for this row's field (the per-row "+"). Lands at the END of the run so repeats stay
 *  contiguous — the picker never offers an already-used property, so this is the only way to repeat. */
export function repeatRow(rows: readonly MetadataRow[], index: number): { rows: MetadataRow[]; index: number } {
  const src = rows[index]!;
  const at = runAt(rows, index).end + 1;
  const sibling = row(
    src.property !== undefined
      ? { property: src.property, ...(src.label !== undefined ? { label: src.label } : {}), value: "" }
      : { label: displayLabelOf(src), value: "" },
  );
  return { rows: [...rows.slice(0, at), sibling, ...rows.slice(at)], index: at };
}

/** Add a vocabulary field from the picker; it lands last, ready to type into. */
export function addProperty(rows: readonly MetadataRow[], property: string): { rows: MetadataRow[]; index: number } {
  return { rows: [...rows, row({ property, value: "" })], index: rows.length };
}

/** Add a custom (property-less) field — the picker's "Custom label" escape hatch. A blank name would
 *  make an unpersistable row, so it falls back to "Field" and the curator renames it. */
export function addCustom(rows: readonly MetadataRow[], label: string): { rows: MetadataRow[]; index: number } {
  return { rows: [...rows, row({ label: label.trim() || "Field", value: "" })], index: rows.length };
}

export function removeRow(rows: readonly MetadataRow[], index: number): MetadataRow[] {
  return rows.filter((_, i) => i !== index);
}

/** Patch one row's field, preserving its id (so the DOM node — and the caret in it — survives). */
export function patchRow(
  rows: readonly MetadataRow[],
  index: number,
  fields: Partial<Omit<MetadataRow, "id">>,
): MetadataRow[] {
  return rows.map((r, i) => (i === index ? { ...r, ...fields } : r));
}

/** Rename a row. A blank name clears the override on a vocab row (back to the preferred label) and
 *  falls back to "Field" on a custom row, which has nothing else to be called. */
export function relabelRow(rows: readonly MetadataRow[], index: number, label: string): MetadataRow[] {
  const r = rows[index]!;
  const trimmed = label.trim();
  if (r.property === undefined) return patchRow(rows, index, { label: trimmed || "Field" });
  const override = overrideLabelOf({ property: r.property, label: trimmed });
  return rows.map((x, i) => {
    if (i !== index) return x;
    const { label: _drop, ...rest } = x;
    return override !== undefined ? { ...rest, label: override } : rest;
  });
}

/** Restore the vocabulary's own label (the spine mark's "reset"). */
export function resetLabel(rows: readonly MetadataRow[], index: number): MetadataRow[] {
  return relabelRow(rows, index, "");
}

/**
 * The picker's offer: every dcterms property that is pickable (not one of the natives Archie owns —
 * {@link METADATA_EXCLUDED_PROPERTIES}) and not already on screen, alphabetical by label, narrowed by a
 * free-text query over label / property / comment. Hiding used properties is deliberate: a SECOND value
 * comes from the row's "+", not from picking the same field twice.
 */
export function pickableProperties(rows: readonly MetadataRow[], query = ""): DctermsProperty[] {
  const used = new Set(rows.map((r) => r.property).filter((p): p is string => p !== undefined));
  const q = query.trim().toLowerCase();
  return DCTERMS_PROPERTIES.filter(
    (p) => !METADATA_EXCLUDED_PROPERTIES.has(p.property) && !used.has(p.property),
  )
    .filter(
      (p) =>
        q === "" ||
        p.label.toLowerCase().includes(q) ||
        p.property.toLowerCase().includes(q) ||
        p.comment.toLowerCase().includes(q),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}
