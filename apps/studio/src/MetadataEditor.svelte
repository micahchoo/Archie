<script lang="ts" module>
  /** Instance counter — the id prefix that keeps two mounted editors' option ids distinct. */
  let instances = 0;
</script>

<script lang="ts">
/**
 * @surface {paper}
 * @composes {Metadata row editor}
 * @variants {empty (seeded from level defaults), populated; single-row, multi-row}
 * @constraint {paper surface: warm tokens (--surface-paper, --ink-paper-*); values are free text everywhere}
 */
  // The pick-from-vocab descriptive-metadata editor (Archie-458e) — the real build of the
  // prototypes/metadata-editor probe (Archie-e100), at every level DetailsEditor renders.
  //
  // Shape carried from the prototype + its reaction:
  //  · rows, not a form: the level's default field set seeds BLANK rows, and blank rows persist nothing.
  //  · repeats are repeated rows, added from the row's own "+" — the picker hides a used property, so
  //    "another Creator" has exactly one door.
  //  · relabelling lives behind the row's overflow (clicking the label was too invisible to find); while
  //    a label departs from the vocabulary an amber `dcterms:` spine mark names the real property and
  //    offers a reset.
  //  · reordering never interleaves properties (metadata-rows.ts `moveRow`).
  //  · values are FREE TEXT everywhere. "ca. 1404–1438" is a real date to a curator; a date picker here
  //    would be a decision about scholarship, not a convenience. Deliberate, not an omission.
  //
  // All logic lives in metadata-rows.ts (unit-tested); this file is the shell + the focus/keyboard work.
  import { tick, untrack } from "svelte";
  import type { MetadataEntry } from "@render/core";
  import {
    addCustom,
    addProperty,
    canMove,
    displayLabelOf,
    isRelabelled,
    moveRow,
    patchRow,
    pickableProperties,
    relabelRow,
    removeRow,
    repeatRow,
    resetLabel,
    sameEntries,
    seedRows,
    toEntries,
    type MetadataLevel,
    type MetadataRow,
  } from "./metadata-rows.js";

  let {
    entries = [],
    level,
    scope,
    onchange,
  }: {
    /** The level's persisted entries (order = display order). */
    entries?: readonly MetadataEntry[];
    /** Which default field set to seed from. */
    level: MetadataLevel;
    /** Curator noun for this level ("object" / "exhibit" / "library"), used in field copy. */
    scope: string;
    /** Emit the sanitized entries on every edit — the host merges + persists through the SAME
     *  patch/autosave path as title/description/rights (no new save vocabulary). */
    onchange: (next: MetadataEntry[]) => void;
  } = $props();

  let uid = `md${(instances += 1)}`;

  // ROWS are local: they include the blank scaffolding that `entries` deliberately does not carry.
  // `emitted` remembers what we last wrote, so the prop change our own write causes is recognised as an
  // echo and does NOT re-seed (which would delete the row the curator is typing into). A change that
  // ISN'T our echo — switching objects, an undo, a collaborator — re-seeds, which is the point.
  // (`untrack` on the initial seed says what is meant: capture the props ONCE here — the $effect below
  // owns every re-seed after that. Without it the compiler rightly warns that a bare read at init only
  // ever sees the first value.)
  let rows = $state<MetadataRow[]>(untrack(() => seedRows(entries, level)));
  let emitted: MetadataEntry[] = untrack(() => toEntries(rows));
  let seededLevel: MetadataLevel = untrack(() => level);
  $effect(() => {
    const incoming = entries ?? [];
    if (level === seededLevel && sameEntries(incoming, emitted)) return;
    seededLevel = level;
    rows = seedRows(incoming, level);
    emitted = toEntries(rows);
  });

  function commit(next: MetadataRow[]) {
    rows = next;
    emitted = toEntries(next);
    onchange(emitted);
  }

  // --- focus follow-through: after a row is added or moved, the caret goes where the curator's
  // attention already went. Keyed by row id (not index — a move renumbers the indices). ---
  const valueEls: Record<string, HTMLInputElement | undefined> = {};
  async function focusValue(index: number) {
    await tick();
    const id = rows[index]?.id;
    if (id) valueEls[id]?.focus();
  }

  // --- row actions ---
  function setValue(i: number, value: string) {
    commit(patchRow(rows, i, { value }));
  }
  function onRepeat(i: number) {
    const next = repeatRow(rows, i);
    commit(next.rows);
    void focusValue(next.index);
  }
  function onMove(i: number, delta: -1 | 1) {
    const next = moveRow(rows, i, delta);
    if (!next) return;
    commit(next.rows);
    void focusValue(next.index);
  }
  function onRemove(i: number) {
    closeMenu();
    commit(removeRow(rows, i));
  }

  // --- relabel (behind the overflow, per the prototype reaction) ---
  let relabelId = $state<string | null>(null);
  let relabelDraft = $state("");
  let labelEl = $state<HTMLInputElement | null>(null);
  async function startRelabel(i: number) {
    closeMenu();
    relabelDraft = displayLabelOf(rows[i]!);
    relabelId = rows[i]!.id;
    await tick();
    labelEl?.select();
  }
  function commitRelabel(i: number) {
    if (relabelId === null) return;
    relabelId = null;
    commit(relabelRow(rows, i, relabelDraft));
  }
  function onResetLabel(i: number) {
    closeMenu();
    commit(resetLabel(rows, i));
  }

  // --- the row overflow menu ---
  let menuId = $state<string | null>(null);
  const closeMenu = () => (menuId = null);
  function onMenuKeydown(e: KeyboardEvent, i: number) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    closeMenu();
    void tick().then(() => menuButtons[rows[i]?.id ?? ""]?.focus());
  }
  const menuButtons: Record<string, HTMLButtonElement | undefined> = {};

  // --- add-a-field picker: a combobox over the remaining vocabulary. Fully arrow-key navigable, and
  // (unlike the prototype) honestly described to assistive tech — `aria-expanded` tracks the real state
  // and `aria-activedescendant` names the highlighted option, including the custom-label one. ---
  let pickerOpen = $state(false);
  let query = $state("");
  let active = $state(0);
  let searchEl = $state<HTMLInputElement | null>(null);
  let addEl = $state<HTMLButtonElement | null>(null);
  const items = $derived(pickableProperties(rows, query));
  /** Index `items.length` is the "Custom label" option — it is a real option in the listbox, so it can
   *  be reached by arrow keys and named by aria-activedescendant. */
  const activeMax = $derived(items.length);
  const activeId = $derived(active >= items.length ? `${uid}-custom` : `${uid}-opt-${active}`);

  async function openPicker() {
    pickerOpen = true;
    query = "";
    active = 0;
    await tick();
    searchEl?.focus();
  }
  async function closePicker(refocus = false) {
    pickerOpen = false;
    if (!refocus) return;
    await tick();
    addEl?.focus();
  }
  function pick(property: string) {
    const next = addProperty(rows, property);
    void closePicker();
    commit(next.rows);
    void focusValue(next.index);
  }
  async function pickCustom() {
    const named = query.trim();
    const next = addCustom(rows, named);
    void closePicker();
    commit(next.rows);
    // No name typed → drop straight into naming the field; otherwise the value is what's missing.
    if (named) void focusValue(next.index);
    else await startRelabel(next.index);
  }
  function onPickerKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(active + 1, activeMax);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (e.key === "Home") {
      e.preventDefault();
      active = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      active = activeMax;
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = items[active];
      if (hit) pick(hit.property);
      else void pickCustom();
    } else if (e.key === "Escape") {
      e.preventDefault();
      void closePicker(true);
    }
  }
  // Keep the highlighted option in view when the arrow keys walk past the scroll edge.
  let listEl = $state<HTMLUListElement | null>(null);
  $effect(() => {
    if (!pickerOpen) return;
    const id = activeId;
    void tick().then(() => listEl?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: "nearest" }));
  });
