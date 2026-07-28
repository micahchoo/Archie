// Embed auto-grow (DIVERGENCES §5 / anvil ADR-0006 follow-up F1). When <archie-viewer> is the sole
// content of an <iframe>, it can't make that iframe grow with its content — iframes don't auto-size. So
// the element POSTs its rendered height to the parent window, and a ~6-line parent-page listener resizes
// the matching iframe (matched by `event.source` = the iframe's window). These are the PURE decisions
// (message shape, when-to-post, framed-or-not); element.ts wires the ResizeObserver + rAF + postMessage.
//
// BOUNDARY (kill-criterion, recorded honestly): a host that strips `<script>` from user content — the
// very CMS class that forced the iframe fallback — ALSO strips the parent listener, so auto-grow can't run
// there; the fixed-height iframe stays the answer for those hosts. See recipes/EMBED.md + ledgers/PROBE-autogrow-2026-07-06.md.

export const EMBED_HEIGHT_MESSAGE = "archie-embed:height" as const;

/** The message an embedded <archie-viewer> posts to its parent so the host can size the iframe. */
export interface EmbedHeightMessage {
  type: typeof EMBED_HEIGHT_MESSAGE;
  /** Rendered content height in CSS px (integer) — the height the parent should give the iframe. */
  height: number;
  /** Discriminator for a page with several embeds: the element's `id`, else its `src`, else "". The
   *  recommended parent snippet matches by `event.source` (robust); `id` is a convenience/label. */
  id: string;
}

/** Build the (namespaced, non-negative-integer-height) message. */
export function embedHeightMessage(height: number, id: string): EmbedHeightMessage {
  return { type: EMBED_HEIGHT_MESSAGE, height: Math.max(0, Math.ceil(height)), id };
}

/** True when `win` is inside a parent frame — the ONLY case where auto-grow applies (a top-level window
 *  sizes itself). Comparing window references is safe cross-origin (no property access). */
export function isFramed(win: Window): boolean {
  return !!win.parent && win.parent !== win;
}

/**
 * The height to post for the current view, or `null` to skip. Skips:
 *  - the READER view — a deep-zoom surface is viewport-sized (`70vh`); posting its height would drive a
 *    vh feedback loop (parent grows iframe → 70vh grows → post again), so we FREEZE the iframe while
 *    reading (the reader keeps whatever height the iframe has). Auto-grow targets the grid-family views,
 *    which are the ones a fixed iframe actually clips.
 *  - a non-positive height (pre-layout / detached).
 *  - a height unchanged from the last post — coalescing ResizeObserver no-ops so pan/zoom / reflow can't
 *    spam the parent.
 */
export function heightToPost(opts: { viewKind: string; height: number; lastPosted: number | null }): number | null {
  if (opts.viewKind === "reader") return null;
  const h = Math.ceil(opts.height);
  if (h <= 0) return null;
  if (opts.lastPosted !== null && h === opts.lastPosted) return null;
  return h;
}
