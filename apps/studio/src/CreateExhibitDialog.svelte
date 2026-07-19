<script lang="ts">
  // The create/import dialog (Archie-51cc, decided by Archie-8482 "Variant A — one scrimmed dialog,
  // three in-surface expanding paths"). Replaces the old New-exhibit grid cell's cramped trio (a
  // title field + a hidden folder input + `window.prompt` for IIIF) with ONE entry point: a
  // three-card chooser that expands the picked path IN PLACE (others disappear; `‹ Back` returns to
  // the chooser without closing the dialog) — ported from prototypes/create-surface/{app.js,styles.css},
  // which the user reviewed and approved. This component is UI only: every actual ingest is one of
  // the three callbacks below, already wired to ingest-flows.ts by App.svelte/LibraryHome.svelte —
  // no new ingest logic lives here (see create-exhibit-dialog.ts / folder-drop.ts for the supporting
  // pure/DOM helpers, which likewise only orchestrate existing ingest-flows.ts / iiif-import.ts /
  // folder-import.ts exports).
  //
  // Scrim/dismissal (CONTEXT.md → Surfaces): via the shared modality helper (Archie-5968) — scrim-click
  // and Esc both close the WHOLE dialog in one action (the in-surface `‹ Back` link is the return-to-
  // chooser affordance, NOT an Esc rung). No close-confirmation guard (autosave makes dismissal lossless);
  // a mid-flight IIIF check cancels cleanly on close or supersede — iiifToken discards its result AND
  // iiifAbort stops the actual network request. Focus trap + return are the helper's, not hand-rolled.
  //
  // Single-scrim invariant: this component does NOT close other surfaces itself (it doesn't know about
  // them) — the helper's `presentScrim` REPLACES whatever scrimmed surface was open (an open PropsDrawer)
  // the moment this dialog mounts, so opening it structurally closes the drawer. That is the ONE mechanism:
  // LibraryHome's openers no longer hand-close the other surface (removed as redundant, Archie-5968).
  import { tick } from "svelte";
  import {
    type CreateSurfaceScope, type IiifStatus,
    surfaceTitle, createActionLabel, offersStartEmpty,
    pickedFromFiles, emptyPathValid, folderPathValid, iiifPathValid, looksLikeUrl, previewManifest,
  } from "./create-exhibit-dialog.js";
  import { summarizeFolderFiles, folderGroupCount, flattenedRelativePaths, type FolderSummary } from "./folder-import.js";
  import { readDroppedFolderFiles } from "./folder-drop.js";
  // Scrimmed surface via the shared helper (Archie-5968): the hand-rolled Esc handler, Tab-trap, and
  // focus-return this dialog carried are now the ONE modality implementation. `focusFirst` stays — it is
  // surface-specific (re-focus after switching path view / a prefill open), richer than the helper's
  // generic "focus the first control", not part of the modal-open/return contract the helper owns.
  import { scrimmed, trapFocus, modality } from "./modality.svelte";

  let {
    open,
    scope = { kind: "new-exhibit" },
    prefillFolderFiles = null,
    oncreate,
    oncreatefromfolder,
    oncreatefrommanifest,
    onclose,
  }: {
    open: boolean;
    /** Archie-beb6's scope parameter — only "new-exhibit" is wired/shipped by this ticket. */
    scope?: CreateSurfaceScope;
    /** Page-level folder drop (LibraryHome's drop target) hands the picked files straight in — the
     *  dialog opens already on the folder path with this folder summarized (Variant B's grafted
     *  trait). Read once per open transition; LibraryHome clears it after handing off. */
    prefillFolderFiles?: File[] | null;
    oncreate: (title: string) => void;
    oncreatefromfolder: (files: File[]) => void;
    oncreatefrommanifest: (url: string) => void;
    onclose: () => void;
  } = $props();

  type PathKind = "empty" | "folder" | "iiif";
  let activePath = $state<PathKind | null>(null);
  let dialogEl = $state<HTMLElement | null>(null);

  // "Start empty" path.
  let title = $state("");

  // "From a media folder" path.
  let folderFiles = $state<File[] | null>(null);
  let folderSummary = $state<FolderSummary | null>(null);
  let folderGroups = $state(1);
  let grouping = $state<"per-subfolder" | "flatten">("per-subfolder");
  let dropActive = $state(false);
  let dirEl = $state<HTMLInputElement | null>(null);

  // "From a IIIF link" path.
  let iiifUrl = $state("");
  let iiifStatus = $state<IiifStatus>("idle");
  let iiifMessage = $state("");
  let iiifPreview = $state<{ title: string; canvases: number } | null>(null);
  let iiifToken = 0;
  let iiifTimer: ReturnType<typeof setTimeout> | undefined;
  // The in-flight preview fetch, so close/supersede can actually stop the network request (NIT,
  // code review) rather than just discarding its result once it eventually resolves (iiifToken
  // alone already guarantees the DISCARD half of "cancels cleanly").
  let iiifAbort: AbortController | undefined;

  function resetAll() {
    activePath = null;
    title = "";
    folderFiles = null;
    folderSummary = null;
    folderGroups = 1;
    grouping = "per-subfolder";
    iiifUrl = "";
    iiifStatus = "idle";
    iiifMessage = "";
    iiifPreview = null;
    iiifToken++;
    clearTimeout(iiifTimer);
    iiifAbort?.abort();
    iiifAbort = undefined;
  }

  function applyFolderFiles(files: File[]) {
    folderFiles = files;
    const picked = pickedFromFiles(files);
    folderSummary = summarizeFolderFiles(picked);
    folderGroups = folderGroupCount(picked);
    grouping = "per-subfolder";
  }

  async function focusFirst() {
    await tick();
    const el = dialogEl?.querySelector<HTMLElement>(".path-card, .field input");
    if (el) el.focus();
    else dialogEl?.focus();
  }

  // Opening (re)seeds every path's transient state — a stale IIIF preview or half-picked folder
  // from a previous open must never bleed into the next one. A page-level folder drop instead seeds
  // straight into the folder path with its summary already computed (skips the dropzone step).
  $effect(() => {
    if (open) {
      resetAll();
      if (prefillFolderFiles && prefillFolderFiles.length > 0) {
        activePath = "folder";
        applyFolderFiles(prefillFolderFiles);
      }
      void focusFirst();
    }
  });

  // Esc/scrim-click both route here through the shared helper (onClose: close): the WHOLE dialog closes
  // in one action (the `‹ Back` link is the return-to-chooser affordance, not an Esc rung). No close
  // confirmation — autosave makes it lossless. A mid-flight IIIF check cancels cleanly (discard + abort);
  // focus-return to the opener is the helper's job now.
  function close() {
    clearTimeout(iiifTimer);
    iiifToken++; // discards any in-flight IIIF check's result — the "cancels cleanly" contract
    iiifAbort?.abort(); // and actually stops the network request, not just its result
    onclose();
  }

  function selectPath(p: PathKind) {
    activePath = p;
    void focusFirst();
  }
  function backToMenu() {
    activePath = null;
    void focusFirst();
  }

  function submitEmpty() {
    if (!emptyPathValid(title)) return;
    oncreate(title.trim());
    close();
  }

  // The flatten choice returns FRESH File instances (never mutates folderFiles in place) — this
  // dialog closes right after submit today, but leaving the picked files' original per-subfolder
  // paths untouched means a future "stay open, try another grouping" tweak can't be bitten by a
  // stale in-place edit.
  function applyFlatten(files: File[]): File[] {
    const paths = flattenedRelativePaths(pickedFromFiles(files));
    return files.map((f, i) => Object.assign(new File([f], f.name, { type: f.type, lastModified: f.lastModified }), { webkitRelativePath: paths[i] }));
  }

  function submitFolder() {
    if (!folderFiles || !folderPathValid(folderSummary)) return;
    const files = grouping === "flatten" && folderGroups > 1 ? applyFlatten(folderFiles) : folderFiles;
    oncreatefromfolder(files);
    close();
  }

  function submitIiif() {
    if (!iiifPathValid(iiifStatus)) return;
    oncreatefrommanifest(iiifUrl.trim());
    close();
  }

  function onIiifInput(v: string) {
    iiifUrl = v;
    clearTimeout(iiifTimer);
    iiifAbort?.abort(); // a newer keystroke supersedes any check already in flight
    const trimmed = v.trim();
    if (!trimmed) {
      iiifStatus = "idle";
      iiifMessage = "";
      iiifPreview = null;
      iiifToken++;
      return;
    }
    if (!looksLikeUrl(trimmed)) {
      iiifStatus = "invalid";
      iiifMessage = "That doesn't look like a link yet.";
      iiifPreview = null;
      iiifToken++;
      return;
    }
    iiifStatus = "checking";
    iiifMessage = "";
    iiifPreview = null;
    const myToken = ++iiifToken;
    iiifTimer = setTimeout(() => void runIiifCheck(trimmed, myToken), 500);
  }
  async function runIiifCheck(url: string, myToken: number) {
    const controller = new AbortController();
    iiifAbort = controller;
    const result = await previewManifest(url, controller.signal);
    if (myToken !== iiifToken) return; // a newer keystroke (or a close) superseded this check
    if (result.status === "valid") {
      iiifStatus = "valid";
      iiifPreview = { title: result.title, canvases: result.canvases };
    } else {
      iiifStatus = "invalid";
      iiifMessage = result.message;
      iiifPreview = null;
    }
  }

  function pickFolder() {
    dirEl?.click();
  }
  function onDirChange(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    if (el.files?.length) applyFolderFiles(Array.from(el.files));
    el.value = "";
  }
  async function onDrop(e: DragEvent) {
    e.preventDefault();
    dropActive = false;
    const items = e.dataTransfer?.items;
    if (!items || items.length === 0) return;
    // The walker is itself per-entry tolerant (folder-drop.ts); this catch is the belt-and-braces
    // half (code review S1) — a rejection here must surface a plain-language message, not an
    // unhandled promise rejection and a silently dead drop.
    try {
      const files = await readDroppedFolderFiles(Array.from(items));
      if (files.length > 0) applyFolderFiles(files);
    } catch (err) {
      console.error("Folder drop failed", err);
      window.alert("Couldn't read that folder.");
    }
  }
