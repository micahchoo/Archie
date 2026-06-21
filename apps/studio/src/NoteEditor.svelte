<script lang="ts">
  // The WADM note-edit form (ADR-0006), promoted from App.svelte's `noteForm` snippet to a component
  // (the DOMINO cut — the seam was already drawn). Rendered as a marker-anchored POPOVER over the canvas
  // (App's <main>); its drag-grip + position stay in App (the popover chrome), this owns the FORM only.
  // Comment + tags + reading + emphasis + (for AV) a mm:ss time fieldset. Edits autosave live via the
  // injected `applyForm`/`applyTime`; "Save" commits any uncommitted comment then closes (`closeNote`).
  //
  // The textarea element is exposed via `bind:commentEl` so App's ⌘K cite-splice (citeIntoComment) and
  // its commit-on-close can read the live value / caret. The reader helpers (commentOf/tagsOf/timeOf)
  // and the mutating actions arrive as props — this component is presentation, the logic stays in App.
  import type { AnnotationRecord, Reading, Emphasis } from "@render/core";

  interface Props {
    /** The selected record being edited (the WADM form is keyed to it). */
    sel: AnnotationRecord;
    /** The editing logicalId (for the Delete action — non-null while this form shows). */
    editing: string;
    /** The exhibit's readings (the Reading <select> options). */
    currentReadings: Reading[];
    /** The comment textarea element — bound out so App's cite-splice + commit-on-close reach it. */
    commentEl?: HTMLTextAreaElement | null;
    // Reader helpers (pure projections off the record) — injected so logic stays in App / core.
    commentOf: (r: AnnotationRecord) => string;
    tagsOf: (r: AnnotationRecord) => string[];
    timeOf: (r: AnnotationRecord) => { start: number; end?: number } | null;
    // Mutating actions (all route through the live session in App).
    applyForm: (comment: string, tagsCsv: string) => void;
    applyTime: (start: number, end: number) => void;
    setNoteReading: (reading: string | null) => void;
    setNoteEmphasis: (emphasis: Emphasis) => void;
    /** Change this note's scope (ADR-0018): "whole" drops its region → whole-object; "region" arms a draw. */
    setNoteScope: (scope: "whole" | "region") => void;
    requestCite: (insert: (md: string) => void) => void;
    citeIntoComment: (md: string) => void;
    closeNote: () => void;
    onDelete: (id: string) => void;
  }
  let {
    sel, editing, currentReadings, commentEl = $bindable(null),
    commentOf, tagsOf, timeOf,
    applyForm, applyTime, setNoteReading, setNoteEmphasis, setNoteScope, requestCite, citeIntoComment, closeNote, onDelete,
  }: Props = $props();

  // Scope (ADR-0018): a note is a "region" if its target carries a selector, else it's whole-object.
  const isRegion = $derived(typeof sel.target !== "string" && !!(sel.target as { selector?: unknown }).selector);

  const comment = $derived(commentOf(sel));
  const tags = $derived(tagsOf(sel).join(", "));
  const reading = $derived(sel.reading ?? null);
  const emphasis = $derived<Emphasis>(sel.emphasis ?? "normal");
  const trange = $derived(timeOf(sel));

  // mm:ss ⇄ seconds for the AV time fieldset (listening notes are second-precision). Parse is tolerant:
  // "1:30" or bare "90" both work; floor on display keeps it from ever rendering "1:60".
  const fmtMMSS = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  function parseMMSS(v: string): number {
    const t = v.trim();
    if (t.includes(":")) { const [m, s] = t.split(":"); return (parseInt(m || "0", 10) || 0) * 60 + (parseFloat(s || "0") || 0); }
    return parseFloat(t) || 0;
  }
</script>

