// The mapping-STEP machinery shared by every surface that asks "which column means what" — today
// MetadataImport (Archie-3754's catalogue import) and, through csv-import.ts's opt-in mapping
// (Archie-96e6), the annotation CSV door. ColumnMapper.svelte is this module's chrome, the same
// split metadata-import.ts / MetadataImport.svelte established: pure logic here, unit-tested in
// node; the component renders header × first-row-sample × target dropdown.
//
// What makes the step GENERIC: a mapping grid is per-COLUMN dropdown state. Each column carries a
// string value that the HOST interprets — MetadataImport encodes a FieldTarget ("native:label",
// "dcterms:creator", "" = ignore, see metadata-import.ts fieldTargetValue); the annotation mapper
// names a csv-import dialect role ("object", "comment", …, see csv-import.ts csvRoleMapping). This
// module knows neither vocabulary: it holds the state mechanics both share.

/** One dropdown option. `group` renders an <optgroup>; options sharing a label keep the order they
 *  arrive in; options without a group render flat (MetadataImport puts "Don't import" there, ahead
 *  of its groups). */
export interface MapperOption {
  value: string;
  label: string;
  group?: string;
}

/** The per-column dropdown grid, width-aligned with the sheet's header. "" = not mapped. */
export type TargetGrid = string[];

/** Set one column's value, padding the grid to the header's width first — a grid carried over from
 *  a wider previous sheet must never misalign or crash. Transcribed verbatim from
 *  MetadataImport.svelte's setTarget (Archie-3754) at extraction; pinned by column-mapper.test.ts. */
export function setTargetAt(targets: TargetGrid, column: number, value: string, width: number): TargetGrid {
  const next = [...targets];
  while (next.length < width) next.push("");
  next[column] = value;
  return next;
}

/** Group options for a <select> as { name, options } runs, each in first-appearance order; the
 *  unnamed run ("" ) renders flat, outside any <optgroup>. Transcribed from MetadataImport.svelte's
 *  mapping markup ("Don't import" flat, then "Archie's own fields", then "Dublin Core"). */
export function groupOptions(options: readonly MapperOption[]): { name: string; options: MapperOption[] }[] {
  const groups: { name: string; options: MapperOption[] }[] = [];
  for (const o of options) {
    const name = o.group ?? "";
    let g = groups.find((x) => x.name === name);
    if (!g) {
      g = { name, options: [] };
      groups.push(g);
    }
    g.options.push(o);
  }
  return groups;
}
