<script lang="ts">
  /**
   * @surface dialog
   * @composes column-mapper, ColumnMapper, csv-import
   * @variants closed, mapping
   * @constraint the annotation CSV door's opt-in mapping step (Archie-96e6). App.svelte gates on
   *   csvHeaderConforms BEFORE opening this — a conforming header never sees it (the zero-config
   *   invariant). Writes nothing itself: Import hands (file, mapping) back to the host, which runs
   *   flows.importNotesCsv and reports through its import note.
   */
  import { scrimmed, trapFocus, modality } from "./modality.svelte";
  import ColumnMapper from "./ColumnMapper.svelte";
  import { setTargetAt, type MapperOption } from "./column-mapper.js";
  import {
    CSV_ROLES,
    CSV_ROLE_LABELS,
    csvMappingMissing,
    csvRegionPartiallyPointed,
    csvRoleMapping,
    suggestRoleGrid,
    type CsvColumnMapping,
  } from "./csv-import.js";

  let {
    open,
    file,
    header,
    sample,
    onimport,
    onclose,
  }: {
    open: boolean;
    /** The picked file — held by the host while the author maps; Import hands it back untouched. */
    file: File;
    header: string[];
    sample: string[];
    onimport: (file: File, mapping: CsvColumnMapping) => void;
    onclose: () => void;
  } = $props();

  // The grid opens prefilled from whatever the header DOES say by name (suggestRoleGrid), then it is
  // the author's to correct — a guessed mapping beats empty dropdowns. Re-seeded on each open, like
  // MetadataImport's targets, so a previous file's mapping never carries into the next one.
  let grid = $state<string[]>([]);
  $effect(() => {
    if (!open) return;
    grid = suggestRoleGrid(header);
  });

  const ROLE_OPTIONS: MapperOption[] = CSV_ROLES.map((r) => ({ value: r, label: CSV_ROLE_LABELS[r] }));
  const missing = $derived(csvMappingMissing(header, grid));
  const canImport = $derived(missing.length === 0);
  const regionWarning = $derived(csvRegionPartiallyPointed(header, grid));

  function setGridTarget(column: number, v: string) {
    grid = setTargetAt(grid, column, v, header.length);
  }

  function importNow() {
    if (!canImport) return;
    onimport(file, csvRoleMapping(grid));
    onclose();
  }
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={() => modality.dismiss()}></div>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="csv-mapping-title"
    tabindex="-1"
    use:scrimmed={{ onClose: onclose }}
    onkeydown={trapFocus}
  >
    <div class="head">
      <h2 id="csv-mapping-title">Map your columns</h2>
      <button type="button" class="close-x" onclick={onclose} aria-label="Close">×</button>
    </div>
    <p class="lede">
      “{file.name}” doesn't use Archie's notes columns, so say what each one holds. Nothing is added
      until you choose Import.
    </p>

    <ColumnMapper
      {header}
      {sample}
      targets={grid}
      options={ROLE_OPTIONS}
      ontarget={setGridTarget}
      targetHead="Annotation role"
      targetAria={(h) => `Annotation role for ${h}`}
    />

    {#if missing.length > 0}
      <p class="refusal">
        Not mapped yet: {missing.map((m) => CSV_ROLE_LABELS[m]).join(", ")}. The media-item column says
        which item each note belongs to; the note-text column holds what the note says.
      </p>
    {:else if regionWarning}
      <p class="note">
        If you point a region column, point all four (x, y, w, h) — or none, and draw each box later
        with “Set area”.
      </p>
    {/if}

    <div class="actions">
      <button type="button" class="btn btn-ghost" onclick={onclose}>Cancel</button>
      <button type="button" class="btn btn-primary" disabled={!canImport} onclick={importNow}>Import</button>
    </div>
  </div>
{/if}

<style>
  /* Same scrimmed-dialog idiom as MetadataImport — the shared field/actions dress, not a second one.
     ColumnMapper carries the mapping table's own styles. */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(59, 49, 56, 0.42);
    backdrop-filter: blur(2px);
  }
  .dialog {
    position: fixed;
    z-index: 51;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(760px, 94vw);
    max-height: 88vh;
    overflow-y: auto;
    box-sizing: border-box;
    background: var(--surface-canvas-raised);
    color: var(--ink-canvas-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lift-mid);
    padding: var(--space-6);
  }
  .dialog:focus-visible {
    outline: none;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
  }
  .head h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.4rem;
    font-weight: 400;
  }
  .close-x {
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 1.3rem;
    line-height: 1;
    color: var(--ink-canvas-secondary);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    transition: color 0.18s ease;
  }
  .close-x:hover {
    color: var(--semantic-error);
  }
  .lede {
    margin: 0 0 var(--space-5);
    font-family: var(--font-body);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--ink-canvas-secondary);
  }
  .note {
    font-family: var(--font-body);
    font-size: 0.72rem;
    line-height: 1.4;
    color: var(--ink-canvas-muted);
  }
  .refusal {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.85rem;
    line-height: 1.45;
    color: var(--semantic-error);
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }
  .btn {
    font-family: var(--font-ui);
    font-size: var(--text-ui-sm);
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: var(--space-2) var(--space-5);
    cursor: pointer;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    transition: background 160ms ease, opacity 160ms ease;
  }
  .btn-primary {
    background: var(--accent);
    color: var(--ink-on-accent);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .btn-primary:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .btn-ghost {
    background: var(--surface-canvas-raised);
    color: var(--ink-canvas-primary);
    border-color: var(--border-canvas-emphasis);
  }
  .btn-ghost:hover {
    background: var(--surface-canvas-overlay);
  }
</style>
