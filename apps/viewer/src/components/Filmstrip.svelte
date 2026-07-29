<script lang="ts">
  // In-exhibit filmstrip (SCALE-GALLERY Phase 4) — a collapsible bottom thumbnail strip for survey + jump,
  // shared by the grid reader AND the narrative (mounted once at the ExhibitView shell). It fills the gap
  // the two existing steppers leave: the top-bar carousel is linear (no random access) and the narrative
  // index is a heavy full-screen grid — this is a light, always-glanceable strip. Purely presentational:
  // the host owns the cursor and decides where a jump lands (grid → selectedObjectId, narrative →
  // indexObjectId); this reflects the object list + calls back. Reuses MediaThumbnail (the grid's plate).
  import MediaThumbnail from "./MediaThumbnail.svelte";
  import type { AObject } from "@render/core";

  let { objects, currentId, collapsed, onjump, ontoggle }: {
    objects: AObject[];
    /** The object currently open in the reader (highlighted), or null when reading the narrative spine. */
    currentId: string | null;
    collapsed: boolean;
    onjump: (id: string) => void;
    ontoggle: () => void;
  } = $props();

  // V27 — the strip was N consecutive tab stops (measured: twelve), so a keyboard reader crossing an
  // exhibit had to Tab through every thumbnail to reach whatever follows. This repo already RATIFIED the
  // answer for this exact component: roving tabindex (docs/research/a11y-interactions.md, adopted in
  // Studio as Archie-f260). One frame is in the page tab sequence; arrows move between frames.
  //
  // The rove cursor follows the CURRENT object when there is one, so tabbing in lands on where the reader
  // actually is rather than always at the first frame.
  // The band used to publish its live height as `--strip-h` so the finder pill and the note card could
  // reserve room above it (Archie-40fe / V22 / V71). It is DOCKED now — a flow member of ExhibitView's
  // `.chrome-dock` — so the surfaces that reserved against it are siblings in the same row, and there is
  // no measurement to publish and nothing to keep in sync. The token is gone with the reservation.

  let roveId = $state<string | null>(null);
  const roveIndex = $derived.by(() => {
    const byRove = roveId ? objects.findIndex((o) => o.id === roveId) : -1;
    if (byRove >= 0) return byRove;
    const byCurrent = objects.findIndex((o) => o.id === currentId);
    return byCurrent >= 0 ? byCurrent : 0;
  });

  let frameEls: HTMLElement[] = [];
  function focusFrame(i: number) {
    const clamped = Math.max(0, Math.min(objects.length - 1, i));
    roveId = objects[clamped]?.id ?? null;
    frameEls[clamped]?.focus();
  }
  function onFrameKey(e: KeyboardEvent, i: number) {
    // Home/End included per APG; ArrowUp/Down are left alone (the strip is horizontal, and the page
    // beneath may scroll).
    const go = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: objects.length - 1 }[e.key];
    if (go === undefined) return;
    e.preventDefault();
    focusFrame(go);
  }
</script>

<div class="filmstrip" class:collapsed>
  <!-- Bottom-edge handle: the one affordance that opens/closes the strip (collapsed by default in the
       narrative, so the authored read stays primary — spike-0005 §1). -->
  <button class="handle" onclick={ontoggle} aria-expanded={!collapsed}
    aria-label={collapsed ? `Show all ${objects.length} items` : "Hide the item strip"}>
    <span class="chev" aria-hidden="true">{collapsed ? "▤" : "▾"}</span>
    <span class="lbl">{collapsed ? `All ${objects.length} items` : "Hide"}</span>
  </button>

  {#if !collapsed}
    <ul class="strip" aria-label="Jump to an item">
      {#each objects as o, i (o.id)}
        <li>
          <!-- V28: the frame carried only `title` (a tooltip — not an accessible name for AT) wrapping a
               thumbnail. For a manuscript the thumbnails are near-identical, so an unlabelled frame was
               indistinguishable from its neighbours by sound OR by sight. The position is included
               because "folio 7 of 12" is what orients a reader in a long strip. -->
          <button class="frame" class:current={o.id === currentId}
            bind:this={frameEls[i]}
            tabindex={i === roveIndex ? 0 : -1}
            onkeydown={(e) => onFrameKey(e, i)}
            onfocus={() => (roveId = o.id)}
            onclick={() => onjump(o.id)} title={o.label}
            aria-label={`${o.label ?? "Untitled"} — item ${i + 1} of ${objects.length}`}
            aria-current={o.id === currentId ? "true" : undefined}>
            <MediaThumbnail object={o} />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* A quiet warm-paper band, DOCKED in the exhibit's chrome bar — the survey-and-jump surface BESIDE
     the read rather than over it. Recedes (canvas inks, connector-blue hover) so the reading stays the
     star. It no longer needs `pointer-events: none` on the band and `auto` on the children: that trick
     existed only so clicks would fall through the band's gaps onto the canvas underneath, and there is
     no canvas underneath any more. */
  .filmstrip {
    display: flex; flex-direction: column; align-items: center; gap: 0; min-width: 0;
  }

  /* Handle tab — sits just above the strip (or alone when collapsed), a small centred grip. */
  .handle {
    display: inline-flex; align-items: center; gap: var(--space-2);
    margin-bottom: var(--space-1);
    padding: var(--space-1) var(--space-4);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary);
    border: none; border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-xs); font-weight: 500;
    letter-spacing: 0.1em; text-transform: uppercase;
    transition: color 160ms ease;
  }
  .handle:hover { color: var(--accent-2); }
  .handle .chev { font-size: 0.85rem; line-height: 1; color: var(--ink-canvas-muted); }
  .filmstrip.collapsed .handle { margin-bottom: 0; }

  /* The thumbnail rail — horizontal scroll, one small plate per object. */
  .strip {
    list-style: none; margin: 0; width: 100%; box-sizing: border-box;
    padding: var(--space-2) var(--space-3);
    display: flex; gap: var(--space-3); overflow-x: auto;
    background: var(--surface-canvas-raised);
    border-radius: var(--radius-sm);
  }
  .frame {
    flex: 0 0 auto; width: 88px; padding: 0; cursor: pointer;
    background: none; border: 2px solid transparent; border-radius: var(--radius-sm);
    overflow: hidden; line-height: 0;
    transition: border-color 160ms ease, transform 160ms ease;
  }
  .frame:hover { transform: translateY(-2px); }
  /* The object currently open reads with a rationed accent ring — the one loud mark on a quiet strip. */
  .frame.current { border-color: var(--accent); }
  .frame:focus-visible { outline: none; border-color: var(--accent-2); }
</style>
