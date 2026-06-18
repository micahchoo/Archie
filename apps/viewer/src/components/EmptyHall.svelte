<script lang="ts">
  // The empty hall (ADR-0008 portable mode) — shown when the Viewer holds no library yet. The warm
  // gallery wall (system.md §Surfaces: Gallery), vacant, with ONE framed invitation to open an Archie
  // library: a dashed empty frame (rhymes with the Studio's "+Object" dashed affordance — the same
  // "bring something in" gesture). Open by file-pick OR drag-drop anywhere on the page. Curator voice:
  // name the action + what it produces, never file-format jargon. The open LOGIC lives in published.ts
  // (tested); this is presentation + file capture — it emits the chosen file via `onfile`.
  let {
    onfile,
    cold = false,
    error = "",
  }: {
    /** The user chose/dropped a library — the shell opens it (openLibraryFromFile) + transitions. */
    onfile: (file: File) => void;
    /** Cold-arrival (§96): a deep-link landed but no library is open — invite opening the linked file. */
    cold?: boolean;
    /** An open attempt failed — shown beneath the action. */
    error?: string;
  } = $props();

  let dragging = $state(false);
  let fileInput: HTMLInputElement | undefined;

  function pick() {
    fileInput?.click();
  }
  function onChange(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) onfile(f);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) onfile(f);
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    dragging = true;
  }
  function onDragLeave(e: DragEvent) {
    if (e.relatedTarget === null) dragging = false; // only clear when the cursor leaves the window
  }
</script>

<svelte:window ondragover={onDragOver} ondrop={onDrop} ondragleave={onDragLeave} />

<main class="hall">
  <div class="frame">
    <p class="eyebrow">Archie</p>
    <h1>Open a library</h1>
    {#if cold}
      <p class="cold" role="status">That link points to an exhibit in a library that isn’t open here yet. Open the library file you were given to pick up where the link leads.</p>
    {/if}
    <p class="lede">Drop a library file here, or choose one with the button, to start reading its exhibits. Library files end in <code>.archie.zip</code>.</p>
    <button class="primary signal-tile" onclick={pick}>Choose a file…</button>
    {#if error}<p class="err" role="alert">{error}</p>{/if}
    <input bind:this={fileInput} type="file" accept=".zip" onchange={onChange} hidden />
  </div>

  {#if dragging}
    <div class="wash" aria-hidden="true"><span>Release to open the library</span></div>
  {/if}
</main>

<style>
  /* The vacant gallery wall (Soft Static §Surfaces: Gallery = warm blush). One framed invitation,
     centered. A soft dashed-clay empty frame on the warm wall — the "bring something in" gesture. */
  .hall {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: var(--space-8);
    background: var(--surface-gallery);
    position: relative;
  }
  .frame {
    max-width: 30rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-3);
    padding: var(--space-10) var(--space-8);
    border: 1px dashed var(--accent-3-muted);
    border-radius: var(--radius-lg);
  }
  /* .eyebrow is the global quiet tracked-mono eyebrow (Spline Sans Mono). Keep tracking local. */
  .eyebrow {
    letter-spacing: 0.2em;
  }
  h1 {
    margin: var(--space-1) 0 var(--space-1);
    font-family: var(--font-display), serif;
    font-weight: 300;
    font-size: 2.75rem;
    line-height: 1.1;
    letter-spacing: 0.01em;
    color: var(--ink-canvas-primary);
    text-shadow: var(--shadow-text-haze);
  }
  .lede {
    margin: 0 0 var(--space-2);
    font-family: var(--font-body), sans-serif;
    font-size: 1.15rem;
    line-height: 1.6;
    color: var(--ink-canvas-secondary);
  }
  /* The file the recipient holds, named so they know what to open (curatorial clarity, not jargon). */
  .lede code, .cold code {
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 0.92em;
    color: var(--accent);
  }
  .cold {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-body), sans-serif;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--ink-canvas-primary);
    background: var(--accent-3-muted);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-inset-fog);
  }
  /* Primary CTA is the one rationed signal — composes the global .signal-tile (orange focal object,
     signal-glow). The local rules below only set sizing — never override .signal-tile's bg/shadow. */
  button.primary {
    font-family: var(--font-ui), sans-serif;
    font-size: 0.8125rem;
    padding: var(--space-2) var(--space-5);
  }
  .err {
    margin: 0;
    font-family: var(--font-ui), sans-serif;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--semantic-error);
  }
  /* Drag anywhere: the whole window is the drop target — the wall lifts with a soft warm wash. */
  .wash {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: var(--accent-muted);
    border: 1px dashed var(--accent-3-muted);
    pointer-events: none;
  }
  .wash span {
    padding: var(--space-2) var(--space-4);
    font-family: var(--font-body), sans-serif;
    font-size: 1rem;
    color: var(--ink-canvas-primary);
    background: var(--surface-canvas-raised);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-mid);
  }
</style>
