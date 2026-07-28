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
// KNOWN BLOCKER, recorded here because the next person to enable the web tier must meet it first:
// ANNOTATION GEOMETRY IS IMAGE-PIXEL SPACE, AND THE WEB TIER MOVES IT.
//
// Notes are stored as absolute pixels against the published master — `xywh=pixel:x,y,w,h`
// (`spine/serialize.test.ts:20`) or an SvgSelector polygon in the same space — and the viewer maps
// them with OSD's `viewport.imageToViewportRectangle` off the LOADED image's content size
// (`render-mount/src/read-overlay.ts:295`, `mount.ts:233`, `mount.ts:405` `item.getContentSize()`).
// Nothing anywhere rescales a selector between the canvas dimensions in the manifest and the image
// actually served. So a 6000 px master published at 2400 px puts every region 2.5x out of place.
//
// This engine therefore does NOT silently pretend the problem away: `projectLibraryForTier` reports
// every object whose published pixel space differs from the authored one (`rescaled`), and
// `publish-flows` surfaces the count. Rescaling the selectors (or teaching the viewer a canvas→image
// transform) is a separate change and touches the annotation projection / render-mount, both outside
// this ticket's studio-side seam. Until it lands, the web tier is correct for an UNANNOTATED library
// and wrong for an annotated one — which is precisely why the engine default stays "archival" and
// why c367's surface must not pre-check "web" before this is closed.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// AUDIO — assessed against the browser-compat data on 2026-07-27, not from memory, and the ticket's
// premise turned out to be out of date. See `audioEncodeAvailable` for the matrix and the one thing
// still missing.
import { fitWithin, type AObject, type Library } from "@render/core";
import { WEB_TIER, WEB_TIER_OPUS_KBPS, type QualityTier } from "./archive-probe.js";
import { inferredMime } from "./folder-import.js";

export type { QualityTier };

/** The engine's default. "archival" = today's bytes-as-ingested behaviour, so wiring this module in
 *  changes nothing until a caller asks for "web" (Archie-c367's control). */
export const DEFAULT_TIER: QualityTier = "archival";

// ---------------------------------------------------------------------------------------------
// The decision (pure)
// ---------------------------------------------------------------------------------------------

/** What the tier does to one asset's bytes. `passthrough` covers both "this tier re-encodes nothing"
 *  and "this MIME is deliberately exempt" — `reason` says which, so a readout can explain itself. */
export type TierAction = "passthrough" | "image-webp" | "audio-opus";

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
}

/** Capability IS "an encoder was wired". Deliberately not a feature probe of the running JS runtime:
 *  the caller is the one that knows what it injected, a probe would answer for the wrong thing under
 *  a worker or a test runner, and `bake-async` already degrades internally (worker → DOM canvas) and
 *  counts what it degrades. A platform where the wired encoder nonetheless throws is caught per file
 *  by `applyTier`'s `*-encode-failed` counters. */
export const capsFor = (enc: TierEncoders): TierCaps => ({ image: !!enc.encodeImage, audio: !!enc.encodeAudio });

/**
 * Which transform the tier applies to a source MIME. PURE — no bytes, no DOM; `caps` is passed in so
 * the same inputs always give the same answer and the whole decision layer unit-tests headlessly.
 *
 * VIDEO is a passthrough by decision, not by omission: Archie-4b0a graduated video transcode out to
 * its own ticket (Archie-7e6f, native sidecar on desktop + WebCodecs on Chromium), so a video file in
 * the web tier is copied as-is here.
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
  if (m.startsWith("video/")) return PASS(mime, "video transcode is Archie-7e6f's — the web tier copies video unchanged");
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

/** An object whose published pixel space is not the authored one — see this file's BLOCKER note.
 *  Reported, never swallowed: `publish-flows` exposes the count so a surface can refuse or warn. */
export interface TierRescale {
  slug: string;
  objectId: string;
  from: { width: number; height: number };
  to: { width: number; height: number };
  /** Linear factor, `to.width / from.width`. < 1 for every downscale. */
  scale: number;
}

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
}

/** Why a web-tier asset shipped its archival bytes anyway. Every one of these is a REAL degradation
 *  (a bigger published site than the tier promised), so none of them is allowed to be silent.
 *
 *  The `no-*-encoder` pair fires on the DECIDED degradation (`TierDecision.degraded`): the tier owned
 *  the media type, no encoder was wired, so it shipped archival bytes under their own name. That is
 *  the honest outcome AND a real shortfall against the size the probe estimated, so it is both a
 *  clean tree and a counted one. `no-audio-encoder` is today's normal state on every platform. */
export type TierFallbackReason = "no-image-encoder" | "no-audio-encoder" | "image-encode-failed" | "audio-encode-failed";

const counts: Record<TierFallbackReason, number> = {
  "no-image-encoder": 0, "no-audio-encoder": 0, "image-encode-failed": 0, "audio-encode-failed": 0,
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
  const fall = (reason: TierFallbackReason): TierBytes => { counts[reason]++; return { bytes: src, mime: srcMime, fellBack: true }; };
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
  if (!enc.encodeAudio) return fall("no-audio-encoder");
  try {
    return { bytes: await enc.encodeAudio(src, WEB_TIER_OPUS_KBPS), mime: decision.mime, fellBack: false };
  } catch {
    return fall("audio-encode-failed");
  }
}