<form class="wadm" onsubmit={(e) => { e.preventDefault(); }}>
  <h3>Edit note</h3>
  <label>
    <span class="field-head">Comment<button type="button" class="cite" onclick={() => void requestCite(citeIntoComment)} title="Cite a note, object, or exhibit (⌘K) — search by text or browse by image">¶ Cite <kbd>⌘K</kbd></button></span>
    <textarea bind:this={commentEl} rows="3" value={comment} onchange={(e) => applyForm((e.currentTarget as HTMLTextAreaElement).value, tags)}></textarea>
  </label>
  {#if trange}
    <fieldset class="time">
      <legend>Time (m:ss)</legend>
      <label class="t">Start<input type="text" inputmode="numeric" placeholder="m:ss" value={fmtMMSS(trange.start)} onchange={(e) => applyTime(parseMMSS((e.currentTarget as HTMLInputElement).value), trange.end ?? trange.start)} /></label>
      <label class="t">End<input type="text" inputmode="numeric" placeholder="m:ss" value={fmtMMSS(trange.end ?? trange.start)} onchange={(e) => applyTime(trange.start, parseMMSS((e.currentTarget as HTMLInputElement).value))} /></label>
    </fieldset>
  {/if}
  <!-- Scope (ADR-0018): the explicit region↔whole-object conversion, on the note it acts on. Eyebrow label
       (like the other fields) over a read-out + contextual action buttons — no overloaded create button. -->
  <div class="scope-field">
    <span class="field-head">Scope</span>
    <div class="scope-row">
      <span class="scope-now">{isRegion ? "A region of this object" : "The whole object (no region)"}</span>
      {#if isRegion}
        <button type="button" class="cite" onclick={() => setNoteScope("whole")} title="Drop the region — make this note apply to the whole object">▣ Make whole-object</button>
        <button type="button" class="cite" onclick={() => setNoteScope("region")} title="Re-draw this note's region — draw a new box or outline on the object">▭ Redraw bounds</button>
      {:else}
        <button type="button" class="cite" onclick={() => setNoteScope("region")} title="Give this note a region — draw a box or outline on the object">▭ Draw a region</button>
      {/if}
    </div>
  </div>
  <label>Tags (comma-separated)<input value={tags} onchange={(e) => applyForm(comment, (e.currentTarget as HTMLInputElement).value)} /></label>
  <label>Reading
    <select value={reading ?? ""} onchange={(e) => setNoteReading((e.currentTarget as HTMLSelectElement).value || null)}>
      <option value="">— No reading —</option>
      {#each currentReadings as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
    </select>
  </label>
  <label>Emphasis
    <select value={emphasis} onchange={(e) => setNoteEmphasis((e.currentTarget as HTMLSelectElement).value as Emphasis)} title="How much a mark stands out — its weight, not its colour.">
      <option value="muted">Muted (recede)</option>
      <option value="normal">Normal</option>
      <option value="strong">Strong (stand out)</option>
    </select>
  </label>
  <div class="wadm-actions">
    <button type="button" class="save" onclick={closeNote}>Save</button>
    <button type="button" class="del" onclick={() => onDelete(editing)}>Delete note</button>
  </div>
</form>

<style>
  /* WADM form — editing on paper. Labels are quiet mono eyebrows; the one focal action (Save) is the signal. */
  .wadm { margin-top: var(--space-5); border-top: 1px solid var(--border-paper); padding-top: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
  /* Scope control — eyebrow label (matching the other fields) over a read-out + contextual actions (ADR-0018).
     The `.field-head` here is NOT inside a <label>, so it needs the eyebrow type explicitly. */
  .scope-field { display: flex; flex-direction: column; gap: var(--space-1); }
  .scope-field .field-head { font-family: var(--font-ui); font-size: 0.7rem; font-weight: 400; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-muted); }
  .scope-row { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
  .scope-row .scope-now { font-family: var(--font-body); font-size: 0.9rem; letter-spacing: 0; text-transform: none; color: var(--ink-paper-secondary); }
  .wadm h3 { margin: 0; font-family: var(--font-display); font-size: 1.3rem; font-weight: 400; letter-spacing: 0; color: var(--ink-paper-primary); }
  .wadm label { display: flex; flex-direction: column; gap: var(--space-1); font-family: var(--font-ui); font-size: 0.7rem; font-weight: 400; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-muted); }
  /* Comment field header: label + the ⌘K "Cite" link affordance (cord-blue link tone). */
  .wadm .field-head { display: flex; align-items: center; justify-content: space-between; }
  .wadm .cite {
    display: inline-flex; align-items: center; gap: var(--space-1); cursor: pointer;
    background: none; border: none; padding: 0;
    font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: 0.03em; text-transform: none;
    color: var(--accent-2);
  }
  .wadm .cite:hover { color: var(--accent-2-hover); }
  .wadm .cite kbd { font-family: var(--font-mono); font-size: 0.62rem; color: var(--ink-paper-muted); background: var(--surface-paper-hover); border: 1px solid var(--border-paper); border-radius: var(--radius-sm); padding: 0 var(--space-1); }
  .wadm textarea, .wadm input:not([type]) {
    font-family: var(--font-body); font-size: 1rem; padding: var(--space-2) var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-sm);
  }
  /* The comment is the primary authoring field — let it grow with content (drag the handle).
     Proven on sibling textareas (DetailsEditor:78, NarrativeEditor); the popover's overflow-y absorbs growth. */
  .wadm textarea { resize: vertical; min-height: 4.5rem; }
  .wadm textarea:focus, .wadm input:focus { outline: none; border-color: var(--accent-2); }
  .wadm fieldset { border: 1px solid var(--border-paper); border-radius: var(--radius-sm); display: flex; gap: var(--space-4); padding: var(--space-2) var(--space-3); }
  /* AV time fieldset — start/end mm:ss inputs (the time note's geometry) */
  .wadm .time .t { flex-direction: column; gap: var(--space-1); }
  .wadm .time input {
    width: 6rem; font-family: var(--font-mono); font-size: 0.9rem; padding: var(--space-1) var(--space-2);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-sm);
  }
  .wadm .time input:focus { outline: none; border-color: var(--accent-2); }
  .wadm legend { font-family: var(--font-ui); font-size: 0.65rem; font-weight: 400; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-muted); padding: 0 var(--space-1); }
  /* Delete = a quiet destructive-toned soft button (not orange — the signal is reserved for Save). */
  .del { align-self: flex-start; font-family: var(--font-ui); font-size: 0.8rem; letter-spacing: 0.04em; padding: var(--space-2) var(--space-3); background: var(--surface-paper-card); color: var(--semantic-error); border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-sm); cursor: pointer; transition: box-shadow 160ms ease; }
  .del:hover { box-shadow: var(--shadow-lift-low); }
  /* Note-editor action row — Save (commit + close the popover) beside Delete. */
  .wadm-actions { display: flex; align-items: center; gap: var(--space-3); }
  /* Save = the ONE focal action in this popover → the orange signal. */
  .save { cursor: pointer; font-family: var(--font-ui); font-size: 0.8rem; font-weight: 500; letter-spacing: 0.04em; padding: var(--space-2) var(--space-4); background: var(--accent); color: var(--ink-on-accent); border: none; border-radius: var(--radius-sm); box-shadow: var(--shadow-signal-glow); transition: background 160ms ease; }
  .save:hover { background: var(--accent-hover); box-shadow: var(--shadow-signal-glow); }
  /* When inside App's marker popover, the form sheds its top margin/border (the popover IS the frame).
     The override lived in App as `.note-popover .wadm`; it now travels with the form via :global on the
     popover ancestor (App's .note-popover is a global class as far as this scoped style is concerned). */
  :global(.note-popover) .wadm { margin-top: 0; border-top: none; padding-top: 0; padding: var(--space-4); }
</style>
