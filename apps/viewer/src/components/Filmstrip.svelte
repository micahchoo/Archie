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
      {#each objects as o (o.id)}
        <li>
          <button class="frame" class:current={o.id === currentId}
            onclick={() => onjump(o.id)} title={o.label}
            aria-current={o.id === currentId ? "true" : undefined}>
            <MediaThumbnail object={o} />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* A quiet warm-paper band pinned to the bottom edge — the survey-and-jump surface floating over the
     read. Recedes (canvas inks, connector-blue hover) so the reading stays the star. Full-width so a long
     object set scrolls horizontally within it; the finder pill floats above at the bottom-right. */
  .filmstrip {
    position: fixed; z-index: 25; left: 0; right: 0; bottom: 0;
    display: flex; flex-direction: column; align-items: center; gap: 0;
    pointer-events: none; /* the band itself is inert; its children re-enable — clicks fall through the gaps */
  }
  .filmstrip > * { pointer-events: auto; }

  /* Handle tab — sits just above the strip (or alone when collapsed), a small centred grip. */
  .handle {
    display: inline-flex; align-items: center; gap: var(--space-2);
    margin-bottom: var(--space-1);
    padding: var(--space-1) var(--space-4);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary);
    border: none; border-radius: var(--radius-md) var(--radius-md) 0 0;
    box-shadow: var(--shadow-lift-low); cursor: pointer;
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
    padding: var(--space-3) var(--space-5);
    display: flex; gap: var(--space-3); overflow-x: auto;
    background: var(--surface-canvas-raised);
    border-top: 1px solid var(--border-canvas);
    box-shadow: var(--shadow-lift-low);
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
