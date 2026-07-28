<script lang="ts" module>
  /** Instance counter — keeps two mounted panels' tab/tabpanel ids distinct. */
  let instances = 0;
</script>

<script lang="ts">
/**
 * @surface paper
 * @composes details-form
 * @variants default, readonly
 * @constraint paper surface: warm tokens (--surface-paper, --ink-paper-*); title/description/rights/MetadataEditor — the Object level hides title (label is inline-editable in rail)
 */
  // Per-level "details" form: title + description (identity) + the shared RightsEditor (credit/license).
  // The Library and Exhibit drawers + the Object disclosure all render this, so title/description/rights
  // are editable wherever the level is edited (user ask: nothing was editable once set). The OBJECT hides
  // its title here (`showTitle={false}`) because the object's label is already inline-editable in the rail.
  import { type MetadataEntry, type RightsFields } from "@render/core";
  import RightsEditor from "./RightsEditor.svelte";
  import MetadataEditor from "./MetadataEditor.svelte";
  import { levelOf } from "./metadata-rows.js";

  let {
    showTitle = true,
    title = "",
    summary = "",
    rights,
    scope,
    ontitle,
    onsummary,
    onrights,
    onmetadata,
    unlisted = false,
    onunlisted,
    onremove,
    readonly = false,
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
    /** Persist this level's Dublin Core entries (Archie-458e). PRESENCE is what turns this panel into a
     *  two-tab surface — a mount that doesn't pass it renders exactly as before, single-pane. The entries
     *  themselves ride in `rights.metadata` (they live on RightsFields), but the write-back is its OWN
     *  callback on purpose: the rights setters are KEYED `{ rights, requiredStatement }` patches
     *  (Archie-5a9b audit) and widening them to a whole-RightsFields replace is exactly the clobber that
     *  audit forbids. */
    onmetadata?: (next: MetadataEntry[]) => void;
    /** Whether this exhibit is hidden from the public gallery (Archie-bdc0, the Exhibit.unlisted lever). */
    unlisted?: boolean;
    /** Toggle the gallery-visibility lever (Archie-bdc0). PRESENCE renders the checkbox — an exhibit-only
     *  control, so only the exhibit-scope mounts wire it; the library/object mounts render exactly as before.
     *  Writes back to the working-store `unlisted` field, which publish projects onto the exhibits.json card. */
    onunlisted?: (next: boolean) => void;
    /** Destructive remove (Archie-3f4c). Absent → no remove button (e.g. library is not removable). */
    onremove?: () => void;
    /** Read-only (writer lock, UX-CRITIQUE O1/B3): every field goes disabled (one <fieldset disabled>
     *  covers title/description/rights without touching RightsEditor) behind a short reason line —
     *  free-text here was the most work-investing affordance a locked tab still invited. Callers
     *  should also withhold onremove. Default false: other mounts are untouched. */
    readonly?: boolean;
  } = $props();

  const uid = `de${(instances += 1)}`;

  // Inline two-step confirm (3f4c): the button morphs in place to a vermillion guard; the SECOND click
  // commits. No window.confirm (off-brand for the study). Blur / leaving the field cancels the arm.
  let confirming = $state(false);
  const removeLabel = $derived(scope === "object" ? "Remove from exhibit" : "Remove from library");
  function onRemoveClick() {
    if (!confirming) { confirming = true; return; }
    confirming = false;
    onremove?.();
  }

  // Metadata is a TAB, not another stacked block (Archie-458e, the user's binding constraint): the right
  // panel is already spoken for at every level, so a third block would push the rights fields off-screen
  // in a 380px drawer. The tab strip exists ONLY when a host wired onmetadata — every other mount keeps
  // its exact previous single-pane render, which is what keeps this component's blast radius nil.
  const tabbed = $derived(!!onmetadata);
  let tab = $state<"details" | "metadata">("details");
  const TABS = [
    { id: "details", label: "Details" },
    { id: "metadata", label: "Metadata" },
  ] as const;
  const entries = $derived(rights.metadata ?? []);
  const metaCount = $derived(entries.length);
  let tabEls = $state<Array<HTMLButtonElement | undefined>>([]);
  // WAI-ARIA tabs: arrows move (and activate) along the strip, Home/End jump to the ends.
  function onTabKeydown(e: KeyboardEvent, i: number) {
    const to =
      e.key === "ArrowRight" ? (i + 1) % TABS.length
      : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? TABS.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    tab = TABS[to]!.id;
    tabEls[to]?.focus();
  }
</script>

