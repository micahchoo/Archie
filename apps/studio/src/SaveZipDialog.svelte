<!-- The zip-file Save surface (⌘S / the Save button when the library saves as a `.archie.zip`
     download — file binding, or first save on a browser with no folder picker). Every such save is
     a fresh download anyway, so the one extra step buys an explicit name and an explicit contents
     choice; the subset warning is loud because opening a partial save later REPLACES the library
     with just that subset. The automatic safety flushes (recovery, close-time flush) never come
     here — they save the whole library directly. -->
<script lang="ts">
/**
 * @surface scrim
 * @composes dialog
 * @variants {open, busy}
 * @constraint {dialog: single-scrim invariant}
 */
  import { scrimmed, trapFocus, modality } from "./modality.svelte";
  import ZipExportFields from "./ZipExportFields.svelte";
  import { allSelected, baseNameOf, canExport, exportOpts } from "./zip-export-opts.js";

  let {
    open = false,
    exhibits = [],
    suggestedName = "",
    busy = false,
    onsave,
    oncancel,
  }: {
    open?: boolean;
    exhibits?: { slug: string; title: string }[];
    /** The bound zip's name, else derived from the library title (the field's starting value). */
    suggestedName?: string;
    busy?: boolean;
    onsave: (opts: { name?: string; slugs?: string[] }) => void;
    oncancel: () => void;
  } = $props();

  let name = $state("");
  let selected = $state<Record<string, boolean>>({});
  // Re-arm the fields on every open: the name from the current suggestion, everything checked.
  $effect(() => {
    if (open) {
      name = baseNameOf(suggestedName);
      selected = allSelected(exhibits);
    }
  });
  const canSave = $derived(canExport(selected, exhibits));
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={() => modality.dismiss()}></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Save your library" tabindex="-1"
    use:scrimmed={{ onClose: oncancel }} onkeydown={trapFocus}>
    <header>
      <p class="eyebrow">Save</p>
      <h2>Save your library</h2>
      <p class="lede">This browser saves your library as a downloaded <code>.archie.zip</code> file.</p>
    </header>
    <ZipExportFields {exhibits} bind:name bind:selected
      subsetWarning="This file will hold ONLY the exhibits you pick — opening it later replaces your library with just those. For a partial copy to share, use Publish → Share a working copy instead." />
    <div class="actions">
      <button type="button" class="ghost" onclick={oncancel}>Cancel</button>
      <button type="button" class="primary" disabled={busy || !canSave} onclick={() => onsave(exportOpts(name, selected, exhibits))}>{busy ? "Saving…" : "Save"}</button>
    </div>
  </div>
{/if}

<style>
  /* Same Soft Static chrome as the Publish surface (scrim + floating warm-paper dialog). */
  .scrim { position: fixed; inset: 0; background: rgba(59,49,56,0.55); backdrop-filter: blur(2px); z-index: 40; }
  .dialog {
    position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(30rem, calc(100vw - var(--space-8))); box-sizing: border-box;
    max-height: min(85vh, 44rem); overflow-y: auto;
    background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lift-mid); padding: var(--space-6);
  }
  header { margin-bottom: var(--space-5); }
  .eyebrow { color: var(--ink-paper-muted); }
  h2 { font-family: var(--font-display); font-size: 1.75rem; font-weight: 400; line-height: 1.15; margin: var(--space-1) 0 var(--space-2); color: var(--ink-paper-primary); text-shadow: var(--shadow-text-haze); }
  .lede { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0; }
  .actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-4); }
  .primary {
    font-family: var(--font-body); font-size: 0.9rem; font-weight: 600;
    letter-spacing: 0.01em;
    padding: var(--space-2) var(--space-5); border-radius: var(--radius-sm); cursor: pointer;
    background: var(--accent); color: var(--ink-on-accent); border: none;
    box-shadow: var(--shadow-signal-glow);
    transition: background 160ms ease, box-shadow 160ms ease;
  }
  .primary:hover { background: var(--accent-hover); box-shadow: var(--shadow-lift-mid); }
  .primary:disabled { background: var(--accent-muted); color: var(--ink-paper-muted); box-shadow: none; cursor: default; }
  .ghost {
    font-family: var(--font-body); font-size: 0.9rem; font-weight: 500;
    letter-spacing: 0.01em;
    padding: var(--space-2) var(--space-5); border-radius: var(--radius-sm); cursor: pointer;
    background: var(--surface-paper-card); color: var(--ink-paper-primary); border: 1px solid var(--border-canvas);
    transition: background 160ms ease, border-color 160ms ease;
  }
  .ghost:hover { background: var(--surface-paper-hover); border-color: var(--border-canvas-emphasis); }
</style>
