// Quality tiers at PUBLISH time (Archie-4b0a). Two tiers, decided on the ticket:
//
//   archival — the bytes as ingested. Today's behaviour, and this engine's DEFAULT, so nothing
//              changes until Archie-c367 ships the publish-surface control.
//   web      — a derivative: images re-encoded WebP at the params Archie-7280 PINNED BY MEASUREMENT
//              (2400 px longer edge, canvas.toBlob quality 0.80 — `archive-probe.ts` WEB_TIER, which
//              this module IMPORTS rather than restating; there is one copy of those two numbers in
//              the repo and it is the probe's).
//
// Publish-time rather than ingest-time is the ticket's own decision, and it rests on a code fact it
// verified: originals are retained at ingest (`ingest-flows.ts:522` saveOriginalFile →
// `assets-original/`), so a web tier is always re-derivable and never a one-way door.
//
// SHAPE — why this file is mostly pure. The DECISIONS (which transform applies to a MIME, what the
// published file is called, how a rename collides, which library fields must move with it, when a
// fallback was taken) are pure functions over strings and the model, unit-tested headlessly. The one
// impure step — the pixel/sample re-encode — is INJECTED (`TierEncoders`), because canvas and
// WebCodecs are browser-only and jsdom has neither. Same seam idiom as `tiff-transcode.ts` +
// `bake-async.ts`: the dimension math lives in a headless core module, only the encode is in the DOM.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// CLOSED 2026-07-27 — WAS A BLOCKER: ANNOTATION GEOMETRY IS IMAGE-PIXEL SPACE, AND THE WEB TIER
// MOVES IT.
//
// The defect, for the record, because the shape recurs: notes are stored as absolute pixels against
// the published master — `xywh=pixel:x,y,w,h` (`spine/serialize.test.ts:20`) or an SvgSelector
// polygon in the same space — and the viewer maps them with OSD's `viewport.imageToViewportRectangle`
// off the LOADED image's content size (`render-mount/src/read-overlay.ts:295`, `mount.ts:233`,
// `mount.ts:405` `item.getContentSize()`). Nothing rescaled a selector between the canvas dimensions
// in the manifest and the image actually served, so a 6000 px master published at 2400 px put every
// region 2.5x out of place.
//
// THE FIX, and why it lands where it does. `projectLibraryForTier` already computed the served
// dimensions purely (`fitWithin`, below) before any encode ran, so it already KNEW the factor — the
// only missing piece was a seam to hand it to the writer. `publishLibrary` now takes
// `scaleSelectors(slug, objectId)` (`render-core/src/publish/site.ts`) and moves the CONSUMER
// PROJECTION with the image: the per-canvas heads pages and the manifest's Range `start`. The
// authored log and the `annotations/history/` sidecar are untouched, exactly like `rebaseCanvasId`,
// so a load→publish round trip rescales from canonical rather than compounding.
//
// This engine supplies the factor from `rescaled` (`publish-flows.svelte.ts` `tierRun`), so the
// report that USED to be a warning about misplacement is now the input that prevents it. Note what
// stays true: `rescaled` remains worth surfacing — an author is entitled to know their 6000 px plate
// ships at 2400 px — it just no longer means "your notes are wrong".
//
// STILL FENCED (see `unscaledSelectors` in the publish result, surfaced by `warnTier`): a selector
// the scaler cannot move EXACTLY — an `<path>`, or any SVG carrying a `transform` — ships in the
// authored pixel space and is reported per note. Neither is in the v1 shape vocabulary Archie
// authors or draws (`isV1Shape`), so this is an imported-WADM edge, counted rather than silent.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// AUDIO — assessed against the browser-compat data on 2026-07-27, not from memory, and the ticket's
// premise turned out to be out of date. See `audioEncodeAvailable` for the matrix and the one thing
// still missing.
import { fitWithin, type AObject, type Library, type SelectorScale } from "@render/core";
import { WEB_TIER, WEB_TIER_OPUS_KBPS, type QualityTier } from "./archive-probe.js";
import { inferredMime } from "./folder-import.js";
// Type-only for the profile, plus the ONE value this module needs: the video seam's skip counter.
// `video-transcode.ts` itself is import-cheap (no Tauri, no mediabunny at module scope — both are
// behind `await import`), so this does not drag either heavy path into the tier engine's graph.
import { noteVideoSkipped, type VideoTargetParams } from "./video-transcode.js";

