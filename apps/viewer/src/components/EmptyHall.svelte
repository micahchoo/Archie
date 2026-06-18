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
      <p class="cold" role="status">You followed a link into a library that isn’t open here. Open its <code>.archie.zip</code> file to follow the link.</p>
    {/if}
    <p class="lede">Open the library’s <code>.archie.zip</code> file to read its exhibits — drag it onto the page, or choose it below.</p>
    <button class="primary pixel-btn" onclick={pick}>Open a library…</button>
    {#if error}<p class="err" role="alert">⚠ {error}</p>{/if}
    <input bind:this={fileInput} type="file" accept=".zip" onchange={onChange} hidden />
  </div>

  {#if dragging}
    <div class="wash" aria-hidden="true"><span>Release to open the library</span></div>
  {/if}
</main>

<style>
  /* The vacant gallery void (8-Bit Orbit §Surfaces: Gallery = void). One framed invitation,
     centered. Neon-cyan accent on the single action. Shallow depth: a dashed cyan square frame. */
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
    border: var(--border-pixel) dashed var(--border-canvas-emphasis);
    border-radius: var(--radius-lg);
  }
  /* .eyebrow is the global navy label-pill (square, neon-yellow Space Mono). Keep tracking local. */
  .eyebrow {
    letter-spacing: 0.2em;
  }
  h1 {
    margin: var(--space-1) 0 var(--space-1);
    font-family: var(--font-display), sans-serif;
    font-weight: 800;
    font-size: 2.75rem;
    line-height: 1.05;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--ink-canvas-primary);
    text-shadow: var(--text-shadow-hero);
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
    font-family: var(--font-ui), sans-serif;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--ink-canvas-primary);
    background: var(--accent-3-muted);
    border: var(--border-pixel) solid var(--semantic-warning);
    border-radius: var(--radius-sm);
  }
  /* Primary CTA composes the global .pixel-btn (Tektur, uppercase, hard cascade shadow, square).
     The local rules below only set sizing — never override .pixel-btn's color/shadow/transform. */
  button.primary {
    font-size: 0.8125rem;
    padding: var(--space-2) var(--space-5);
  }
  .err {
    margin: 0;
    font-family: var(--font-ui), sans-serif;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--semantic-error);
  }
  /* Drag anywhere: the whole window is the drop target — the void lifts with a neon-cyan wash. */
  .wash {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: var(--accent-muted);
    border: var(--border-pixel-bold) dashed var(--accent);
    pointer-events: none;
  }
  .wash span {
    padding: var(--space-2) var(--space-4);
    font-family: var(--font-ui), sans-serif;
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--accent);
    background: var(--surface-paper-card);
    border: var(--border-pixel) solid var(--border-canvas-emphasis);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-pixel);
  }
</style>
