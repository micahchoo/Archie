<script lang="ts">
/**
 * @surface gallery
 * @composes standalone
 * @variants image, sound, video; loaded, failed, av-glyph
 * @constraint lazy IntersectionObserver mint; revokes blob URL on destroy
 */
  // A single Library-Gallery thumbnail (SCALE-GALLERY Phase 3.2) — shared by the exhibit-card cover AND
  // the all-images wall tiles. LAZY by design (the 50+-object surface this phase exists for): it mints its
  // blob URL only when it scrolls near the viewport (IntersectionObserver), so opening the Library never
  // fan-out-mints every object's thumb (which would pin N OPFS Files at once — the Phase 1.2 finding), and
  // it REVOKES on destroy, so leaving the wall / toggling views frees them. An imported (/assets) object
  // mints an OPFS baked-thumb blob (or its MASTER when no thumb was baked — a small or legacy import);
  // a remote/IIIF object uses a derived thumbnail URL (no mint); AV objects
  // paint a type glyph (no image to load).
  import { onMount, onDestroy } from "svelte";
  import { thumbnailUrl } from "@render/core";
  import { readThumbUrl, readAssetUrl, isAsset, ASSET_PREFIX } from "./store.js";
  import { commitMintedThumb } from "./gallery-data.js";

  let { slug, source, mediaType, alt = "" }: {
    slug: string;
    source: string;
    /** May be undefined (callers pass a possibly-absent field) — exactOptionalPropertyTypes-correct. */
    mediaType?: string | undefined;
    alt?: string;
  } = $props();

  let el = $state<HTMLElement | null>(null);
  let url = $state<string | null>(null); // the resolved thumb src (an OPFS blob: URL, or a derived remote URL)
  let minted = false; // true only when we createObjectURL'd a blob (→ must revoke); a derived URL must not be revoked
  let failed = $state(false);
  let io: IntersectionObserver | null = null;
  let destroyed = false; // set in onDestroy — a mint in flight when we unmount must NOT install (leak); it revokes
  const isAv = $derived(mediaType === "sound" || mediaType === "video");

  async function resolve() {
    if (url) return;
    if (isAsset(source)) {
      const name = source.slice(ASSET_PREFIX.length);
      // OPFS baked thumb → fresh blob URL. No baked thumb is NOT a failure: bake.ts returns null BY
      // DESIGN for masters already ≤ THUMB_DIM (and legacy pre-thumb imports never baked), so fall back
      // to the MASTER as the plate — exactly what the editor rail/overview does (asset-urls.svelte.ts
      // resolveThumbs' railFallbackUrls / thumbFor).
      const u = (await readThumbUrl(slug, name)) ?? (await readAssetUrl(slug, name));
      // Destroyed mid-mint? commitMintedThumb revokes the orphan blob and returns null (no leak, no set).
      const kept = commitMintedThumb(u, destroyed, URL.revokeObjectURL);
      if (destroyed) return;
      if (kept) { url = kept; minted = true; } else { failed = true; } // neither thumb NOR master → honest placeholder
    } else {
      url = thumbnailUrl(source, 480); // remote / IIIF — a derived URL, nothing to mint or revoke
    }
  }
  onMount(() => {
    if (isAv || !el) return; // AV → glyph, never mint
    io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { void resolve(); io?.disconnect(); io = null; } // mint once, then stop watching
    }, { rootMargin: "300px" }); // pre-mint just before it enters view so the image is ready on arrival
    io.observe(el);
  });
  onDestroy(() => {
    destroyed = true;
    io?.disconnect();
    if (minted && url) URL.revokeObjectURL(url); // free the OPFS-pinned blob (Phase 1.2 revoke-on-unmount convention)
  });
</script>

<span class="thumb" class:av={isAv} bind:this={el}>
  {#if isAv}
    <span class="glyph" aria-hidden="true">{mediaType === "video" ? "▶" : "♪"}</span>
  {:else if url && !failed}
    <img src={url} {alt} loading="lazy" decoding="async" onerror={() => (failed = true)} />
  {/if}
</span>

<style>
  /* The plate box — a 4/3 window that reserves its space before the image loads (no layout shift under the
     content-visibility virtualization). Uniform aspect keeps the wall's contain-intrinsic-size honest. */
  .thumb {
    position: relative; display: block; width: 100%; aspect-ratio: 4 / 3; overflow: hidden;
    background: var(--surface-canvas-overlay); border-radius: var(--radius-sm);
    display: flex; align-items: center; justify-content: center;
  }
  .thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumb .glyph { font-size: 1.6rem; color: var(--accent-2); }
</style>