export type { QualityTier };

/** The engine's default. "archival" = today's bytes-as-ingested behaviour, so wiring this module in
 *  changes nothing until a caller asks for "web" (Archie-c367's control). */
export const DEFAULT_TIER: QualityTier = "archival";

// ---------------------------------------------------------------------------------------------
// The decision (pure)
// ---------------------------------------------------------------------------------------------

/** What the tier does to one asset's bytes. `passthrough` covers both "this tier re-encodes nothing"
 *  and "this MIME is deliberately exempt" — `reason` says which, so a readout can explain itself. */
export type TierAction = "passthrough" | "image-webp" | "audio-opus" | "video-transcode";

export interface TierDecision {
  action: TierAction;
  /** The published file's MIME. Equals the source MIME for a passthrough. */
  mime: string;
  /** The published file's extension WITHOUT the dot; null = keep whatever the stored name has. */
  ext: string | null;
  /** Why, for a passthrough that a reader might expect to have been re-encoded. */
  reason?: string;
  /** Set when this passthrough is a DEGRADATION rather than a policy — the tier owns this media type
   *  and wanted to re-encode it, but no encoder is wired. Carried on the decision (rather than
   *  discovered during the encode) precisely because the decision is what names the file: the
   *  degradation is chosen up front so the name degrades with the bytes. `applyTier` counts it. */
  degraded?: TierFallbackReason;
}

const PASS = (mime: string, reason?: string, degraded?: TierFallbackReason): TierDecision =>
  ({ action: "passthrough", mime, ext: null, ...(reason ? { reason } : {}), ...(degraded ? { degraded } : {}) });

/** MIMEs the web tier deliberately leaves alone, and why. Each is a real loss-without-a-win:
 *  - `image/svg+xml` is vector; rasterising it to 2400 px WebP throws away the resolution
 *    independence that is the whole reason the file is an SVG.
 *  - `image/gif` may be animated, and `canvas.toBlob` sees exactly one frame — a re-encode would
 *    silently flatten an animation to its first frame. (Static GIFs pay the same exemption; telling
 *    the two apart needs a decoder this path does not have.) */
const IMAGE_EXEMPT: Readonly<Record<string, string>> = {
  "image/svg+xml": "vector source — rasterising to a fixed 2400 px would lose the resolution independence that makes it an SVG",
  "image/gif": "GIF may be animated and canvas.toBlob captures one frame — a re-encode would silently drop the animation",
};

/** What this build can actually re-encode. Part of the DECISION rather than only of the execution,
 *  because the decision is what names the published file: deciding "WebP" with no encoder wired would
 *  publish `folio.webp` containing JPEG bytes and a manifest claiming `image/webp`. Folding capability
 *  in up front keeps the tree internally consistent by construction — the systematic case degrades to
 *  a clean archival passthrough, name and MIME included. */
export interface TierCaps {
  image: boolean;
  audio: boolean;
  /** VIDEO IS A PROFILE, NOT A BOOLEAN, and that asymmetry is load-bearing rather than untidy.
   *
   *  Image and audio have one web-tier answer each (WebP, Opus/Ogg), so "can this build do it" is the
   *  whole question. Video has TWO declared profiles — `WEB_TIER_H264` (.mp4) and `WEB_TIER_VP9`
   *  (.webm) — and which one a machine can reach decides the published file's EXTENSION and MIME.
   *  Since `tierDecision` is what names the file, a boolean here would leave the namer unable to
   *  name. Null = no reachable profile, which is the ordinary state on Firefox, Safari, and a desktop
   *  build whose ffmpeg lacks codecs. */
  video: VideoTargetParams | null;
}

/** Capability IS "an encoder was wired". Deliberately not a feature probe of the running JS runtime:
 *  the caller is the one that knows what it injected, a probe would answer for the wrong thing under
 *  a worker or a test runner, and `bake-async` already degrades internally (worker → DOM canvas) and
 *  counts what it degrades. A platform where the wired encoder nonetheless throws is caught per file
 *  by `applyTier`'s `*-encode-failed` counters. */
