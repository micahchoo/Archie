<script lang="ts">
  // Object thumbnail for the exhibit overview — one designed plate per IMPORTABLE media type, so an
  // audio/video/map object reads as the thing it is instead of a broken image. Extends NoteMedia's
  // av-cover language (video poster + ▶, audio waveform + ♪) up to object scale and adds the one type
  // NoteMedia has no equivalent for: a MAP (geo object, AObject.tileSource). Image is the real picture;
  // the others are intentional motifs on warm paper, distinct from the HONEST "couldn't load" error
  // fallback an actual broken file gets. Type is read off the object: tileSource ⇒ map, else mediaType.
  import { thumbnailUrl, type AObject } from "@render/core";

  let { object }: { object: AObject } = $props();

  const kind = $derived(object.tileSource ? "map" : (object.mediaType ?? "image"));
  const imgSrc = $derived(object.thumbnail ?? thumbnailUrl(object.source, 480));

  // Deterministic waveform bar heights (NoteMedia's av-cover motif, widened for the bigger plate) — a
  // drawn sound signature, not a real decode.
  const bars = Array.from({ length: 17 }, (_, b) => 22 + ((b * 53) % 72));

  let failed = $state(false); // an actual file failed to load (image/video) — show the honest fallback
</script>

<div class="thumb {kind}">
  {#if kind === "image"}
    {#if failed}
      <span class="broken">Couldn’t load this image</span>
    {:else}
      <img class="picture" src={imgSrc} alt="" loading="lazy" decoding="async" onerror={() => (failed = true)} />
    {/if}
  {:else if kind === "video"}
    {#if failed}
      <span class="broken">Couldn’t load this recording</span>
    {:else}
      <!-- preload metadata → the first frame is the poster (the NoteMedia idiom); muted, no controls. -->
      <video class="picture" src={object.source} muted preload="metadata" tabindex="-1" onerror={() => (failed = true)}></video>
    {/if}
    <span class="badge"><span class="glyph" aria-hidden="true">▶</span>Video</span>
  {:else if kind === "sound"}
    <span class="wave" aria-hidden="true">{#each bars as h}<span style={`height:${h}%`}></span>{/each}</span>
    <span class="badge"><span class="glyph" aria-hidden="true">♪</span>Audio</span>
  {:else}
    <!-- map: a faint graticule (coordinate grid) with a located pin — "a place", on warm paper. -->
    <span class="graticule" aria-hidden="true"></span>
    <svg class="pin" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5c-3.6 0-6.5 2.8-6.5 6.4 0 4.6 6.5 12.6 6.5 12.6s6.5-8 6.5-12.6c0-3.6-2.9-6.4-6.5-6.4z" />
      <circle cx="12" cy="9" r="2.7" />
    </svg>
    <span class="badge"><span class="glyph" aria-hidden="true">⌖</span>Map</span>
  {/if}
</div>

<style>
  /* The plate fills the card's image area; the warm cream is the ground every motif sits on. */
  .thumb {
    position: relative; width: 100%; aspect-ratio: 4 / 3;
    display: flex; align-items: center; justify-content: center; overflow: hidden;
    background: var(--surface-canvas); color: var(--ink-canvas-secondary);
  }
  /* The work rests WHOLE (contain) — don't crop a portrait or a wide landscape (matches the prior grid). */
  .picture { width: 100%; height: 100%; object-fit: contain; display: block; }
  video.picture { object-fit: cover; background: var(--surface-canvas-overlay); }
  /* Honest error (a real file failed) — quiet, distinct from the intentional type motifs below. */
  .broken { font-family: var(--font-ui); font-size: var(--text-ui-sm); font-style: italic; color: var(--ink-canvas-muted); padding: var(--space-4); text-align: center; }

  /* Audio — a soft warm-line waveform (the av-cover motif), centred on the cream. */
  .wave { display: flex; align-items: center; gap: 4px; height: 56%; }
  .wave span { width: 4px; border-radius: var(--radius-sm); background: var(--accent-3); display: block; }

  /* Map — a faint coordinate graticule + a single located pin. The grid reads "a place with coordinates",
     the pin reads "here"; both quiet, the curator's-study map drawer, not a loud icon. */
  .graticule {
    position: absolute; inset: 0;
    background-image:
      repeating-linear-gradient(0deg, transparent 0 19px, var(--border-canvas-emphasis) 19px 20px),
      repeating-linear-gradient(90deg, transparent 0 19px, var(--border-canvas-emphasis) 19px 20px);
    opacity: 0.6;
  }
  .pin { position: relative; width: 34%; max-width: 64px; height: auto; }
  .pin path { fill: var(--accent-3); }
  .pin circle { fill: var(--surface-canvas); }

  /* Type badge — a quiet warm-paper chip naming the kind, so the visitor knows what a plate is before
     opening it (wayfinding). Glyph + word: the NoteMedia glyph, plus a tracked-mono label at plate scale. */
  .badge {
    position: absolute; bottom: var(--space-2); right: var(--space-2);
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px var(--space-2); border-radius: var(--radius-sm);
    font-family: var(--font-ui), monospace; font-size: var(--text-ui-xs); font-weight: 500;
    letter-spacing: 0.12em; text-transform: uppercase;
    background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary);
    box-shadow: var(--shadow-lift-low);
  }
  .badge .glyph { font-size: 0.85rem; letter-spacing: 0; color: var(--accent-3); }
</style>
