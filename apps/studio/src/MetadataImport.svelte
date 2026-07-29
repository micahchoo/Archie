<script lang="ts">
/**
 * @surface dialog
 * @composes metadata-import
 * @variants closed, empty, mapping, preview
 * @constraint single-scrim invariant: opening REPLACES any prior scrimmed surface; no close-confirmation (nothing is written until Import)
 */
  // Bulk metadata import (Archie-3754) — the door for an institution that arrives with its catalogue in a
  // spreadsheet. All the logic is in metadata-import.ts (pure, unit-tested); this file is chrome and a
  // preview, and it writes nothing: `onapply` hands the host a list of already-computed keyed patches.
  //
  // WHY A COLUMN-MAPPING STEP, when csv-import.ts:1-6 states the annotation dialect is deliberately fixed:
  // an annotation sheet is authored TO Archie's spec, a catalogue export is not. The reasoning is recorded
  // in the ticket and in metadata-import.ts's header so it is not re-litigated here.
  //
  // Both doors from the ticket's "BOTH DOORS SHIP IN V1" live in this one surface: the file picker (map
  // your own export) and the starter spreadsheet (fill in Archie's own shape, which carries the item ids
  // so a re-import matches with no mapping at all).
  //
  // The dialog is a scrimmed surface via the shared modality helper (Archie-5968) — the same
  // scrim-click/Esc dismissal, focus trap and focus return as BulkRightsDialog, whose field/actions dress
  // this reuses rather than inventing a second dialog idiom.
  import { DCTERMS_PROPERTIES, METADATA_EXCLUDED_PROPERTIES } from "@render/core";
  import { scrimmed, trapFocus, modality } from "./modality.svelte";
  import {
    METADATA_TEMPLATE_COLUMNS,
    buildMetadataCsvTemplate,
    planMetadataImport,
    suggestMapping,
    suggestMatchColumn,
    targetLabel,
    type FieldTarget,
    type ImportObject,
    type MatchKey,
    type MetadataImportPlan,
    type PlannedUpdate,
  } from "./metadata-import.js";
  import { parseCsv } from "./csv-import.js";

  let {
    open,
    exhibitName,
    objects,
    onapply,
    onclose,
  }: {
    open: boolean;
    /** Names the exhibit being updated, so the curator can see they are pointed at the right one. */
    exhibitName: string;
    objects: ImportObject[];
    /** The planned updates, each carrying a KEYED PARTIAL patch. The host forwards each to
     *  lib.patchObject — it must NOT reconstruct anything from them
     *  (.claude/rules/metadata-rights-keyed-writebacks.md). */
    onapply: (updates: PlannedUpdate[]) => void;
    onclose: () => void;
  } = $props();

  // --- the picked file ---
  let fileName = $state("");
  let text = $state("");
  let readError = $state("");
  let targets = $state<FieldTarget[]>([]);
  let matchKey = $state<MatchKey>("filename");
  let matchColumn = $state(-1);

  const rows = $derived(text === "" ? [] : parseCsv(text));
  const header = $derived(rows[0] ?? []);
  /** The first data row, shown beside each column so the curator maps against real values, not guesses. */
  const sample = $derived(rows[1] ?? []);

  // Re-seed on each open: a previous file's mapping must never carry into the next one.
  $effect(() => {
    if (!open) return;
    fileName = ""; text = ""; readError = "";
    targets = []; matchColumn = -1; matchKey = "filename";
  });

  const MATCH_KEYS: { key: MatchKey; label: string; hint: string }[] = [
    { key: "filename", label: "File name", hint: "Matches the name each file had when you added it." },
    { key: "path", label: "File path or URL", hint: "Matches the whole path or address, so two files with the same name stay apart." },
    { key: "identifier", label: "Identifier already in Archie", hint: "Matches the Identifier a previous import wrote." },
    { key: "archieId", label: "Archie item id", hint: "What the starter spreadsheet puts in its first column." },
  ];
  const matchHint = $derived(MATCH_KEYS.find((k) => k.key === matchKey)?.hint ?? "");

  /** The properties offered in the field dropdown: the four Archie owns natively, then every Dublin Core
   *  property that does NOT collide with one of them (model/dcterms.ts METADATA_EXCLUDED_PROPERTIES —
   *  offering "dcterms:title" beside "Title" would publish two disagreeing titles). */
  const DC_OPTIONS = DCTERMS_PROPERTIES.filter((p) => !METADATA_EXCLUDED_PROPERTIES.has(p.property));

  /** A dropdown's value is a string, so a target round-trips through one: "" = ignore, "native:label",
   *  "dcterms:creator". */
  function targetValue(t: FieldTarget | undefined): string {
    if (!t || t.kind === "ignore") return "";
    return t.kind === "native" ? `native:${t.field}` : t.property;
  }
  function parseTargetValue(v: string): FieldTarget {
    if (v === "") return { kind: "ignore" };
    if (v.startsWith("native:")) return { kind: "native", field: v.slice("native:".length) as "label" | "summary" | "rights" | "credit" };
    return { kind: "dcterms", property: v };
  }
  function setTarget(column: number, v: string) {
    const next = [...targets];
    while (next.length < header.length) next.push({ kind: "ignore" });
    next[column] = parseTargetValue(v);
    targets = next;
  }

  async function pickFile(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const f = el.files?.[0];
    el.value = "";
    if (!f) return;
    readError = "";
    fileName = f.name;
    try {
      text = await f.text();
    } catch {
      text = "";
      readError = `Couldn’t read “${f.name}”. Save it again as a CSV and try once more.`;
      return;
    }
    const head = parseCsv(text)[0] ?? [];
    if (head.length === 0) {
      readError = `“${f.name}” has no column headings. The first row has to name the columns.`;
      text = "";
      return;
    }
    // Open the step filled in — a guessed mapping the curator corrects beats twenty empty dropdowns.
    targets = suggestMapping(head);
    const guessed = MATCH_KEYS.map((k) => ({ key: k.key, column: suggestMatchColumn(head, k.key) })).find((g) => g.column >= 0);
    matchKey = guessed?.key ?? "filename";
    matchColumn = guessed?.column ?? -1;
  }

  const plan = $derived<MetadataImportPlan | null>(
    text === "" ? null : planMetadataImport(text, { targets, matchColumn, matchKey }, { objects }),
  );
  const preview = $derived(plan?.updates.slice(0, 5) ?? []);
  const canImport = $derived(!!plan && !plan.refusal && plan.updates.length > 0);

  function downloadTemplate() {
    const csv = buildMetadataCsvTemplate(objects);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exhibitName || "exhibit"}-metadata.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importNow() {
    if (!plan || !canImport) return;
    onapply(plan.updates);
    onclose();
  }
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={() => modality.dismiss()}></div>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="metadata-import-title"
    tabindex="-1"
    use:scrimmed={{ onClose: onclose }}
    onkeydown={trapFocus}
  >
    <div class="head">
      <h2 id="metadata-import-title">Import metadata</h2>
      <button type="button" class="close-x" onclick={onclose} aria-label="Close">×</button>
    </div>
    <p class="lede">
      Add titles, dates, creators and rights to the media items in {exhibitName} from a spreadsheet. You
      say what each column means; Archie only changes the fields you point at, and nothing is written
      until you choose Import.
    </p>

    <div class="field">
      <label class="control">
        <span class="field-head">Spreadsheet</span>
        <input type="file" accept=".csv,text/csv" onchange={pickFile} />
      </label>
      {#if fileName && !readError}<span class="spread">{fileName}</span>{/if}
      {#if readError}<p class="refusal">{readError}</p>{/if}
      <button type="button" class="text-link" onclick={downloadTemplate}>
        Download a starter spreadsheet for this exhibit
      </button>
      <span class="note">
        The starter spreadsheet already lists this exhibit's media items with their ids, so filling it in
        and adding it back matches every row exactly. Its columns are
        {METADATA_TEMPLATE_COLUMNS.join(", ")}.
      </span>
    </div>

    {#if header.length > 0}
      <div class="field">
        <span class="field-head">Match rows to media items by</span>
        <div class="match-row">
          <label class="control">
            <span class="sr-only">What to match on</span>
            <select bind:value={matchKey}>
              {#each MATCH_KEYS as k (k.key)}
                <option value={k.key}>{k.label}</option>
              {/each}
            </select>
          </label>
          <label class="control">
            <span class="sr-only">Which column holds it</span>
            <select bind:value={matchColumn}>
              <option value={-1}>Pick a column…</option>
              {#each header as h, i (i)}
                <option value={i}>{h || `Column ${i + 1}`}</option>
              {/each}
            </select>
          </label>
        </div>
        <span class="note">{matchHint}</span>
      </div>

      <div class="field">
        <span class="field-head">Your columns</span>
        <table class="mapping">
          <thead>
            <tr><th scope="col">Column</th><th scope="col">First row</th><th scope="col">Archie field</th></tr>
          </thead>
          <tbody>
            {#each header as h, i (i)}
              <tr>
                <th scope="row">{h || `Column ${i + 1}`}</th>
                <td class="sample">{sample[i] ?? ""}</td>
                <td>
                  <label class="control">
                    <span class="sr-only">Archie field for {h || `column ${i + 1}`}</span>
                    <select value={targetValue(targets[i])} onchange={(e) => setTarget(i, e.currentTarget.value)}>
                      <option value="">Don't import</option>
                      <optgroup label="Archie's own fields">
                        <option value="native:label">{targetLabel({ kind: "native", field: "label" })}</option>
                        <option value="native:summary">{targetLabel({ kind: "native", field: "summary" })}</option>
                        <option value="native:rights">{targetLabel({ kind: "native", field: "rights" })}</option>
                        <option value="native:credit">{targetLabel({ kind: "native", field: "credit" })}</option>
                      </optgroup>
                      <optgroup label="Dublin Core">
                        {#each DC_OPTIONS as p (p.property)}
                          <option value={p.property}>{p.label}</option>
                        {/each}
                      </optgroup>
                    </select>
                  </label>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    {#if plan}
      <div class="field">
        <span class="field-head">Preview</span>
        {#if plan.refusal}
          <p class="refusal">{plan.refusal}</p>
        {:else}
          <p class="spread">
            {plan.updates.length} to update · {plan.unchanged} already match · {plan.skipped.length} skipped
          </p>
          {#if preview.length > 0}
            <table class="preview">
              <thead>
                <tr><th scope="col">Media item</th><th scope="col">Field</th><th scope="col">Now</th><th scope="col">After</th></tr>
              </thead>
              <tbody>
                {#each preview as u (u.objectId)}
                  {#each u.changes as c, ci (ci)}
                    <tr>
                      <th scope="row">{ci === 0 ? u.objectLabel : ""}</th>
                      <td>{c.field}</td>
                      <td class="from">{c.from ?? "—"}</td>
                      <td>{c.to}</td>
                    </tr>
                  {/each}
                {/each}
              </tbody>
            </table>
            {#if plan.updates.length > preview.length}
              <span class="note">Showing the first {preview.length} of {plan.updates.length}.</span>
            {/if}
          {:else}
            <p class="note">Nothing to change yet. Point a column at a field, or check the match column.</p>
          {/if}
          {#if plan.skipped.length > 0}
            <ul class="skipped">
              {#each plan.skipped.slice(0, 5) as s (s.row)}
                <li>Line {s.row}: {s.reason}</li>
              {/each}
              {#if plan.skipped.length > 5}
                <li>…and {plan.skipped.length - 5} more.</li>
              {/if}
            </ul>
          {/if}
        {/if}
      </div>
    {/if}

    <div class="actions">
      <button type="button" class="btn btn-ghost" onclick={onclose}>Cancel</button>
      <button type="button" class="btn btn-primary" disabled={!canImport} onclick={importNow}>
        {plan && plan.updates.length > 0 ? `Import ${plan.updates.length} media item${plan.updates.length === 1 ? "" : "s"}` : "Import"}
      </button>
    </div>
  </div>
{/if}

<style>
  /* Canvas-scrimmed dialog — matches BulkRightsDialog (the sibling bulk-edit surface). */
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

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .control {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .field-head {
    font-family: var(--font-ui);
    font-size: var(--text-ui-xs, 0.7rem);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--ink-canvas-muted);
  }
  select,
  input[type="file"] {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--font-ui);
    font-size: 0.9rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-canvas-raised);
    color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-sm);
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  select {
    cursor: pointer;
  }
  select:focus,
  input[type="file"]:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-muted);
  }
  .match-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .spread {
    font-family: var(--font-mono);
    font-size: var(--text-ui-xs, 0.7rem);
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
  .text-link {
    align-self: flex-start;
    padding: 6px 0;
    border: none;
    background: none;
    cursor: pointer;
    font-family: var(--font-ui);
    font-size: var(--text-ui-sm);
    color: var(--accent);
    text-decoration: underline;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-ui);
    font-size: 0.8rem;
  }
  th,
  td {
    text-align: left;
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--border-canvas);
    vertical-align: middle;
  }
  thead th {
    font-size: var(--text-ui-xs, 0.7rem);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink-canvas-muted);
    font-weight: 500;
  }
  tbody th {
    font-weight: 600;
    color: var(--ink-canvas-primary);
  }
  .sample,
  .from {
    color: var(--ink-canvas-secondary);
    max-width: 16ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mapping td:last-child {
    width: 40%;
  }
  .skipped {
    margin: 0;
    padding-left: 1.1rem;
    font-family: var(--font-body);
    font-size: 0.78rem;
    line-height: 1.5;
    color: var(--ink-canvas-secondary);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
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
