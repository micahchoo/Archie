<script lang="ts">
  // The cite panel (V102/V106, Archie-3ea1) — the audit's headline finding: for a tool whose whole
  // purpose is citable annotation, there was NO clipboard or share affordance anywhere in the read
  // surface. Every rung was addressable (Archie-99b1) and none of them was copyable.
  //
  // THREE GRAINS SIDE BY SIDE, not a menu behind a default. They serve different readers — someone
  // pasting into Slack wants the link, someone writing a paper wants the reference, someone feeding
  // another IIIF viewer wants Content State — and hiding two of the three answers only the easiest
  // case while making the other two feel unsupported.
  //
  // A DIALOG, NOT A FLOATING PANEL. Archie-40fe spent a whole ticket getting floating chrome OFF the
  // canvas (V22/V48/V71/V87); a cite panel parked over the image is V48 again under a new name. So
  // this takes the ReadingSheet shape exactly: scrim + sheet as siblings, `use:dialog` for the focus
  // trap / initial focus / focus return, Escape delegated to the caller.
  import { dialog } from "../lib/dialog-a11y.js";

  let { label, link, citation, contentState, onclose }: {
    /** What is being cited, in words — the dialog's accessible name and its heading. */
    label: string;
    /** The address for the current rung. READ from `location.hash` by the caller, never re-derived
     *  here: two derivations of "where am I" drift, and then one of them is wrong. */
    link: string;
    /** The rendered reference (render-core `citationFor`). */
    citation: string;
    /** IIIF Content State (ADR-0022), or null when the current rung has no annotation to encode —
     *  Content State names an annotation on a canvas, so an exhibit-level cite genuinely has none.
     *  Absent beats a fabricated payload that decodes to nothing. */
    contentState: string | null;
    onclose: () => void;
  } = $props();

  // Which grain was copied last — a per-grain confirmation, because with three buttons a single
  // shared "Copied!" leaves you unsure which one fired.
  let copied = $state<string | null>(null);
  let copyFailed = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy(key: string, text: string) {
    clearTimeout(timer);
    try {
      // The clipboard API is permission-gated and absent on insecure origins. A silent no-op would be
      // the worst outcome here — the reader walks away believing they have the citation.
      await navigator.clipboard.writeText(text);
      copied = key;
      copyFailed = false;
    } catch {
      copied = null;
      copyFailed = true;
    }
    timer = setTimeout(() => { copied = null; copyFailed = false; }, 2500);
  }

  const grains = $derived([
    { key: "link", title: "Link", hint: "Opens exactly this view.", value: link },
    { key: "citation", title: "Citation", hint: "A formatted reference.", value: citation },
    ...(contentState
      ? [{ key: "state", title: "IIIF Content State", hint: "For other IIIF viewers.", value: contentState }]
      : []),
  ]);
</script>

<!-- Scrim + sheet as SIBLINGS (ReadingSheet/NoteLightbox pattern): clicks inside the sheet don't
     reach the scrim, so no stopPropagation is needed. -->
<div class="cite-scrim" role="presentation" onclick={onclose}></div>
<div class="cite" role="dialog" aria-modal="true" aria-label={`Cite ${label}`} use:dialog={{ onclose }}>
  <header>
    <p class="eyebrow">Cite</p>
    <h2>{label}</h2>
    <button class="close" onclick={onclose} aria-label="Close cite panel">×</button>
  </header>

  <ul class="grains">
    {#each grains as g (g.key)}
      <li>
        <div class="head">
          <span class="name">{g.title}</span>
          <span class="hint">{g.hint}</span>
        </div>
        <!-- readonly, not disabled: a disabled field is unreadable to a screen reader and unselectable
             by someone who prefers to select-and-copy by hand. -->
        <textarea readonly rows={g.key === "citation" ? 3 : 2} value={g.value} aria-label={`${g.title} for ${label}`}></textarea>
        <button class="copy" onclick={() => copy(g.key, g.value)} aria-label={`Copy ${g.title.toLowerCase()}`}>
          {copied === g.key ? "Copied" : "Copy"}
        </button>
      </li>
    {/each}
  </ul>

  {#if copyFailed}
    <!-- aria-live so it is announced: a failed copy that only changes a colour is a silent failure. -->
    <p class="failed" role="status">Couldn't reach the clipboard — select the text and copy it by hand.</p>
  {/if}
</div>

<style>
  .cite-scrim { position: fixed; inset: 0; background: var(--scrim-dim); backdrop-filter: blur(3px); z-index: 60; }
  .cite {
    position: fixed; z-index: 61; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(44rem, calc(100vw - 2rem)); max-height: calc(100vh - 4rem); overflow: auto;
    display: flex; flex-direction: column; gap: var(--space-4);
    padding: var(--space-5); border-radius: var(--radius-lg);
    background: var(--surface-paper-card); color: var(--ink-paper-primary); box-shadow: var(--shadow-lift-high);
  }
  header { position: relative; }
  .eyebrow { margin: 0; font-family: var(--font-ui), monospace; font-size: 0.62rem; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-paper-muted); }
  h2 { margin: 0.25rem 0 0; font-weight: 300; font-size: 1.4rem; }
  .close { position: absolute; top: -0.25rem; right: -0.25rem; border: none; background: transparent; cursor: pointer; font-size: 1.4rem; line-height: 1; padding: 6px; color: var(--ink-paper-muted); }
  .close:hover { color: var(--accent); }
  /* Equal weight, literally: one column each at the same width, so no grain reads as the default. */
  .grains { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-4); }
  @media (min-width: 46rem) { .grains { grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); } }
  .grains li { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
  .head { display: flex; flex-direction: column; gap: 2px; }
  .name { font-family: var(--font-ui), monospace; font-size: 0.68rem; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; }
  .hint { font-size: 0.76rem; color: var(--ink-paper-muted); }
  textarea {
    width: 100%; box-sizing: border-box; resize: vertical; font-family: var(--font-ui), monospace;
    font-size: 0.72rem; line-height: 1.5; padding: var(--space-2);
    border: 1px solid var(--rule); border-radius: var(--radius-sm);
    background: var(--surface-paper); color: var(--ink-paper-primary);
  }
  .copy { font: inherit; font-size: 0.78rem; padding: 0.35rem 0.9rem; border: 1px solid var(--rule); border-radius: var(--radius-sm); background: transparent; color: inherit; cursor: pointer; align-self: start; }
  .copy:hover { border-color: var(--accent); color: var(--accent); }
  .failed { margin: 0; font-size: 0.78rem; color: var(--accent-2); }
</style>