<div class="details">
  {#if readonly}
    <p class="ro-note">Read-only — take over editing to make changes.</p>
  {/if}
  {#if tabbed}
    <div class="tabs" role="tablist" aria-label="{scope} details">
      {#each TABS as t, i (t.id)}
        <button
          type="button" role="tab" id="{uid}-tab-{t.id}"
          bind:this={tabEls[i]}
          class:on={tab === t.id}
          aria-selected={tab === t.id}
          aria-controls="{uid}-panel-{t.id}"
          tabindex={tab === t.id ? 0 : -1}
          onclick={() => (tab = t.id)}
          onkeydown={(e) => onTabKeydown(e, i)}
        >{t.label}{#if t.id === "metadata" && metaCount > 0}<span class="tab-count">{metaCount}</span>{/if}</button>
      {/each}
    </div>
  {/if}
  <!-- Both panels stay MOUNTED (hidden, not destroyed): switching tabs mid-edit must not throw away the
       blank rows the metadata editor is holding for you. `hidden` also takes them out of the tab order. -->
  <!-- One <fieldset disabled> covers EVERY form control below (title, description, the whole
       RightsEditor, a remove if present) via native disabled propagation — no per-input wiring,
       no prop threading into RightsEditor. -->
  <div
    class="panel"
    hidden={tabbed && tab !== "details"}
    role={tabbed ? "tabpanel" : undefined}
    id={tabbed ? `${uid}-panel-details` : undefined}
    aria-labelledby={tabbed ? `${uid}-tab-details` : undefined}
  >
  <fieldset class="fields" disabled={readonly}>
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
    {#if onunlisted}
      <!-- Gallery visibility (Archie-bdc0): an exhibit-only lever, so it renders only where a host wires
           onunlisted. Copy leads with what it does for the curator; the mechanic (still reachable by link)
           is the demoted second line. Inside the fieldset, so the writer lock disables it with everything else. -->
      <label class="field visibility">
        <span class="cb-row">
          <input type="checkbox" checked={unlisted} onchange={(e) => onunlisted((e.currentTarget as HTMLInputElement).checked)} />
          <span class="cb-text">Hide this {scope} from the public gallery</span>
        </span>
        <span class="hint">People with the direct link can still open it — it just won’t appear in the gallery, the all-images wall, or the sitemap.</span>
      </label>
    {/if}
    {#if onremove}
      <div class="danger">
        <button type="button" class="remove" class:confirming onclick={onRemoveClick} onblur={() => (confirming = false)}>
          {confirming ? "Confirm — this can’t be undone" : removeLabel}
        </button>
      </div>
    {/if}
  </fieldset>
  </div>
  {#if onmetadata}
    <div
      class="panel"
      hidden={tab !== "metadata"}
      role="tabpanel"
      id="{uid}-panel-metadata"
      aria-labelledby="{uid}-tab-metadata"
    >
      <fieldset class="fields" disabled={readonly}>
        <MetadataEditor {entries} {scope} level={levelOf(scope)} onchange={onmetadata} />
      </fieldset>
    </div>
  {/if}
</div>

<style>
  .details { display: flex; flex-direction: column; gap: var(--space-3); }
  /* The disabled-propagation fieldset is layout-invisible: it takes over .details' column flow (browser
     default fieldset chrome reset), so the form renders identically to the pre-fieldset markup. */
  .fields { display: flex; flex-direction: column; gap: var(--space-3); border: 0; padding: 0; margin: 0; min-width: 0; }
  .fields:disabled { opacity: 0.6; }
  /* The tabpanel wrapper is layout-invisible in the single-pane case (one child, block flow). */
  .panel { min-width: 0; }
  .panel[hidden] { display: none; }

  /* Tab strip — the CmdK view-switcher idiom (underline, no fill), one level quieter for a drawer. */
  .tabs { display: flex; gap: var(--space-3); border-bottom: 1px solid var(--border-paper); }
  .tabs button {
    background: none; border: none; cursor: pointer; padding: var(--space-1) 0 var(--space-2);
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs, 0.7rem); letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--ink-paper-muted, var(--ink-paper-secondary));
    border-bottom: 2px solid transparent; margin-bottom: -1px;
    transition: color 140ms ease, border-color 140ms ease;
  }
  .tabs button:hover { color: var(--ink-paper-primary); }
  .tabs button.on { color: var(--accent); border-bottom-color: var(--accent); }
  /* How many fields are actually set — the tab carries the same "Set" signal the drawer triggers do. */
  .tab-count { margin-left: var(--space-1); font-size: 0.62rem; letter-spacing: 0; opacity: 0.7; }
  /* Read-only reason (writer lock) — quiet body voice, mirrors the overview's read-only message. */
  .ro-note { margin: 0; font-family: var(--font-body), serif; font-size: 0.8rem; font-style: italic; color: var(--ink-paper-secondary); }
  .field { display: flex; flex-direction: column; gap: var(--space-1); }
  .field-head {
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs, 0.7rem); font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.18em; color: var(--ink-paper-muted, var(--ink-paper-secondary));
    opacity: 0.6;
  }
  input, textarea {
    font-family: var(--font-body), serif; font-size: 0.85rem; color: var(--ink-paper-primary);
    background: var(--surface-paper-card); border: 1px solid var(--border-paper);
    border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); width: 100%; box-sizing: border-box;
  }
  textarea { resize: vertical; }
  input:focus, textarea:focus { outline: none; border-color: var(--accent); }

  /* Gallery-visibility lever (Archie-bdc0): a checkbox row + a demoted mechanic line. The checkbox opts out
     of the full-width text-input rule above (it's not a text field) and sits inline with its label. */
  .visibility { gap: var(--space-1); }
  .cb-row { display: flex; flex-direction: row; align-items: flex-start; gap: var(--space-2); }
  .cb-row input[type="checkbox"] {
    width: auto; margin: 2px 0 0; padding: 0; flex: none; accent-color: var(--accent);
  }
  .cb-text { font-family: var(--font-body), serif; font-size: 0.85rem; color: var(--ink-paper-primary); }
  .visibility .hint { margin: 0; font-family: var(--font-body), serif; font-size: 0.75rem; color: var(--ink-paper-secondary); }

  /* Destructive remove (3f4c): a quiet soft button that warms into a semantic-error fill on the armed second-click guard. */
  .danger { margin-top: var(--space-1); }
  .remove {
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm, 0.8125rem);
    text-transform: uppercase; letter-spacing: 0.08em;
    padding: var(--space-2) var(--space-3); cursor: pointer; width: 100%;
    background: var(--surface-paper-card); color: var(--semantic-error);
    border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-sm);
    transition: background 160ms ease, color 160ms ease;
  }
  .remove:hover { background: var(--semantic-error); color: var(--ink-on-accent); border-color: transparent; }
  .remove.confirming { background: var(--semantic-error); color: var(--ink-on-accent); border-color: transparent; font-weight: 600; }
</style>
