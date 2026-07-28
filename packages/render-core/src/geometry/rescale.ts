// Selector coordinate RESCALING (Archie-4b0a) — the pure half of the web-tier fix.
//
// THE DEFECT THIS CLOSES. Annotation geometry is stored in ABSOLUTE IMAGE PIXELS against the
// authored master: `xywh=pixel:x,y,w,h` on a FragmentSelector, or an SvgSelector polygon in the same
// space. The viewer maps those straight off the LOADED image's content size — OSD's
// `viewport.imageToViewportRectangle` (`render-mount/src/read-overlay.ts:295`, `mount.ts:233`) over
// `item.getContentSize()` (`mount.ts:405`). Nothing between the manifest's canvas dimensions and the
// image actually served rescales a selector. So publishing a 6000 px master at 2400 px (the web
// quality tier, `apps/studio/src/publish-tier.ts`) put every region 2.5x out of place.
//
// THE POSTURE. This is a PROJECTION-time transform, exactly like `rebaseCanvasId`: the authored log
// is never touched, the history sidecar keeps the master-space coordinates verbatim, and only the
// consumer projection (the per-canvas heads pages + the manifest's Range `start`) is scaled. A
// load→publish round trip therefore rescales from canonical each time rather than compounding.
//
// WHAT SCALES AND WHAT MUST NOT — each of these is a real coordinate space, not an oversight:
//   xywh=pixel:… / bare xywh=…  SCALES. Absolute image pixels; the whole subject.
//   xywh=percent:…              NEVER. Percent is frame-size-independent by construction (video,
//                               `geometry/mediafragment.ts`) — scaling it would break what already works.
//   t=start,end                 NEVER. Time, not space (audio/video windows, ADR-0006).
//   archie:geo                  NEVER. WGS84 lng/lat (`GeoAnchor`, wadm/types.ts:279) — a geographic
//                               anchor is not in the image's pixel space at all.
//
// ROUNDING POLICY, stated because a published coordinate is a permanent artifact:
//   - `xywh` rounds to INTEGER pixels, half-up (`Math.round`, which rounds toward +Infinity on .5).
//     The media-fragment grammar addresses pixels, and the parsers this repo ships
//     (`parseFragmentXYWH`, `parseMediaFragment`) accept decimals but nothing gains from them.
//     EDGES are scaled, not (origin, extent): x2 = round((x+w)·sx) then w' = x2 − x1. Rounding x and
//     w independently lets the far edge drift by a pixel; rounding the edges cannot.
//   - SVG coordinates keep TWO DECIMALS. An SVG selector is a float geometry (Annotorious emits
//     fractional vertices), so integer-snapping a polygon would visibly move vertices on a small
//     region. Trailing zeros are dropped, so an integer stays an integer in the output.
//
// NOT SILENT. Anything this module cannot scale exactly comes back with an `unscalable` reason
// instead of being passed through with wrong coordinates — the caller reports it
// (`PublishResult.unscaledSelectors`). `<path d="…">` is the honest instance: arc flags and
// elliptical-arc radii do not survive a non-uniform scale by attribute rewriting, and a path is
// outside the v1 shape vocabulary (`isV1Shape`, selector.ts:124) that the overlay renderers will
// draw, so inventing a transform for it would be inventing behaviour for geometry nothing renders.

import type { W3CSelector, W3CSpecificResource, W3CTarget } from "../wadm/types.js";

/** The per-axis linear factor from AUTHORED (master) pixel space to SERVED pixel space.
 *  `sx = served.width / master.width`; both axes are carried separately because `fitWithin` rounds
 *  each independently, so a downscale is very nearly — but not exactly — uniform. */
export interface SelectorScale {
  sx: number;
  sy: number;
}

/** Is this scale a no-op? The archival tier's answer, and the byte-identity guarantee's basis. */
export function isIdentityScale(s: SelectorScale): boolean {
  return s.sx === 1 && s.sy === 1;
}

/** The outcome of scaling one value: the new string, plus a REASON when some part of it could not be
 *  scaled exactly. `unscalable` set means `value` is the INPUT, untouched — never a half-scaled one. */
export interface ScaleOutcome<T> {
  value: T;
  unscalable?: string;
}

/** Round-half-up to an integer pixel. `Math.round` rounds .5 toward +Infinity, which IS half-up. */
const px = (n: number): number => Math.round(n);

/** Two decimals, trailing zeros dropped (`12.00` → `12`, `12.345` → `12.35`). */
const svgNum = (n: number): string => String(Math.round(n * 100) / 100);

// ---------------------------------------------------------------------------------------------
// Media fragments (`xywh=` / `t=`, `&`-joined in any order — geometry/mediafragment.ts)
// ---------------------------------------------------------------------------------------------

const XYWH_RE = /^xywh=(?:(pixel|percent):)?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;

