<script lang="ts">
  // Renders note/section prose, promoting BLOCK exhibit cites to rich cards (ExhibitCiteCard) while
  // every other span stays plain sanitized HTML. Drop-in for `{@html renderMarkdown(text)}` in the
  // viewer prose sites. The gallery index (for cover/title lookup + the known-slug set) comes from
  // context (ViewerShell), so this stays prop-free at each call site.
  //
  // Inline cites (a cite MID-SENTENCE) stay plain ¶ links — splitProseCites only promotes standalone-line
  // cites to block cards — so hovering / focusing one floats the SAME typed preview (ADR-0018): the reader
  // sees the target without leaving the prose. Delegated (Svelte actions) over the {@html} links we never
  // turned into components; the card is `position: fixed` so a scrolling host (the note popup) can't clip it.
  import { getContext } from "svelte";
  import { renderMarkdown, classifyCite, type ClassifiedCite } from "@render/core";
  import { splitProseCites } from "../cite-cards.js";
  import { CITE_GALLERY, type GalleryRef } from "../cite-context.js";
  import ExhibitCiteCard from "./ExhibitCiteCard.svelte";
  import CiteCard from "./CiteCard.svelte";

  let { text }: { text: string } = $props();

  const galleryRef = getContext<GalleryRef | undefined>(CITE_GALLERY);
  const cards = $derived(galleryRef?.value?.exhibits ?? []);
  const slugs = $derived(new Set(cards.map((e) => e.slug)));
  const segments = $derived(splitProseCites(renderMarkdown(text ?? ""), slugs));
  const entryFor = (slug?: string) => cards.find((e) => e.slug === slug);

  // --- Inline-cite hovercard ---
  type Hover = { cite: ClassifiedCite; label: string; x: number; y: number };
  let hover = $state<Hover | null>(null);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  // The intra-Library inline cite under an event target (the block cards carry `cite-card` and are already
  // a preview, so they're skipped). Only same-page hash cites (`#/…`) qualify; external links don't.
  const citeLinkAt = (t: EventTarget | null): HTMLAnchorElement | null => {
    // Any in-prose link that isn't already a block card — show()'s classifyCite decides if it's a real
    // intra-Library cite. (Don't prefilter on "#/": the static-archival publish rewrites cites to a
    // …/<slug>/index.html#note-<id> form with no "#/", which a narrower guard would silently drop.)
    const a = (t as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    return a && !a.classList.contains("cite-card") ? a : null;
  };
  function show(a: HTMLAnchorElement) {
    const cite = classifyCite(a.getAttribute("href") ?? "", slugs);
    if (cite.kind === "external") return; // external / cross-library / unknown slug → no preview
    clearTimeout(hideTimer);
    const r = a.getBoundingClientRect();
    const W = 320, H = 160, GAP = 6, M = 12; // clamp the card into the viewport (flip above if no room below)
    const x = Math.max(M, Math.min(r.left, window.innerWidth - W - M));
    const y = window.innerHeight - r.bottom > H + M ? r.bottom + GAP : Math.max(M, r.top - H - GAP);
    hover = { cite, label: a.textContent?.trim() ?? "", x, y };
  }
  const onOver = (e: Event) => { const a = citeLinkAt(e.target); if (a) show(a); };
  const scheduleHide = () => { clearTimeout(hideTimer); hideTimer = setTimeout(() => (hover = null), 140); };

  // Delegated hover + keyboard-focus reveal on the prose wrapper. Action (not markup handlers) so a
  // presentational wrapper draws no a11y lint, and focusin/focusout (the bubbling variants) reach it.
  function citeHover(node: HTMLElement) {
    node.addEventListener("mouseover", onOver);
    node.addEventListener("mouseout", scheduleHide);
    node.addEventListener("focusin", onOver);
    node.addEventListener("focusout", scheduleHide);
    return { destroy() {
      clearTimeout(hideTimer);
      node.removeEventListener("mouseover", onOver);
      node.removeEventListener("mouseout", scheduleHide);
      node.removeEventListener("focusin", onOver);
      node.removeEventListener("focusout", scheduleHide);
    } };
  }
  // Moving the cursor onto the floating card keeps it open (so its click-through stays reachable).
  function hoverKeep(node: HTMLElement) {
    const enter = () => clearTimeout(hideTimer);
    const leave = () => (hover = null);
    node.addEventListener("mouseenter", enter);
    node.addEventListener("mouseleave", leave);
    return { destroy() { node.removeEventListener("mouseenter", enter); node.removeEventListener("mouseleave", leave); } };
  }
  // The card is `position: fixed`, but a transformed ancestor (ReadingSheet / NoteLightbox centre via
  // translate) would become its containing block and offset it. Portal to <body> so `fixed` stays truly
  // viewport-relative — no host can reparent, clip, or shift it.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { if (node.parentNode) node.parentNode.removeChild(node); } };
  }
</script>

<div class="prose-cites" use:citeHover>{#each segments as seg}{#if seg.kind === "html"}{@html seg.html}{:else if seg.cite.kind === "exhibit"}<ExhibitCiteCard slug={seg.cite.slug ?? ""} label={seg.label} entry={entryFor(seg.cite.slug)} />{:else}<CiteCard cite={seg.cite} label={seg.label} entry={entryFor(seg.cite.slug)} />{/if}{/each}</div>

{#if hover}
  <div class="cite-hover" use:portal use:hoverKeep style="left:{hover.x}px; top:{hover.y}px">
    {#if hover.cite.kind === "exhibit"}<ExhibitCiteCard slug={hover.cite.slug ?? ""} label={hover.label} entry={entryFor(hover.cite.slug)} />{:else}<CiteCard cite={hover.cite} label={hover.label} entry={entryFor(hover.cite.slug)} />{/if}
  </div>
{/if}

<style>
  /* display:contents → the wrapper adds no box (prose flows exactly as before) but still receives the
     delegated bubbling events + carries the host's `:global` prose styles through to the rendered HTML. */
  .prose-cites { display: contents; }
  /* Floating inline-cite preview — fixed (a scrolling host's overflow can't clip it), above the chrome.
     The host JS clamps x/y into the viewport so an edge cite stays on-screen; width is capped. */
  .cite-hover {
    position: fixed; z-index: 100; width: min(20rem, calc(100vw - 24px));
    animation: cite-hover-in 120ms ease-out;
  }
  /* The reused cards carry block margins for in-prose use; strip them in the floating context. */
  .cite-hover :global(.cite-card) { margin: 0; }
  @keyframes cite-hover-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .cite-hover { animation: none; } }
</style>