</script>

{#if open}
  <!-- Sibling scrim + dialog (PropsDrawer/TutorialModal's shape): the panel needs no click-stop
       handler since a click inside it never bubbles to a non-ancestor sibling. -->
  <div class="scrim" role="presentation" onclick={() => modality.dismiss()}></div>
  <div class="dialog" bind:this={dialogEl} role="dialog" aria-modal="true" aria-label={surfaceTitle(scope)} tabindex="-1"
    use:scrimmed={{ onClose: close }} onkeydown={trapFocus}>
    {#if activePath === null}
      <div class="chooser-head">
        <h2>{surfaceTitle(scope)}</h2>
        <button type="button" class="close-x" onclick={close} aria-label="Close">×</button>
      </div>
      <div class="path-cards">
        {#if offersStartEmpty(scope)}
          <button type="button" class="path-card" onclick={() => selectPath("empty")}>
            <span class="glyph" aria-hidden="true">+</span>
            <span class="p-title">Start empty</span>
            <span class="p-desc">Begin with a blank exhibit and add media as you go.</span>
          </button>
        {/if}
        <button type="button" class="path-card" onclick={() => selectPath("folder")}>
          <span class="glyph" aria-hidden="true">⌸</span>
          <span class="p-title">From a media folder</span>
          <span class="p-desc">Point at a folder of images, audio, or video — each file becomes an object, in folder order.</span>
        </button>
        <button type="button" class="path-card" onclick={() => selectPath("iiif")}>
          <span class="glyph" aria-hidden="true">⇲</span>
          <span class="p-title">From a IIIF link</span>
          <span class="p-desc">Paste a IIIF link (from a library or museum site) and Archie fetches its pages for you.</span>
        </button>
      </div>
    {:else}
      <div class="chooser-head">
        <h2>{activePath === "empty" ? "Start empty" : activePath === "folder" ? "From a media folder" : "From a IIIF link"}</h2>
        <button type="button" class="close-x" onclick={close} aria-label="Close">×</button>
      </div>
      <button type="button" class="back-link" onclick={backToMenu}>‹ Back</button>

      {#if activePath === "empty"}
        <div class="field">
          <label class="f-label" for="createTitle">Exhibit title</label>
          <input id="createTitle" type="text" bind:value={title} placeholder="e.g. Herbal quires" autocomplete="off" />
        </div>
        <div class="path-actions">
          <button type="button" class="btn btn-ghost" onclick={close}>Cancel</button>
          <button type="button" class="btn btn-primary" disabled={!emptyPathValid(title)} onclick={submitEmpty}>{createActionLabel(scope)}</button>
        </div>
      {:else if activePath === "folder"}
        {#if folderSummary}
          <div class="folder-summary">
            <span class="fs-icon" aria-hidden="true">⌸</span>
            <span class="fs-text">
              <span class="fs-name">{folderSummary.name}</span>
              <span class="fs-counts">{folderSummary.images} image{folderSummary.images === 1 ? "" : "s"} · {folderSummary.audio} audio · {folderSummary.video} video</span>
            </span>
            <button type="button" class="fs-change" onclick={pickFolder}>Change folder…</button>
          </div>
          {#if folderSummary.total === 0}
            <p class="empty-folder-note">No images, audio, or video found in that folder.</p>
          {:else if folderGroups > 1}
            <!-- Progressive disclosure (Archie-8482): only shown once the folder actually holds
                 media subfolders — a flat folder never sees a choice with nothing to choose between. -->
            <fieldset class="grouping-choice">
              <!-- Lead with the outcome, not a subfolder count (code review S2): folderGroups is
                   planFolderImportGroups().length, which also counts a loose-top-level-files group
                   as one — "N subfolders" over-counts whenever loose media sits alongside a real
                   subfolder. "N exhibits" is unambiguous either way. -->
              <legend class="f-label">This will create {folderGroups} exhibits</legend>
              <label class="grouping-option">
                <input type="radio" name="grouping" checked={grouping === "per-subfolder"} onchange={() => (grouping = "per-subfolder")} />
                One exhibit per subfolder ({folderGroups})
              </label>
              <label class="grouping-option">
                <input type="radio" name="grouping" checked={grouping === "flatten"} onchange={() => (grouping = "flatten")} />
                One exhibit from everything
              </label>
            </fieldset>
          {/if}
        {:else}
          <div
            class="dropzone"
            role="presentation"
            class:dragover={dropActive}
            ondragover={(e) => {
              e.preventDefault();
              dropActive = true;
            }}
            ondragleave={() => (dropActive = false)}
            ondrop={onDrop}
          >
            <span class="dz-title">Drag a folder here</span>
            <span class="dz-or">or</span>
            <button type="button" class="btn btn-ghost" onclick={pickFolder}>Choose a folder</button>
            <span class="dz-hint">Archie sorts images, audio, and video into reading order automatically.</span>
          </div>
        {/if}
        <input bind:this={dirEl} type="file" webkitdirectory style="display:none" aria-label="Choose a folder of media" onchange={onDirChange} />
        <div class="path-actions">
          <button type="button" class="btn btn-ghost" onclick={close}>Cancel</button>
          <button type="button" class="btn btn-primary" disabled={!folderPathValid(folderSummary)} onclick={submitFolder}>{createActionLabel(scope)}</button>
        </div>
      {:else}
        <div class="field" class:has-success={iiifStatus === "valid"} class:has-error={iiifStatus === "invalid"}>
          <label class="f-label" for="iiifUrl">IIIF link</label>
          <input
            id="iiifUrl"
            type="url"
            placeholder="https://…/manifest.json"
            value={iiifUrl}
            oninput={(e) => onIiifInput((e.currentTarget as HTMLInputElement).value)}
            autocomplete="off"
          />
          <span class="f-hint">A IIIF link (from a library or museum site) points at a set of pages Archie can import.</span>
          {#if iiifStatus === "checking"}
            <div class="iiif-status checking"><span class="spinner" aria-hidden="true"></span> Checking that link…</div>
          {:else if iiifStatus === "valid" && iiifPreview}
            <div class="iiif-status valid">Found it.</div>
            <div class="manifest-preview">
              <span class="mp-thumb" aria-hidden="true"></span>
              <span class="mp-text">
                <span class="mp-label">{iiifPreview.title}</span>
                <span class="mp-count">{iiifPreview.canvases} canvas{iiifPreview.canvases === 1 ? "" : "es"}</span>
              </span>
            </div>
          {:else if iiifStatus === "invalid" && iiifMessage}
            <div class="iiif-status invalid" role="alert">{iiifMessage}</div>
          {/if}
        </div>
        <div class="path-actions">
          <button type="button" class="btn btn-ghost" onclick={close}>Cancel</button>
          <button type="button" class="btn btn-primary" disabled={!iiifPathValid(iiifStatus)} onclick={submitIiif}>{createActionLabel(scope)}</button>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
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
    width: min(640px, 92vw);
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

  .chooser-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .chooser-head h2 {
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

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0 var(--space-4);
    font-family: var(--font-ui);
    font-size: var(--text-ui-sm);
    color: var(--ink-canvas-secondary);
  }
  .back-link:hover {
    color: var(--accent);
  }

  .path-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
  }
  @media (max-width: 640px) {
    .path-cards {
      grid-template-columns: 1fr;
    }
  }
  .path-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    text-align: left;
    padding: var(--space-4);
    min-height: 8.5rem;
    background: var(--surface-canvas-overlay);
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  }
  .path-card:hover,
  .path-card:focus-visible {
    border-color: var(--accent);
    box-shadow: var(--shadow-lift-low);
    transform: translateY(-1px);
  }
  .path-card .glyph {
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 0.9rem;
    color: var(--accent);
    background: var(--accent-muted);
    border-radius: var(--radius-sm);
  }
  .path-card .p-title {
    font-family: var(--font-body);
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--ink-canvas-primary);
  }
  .path-card .p-desc {
    font-family: var(--font-body);
    font-size: 0.82rem;
    line-height: 1.45;
    color: var(--ink-canvas-secondary);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .field .f-label {
    font-family: var(--font-ui);
    font-size: var(--text-ui-md);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-canvas-muted);
  }
  .field input[type="text"],
  .field input[type="url"] {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--font-body);
    font-size: 1rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-canvas-raised);
    color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-sm);
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  .field input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-muted);
  }
  .field .f-hint {
    font-family: var(--font-body);
    font-size: 0.78rem;
    color: var(--ink-canvas-secondary);
  }
  .field.has-error input {
    border-color: var(--semantic-error);
  }
  .field.has-success input {
    border-color: var(--semantic-success);
  }

  .dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-8) var(--space-5);
    text-align: center;
    border: 2px dashed var(--border-canvas-emphasis);
    border-radius: var(--radius-md);
    transition: border-color 160ms ease, background 160ms ease;
  }
  .dropzone.dragover {
    border-color: var(--accent);
    background: var(--accent-muted);
  }
  .dropzone .dz-title {
    font-family: var(--font-body);
    font-size: 0.95rem;
    color: var(--ink-canvas-primary);
  }
  .dropzone .dz-or {
    font-family: var(--font-ui);
    font-size: var(--text-ui-md);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-canvas-muted);
  }
  .dropzone .dz-hint {
    font-family: var(--font-body);
    font-size: 0.78rem;
    color: var(--ink-canvas-secondary);
    max-width: 26rem;
  }

  .folder-summary {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--surface-canvas-overlay);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
  }
  .folder-summary .fs-icon {
    width: 2.4rem;
    height: 2.4rem;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-muted);
    color: var(--accent);
    border-radius: var(--radius-sm);
    font-size: 1.1rem;
  }
  .folder-summary .fs-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .folder-summary .fs-name {
    font-family: var(--font-body);
    font-weight: 600;
    font-size: 0.95rem;
  }
  .folder-summary .fs-counts {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--ink-canvas-secondary);
  }
  .folder-summary .fs-change {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--accent-2);
    font-family: var(--font-ui);
    font-size: 0.78rem;
  }
  .folder-summary .fs-change:hover {
    text-decoration: underline;
  }
  .empty-folder-note {
    font-family: var(--font-body);
    font-size: 0.82rem;
    color: var(--semantic-error);
    margin: 0 0 var(--space-4);
  }

  .grouping-choice {
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4) var(--space-4);
    margin: 0 0 var(--space-4);
  }
  .grouping-choice legend {
    padding: 0 var(--space-1);
  }
  .grouping-option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-body);
    font-size: 0.88rem;
    color: var(--ink-canvas-primary);
    padding: var(--space-1) 0;
    cursor: pointer;
  }

  .iiif-status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-body);
    font-size: 0.82rem;
  }
  .iiif-status.checking {
    color: var(--ink-canvas-secondary);
  }
  .iiif-status.valid {
    color: var(--semantic-success);
  }
  .iiif-status.invalid {
    color: var(--semantic-error);
  }
  .spinner {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--border-canvas-emphasis);
    border-top-color: var(--accent);
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .manifest-preview {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--surface-canvas-overlay);
    border-radius: var(--radius-md);
    margin-top: var(--space-2);
    box-shadow: inset 3px 0 0 var(--semantic-success);
  }
  .manifest-preview .mp-thumb {
    width: 2.6rem;
    height: 3.4rem;
    flex: none;
    border-radius: 4px;
    background: linear-gradient(160deg, #d8cfbd, #b9ae95);
    box-shadow: var(--shadow-lift-low);
  }
  .manifest-preview .mp-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .manifest-preview .mp-label {
    font-family: var(--font-body);
    font-weight: 600;
    font-size: 0.92rem;
  }
  .manifest-preview .mp-count {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--ink-canvas-secondary);
  }

  .path-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-top: var(--space-5);
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
    transition: background 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
  }
  .btn-primary {
    background: var(--accent);
    color: var(--ink-on-accent);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
    box-shadow: var(--shadow-lift-low);
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
