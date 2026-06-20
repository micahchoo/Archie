<script lang="ts">
  // A draggable divider between a fixed-width side panel and the flexible main area, plus a
  // collapse toggle (image-first looking). The MATH lives in @render/core's panel-resize
  // (headless-tested); this component only measures the live panel width, projects the new width
  // onto a bindable `width`, and draws the handle — the MarginColumn ↔ layoutMarginalia pattern.
  //
  // The resting width is the CSS `clamp()` default (responsive); `width` is the user's px OVERRIDE
  // (null ⇒ default). The host applies it via a CSS custom property on the panel and persists it.
  // The divider measures its adjacent panel via the DOM (previous/next sibling per `side`), so it
  // never needs the host to thread a ref through.
  import { resizePanelWidth, stepPanelWidth, type PanelSide, type ResizeBounds } from "@render/core";

  let {
    width = $bindable(null),
    collapsed = $bindable(false),
    side = "right",
    min = 280,
    max = 720,
    step = 24,
    label = "panel",
    oncommit,
  }: {
    /** User width OVERRIDE in px; null ⇒ the CSS clamp() default. Bindable. */
    width?: number | null;
    /** Whether the panel is collapsed to nothing. Bindable. */
    collapsed?: boolean;
    /** Which side of the divider the resized panel sits on (drag-sign depends on it). */
    side?: PanelSide;
    min?: number;
    max?: number;
    /** Keyboard nudge increment, px. */
    step?: number;
    /** Human name of the panel, for the divider + collapse-button aria/title. */
    label?: string;
    /** Fired on pointer-up / reset / collapse so the host can persist {width, collapsed}. */
    oncommit?: (state: { width: number | null; collapsed: boolean }) => void;
  } = $props();

  let el = $state<HTMLElement | null>(null);
  let dragging = $state(false);
  let startX = 0;
  let startWidth = 0;

  const bounds = (): ResizeBounds => ({ min, max });

  /** The live rendered width of the adjacent panel (honours the clamp() default when width is null). */
  function measurePanel(): number {
    const panel = (side === "left" ? el?.previousElementSibling : el?.nextElementSibling) as HTMLElement | null;
    return panel ? panel.getBoundingClientRect().width : (width ?? min);
  }

  function down(e: PointerEvent) {
    if (collapsed) return; // collapsed ⇒ the handle only expands (the button), no drag
    dragging = true;
    startX = e.clientX;
    startWidth = measurePanel();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    width = resizePanelWidth(startWidth, e.clientX - startX, side, bounds());
  }
  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    oncommit?.({ width, collapsed });
  }

  /** Double-click ⇒ forget the override, fall back to the responsive clamp() default. */
  function reset() {
    width = null;
    oncommit?.({ width, collapsed });
  }

  function key(e: KeyboardEvent) {
    if (collapsed) return;
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (dir === 0) return;
    e.preventDefault();
    width = stepPanelWidth(width ?? measurePanel(), dir as 1 | -1, step, side, bounds());
    oncommit?.({ width, collapsed });
  }

  function toggleCollapse() {
    collapsed = !collapsed;
    oncommit?.({ width, collapsed });
  }

  // Chevron points toward the panel's hidden direction: it shows where the panel went / will go.
  const chevron = $derived(side === "right" ? (collapsed ? "‹" : "›") : (collapsed ? "›" : "‹"));
</script>

<!-- A focusable role="separator" with aria-valuenow IS the ARIA "window splitter" pattern — the spec
     makes a focusable separator interactive, so the keyboard handler + tabindex are correct here.
     Svelte's a11y linter is conservative about role=separator; these two are intentional. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={el}
  class="resize-divider"
  class:dragging
  class:collapsed
  role="separator"
  aria-orientation="vertical"
  aria-label={`Resize ${label}`}
  aria-valuenow={width ?? undefined}
  aria-valuemin={min}
  aria-valuemax={max}
  tabindex="0"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  ondblclick={reset}
  onkeydown={key}
>
  <span class="grip" aria-hidden="true"></span>
  <button
    type="button"
    class="collapse"
    aria-pressed={collapsed}
    aria-label={collapsed ? `Show ${label}` : `Hide ${label}`}
    title={collapsed ? `Show ${label}` : `Hide ${label} — image-first`}
    onpointerdown={(e) => e.stopPropagation()}
    onclick={toggleCollapse}
  >{chevron}</button>
</div>

<style>
  /* A thin warm seam, not a hard rule — quiet until you reach for it (hover/focus lift the accent). */
  .resize-divider {
    position: relative; flex: 0 0 auto; width: 10px; align-self: stretch;
    cursor: col-resize; touch-action: none; user-select: none;
    display: flex; align-items: center; justify-content: center;
    background: transparent;
  }
  .resize-divider:focus-visible { outline: 2px solid var(--accent-2); outline-offset: -2px; border-radius: var(--radius-sm); }
  .grip {
    width: 2px; height: 28px; border-radius: 999px;
    background: var(--border-canvas-emphasis, var(--border-canvas));
    transition: background 160ms ease, height 160ms ease;
  }
  .resize-divider:hover .grip,
  .resize-divider:focus-visible .grip { background: var(--accent-2); height: 44px; }
  .resize-divider.dragging .grip { background: var(--accent); height: 100%; border-radius: 0; }
  .resize-divider.collapsed { cursor: default; }
  .resize-divider.collapsed .grip { opacity: 0; }

  /* Collapse chevron — a small quiet disc centred on the seam; always reachable so the panel can
     never be permanently hidden (anti-trap). Cord-blue hover, never the rationed orange. */
  .collapse {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; padding: 0;
    font-family: var(--font-ui), sans-serif; font-size: 0.85rem; line-height: 1;
    color: var(--ink-canvas-secondary);
    background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas);
    border-radius: 999px; box-shadow: var(--shadow-lift-low);
    cursor: pointer; opacity: 0; transition: opacity 160ms ease, color 160ms ease;
  }
  .resize-divider:hover .collapse,
  .resize-divider:focus-within .collapse,
  .resize-divider.collapsed .collapse { opacity: 1; }
  .collapse:hover { color: var(--accent-2); }
  .collapse:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 1px; opacity: 1; }

  @media (prefers-reduced-motion: reduce) {
    .grip, .collapse { transition: none; }
  }
</style>
