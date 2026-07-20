// The pure logic behind the `.archie.zip` export fields (ZipExportFields.svelte): what the save
// button is allowed to do, and how the fields compose into the flows' ZipExportOpts.
//
// These live in a plain .ts module, NOT in the component's `<script module>`, for two reasons:
// `tsc --noEmit` (the real gate for .ts here — see .claude/rules/studio-ts-typecheck-gate.md)
// resolves `*.svelte` through an ambient module declaration that exposes only the default export,
// so module-script helpers are invisible to it and untestable from a .ts spec; and the rules below
// are save-correctness rules, which deserve their own unit test independent of any component.

/** An exhibit as the export surfaces see it — App passes only what the list needs. */
export interface ExportExhibit {
  slug: string;
  title: string;
}

/** Every exhibit checked — the opening state of each save surface (no remembered subset: a partial
 *  copy is an explicit, per-save choice, never hidden state). */
export function allSelected(exhibits: { slug: string }[]): Record<string, boolean> {
  return Object.fromEntries(exhibits.map((e) => [e.slug, true]));
}

/** The suggested name with the suffix stripped for editing (the field shows it as a fixed adornment). */
export function baseNameOf(suggested: string): string {
  return (suggested || "library").replace(/\.archie\.zip$/, "").replace(/\.zip$/, "");
}

/** How many exhibits are checked. */
export function selectedCount(selected: Record<string, boolean>, exhibits: { slug: string }[]): number {
  return exhibits.filter((e) => selected[e.slug]).length;
}

/** May this export proceed? Save surfaces gate their button on THIS, never on `selectedCount > 0`.
 *  A library with NOTHING to pick (no authored exhibits yet — only bundled examples, which App's
 *  `exportableExhibits` filters out — or the last one just deleted) still saves: there is no subset
 *  to choose, so it exports whole, which is exactly what `exportOpts` composes for the empty case
 *  (0 === 0 ⇒ no `slugs`). Only a library that HAS exhibits with none checked is a real "pick
 *  something first". Gating on the raw count instead strands library-level work (title/summary/
 *  credit counts as real work to SafetyState) behind a button that can never enable — and where
 *  there is no folder picker the zip is the ONLY save route, so that is a dead end while the UI
 *  demands a save. */
export function canExport(selected: Record<string, boolean>, exhibits: { slug: string }[]): boolean {
  return exhibits.length === 0 || selectedCount(selected, exhibits) > 0;
}

/** Compose the flows' export opts from the fields: the name always carries the `.archie.zip` suffix;
 *  `slugs` is present only for a strict subset (absent = the whole library — the pre-chooser
 *  contract every opts-less caller keeps). */
export function exportOpts(
  name: string,
  selected: Record<string, boolean>,
  exhibits: { slug: string }[],
): { name?: string; slugs?: string[] } {
  const base = baseNameOf(name.trim());
  const slugs = exhibits.filter((e) => selected[e.slug]).map((e) => e.slug);
  return { ...(base ? { name: `${base}.archie.zip` } : {}), ...(slugs.length === exhibits.length ? {} : { slugs }) };
}
