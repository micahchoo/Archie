<script lang="ts">
  // The Safety State indicator (CONTEXT.md → Persistence; ticket Archie-0b7b "One save vocabulary").
  // ONE component, mounted in the SAME header slot at every place (editor header / library project bar)
  // — the only save UI. It is inert text in Saved/Saving; in Failed/Action-needed it IS the control that
  // performs the needed act. Copy reuses the app's existing save vocabulary (prior art: LibraryHome's old
  // "Save to disk"/"Save" ternary, App.svelte's "⚠ Save failed", shortcuts.ts' "⌘S — Save the library").
  //
  // ⌘S is universal "flush now", owned HERE (not by each mount site): whichever SafetyState is currently
  // mounted is the only one alive (the editor header and the library project bar are mutually exclusive
  // views), so one `<svelte:window onkeydown>` per live instance is exactly one live handler app-wide.
  import { computeSafetyState } from "./safety-state.svelte.js";
  import type { Binding } from "@render/core";
  import type { SaveHealth } from "./save-queue.svelte.js";

  let {
    sessDirty = false,
    saveHealth,
    bindingKind,
    bindingDirty,
    bindingBusy,
    bindingError,
    hasRealWork,
    onflush,
  }: {
    /** Session stage, immediate — exhibit-session.svelte.ts `dirty`. Omit outside the editor. */
    sessDirty?: boolean;
    /** Session stage, app-wide — save-queue.svelte.ts `saveStatus.health`. */
    saveHealth: SaveHealth;
    /** Mirror stage — binding-store.svelte.ts `binding.kind`. */
    bindingKind: Binding["kind"];
    /** Mirror stage — binding-store.svelte.ts `dirty`. */
    bindingDirty: boolean;
    /** Mirror stage — binding-store.svelte.ts `busy`. */
    bindingBusy: boolean;
    /** Mirror stage — binding-store.svelte.ts `error`. */
    bindingError: string | null;
    /** Mirror stage (unbound only) — see `hasRealWorkIn` in safety-state.svelte.ts. */
    hasRealWork: boolean;
    /** The one save act: flush a stale file binding, bind an unbound library to disk, or retry a
     *  failure — binding-store.svelte.ts `saveProject`. The SAME handler ⌘S invokes. */
    onflush: () => void;
  } = $props();

  const safety = $derived(
    computeSafetyState({ sessDirty, saveHealth, bindingKind, bindingDirty, bindingBusy, bindingError, hasRealWork }),
  );

  // Action-needed has two causes with different copy (CONTEXT.md — "Save" names exactly one act, but the
  // OBJECT differs): a stale `file` binding needs updating; an `unbound` library needs its first bind.
  const actionLabel = $derived(bindingKind === "file" ? "Save (⌘S)" : "Save to disk");

  // ⌘S while clean is a harmless no-op — flash "Saved" so the keystroke visibly did something, without
  // starting any write (CONTEXT.md: "a flush request while clean briefly affirms Saved").
  let affirm = $state(false);
  let affirmTimer: ReturnType<typeof setTimeout> | undefined;
  function flashSaved(): void {
    affirm = true;
    clearTimeout(affirmTimer);
    affirmTimer = setTimeout(() => { affirm = false; }, 900);
  }

  function act(): void {
    if (safety === "saved") flashSaved();
    else if (safety === "failed" || safety === "action-needed") onflush();
    // "saving": nothing to do — the act is already underway.
  }

  /** ⌘S / Ctrl+S anywhere — universal "flush now". Owns preventDefault so no mount site needs its own
   *  binding for the browser save dialog. */
  function onSaveKey(e: KeyboardEvent): void {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "s") return;
    e.preventDefault();
    act();
  }
</script>

<svelte:window onkeydown={onSaveKey} />

{#if safety === "saved"}
  <span class="safety-state saved" class:affirm role="status">Saved</span>
{:else if safety === "saving"}
  <span class="safety-state saving" role="status">Saving…</span>
{:else if safety === "failed"}
  <button type="button" class="safety-state failed" onclick={act} title={bindingError ?? undefined}>
    <span aria-hidden="true">⚠</span> Retry save
  </button>
{:else}
  <button type="button" class="safety-state action-needed" onclick={act}>
    {actionLabel}
  </button>
{/if}

<style>
  .safety-state {
    font-family: var(--font-ui); font-size: var(--text-ui-sm, 0.8125rem); font-weight: 600;
    letter-spacing: 0.02em; line-height: 1;
  }
  span.safety-state { display: inline-block; }
  .safety-state.saved { color: var(--ink-canvas-secondary); font-weight: 400; transition: color 200ms ease; }
  .safety-state.saved.affirm { color: var(--semantic-success); }
  .safety-state.saving { color: var(--ink-canvas-secondary); font-weight: 400; }
  button.safety-state {
    border: none; background: none; padding: 0; cursor: pointer; font: inherit;
    color: inherit; letter-spacing: inherit;
  }
  button.safety-state.failed { color: var(--semantic-error); }
  button.safety-state.action-needed { color: var(--semantic-warning); }
  button.safety-state:hover { text-decoration: underline; }
</style>