/**
 * Scale the spatial dimension of a media-fragment value, leaving every other dimension byte-identical.
 *
 * Order and separators are preserved (a spatiotemporal `t=…&xywh=…` comes back with `t=` first), and
 * the unit prefix is preserved: `xywh=pixel:` stays `pixel:`, a bare `xywh=` stays bare.
 */
export function scaleMediaFragmentValue(value: string, s: SelectorScale): ScaleOutcome<string> {
  if (isIdentityScale(s)) return { value };
  const dims = value.split("&");
  let sawSpatial = false;
  let unscalable: string | undefined;
  const next = dims.map((dim) => {
    const d = dim.trim();
    if (!d.startsWith("xywh=")) return dim; // t=… and anything else: not this module's coordinate space
    sawSpatial = true;
    const m = d.match(XYWH_RE);
    if (!m) {
      unscalable ??= `unparseable spatial fragment: ${d}`;
      return dim;
    }
    if (m[1] === "percent") return dim; // frame-size-independent by construction — scaling it is the bug
    const [x, y, w, h] = [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
    // Scale the EDGES, then derive the extent — see the header's rounding note.
    const x1 = px(x * s.sx);
    const y1 = px(y * s.sy);
    const x2 = px((x + w) * s.sx);
    const y2 = px((y + h) * s.sy);
    const unit = m[1] ? `${m[1]}:` : "";
    return `xywh=${unit}${x1},${y1},${x2 - x1},${y2 - y1}`;
  });
  if (unscalable !== undefined) return { value, unscalable };
  if (!sawSpatial) return { value }; // pure `t=…` — correct untouched, and not a finding
  return { value: next.join("&") };
}

// ---------------------------------------------------------------------------------------------
// SVG selectors
// ---------------------------------------------------------------------------------------------

/** Which axis each scalable SVG attribute lives on. `mean` is the geometric mean of the two factors —
 *  a circle's radius has no single axis, and under a near-uniform tier downscale the two differ by
 *  well under a pixel. (An `<ellipse>` is the shape that expresses a genuinely non-uniform radius,
 *  and it scales its two radii independently, which is why `mean` is confined to `<circle> r`.) */
const SHAPE_ATTRS: Readonly<Record<string, Readonly<Record<string, "x" | "y" | "mean">>>> = {
  rect: { x: "x", y: "y", width: "x", height: "y", rx: "x", ry: "y" },
  circle: { cx: "x", cy: "y", r: "mean" },
  ellipse: { cx: "x", cy: "y", rx: "x", ry: "y" },
  line: { x1: "x", y1: "y", x2: "x", y2: "y" },
};

/** Structural elements that carry no geometry of their own and are passed through. */
const CONTAINER_TAGS: ReadonlySet<string> = new Set(["svg", "g", "defs", "title", "desc", "metadata"]);

/** Elements whose geometry is a POINT LIST rather than attributes. */
const POINTS_TAGS: ReadonlySet<string> = new Set(["polygon", "polyline"]);

const ELEMENT_RE = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)/g;

/** Rewrite a `points="x,y x,y …"` list, preserving the authored separators exactly. */
function scalePoints(raw: string, s: SelectorScale): string | null {
  // Split KEEPING the separators, so `1,2 3,4` does not come back as `1 2 3 4`.
  const parts = raw.split(/([\s,]+)/);
  let coord = 0;
  for (let i = 0; i < parts.length; i++) {
    const tok = parts[i]!;
    if (i % 2 === 1 || tok === "") continue; // separator, or an empty edge token from a leading/trailing one
    const n = Number(tok);
    if (!Number.isFinite(n)) return null;
    parts[i] = svgNum(n * (coord % 2 === 0 ? s.sx : s.sy));
    coord++;
  }
  if (coord < 6 || coord % 2 !== 0) return null;
  return parts.join("");
}

/** Rewrite one numeric attribute in an element's attribute text, if present. */
function scaleAttr(attrs: string, name: string, factor: number): { attrs: string; ok: boolean } {
  const re = new RegExp(`(\\b${name}\\s*=\\s*)("([^"]*)"|'([^']*)')`);
  const m = attrs.match(re);
  if (!m) return { attrs, ok: true }; // absent is fine — SVG attributes have defaults
  const raw = m[3] ?? m[4] ?? "";
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return { attrs, ok: false };
  const q = m[2]!.startsWith('"') ? '"' : "'";
  return { attrs: attrs.replace(re, `${m[1]}${q}${svgNum(n * factor)}${q}`), ok: true };
}

/**
 * Scale every coordinate in an SVG selector's markup.
 *
 * A `transform` attribute anywhere is refused outright: it re-parents the coordinate system, so
 * rewriting the attributes underneath it would be wrong in a way no test of the attributes alone
 * would catch. Same for `<path>` — see the header.
 */