export const capsFor = (enc: TierEncoders): TierCaps => ({
  image: !!enc.encodeImage,
  audio: !!enc.encodeAudio,
  // BOTH halves or neither. An `encodeVideo` with no `videoTarget` cannot name the output file, and a
  // `videoTarget` with no encoder would name a `.mp4` nothing writes — either alone would produce a
  // published tree whose manifest and bytes disagree, which is the failure `TierCaps` exists to make
  // structurally impossible.
  video: enc.encodeVideo && enc.videoTarget ? enc.videoTarget : null,
});

/**
 * Which transform the tier applies to a source MIME. PURE — no bytes, no DOM; `caps` is passed in so
 * the same inputs always give the same answer and the whole decision layer unit-tests headlessly.
 *
 * VIDEO transcodes when `caps.video` names a reachable profile — Archie-7e6f's native sidecar on
 * desktop, mediabunny/WebCodecs in Chromium. Where neither is reachable (Firefox, Safari, a build
 * whose ffmpeg lacks codecs) it takes the COUNTED passthrough, exactly like an unencodable image.
 */
export function tierDecision(mime: string, tier: QualityTier, caps: TierCaps): TierDecision {
  const m = mime.toLowerCase();
  if (tier === "archival") return PASS(mime, "archival tier ships the bytes as ingested");
  const exempt = IMAGE_EXEMPT[m];
  if (exempt) return PASS(mime, exempt);
  if (m.startsWith("image/")) {
    return caps.image ? { action: "image-webp", mime: "image/webp", ext: "webp" } : PASS(mime, "no image encoder wired — shipping the archival bytes under their own name", "no-image-encoder");
  }
  if (m.startsWith("audio/")) {
    return caps.audio ? { action: "audio-opus", mime: "audio/ogg", ext: "opus" } : PASS(mime, "no Opus encoder wired — shipping the archival bytes under their own name", "no-audio-encoder");
  }
  if (m.startsWith("video/")) {
    // The profile carries the extension AND the mime, so the published name, the manifest's `format`
    // and the bytes are all derived from one object — there is no second place to keep in step.
    return caps.video
      // `containerMime`, NOT `mime`: the manifest's `format` is a bare media type like its
      // `image/webp` sibling. `mime` carries codec parameters for a `<source type>` attribute and
      // does not belong in the model.
      ? { action: "video-transcode", mime: caps.video.containerMime, ext: caps.video.ext }
      : PASS(mime, "no video converter on this platform — shipping the archival bytes under their own name", "no-video-encoder");
  }
  return PASS(mime, "not a media type this tier re-encodes");
}

// ---------------------------------------------------------------------------------------------
// Naming (pure)
// ---------------------------------------------------------------------------------------------

/** The MIME an asset's stored bytes have: the object's own `format` when ingest recorded one, else
 *  inferred from the file extension through the SAME table the importer used (`folder-import`'s
 *  EXT_MIME via `inferredMime`) — so the tier can never disagree with ingest about what a `.tif` is.
 *  `application/octet-stream` counts as "no format": it is what a `Blob` read back out of OPFS reports
 *  when nothing recorded a type, and treating it as authoritative would exempt every asset from the
 *  tier for a reason that says nothing about the file. */
export function assetMime(name: string, format?: string): string {
  const declared = format && format !== "application/octet-stream" ? format : "";
  return declared || inferredMime({ name, relativePath: name, type: "" });
}

/** Swap a file name's extension. `ext === null` returns the name untouched; a name with no extension
 *  gains one. Case is normalised away (`FOLIO.TIF` → `folio.webp`) so two spellings of one extension
 *  cannot produce two published names for the same asset. */