</script>

<svelte:window
  onpointerdown={(e) => {
    // Dismiss the transient popovers on an outside press — same reflex as the drawer's scrim, but these
    // are inline (no scrim of their own; a scrim here would fight the drawer's).
    const t = e.target as HTMLElement | null;
    if (menuId && !t?.closest(".row-menu, .rbtn-more")) closeMenu();
    if (pickerOpen && !t?.closest(".picker, .addfield")) void closePicker();
  }}
/>

<div class="metadata">
  <p class="lead">Descriptive fields published with this {scope} — and shown to anyone reading it.</p>

  {#if rows.length > 0}
    <div class="rows">
      {#each rows as row, i (row.id)}
        {@const label = displayLabelOf(row)}
        <div class="mrow" class:relabelling={relabelId === row.id}>
          <div class="labelcell">
            {#if relabelId === row.id}
              <input
                class="label-input"
                bind:this={labelEl}
                bind:value={relabelDraft}
                aria-label="Field name"
                onblur={() => commitRelabel(i)}
                onkeydown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitRelabel(i); void focusValue(i); }
                  else if (e.key === "Escape") { e.preventDefault(); relabelId = null; }
                }}
              />
            {:else}
              <span class="label" id="{uid}-lbl-{row.id}" title={row.property ?? "A field of your own naming"}>{label}</span>
              {#if isRelabelled(row)}
                <span class="spine">
                  {row.property}
                  <button type="button" class="spine-reset" onclick={() => onResetLabel(i)}>reset</button>
                </span>
              {/if}
            {/if}
          </div>

          <input
            class="value"
            type="text"
            bind:this={valueEls[row.id]}
            value={row.value}
            aria-labelledby="{uid}-lbl-{row.id}"
            oninput={(e) => setValue(i, (e.currentTarget as HTMLInputElement).value)}
            onkeydown={(e) => {
              if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                e.preventDefault();
                onMove(i, e.key === "ArrowUp" ? -1 : 1);
              }
            }}
          />

          <!-- The actions FLOAT over the value's trailing edge (they appear on hover / focus-within):
               at drawer width a reserved column would cost the value field a third of its room. -->
          <div class="actions">
            <button type="button" class="rbtn" title="Add another {label.toLowerCase()}"
              aria-label="Add another {label.toLowerCase()}" onclick={() => onRepeat(i)}>+</button>
            <button type="button" class="rbtn" title="Move up (Alt+↑)" aria-label="Move {label} up"
              disabled={!canMove(rows, i, -1)} onclick={() => onMove(i, -1)}>↑</button>
            <button type="button" class="rbtn" title="Move down (Alt+↓)" aria-label="Move {label} down"
              disabled={!canMove(rows, i, 1)} onclick={() => onMove(i, 1)}>↓</button>
            <button type="button" class="rbtn rbtn-more" bind:this={menuButtons[row.id]}
              aria-label="More actions for {label}" aria-haspopup="menu" aria-expanded={menuId === row.id}
              onclick={() => (menuId = menuId === row.id ? null : row.id)}>⋯</button>

            {#if menuId === row.id}
              <div class="row-menu" role="menu" tabindex="-1" aria-label="{label} actions" onkeydown={(e) => onMenuKeydown(e, i)}>
                <button type="button" role="menuitem" onclick={() => startRelabel(i)}>Rename field…</button>
                {#if isRelabelled(row)}
                  <button type="button" role="menuitem" onclick={() => onResetLabel(i)}>Restore “{row.property ? displayLabelOf({ property: row.property }) : label}”</button>
                {/if}
                <button type="button" role="menuitem" class="danger" onclick={() => onRemove(i)}>Remove field</button>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="add">
    <button type="button" class="addfield" bind:this={addEl} aria-expanded={pickerOpen}
      onclick={() => (pickerOpen ? void closePicker(true) : void openPicker())}>
      <span aria-hidden="true">+</span> Add a field
    </button>

    {#if pickerOpen}
      <div class="picker">
        <input
          class="picker-search"
          type="text"
          role="combobox"
          bind:this={searchEl}
          bind:value={query}
          oninput={() => (active = 0)}
          onkeydown={onPickerKeydown}
          placeholder="Search fields…"
          aria-label="Search metadata fields"
          aria-expanded="true"
          aria-controls="{uid}-list"
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autocomplete="off"
        />
        <ul class="picker-list" id="{uid}-list" role="listbox" aria-label="Metadata fields" bind:this={listEl}>
          {#if items.length === 0}
            <li class="picker-empty" role="presentation">
              {query.trim() ? `Nothing in the vocabulary matches “${query.trim()}”.` : "Every field is already in use."}
            </li>
          {/if}
          {#each items as p, i (p.property)}
            <li role="presentation">
              <button
                type="button" role="option" tabindex="-1"
                id="{uid}-opt-{i}"
                class:active={i === active}
                aria-selected={i === active}
                onmousemove={() => (active = i)}
                onclick={() => pick(p.property)}
              >
                <span class="pi-label">{p.label}</span>
                <span class="pi-term">{p.property}</span>
                <span class="pi-comment">{p.comment}</span>
              </button>
            </li>
          {/each}
          <li role="presentation">
            <button
              type="button" role="option" tabindex="-1"
              id="{uid}-custom"
              class="custom"
              class:active={active >= items.length}
              aria-selected={active >= items.length}
              onmousemove={() => (active = items.length)}
              onclick={() => void pickCustom()}
            >
              <span class="pi-label">{query.trim() ? `Custom label “${query.trim()}”` : "Custom label…"}</span>
              <span class="pi-comment">A field of your own naming, outside the vocabulary.</span>
            </button>
          </li>
        </ul>
        <p class="picker-hint"><kbd>↑↓</kbd> move · <kbd>↵</kbd> add · <kbd>esc</kbd> close</p>
      </div>
    {/if}
  </div>

  <!-- Load-bearing footnote: the default field set puts blank rows on screen, and a curator is entitled
       to know that leaving them blank costs nothing. -->
  <p class="hint">Empty fields aren’t saved.</p>
</div>

<style>
  .metadata { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
  .lead, .hint {
    margin: 0; font-family: var(--font-body), serif; font-size: 0.75rem; line-height: 1.6;
    color: var(--ink-paper-muted, var(--ink-paper-secondary));
  }

  .rows { display: flex; flex-direction: column; gap: var(--space-1); }
  /* Row = label above value, so the value keeps the drawer's full width (a two-column row at 380px
     leaves the value nowhere to breathe). */
  .mrow { position: relative; display: flex; flex-direction: column; gap: 2px; min-width: 0; }

  .labelcell { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; }
  .label {
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs, 0.7rem); font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.18em; color: var(--ink-paper-muted, var(--ink-paper-secondary));
    opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  /* The spine mark: the real dcterms property, shown ONLY while the display label departs from it —
     an amber state indicator, not decoration. */
  .spine {
    display: inline-flex; align-items: baseline; gap: var(--space-1); flex: none;
    font-family: var(--font-ui), sans-serif; font-size: 0.62rem; letter-spacing: 0.04em;
    color: var(--semantic-warning);
  }
  .spine-reset {
    border: none; background: none; padding: 0; cursor: pointer;
    font: inherit; color: inherit; text-decoration: underline; text-underline-offset: 2px;
  }
  .spine-reset:hover { color: var(--accent); }

  .value, .label-input {
    font-family: var(--font-body), serif; font-size: 0.85rem; color: var(--ink-paper-primary);
    background: var(--surface-paper-card); border: 1px solid var(--border-paper);
    border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); width: 100%; box-sizing: border-box;
  }
  .value:focus, .label-input:focus, .picker-search:focus { outline: none; border-color: var(--accent); }
  .label-input {
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs, 0.7rem);
    letter-spacing: 0.08em; padding: 2px var(--space-2);
  }

  /* Quiet until wanted: the actions fade in on hover or when anything in the row takes focus, so the
     keyboard reaches them exactly when the mouse does. */
  .actions {
    position: absolute; right: var(--space-1); bottom: 4px;
    display: flex; align-items: center; gap: 1px;
    opacity: 0; transition: opacity 140ms ease;
  }
  .mrow:hover .actions, .mrow:focus-within .actions { opacity: 1; }
  .rbtn {
    border: none; background: var(--surface-paper-card); cursor: pointer;
    width: 1.35rem; height: 1.35rem; line-height: 1; border-radius: var(--radius-sm);
    font-family: var(--font-ui), sans-serif; font-size: 0.8rem;
    color: var(--ink-paper-secondary);
    transition: color 140ms ease, background 140ms ease;
  }
  .rbtn:hover:not(:disabled) { color: var(--accent); background: var(--surface-paper-hover); }
  .rbtn:disabled { opacity: 0.25; cursor: default; }

  .row-menu {
    position: absolute; top: calc(100% + 4px); right: 0; z-index: 5; min-width: 11rem;
    display: flex; flex-direction: column;
    background: var(--surface-paper-card); border: 1px solid var(--border-paper);
    border-radius: var(--radius-sm); box-shadow: var(--shadow-lift-mid); padding: var(--space-1);
  }
  .row-menu button {
    border: none; background: none; cursor: pointer; text-align: left;
    padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm);
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm, 0.8125rem);
    color: var(--ink-paper-primary);
  }
  .row-menu button:hover, .row-menu button:focus-visible { background: var(--surface-paper-hover); color: var(--accent); outline: none; }
  .row-menu button.danger { color: var(--semantic-error); }
  .row-menu button.danger:hover, .row-menu button.danger:focus-visible { color: var(--semantic-error); }

  .add { position: relative; }
  .addfield {
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm, 0.8125rem);
    letter-spacing: 0.06em; cursor: pointer; width: 100%;
    padding: var(--space-2) var(--space-3);
    background: transparent; color: var(--ink-paper-secondary);
    border: 1px dashed var(--border-paper); border-radius: var(--radius-sm);
    transition: color 140ms ease, border-color 140ms ease;
  }
  .addfield:hover { color: var(--accent); border-color: var(--accent); }

  .picker {
    margin-top: var(--space-1);
    background: var(--surface-paper-card); border: 1px solid var(--border-paper);
    border-radius: var(--radius-sm);
    padding: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1);
  }
  .picker-search {
    font-family: var(--font-ui), sans-serif; font-size: 0.8rem; color: var(--ink-paper-primary);
    background: var(--surface-paper-card); border: 1px solid var(--border-paper);
    border-radius: var(--radius-sm); padding: var(--space-1) var(--space-2); width: 100%; box-sizing: border-box;
  }
  .picker-list { list-style: none; margin: 0; padding: 0; max-height: 15rem; overflow-y: auto; }
  .picker-list button {
    display: grid; grid-template-columns: 1fr auto; gap: 0 var(--space-2); width: 100%; text-align: left;
    border: none; background: none; cursor: pointer;
    padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm);
  }
  .picker-list button.active { background: var(--surface-paper-hover); }
  .pi-label {
    font-family: var(--font-ui), sans-serif; font-size: 0.8rem; color: var(--ink-paper-primary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .picker-list button.active .pi-label { color: var(--accent); }
  .pi-term { font-family: var(--font-ui), sans-serif; font-size: 0.62rem; color: var(--ink-paper-muted, var(--ink-paper-secondary)); opacity: 0.7; }
  .pi-comment {
    grid-column: 1 / -1;
    font-family: var(--font-body), serif; font-size: 0.7rem; line-height: 1.5;
    color: var(--ink-paper-muted, var(--ink-paper-secondary));
  }
  .picker-empty {
    padding: var(--space-2); font-family: var(--font-body), serif; font-size: 0.75rem;
    color: var(--ink-paper-muted, var(--ink-paper-secondary));
  }
  .picker-list .custom { border-top: 1px solid var(--border-paper); border-radius: 0 0 var(--radius-sm) var(--radius-sm); }
  .picker-hint {
    margin: 0; font-family: var(--font-ui), sans-serif; font-size: 0.62rem; letter-spacing: 0.04em;
    color: var(--ink-paper-muted, var(--ink-paper-secondary));
  }
  .picker-hint kbd {
    font-family: var(--font-ui), sans-serif; font-size: 0.6rem;
    border: 1px solid var(--border-paper); border-radius: 3px; padding: 0 3px;
  }
</style>