export function scaleSvgSelectorValue(value: string, s: SelectorScale): ScaleOutcome<string> {
  if (isIdentityScale(s)) return { value };
  if (/\btransform\s*=/.test(value)) return { value, unscalable: "SVG carries a transform — the coordinate system is not the image's" };
  const mean = Math.sqrt(s.sx * s.sy);
  let out = "";
  let last = 0;
  let shapes = 0;
  let unscalable: string | undefined;
  for (const m of value.matchAll(ELEMENT_RE)) {
    const tag = m[1]!.toLowerCase();
    if (CONTAINER_TAGS.has(tag)) continue;
    if (tag === "path") {
      unscalable ??= "<path> geometry cannot be rescaled by attribute rewriting (arc flags/radii)";
      break;
    }
    const attrs = m[2]!;
    let nextAttrs: string | null = null;
    if (POINTS_TAGS.has(tag)) {
      const pm = attrs.match(/(\bpoints\s*=\s*)("([^"]*)"|'([^']*)')/);
      if (!pm) { unscalable ??= `<${tag}> has no points list`; break; }
      const scaled = scalePoints(pm[3] ?? pm[4] ?? "", s);
      if (scaled === null) { unscalable ??= `<${tag}> points list is degenerate or non-numeric`; break; }
      const q = pm[2]!.startsWith('"') ? '"' : "'";
      nextAttrs = attrs.replace(pm[0], `${pm[1]}${q}${scaled}${q}`);
    } else if (SHAPE_ATTRS[tag]) {
      let acc = attrs;
      let ok = true;
      for (const [name, axis] of Object.entries(SHAPE_ATTRS[tag]!)) {
        const r = scaleAttr(acc, name, axis === "x" ? s.sx : axis === "y" ? s.sy : mean);
        acc = r.attrs;
        if (!r.ok) { ok = false; break; }
      }
      if (!ok) { unscalable ??= `<${tag}> has a non-numeric coordinate attribute`; break; }
      nextAttrs = acc;
    } else {
      unscalable ??= `unsupported SVG element <${tag}>`;
      break;
    }
    shapes++;
    // Splice the rewritten attribute text back in place of the original.
    const attrsAt = m.index! + 1 + m[1]!.length;
    out += value.slice(last, attrsAt) + nextAttrs;
    last = attrsAt + attrs.length;
  }
  if (unscalable !== undefined) return { value, unscalable };
  if (shapes === 0) return { value, unscalable: "SVG selector carries no scalable geometry" };
  return { value: out + value.slice(last) };
}

// ---------------------------------------------------------------------------------------------
// Selectors + targets
// ---------------------------------------------------------------------------------------------

/** Scale ONE selector, dispatching on its type. Unchanged (and not a finding) when it carries no
 *  spatial coordinates — a pure `t=` time window is a correct, complete answer. */
export function scaleSelector(sel: W3CSelector, s: SelectorScale): ScaleOutcome<W3CSelector> {
  const r = sel.type === "FragmentSelector" ? scaleMediaFragmentValue(sel.value, s) : scaleSvgSelectorValue(sel.value, s);
  if (r.unscalable !== undefined) return { value: sel, unscalable: r.unscalable };
  return { value: r.value === sel.value ? sel : { ...sel, value: r.value } };
}

/**
 * Scale every selector on a WADM target.
 *
 * A BARE-STRING target is returned untouched, including one carrying a `#xywh=` fragment. That is
 * not an omission and it is measured: `publishLibrary` groups heads by EXACT canvas-IRI equality
 * (`targetSource(h) === canvasId`, site.ts), and `targetSource` returns the whole string for a bare
 * target — so `{canvasId}#xywh=…` matches no canvas and never reaches a per-canvas page in the first
 * place. Scaling it here would be code no published tree can exercise. The bare targets that DO
 * reach a page are ADR-0018 whole-object notes, which carry no fragment and nothing to scale.
 */
export function scaleTarget(target: W3CTarget, s: SelectorScale): ScaleOutcome<W3CTarget> {
  if (typeof target === "string" || isIdentityScale(s)) return { value: target };
  const sel = target.selector;
  if (sel === undefined) return { value: target };
  const list = Array.isArray(sel) ? sel : [sel];
  const out: W3CSelector[] = [];
  let changed = false;
  let unscalable: string | undefined;
  for (const one of list) {
    const r = scaleSelector(one, s);
    if (r.unscalable !== undefined) unscalable ??= r.unscalable;
    if (r.value !== one) changed = true;
    out.push(r.value);
  }
  if (unscalable !== undefined) return { value: target, unscalable };
  if (!changed) return { value: target };
  const next: W3CSpecificResource = { ...target, selector: Array.isArray(sel) ? out : out[0]! };
  return { value: next };
}