export function renameForTier(name: string, ext: string | null): string {
  if (ext === null) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}.${ext}`;
}

/**
 * Stored asset name → published asset name, for one exhibit's whole asset set.
 *
 * Built over the SET rather than per file because renaming is not injective: `plate.jpg` and
 * `plate.png` both want `plate.webp`, and site.ts writes into one flat `{slug}/assets/` directory —
 * so the second would overwrite the first's bytes while both manifest entries pointed at the survivor.
 * Losing an object's image to a name collision is exactly the silent round-trip loss the publish path
 * already reports elsewhere (`missingAssets`), so it is resolved here instead: the first name wins,
 * later ones get `-2`, `-3`, … Iteration order is the caller's object order, which is stable.
 *
 * Returns BOTH directions: `toPublished` for rewriting the model, `toStored` for the `getAsset`
 * callback, which is handed the PUBLISHED name (site.ts derives it from the rewritten `source`) and
 * must read the real stored file.
 */
export interface TierNameMap {
  toPublished: Map<string, string>;
  toStored: Map<string, string>;
}
export function tierNameMap(assets: readonly { name: string; format?: string }[], tier: QualityTier, caps: TierCaps): TierNameMap {
  const toPublished = new Map<string, string>();
  const toStored = new Map<string, string>();
  for (const a of assets) {
    if (toPublished.has(a.name)) continue; // one object per stored asset is the norm; two sharing is fine
    const want = renameForTier(a.name, tierDecision(assetMime(a.name, a.format), tier, caps).ext);
    let candidate = want;
    if (toStored.has(candidate) && toStored.get(candidate) !== a.name) {
      const dot = want.lastIndexOf(".");
      const stem = dot > 0 ? want.slice(0, dot) : want;
      const ext = dot > 0 ? want.slice(dot) : "";
      let n = 2;
      while (toStored.has(candidate) && toStored.get(candidate) !== a.name) candidate = `${stem}-${n++}${ext}`;
    }
    toPublished.set(a.name, candidate);
    toStored.set(candidate, a.name);
  }
  return { toPublished, toStored };
}

// ---------------------------------------------------------------------------------------------
// The library projection (pure)
// ---------------------------------------------------------------------------------------------

const ASSET_PREFIX = "/assets/";
const THUMB_PREFIX = "/assets-thumb/";

/** An object whose published pixel space is not the authored one.
 *
 *  TWO JOBS, and the second one is what closed this file's former blocker:
 *  1. REPORTING — an author is entitled to know their 6000 px plate ships at 2400 px
 *     (`publish-flows` surfaces the count).
 *  2. The INPUT to `publishLibrary`'s `scaleSelectors`, which moves every annotation selector and
 *     narrative `start` on this object by exactly this factor, so the published tree is internally
 *     consistent. See `selectorScaleOf` for the conversion. */
export interface TierRescale {
  slug: string;
  objectId: string;
  from: { width: number; height: number };
  to: { width: number; height: number };
  /** Linear factor, `to.width / from.width`. < 1 for every downscale. */
  scale: number;
}

/** A rescale as the per-axis factor the selector rescaler takes.
 *
 *  Both axes, separately, deliberately: `fitWithin` rounds each dimension independently, so a
 *  "uniform" downscale is very nearly — but not exactly — uniform (6000x4001 → 2400x1600 gives
 *  sx 0.4000 and sy 0.39990). Collapsing to the single `scale` above would put a tall region a
 *  fraction of a pixel out on the long axis for no reason. */
export const selectorScaleOf = (r: TierRescale): SelectorScale => ({
  sx: r.to.width / r.from.width,
  sy: r.to.height / r.from.height,
});

export interface TierProjection {
  /** The library as the published tree should describe it: rewritten `source` / `thumbnail` /
   *  `format` / `width` / `height`. Identical (by value) to the input at the archival tier. */
  library: Library;
  /** Per exhibit slug: published asset name → stored asset name, for `getAsset` / `getThumbnail`. */
  stored: Map<string, Map<string, string>>;
  /** Objects whose pixel dimensions changed. Empty at the archival tier. */
  rescaled: TierRescale[];
}

/**
 * Rewrite the library so the published tree is INTERNALLY CONSISTENT under `tier`.
 *
 * The naming chain this has to keep honest, read out of `publish/site.ts` rather than assumed:
 * site.ts takes `name = o.source.slice("/assets/".length)` (`:514`), calls `getAsset(slug, name)`
 * (`:515`), writes the bytes to `{slug}/assets/{name}` (`:523`), and points the manifest at
 * `{base}{slug}/assets/{name}` (`:527`). The baked thumbnail uses the SAME `name` in
 * `{slug}/assets-thumb/` (`:545`, `:549`). So the file name in the published tree is a pure function
 * of the model's `source`, and the ONLY way to publish `folio.webp` without editing render-core is to
 * hand render-core a model that already says `folio.webp` — which is what this does. `getAsset` then
 * maps back through `stored`.
 *
 * Dimensions are computed with the same `fitWithin` the encoder itself uses (`bake.ts:37`,
 * `tiff-transcode.ts:62`), so the manifest's width/height are exactly what the re-encode produces —
 * derived once, purely, rather than waiting on an async encode to find out.
 */
export function projectLibraryForTier(lib: Library, tier: QualityTier, caps: TierCaps): TierProjection {
  const stored = new Map<string, Map<string, string>>();
  const rescaled: TierRescale[] = [];
  if (tier === "archival") return { library: lib, stored, rescaled };

  const exhibits = lib.exhibits.map((ex) => {
    const assets = ex.objects
      .filter((o) => o.source.startsWith(ASSET_PREFIX))
      .map((o) => ({ name: o.source.slice(ASSET_PREFIX.length), ...(o.format ? { format: o.format } : {}) }));
    if (assets.length === 0) return ex;
    const map = tierNameMap(assets, tier, caps);
    stored.set(ex.slug, map.toStored);

    const objects = ex.objects.map((o) => {
      if (!o.source.startsWith(ASSET_PREFIX)) return o;
      const name = o.source.slice(ASSET_PREFIX.length);
      const published = map.toPublished.get(name)!;
      const d = tierDecision(assetMime(name, o.format), tier, caps);
      const next: AObject = { ...o, source: `${ASSET_PREFIX}${published}` };
      if (d.action !== "passthrough") next.format = d.mime;
      // The thumbnail's working ref is `/assets-thumb/{name}` with the SAME name; keep the two in step
      // or site.ts writes the thumb under the published name while the manifest still cites the old one.
      if (o.thumbnail?.startsWith(THUMB_PREFIX)) next.thumbnail = `${THUMB_PREFIX}${published}`;
      if (d.action === "image-webp" && o.width && o.height) {
        const to = fitWithin(o.width, o.height, WEB_TIER.maxDim);
        if (to.width !== o.width || to.height !== o.height) {
          next.width = to.width;
          next.height = to.height;
          rescaled.push({ slug: ex.slug, objectId: String(o.id), from: { width: o.width, height: o.height }, to, scale: to.width / o.width });
        }
      }
      return next;
    });
    return { ...ex, objects };
  });
  return { library: { ...lib, exhibits }, stored, rescaled };
}

// ---------------------------------------------------------------------------------------------
// Capability probes + the injected encode
// ---------------------------------------------------------------------------------------------

/**
 * Can this platform encode Opus at all?
 *
 * THE MATRIX, read from `mdn/browser-compat-data` `api/AudioEncoder.json` on 2026-07-27 (fetched, not
 * recalled). Archie-4b0a's premise — "WebCodecs AudioEncoder is Chromium-only" — is OUT OF DATE:
 *
 *   | path                                  | Chrome | Firefox | Safari | faster than realtime? | container? |
 *   |---------------------------------------|--------|---------|--------|-----------------------|------------|
 *   | WebCodecs `AudioEncoder`              | 94     | 130     | 26     | YES                   | NO         |
 *   | `MediaRecorder` audio/webm;codecs=opus| yes    | yes     | no     | **NO**                | yes (WebM) |
 *
 * MediaRecorder is not a publish-time transcoder and the reason is structural, not a quirk:
 * `createMediaStreamDestination` is defined on `AudioContext`, NOT on `BaseAudioContext`
 * (webaudio spec `#dom-audiocontext-createmediastreamdestination`; BCD `api/AudioContext.json`), so an
 * `OfflineAudioContext` — the only thing that renders faster than realtime — cannot feed a
 * MediaRecorder. Transcoding a 90-minute oral history would take 90 minutes of wall clock during a
 * publish. That rules it out regardless of its better container story.
 *
 * WHAT IS STILL MISSING, and why no encoder is wired today: WebCodecs is codecs WITHOUT containers.
 * `AudioEncoder` hands back `EncodedAudioChunk`s — raw Opus packets — and something must mux them
 * into Ogg (RFC 7845 OpusHead/OpusTags + Ogg pages) or WebM before a browser will play the file.
 * This repo has no muxer and no dependency that provides one, and a muxer written blind is exactly
 * the artifact this repo's rules say not to trust: unit tests would prove it COMPILED, never that the
 * bytes decode. So the seam is here, the probe is honest, and until a muxer lands with a real-browser
 * decode check, every audio asset at the web tier takes the COUNTED archival passthrough below.
 *
 * The probe is the runtime authority — it is what covers the platform the table cannot speak for
 * (Tauri's WebKitGTK webview, which is not any of the three rows above).
 */
export function audioEncodeAvailable(): boolean {
  return typeof (globalThis as { AudioEncoder?: unknown }).AudioEncoder === "function";
}

/** The one impure step, injected. Absent member = "this platform cannot", which `applyTier` turns
 *  into a counted archival passthrough rather than a failed publish. */
export interface TierEncoders {
  /** Re-encode to WebP, longer edge capped to `maxDim` (aspect-preserving, downscale-only). */
  encodeImage?: (src: Blob, maxDim: number, quality: number) => Promise<Blob>;
  /** Re-encode to Opus at `kbps`, in a playable container. Nothing supplies this yet — see
   *  `audioEncodeAvailable`. */
  encodeAudio?: (src: Blob, kbps: number) => Promise<Blob>;
  /** Re-encode one video to `target`. Supplied by `publish-flows` from whichever path the platform
   *  has: the ffmpeg sidecar on desktop, mediabunny/WebCodecs in Chromium, neither elsewhere.
   *
   *  MUST THROW rather than return the source bytes. Both implementations already do
   *  (`transcodeVideo`, `transcodeVideoInBrowser`), and `applyTier` is what converts that throw into
   *  a COUNTED passthrough — so the "never silently degrade" contract lives in one place instead of
   *  being re-decided by each encoder. */
  encodeVideo?: (src: Blob, target: VideoTargetParams) => Promise<Blob>;
  /** The profile `encodeVideo` will produce. Separate from the function because the DECISION layer
   *  needs it before any encode runs — see `TierCaps.video`. Meaningless without `encodeVideo`, and
   *  `capsFor` refuses the half-configured pair. */
  videoTarget?: VideoTargetParams;
}

/** Why a web-tier asset shipped its archival bytes anyway. Every one of these is a REAL degradation
 *  (a bigger published site than the tier promised), so none of them is allowed to be silent.
 *
 *  The `no-*-encoder` pair fires on the DECIDED degradation (`TierDecision.degraded`): the tier owned
 *  the media type, no encoder was wired, so it shipped archival bytes under their own name. That is
 *  the honest outcome AND a real shortfall against the size the probe estimated, so it is both a
 *  clean tree and a counted one. `no-audio-encoder` is today's normal state on every platform.
 *
 *  The two VIDEO reasons are the ones worth watching. An image that ships archival costs megabytes;
 *  a video that ships archival costs GIGABYTES — it is the single largest gap between the size the
 *  probe estimated and the size the author actually uploads. */
export type TierFallbackReason =
  | "no-image-encoder" | "no-audio-encoder" | "no-video-encoder"
  | "image-encode-failed" | "audio-encode-failed" | "video-encode-failed";

const counts: Record<TierFallbackReason, number> = {
  "no-image-encoder": 0, "no-audio-encoder": 0, "no-video-encoder": 0,
  "image-encode-failed": 0, "audio-encode-failed": 0, "video-encode-failed": 0,
};

/** Total assets that fell back to archival bytes inside a web-tier publish.
 *
 *  Modelled on `bakeFallbackCount()` (`bake-async.ts:38`) and for the same reason it exists: the
 *  fallback is deliberate — a missing encoder must never fail a publish — and therefore INVISIBLE. A
 *  wholly encoder-less platform would otherwise look like a working web tier that merely produced a
 *  suspiciously large site. Non-zero after a web publish means the tier under-delivered; the surface
 *  can say so, and a perf run can assert zero. */
export const tierFallbackCount = (): number => Object.values(counts).reduce((a, b) => a + b, 0);
/** The same total, broken down — a count with no reason is a symptom with no diagnosis. */
export const tierFallbacksByReason = (): Record<TierFallbackReason, number> => ({ ...counts });
/** Zero the counters. The publish path calls this at the start of a projection so a reported count
 *  belongs to THAT publish; tests call it for isolation. */
export function resetTierFallbacks(): void {
  for (const k of Object.keys(counts) as TierFallbackReason[]) counts[k] = 0;
}

export interface TierBytes {
  bytes: Blob;
  /** The MIME actually shipped — the decision's when the encode ran, the SOURCE's when it fell back. */
  mime: string;
  /** True when the bytes are the untouched archival ones despite a re-encoding decision. */
  fellBack: boolean;
}

/**
 * Apply a decision to one asset's bytes.
 *
 * Never throws for want of an encoder and never throws when an encoder throws: a tier is a size
 * optimisation, and a publish that fails because one JPEG would not re-encode is strictly worse than
 * a publish that ships that JPEG whole. Both routes increment a named counter — see
 * `tierFallbacksByReason`.
 *
 * WHAT A PER-FILE FALLBACK COSTS, stated because it is the one inconsistency this design accepts:
 * the published NAME was fixed purely, before any encode (`projectLibraryForTier`), so a single file
 * whose encode THROWS ships its archival bytes under `folio.webp` with the manifest claiming
 * `image/webp`. It still renders — browsers content-sniff raster `<img>` sources rather than trusting
 * the extension or the served type — and it is counted, so it is visible rather than silent. The
 * alternatives were worse: dropping the object (data loss) or failing the publish (a whole library
 * lost to one bad file). The SYSTEMATIC case, a platform with no encoder at all, does not reach here
 * — `TierCaps` turns it into a clean archival passthrough, name and MIME included.
 */
export async function applyTier(src: Blob, decision: TierDecision, enc: TierEncoders, srcMime: string): Promise<TierBytes> {
  const fall = (reason: TierFallbackReason): TierBytes => {
    counts[reason]++;
    // TWO counters for video, deliberately, because they answer to different readers — and it is done
    // HERE so both routes are covered by one line: the DECIDED degradation (no encoder on this
    // platform, which arrives via `decision.degraded` below) and the per-file throw. `counts` is this
    // engine's own tally, so `tierFallbacksByReason` stays a complete account of one publish.
    // `noteVideoSkipped()` feeds the VIDEO seam's `videoSkipCount()`, whose stated contract is that a
    // caller choosing to publish an original after a refusal must say so — and `applyTier` IS that
    // caller. Counting only locally would leave `videoSkipCount()` reading zero while gigabytes of
    // originals shipped, which is exactly the invisibility it exists to prevent.
    if (reason === "no-video-encoder" || reason === "video-encode-failed") noteVideoSkipped();
    return { bytes: src, mime: srcMime, fellBack: true };
  };
  // A passthrough the tier CHOSE (archival, video, SVG/GIF) is not a fallback. A passthrough it was
  // FORCED into carries `degraded` and is counted here — that is the "never silent" half of the
  // contract, and counting it at the decision's edge keeps one counter for both routes.
  if (decision.action === "passthrough") {
    return decision.degraded ? fall(decision.degraded) : { bytes: src, mime: decision.mime, fellBack: false };
  }
  if (decision.action === "image-webp") {
    if (!enc.encodeImage) return fall("no-image-encoder");
    try {
      return { bytes: await enc.encodeImage(src, WEB_TIER.maxDim, WEB_TIER.quality), mime: decision.mime, fellBack: false };
    } catch {
      return fall("image-encode-failed");
    }
  }
  if (decision.action === "video-transcode") {
    if (!enc.encodeVideo || !enc.videoTarget) return fall("no-video-encoder");
    try {
      return { bytes: await enc.encodeVideo(src, enc.videoTarget), mime: decision.mime, fellBack: false };
    } catch {
      return fall("video-encode-failed");
    }
  }
  if (!enc.encodeAudio) return fall("no-audio-encoder");
  try {
    return { bytes: await enc.encodeAudio(src, WEB_TIER_OPUS_KBPS), mime: decision.mime, fellBack: false };
  } catch {
    return fall("audio-encode-failed");
  }
}
