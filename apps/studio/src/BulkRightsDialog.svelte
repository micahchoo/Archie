<script lang="ts">
/**
 * @surface dialog
 * @composes bulk-rights
 * @variants open, closed
 * @constraint single-scrim invariant: opening REPLACES any prior scrimmed surface; no close-confirmation (autosave makes dismissal lossless)
 */
  // Bulk rights edit (collection-import Phase 2, plan §9 / Archie-d2cc): set ONE license + credit across
  // the SELECTED exhibits at once — the field an institutional bulk import needs to stamp uniformly. Only
  // license + credit are bulk-editable; title/description stay per-exhibit (bulk title is nonsense; bulk
  // description would stomp provenance — plan §9), so they are absent here on purpose.
  //
  // A scrimmed surface via the shared modality helper (Archie-5968, CONTEXT.md → Surfaces): same
  // scrim-click/Esc dismissal + focus trap/return as CreateExhibitDialog. NO close-confirmation — a rights
  // edit is not destructive and autosave makes dismissal lossless (the two-step guard is only for the
  // DELETE path). The field set + vocabulary MIRROR the single-exhibit RightsEditor (same `LICENSES` source,
  // same "License" + "Attribution / credit" labels) — not a second rights idiom; the only bulk-specific
  // addition is the per-field "Change …" gate.
  //
  // MIXED-STATE POLICY (bulk-rights.ts): each field is gated by an explicit "Change …" checkbox and its
  // input is DISABLED until checked. Unchecked = leave every exhibit's own value untouched (never silently
  // erased); checked-but-blank = a deliberate clear-for-all. A muted line names the current spread across
  // the selection (all agree / mixed / none set) so the curator sees what an apply would overwrite.
  import { LICENSES, licenseLabel, type RightsFields } from "@render/core";
  import { scrimmed, trapFocus, modality } from "./modality.svelte";
  import {
    EMPTY_BULK_RIGHTS_FORM,
    buildBulkRightsPatch,
    bulkRightsFormDirty,
    summarizeLicenses,
    summarizeCredits,
    type BulkRightsForm,
    type RightsSpread,
    type RightsFieldsPatch,
  } from "./bulk-rights.js";

  let {
    open,
    selected,
    onapply,
    onclose,
  }: {
    open: boolean;
    /** The rights of every selected exhibit — drives the count + the current-spread hints. */
    selected: RightsFields[];
    /** Emit the built patch (only the gated fields). The host forwards to lib.patchExhibits(slugs, patch). */
    onapply: (patch: RightsFieldsPatch) => void;
    onclose: () => void;
  } = $props();

  let form = $state<BulkRightsForm>({ ...EMPTY_BULK_RIGHTS_FORM });
  // Re-seed on each open so a previous edit (or a prior selection's fields) never bleeds into the next one.
  $effect(() => {
    if (open) form = { ...EMPTY_BULK_RIGHTS_FORM };
  });

  const count = $derived(selected.length);
  const noun = $derived(count === 1 ? "exhibit" : "exhibits");
  const dirty = $derived(bulkRightsFormDirty(form));
  const licenseSpread = $derived(summarizeLicenses(selected));
  const creditSpread = $derived(summarizeCredits(selected));

  function spreadHint(spread: RightsSpread, noneLabel: string, format: (value: string) => string): string {
    if (spread.kind === "none") return `Currently: ${noneLabel}`;
    if (spread.kind === "mixed") return "Currently: mixed";
    return `Currently: ${format(spread.value)}`;
  }
  const licenseHint = $derived(spreadHint(licenseSpread, "no license set", (uri) => licenseLabel(uri) ?? uri));
  const creditHint = $derived(spreadHint(creditSpread, "no credit set", (value) => `“${value}”`));

  // The reconcile $effect in LibraryHome can prune the selection to empty while this dialog is open (a card
  // removed elsewhere) — an apply over zero exhibits is a no-op the button must not offer.
  const canApply = $derived(dirty && count > 0);

  function apply() {
    if (!canApply) return;
    onapply(buildBulkRightsPatch(form));
    onclose();
  }
</script>

{#if open}
  <!-- Sibling scrim + dialog (CreateExhibitDialog's shape). scrim-click = Esc via modality.dismiss. -->
  <div class="scrim" role="presentation" onclick={() => modality.dismiss()}></div>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="bulk-rights-title"
    tabindex="-1"
    use:scrimmed={{ onClose: onclose }}
    onkeydown={trapFocus}
  >
    <div class="head">
      <h2 id="bulk-rights-title">Rights — {count} {noun}</h2>
      <button type="button" class="close-x" onclick={onclose} aria-label="Close">×</button>
    </div>
    <p class="lede">
      Set the license and credit for the selected {noun} at once. Anything you leave unchecked keeps each
      exhibit's own value.
    </p>

    <div class="field">
      <label class="gate">
        <input type="checkbox" bind:checked={form.changeLicense} />
        Change license
      </label>
      <label class="control">
        <span class="field-head">License</span>
        <select bind:value={form.license} disabled={!form.changeLicense} aria-describedby="bulk-license-spread">
          {#each LICENSES as opt (opt.uri)}
            <option value={opt.uri}>{opt.label}</option>
          {/each}
        </select>
      </label>
      <span class="spread" id="bulk-license-spread">{licenseHint}</span>
    </div>

    <div class="field">
      <label class="gate">
        <input type="checkbox" bind:checked={form.changeCredit} />
        Change attribution
      </label>
      <label class="control">
        <span class="field-head">Attribution / credit</span>
        <textarea
          rows="2"
          bind:value={form.credit}
          disabled={!form.changeCredit}
          placeholder="Who to credit when these {noun} are shown or shared"
          aria-describedby="bulk-credit-spread bulk-credit-note"
        ></textarea>
      </label>
      <span class="spread" id="bulk-credit-spread">{creditHint}</span>
      <!-- Deliberate divergence from per-exhibit editing (bulk-rights.ts buildBulkRightsPatch): a uniform
           bulk stamp writes the default "Attribution" label, replacing any per-exhibit custom label. -->
      <span class="note" id="bulk-credit-note">Applies one shared credit — replaces any custom attribution labels.</span>
    </div>

    <div class="actions">
      <button type="button" class="btn btn-ghost" onclick={onclose}>Cancel</button>
      <button type="button" class="btn btn-primary" disabled={!canApply} onclick={apply}>Apply to {count} {noun}</button>
    </div>
  </div>
{/if}

<style>
  /* Canvas-scrimmed dialog — matches CreateExhibitDialog (the sibling create/import surface). */
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
    width: min(520px, 92vw);
    max-height: 86vh;
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
  .gate {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-ui);
    font-size: var(--text-ui-sm);
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--ink-canvas-primary);
    cursor: pointer;
  }
  .gate input {
    cursor: pointer;
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
  textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--font-body);
    font-size: 0.95rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-canvas-raised);
    color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-sm);
    transition: border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
  }
  select {
    font-family: var(--font-ui);
    cursor: pointer;
  }
  textarea {
    resize: vertical;
    min-height: 2.6rem;
  }
  select:focus,
  textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-muted);
  }
  select:disabled,
  textarea:disabled {
    opacity: 0.45;
    cursor: default;
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
