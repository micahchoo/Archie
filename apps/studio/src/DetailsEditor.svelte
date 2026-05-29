<script lang="ts">
  // Per-level "details" form: title + description (identity) + the shared RightsEditor (credit/license).
  // The Library and Exhibit drawers + the Object disclosure all render this, so title/description/rights
  // are editable wherever the level is edited (user ask: nothing was editable once set). The OBJECT hides
  // its title here (`showTitle={false}`) because the object's label is already inline-editable in the rail.
  import { type RightsFields } from "@render/core";
  import RightsEditor from "./RightsEditor.svelte";

  let {
    showTitle = true,
    title = "",
    summary = "",
    rights,
    scope,
    ontitle,
    onsummary,
    onrights,
    onremove,
  }: {
    showTitle?: boolean;
    title?: string;
    summary?: string;
    rights: RightsFields;
    /** Curator noun for this level ("object" / "exhibit" / "library"), used in field copy. */
    scope: string;
    ontitle?: (v: string) => void;
    onsummary: (v: string) => void;
    onrights: (next: RightsFields) => void;
    /** Destructive remove (Archie-3f4c). Absent → no remove button (e.g. library is not removable). */
    onremove?: () => void;
  } = $props();

  // Inline two-step confirm (3f4c): the button morphs in place to a vermillion guard; the SECOND click
  // commits. No window.confirm (off-brand for the study). Blur / leaving the field cancels the arm.
  let confirming = $state(false);
  const removeLabel = $derived(scope === "object" ? "Remove from exhibit" : "Remove from library");
  function onRemoveClick() {
    if (!confirming) { confirming = true; return; }
    confirming = false;
    onremove?.();
  }
</script>

<div class="details">
  {#if showTitle}
    <label class="field">
      <span class="field-head">Title</span>
      <input value={title} placeholder="Name this {scope}" oninput={(e) => ontitle?.((e.currentTarget as HTMLInputElement).value)} />
    </label>
  {/if}
  <label class="field">
    <span class="field-head">Description</span>
    <textarea rows="3" value={summary} placeholder="A short description of this {scope}" oninput={(e) => onsummary((e.currentTarget as HTMLTextAreaElement).value)}></textarea>
  </label>
  <RightsEditor value={rights} {scope} onchange={onrights} />
  {#if onremove}
    <div class="danger">
      <button type="button" class="remove" class:confirming onclick={onRemoveClick} onblur={() => (confirming = false)}>
        {confirming ? "Confirm — this can’t be undone" : removeLabel}
      </button>
    </div>
  {/if}
</div>

<style>
  .details { display: flex; flex-direction: column; gap: var(--space-3); }
  .field { display: flex; flex-direction: column; gap: var(--space-1); }
  .field-head {
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs, 0.7rem); font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-paper-secondary);
  }
  input, textarea {
    font-family: var(--font-body), serif; font-size: 0.85rem; color: var(--ink-paper-primary);
    background: var(--surface-paper-card); border: 1px solid var(--border-paper-emphasis);
    border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); width: 100%; box-sizing: border-box;
  }
  textarea { resize: vertical; }
  input:focus, textarea:focus { outline: none; border-color: var(--accent); }

  /* Destructive remove (3f4c): a quiet vermillion outline that fills in on the armed second-click guard. */
  .danger { margin-top: var(--space-1); }
  .remove {
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm, 0.8125rem);
    padding: var(--space-1) var(--space-3); cursor: pointer; width: 100%;
    background: transparent; color: var(--semantic-error);
    border: 1px solid var(--semantic-error); border-radius: var(--radius-sm);
    transition: background 120ms ease, color 120ms ease;
  }
  .remove:hover { background: var(--semantic-error); color: var(--ink-on-accent); }
  .remove.confirming { background: var(--semantic-error); color: var(--ink-on-accent); font-weight: 600; }
</style>
