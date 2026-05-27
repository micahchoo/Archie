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
    <button class="primary" onclick={pick}>Open a library…</button>
    {#if error}<p class="err" role="alert">⚠ {error}</p>{/if}
    <input bind:this={fileInput} type="file" accept=".zip" onchange={onChange} hidden />
  </div>

  {#if dragging}
    <div class="wash" aria-hidden="true"><span>Release to open the library</span></div>
  {/if}
</main>

<style>
  /* The vacant gallery wall — warm stone (system.md §Surfaces: Gallery). One framed invitation,
     centered. Forest-green accent on the single action. Shallow depth: a dashed empty frame. */
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
    border: 1.5px dashed var(--border-paper-emphasis);
    border-radius: var(--radius-lg);
  }
  .eyebrow {
    margin: 0;
    font-family: var(--font-ui), sans-serif;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
  }
  h1 {
    margin: var(--space-1) 0 var(--space-1);
    font-family: var(--font-display), Georgia, serif;
    font-weight: 600;
    font-size: 2.75rem;
    line-height: 1.05;
    color: var(--ink-paper-primary);
  }
  .lede {
    margin: 0 0 var(--space-2);
    font-family: var(--font-body), Georgia, serif;
    font-size: 1.15rem;
    line-height: 1.5;
    color: var(--ink-paper-secondary);
  }
  /* The file the recipient holds, named so they know what to open (curatorial clarity, not jargon). */
  .lede code, .cold code {
    font-family: var(--font-mono), ui-monospace, monospace;
    font-size: 0.92em;
    color: var(--ink-paper-primary);
  }
  .cold {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-ui), sans-serif;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--ink-paper-primary);
    background: rgba(196, 155, 54, 0.12);
    border: 1px solid var(--semantic-warning);
    border-radius: var(--radius-sm);
  }
  button.primary {
    font-family: var(--font-ui), sans-serif;
    font-size: 0.8125rem;
    font-weight: 500;
    padding: var(--space-2) var(--space-5);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--ink-on-accent);
    background: var(--accent);
    border: 1px solid var(--accent);
    transition: background 120ms ease, border-color 120ms ease;
  }
  button.primary:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  .err {
    margin: 0;
    font-family: var(--font-ui), sans-serif;
    font-size: 0.8rem;
    color: var(--accent);
  }
  /* Drag anywhere: the whole window is the drop target — the wall lifts with an accent wash. */
  .wash {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: var(--accent-muted);
    border: 2px dashed var(--accent);
    pointer-events: none;
  }
  .wash span {
    padding: var(--space-2) var(--space-4);
    font-family: var(--font-ui), sans-serif;
    font-size: 1rem;
    color: var(--accent);
    background: var(--surface-paper);
    border-radius: var(--radius-sm);
  }
</style>
