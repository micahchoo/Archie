// Archie authoring domain model (CONTEXT.md §Language). Distinct from the WADM annotation
// format: this is the exhibit/object structure the Studio authors and the IIIF projections
// (manifest/collection/exhibits.json) derive from. Exhibit-nested ownership (ADR-0001 / Q-1):
// an Exhibit owns its Objects; there is no shared object pool.

import type { TileSourceDescriptor } from "../iiif/resolve.js";

/** Media kind of an Object (CONTEXT: image / audio / video). */
export type MediaType = "image" | "sound" | "video";

const SOUND_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)(?:[?#]|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i;

/** Infer an Object's MediaType from its source URL (+ optional MIME). Unknown → "image" (the v1
 *  default; OSD is the image path). Used at import to type an added object. */
export function mediaTypeFromSource(source: string, format?: string): MediaType {
  if (format) {
    if (format.startsWith("audio/")) return "sound";
    if (format.startsWith("video/")) return "video";
    if (format.startsWith("image/")) return "image";
  }
  if (SOUND_EXT.test(source)) return "sound";
  if (VIDEO_EXT.test(source)) return "video";
  return "image";
}

// Layout = the author's declaration of reading intent. CONTEXT §43: a "layout" conflates TWO orthogonal
// axes — SPATIAL ARRANGEMENT (one / many / side-by-side) and READING MODE (click vs scroll, object-led
// vs prose-led). The forward-compatibility RULE (so the picker never sprawls into a template menu):
//   • a new spatial ARRANGEMENT → a new `LayoutType` value (e.g. `compare`, v1.1);
//   • a new reading MODE of an existing arrangement → the `mode` field on Exhibit, NOT a new LayoutType
//     (e.g. slideshow = a mode of grid; scrollytelling = a mode of narrative — both §92).
/** The v1 layout set (the SPATIAL-arrangement axis; `narrative` also carries the prose-led reading). */
export type LayoutType = "single" | "grid" | "narrative";

/** The reading-mode family (CONTEXT §43/§122): is the OBJECT the subject, or the author's PROSE? Names a
 *  reading relationship rather than an interchangeable skin.
 *  RESERVED for the v1.1 'compare' arrangement; no v1 production consumer (the layout-picker is retired — ADR-0016). */
export type ReadingFamily = "object-led" | "prose-led";

/** Which reading family a layout belongs to. (Single/Grid/Compare = object-led; Narrative = prose-led.) */
export function readingFamily(layout: LayoutType): ReadingFamily {
  return layout === "narrative" ? "prose-led" : "object-led";
}

/**
 * Is `mode` a valid reading-mode for `layout`? The §43 family-binding rule, in code (not just comments)
 * — and the guard for untrusted input (published JSON / a hand-edited file may carry any string). v1:
 * no reading modes are defined yet, so only the absence of a mode is valid; v1.1 widens this to bind
 * each mode to its arrangement (e.g. "slideshow" ⇒ grid only, "scrollytelling" ⇒ narrative only).
 */
export function isValidMode(_layout: LayoutType, mode: string | undefined): boolean {
  return mode === undefined;
}

/**
 * IIIF rights / attribution carried by a Library, Exhibit, or Object — the SAME field set at every
 * level (CONTEXT "Exhibit / Library rights & metadata"; Q1–Q3). Authored as friendly inputs, projected
 * THIN to the IIIF-standard vocabulary at publish so a pure IIIF viewer (Mirador) shows credit + license
 * for free: `requiredStatement` → IIIF `requiredStatement` (a MUST-display label/value pair), `rights`
 * → IIIF `rights` (a single license URI — CC / RightsStatements.org). `provider` / `metadata` /
 * contributors / per-field opt-in `inherit` are ADDITIVE (the IIIF fields exist; exposed progressively).
 * Core-first carries only `requiredStatement` + `rights`.
 */
export interface RightsFields {
  /** A license URI (CC / RightsStatements.org). Projects to IIIF `rights`. Studio = an approved-URI picker. */
  rights?: string;
  /** The displayed attribution credit. Projects to IIIF `requiredStatement` (MUST-display). `label`
   *  defaults to "Attribution" at projection when blank. "Republished from X under the same license"
   *  lives HERE (it is statement text, not an approved `rights` URI). */
  requiredStatement?: { label: string; value: string };
}

/** One media item inside an Exhibit; projects to an IIIF Canvas. */
export interface AObject extends RightsFields {
  /** Stable id within the Exhibit (used to build the canvas id). */
  id: string;
  /** Image URL or IIIF service/info.json (classified by resolveTileSource). */
  source: string;
  label: string;
  /** Optional description/caption for this object — projects to the IIIF Canvas `summary`. */
  summary?: string;
  /** Defaults to "image". */
  mediaType?: MediaType;
  /** Geo-annotation extension (DESIGN.md): a slippy-map basemap descriptor. When set, the object mounts
   *  as a bounded OSD pixel raster (a map) rather than an image/IIIF `source`. Absent for normal media. */
  tileSource?: TileSourceDescriptor;
  /** Pixel dimensions — required by IIIF for image/video canvases when known. */
  width?: number;
  height?: number;
  /** Seconds — for sound/video canvases. */
  duration?: number;
  /** MIME type of the source (e.g. image/jpeg). */
  format?: string;
  /** Preserved-original filename, published to `{slug}/assets-original/{name}` for citation when opted in
   *  (CONTEXT §89.1 EXIF display-master). Set from the bake provenance; absent for non-baked objects. */
  originalName?: string;
}

/**
 * One ordered unit of a Narrative exhibit's spine; projects to an IIIF Range. Its `start` is
 * what the canvas shows when the section is active (CONTEXT §Language: Section). A Single
 * exhibit has no sections; a Narrative exhibit has N ordered ones (prose is the spine).
 */
export interface Section {
  id: string;
  title: string;
  /** The Object (canvas) this section activates. The spine may switch objects across sections. */
  objectId: string;
  /** The camera target on that object — a MEDIA FRAGMENT (ADR-0005): `xywh=...` for an image object,
   *  `t=start,end` for an AV object (the fragment after `#`, same grammar as a Note selector). Whole
   *  object when absent. (Was `xywh` spatial-only; widened so the spine can focus a moment on AV.) */
  start?: string;
  /** Prose (markdown/HTML) for this section's pane. */
  prose?: string;
}

/**
 * A Reading — a curated, mutually-exclusive interpretive PASS over the exhibit's objects (ADR-0007;
 * e.g. a "cipher" vs a "hoax" reading of the same folio). The reader switches between Readings (the
 * canvas legend is a radio); a Note belongs to one Reading via `record.reading` (this id) or none
 * (the always-visible base). Projects to an IIIF `AnnotationCollection` per Exhibit; each object's
 * notes for the reading form an `AnnotationPage` whose `partOf` points at it.
 * NB: DISTINCT from the §42 reading-MODE axis (`Exhibit.mode` / `readingFamily`) — a Reading is
 * *interpretation*; a mode is *pacing* (click vs scroll). Different concepts, similar word.
 */
export interface Reading {
  /** Stable id; `record.reading` references this. */
  id: string;
  /** Display name shown in the legend (e.g. "Cipher"). */
  name: string;
  /** One-line description — makes the reading's intent legible in the legend (UX principle #1). */
  description?: string;
  /** Visual identity (legend swatch / marker accent). */
  colour?: string;
}

/** One published narrative artifact; projects to an IIIF Manifest. Self-contained (Q-1).
 *  Carries `RightsFields` (credit/license) at the Exhibit level. */
export interface Exhibit extends RightsFields {
  id: string;
  /** URL segment — the published grammar is `/{slug}/` (CONTEXT linkability). */
  slug: string;
  title: string;
  summary?: string;
  /** Cover image URL for the Gallery card (UX-Q7). */
  cover?: string;
  objects: AObject[];
  /** Ordered narrative sections (IIIF Ranges). Present only for Narrative-layout exhibits. */
  sections?: Section[];
  /** The exhibit's curated Readings — interpretive passes (ADR-0007). A Note references one by id
   *  (`record.reading`) or none (base). Absent/empty = a base-only exhibit (no legend). Order = legend order. */
  readings?: Reading[];
  /** @deprecated (ADR-0016) The leading surface is now a pure function of content — `resolveLayout`
   *  always DERIVES the type and IGNORES this field. Kept OPTIONAL only for read-tolerance of legacy
   *  stored data (harmless when present); the Studio MUST NOT write it. Remove once no stored exhibit
   *  carries it. */
  layout?: LayoutType;
  /** RESERVED (§43 reading-MODE axis) — a pacing/mode variant of `layout` (e.g. "slideshow" of grid,
   *  "scrollytelling" of narrative). Unused in v1 (no mode is set); reserved so v1.1 modes attach here
   *  additively instead of becoming new flat LayoutType templates. */
  mode?: string;
}

/** Top-level container for one project; projects to an IIIF Collection. Array order = display order.
 *  Carries `RightsFields` (credit/license) at the Library level. */
export interface Library extends RightsFields {
  id: string;
  title?: string;
  summary?: string;
  exhibits: Exhibit[];
}

/**
 * Scope a Library to a single Exhibit — the "single-exhibit export = a Library with N=1" resolution
 * (CONTEXT §"Local view loop"): NOT a new artifact type, just a one-exhibit Library. Drops the
 * Library title/summary so the Gallery collapses straight to the exhibit (shouldRenderGallery →
 * false). Unknown slug → an empty Library (defensive; nothing to publish).
 */
export function singleExhibitLibrary(library: Library, slug: string): Library {
  const ex = library.exhibits.find((e) => e.slug === slug);
  return { id: library.id, exhibits: ex ? [ex] : [] };
}

/** Resolve a Reading id to its registry entry (name/description/colour), or undefined (ADR-0007). */
export function readingById(exhibit: Pick<Exhibit, "readings">, id: string): Reading | undefined {
  return exhibit.readings?.find((r) => r.id === id);
}
