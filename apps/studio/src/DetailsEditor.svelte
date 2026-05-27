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
  } = $props();
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
</style>
