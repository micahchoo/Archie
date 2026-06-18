// Pure selector parsing + geometry (spike-0001 module 5, CLEAN-LIFT from anvil
// storage/annotations.ts:19 + annotation-fields.ts:67). All pure: value in, value out —
// no DOM, no Annotorious. The polygon->bbox math is the piece the fitBounds nav contract
// needs (OSD goToTarget is rect-only); the OSD wiring itself lands in @render/mount (Phase 1).

import type { W3CSelector } from "../wadm/types.js";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}

const XYWH_RE = /^xywh=(?:pixel:)?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;

/** Parse a `xywh=pixel:x,y,w,h` (or bare `xywh=x,y,w,h`) media fragment. Null if not a rect. */
export function parseFragmentXYWH(value: string): Box | null {
  const m = value.match(XYWH_RE);
  if (!m) return null;
  const [x, y, w, h] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if ([x, y, w, h].some((n) => !Number.isFinite(n))) return null;
  return { x, y, w, h };
}

/** Extract polygon points from an SVG selector value. Null if degenerate (NaN / empty). */
export function parsePolygonPoints(svg: string): Point[] | null {
  const m = svg.match(/<polygon\b[^>]*\bpoints=(?:"([^"]*)"|'([^']*)')/);
  const raw = m ? (m[1] ?? m[2] ?? "") : "";
  if (raw.trim() === "" || /\bNaN\b/.test(raw)) return null;
  const nums = raw.trim().split(/[\s,]+/).map(Number);
  if (nums.length < 6 || nums.length % 2 !== 0 || nums.some((n) => !Number.isFinite(n))) return null;
  const points: Point[] = [];
  for (let i = 0; i < nums.length; i += 2) points.push({ x: nums[i]!, y: nums[i + 1]! });
  return points;
}

/** Axis-aligned bounding box of a point set. Null if empty. */
export function polygonBBox(points: Point[]): Box | null {
  if (points.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** A WADM-shaped annotation as Annotorious emits it — the minimal structural surface `selectorOf`
 *  reads (id for lookup, target for the selector). Matches @render/mount's fitbounds AnnotationLike. */
export interface AnnotationLike {
  id?: string;
  target?: unknown;
}

/**
 * Extract a v1 WADM selector (rect/polygon) from a (possibly Annotorious-shaped) annotation: read
 * `ann.target.selector`, take `[0]` if it's an array, accept only a `FragmentSelector`/`SvgSelector`
 * with a string `value`, else null. The canonical home (@render/core) for the selector extraction the
 * viewer + @render/mount both need — pure (only W3CSelector, no OpenSeadragon/Annotorious dependency).
 */
export function selectorOf(ann: AnnotationLike | undefined): W3CSelector | null {
  const target = (ann as { target?: { selector?: unknown } } | undefined)?.target;
  const raw = Array.isArray(target?.selector) ? target?.selector[0] : target?.selector;
  const s = raw as { type?: unknown; value?: unknown } | undefined;
  if (s && (s.type === "FragmentSelector" || s.type === "SvgSelector") && typeof s.value === "string") {
    return { type: s.type, value: s.value } as W3CSelector;
  }
  return null;
}

/** Unify a v1 selector (rect or polygon) to a bounding box — the fitBounds input. */
export function selectorBBox(selector: W3CSelector): Box | null {
  if (selector.type === "FragmentSelector") return parseFragmentXYWH(selector.value);
  const points = parsePolygonPoints(selector.value);
  return points ? polygonBBox(points) : null;
}

/**
 * Degenerate-selector guard (anvil annotations.ts:19). Annotorious drawing tools can emit
 * empty path d="", polygon points="" / points="NaN". Four-layer defence in anvil; this is
 * the pure predicate. Operates on the selector VALUE string.
 */
export function isDegenerateSelectorValue(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  if (/<path\s[^>]*\bd=(""|'')/.test(value)) return true;
  if (/<polygon\s[^>]*\bpoints=(""|'')/.test(value)) return true;
  if (/\bNaN\b/.test(value)) return true;
  return false;
}

/**
 * Degenerate-TARGET guard at the log boundary (worklist 0.2): does any selector on this target
 * carry empty/NaN geometry? A target with NO selector is fine (a whole-canvas / Library / Exhibit
 * note). Used by AnnotationSession to refuse degenerate geometry BEFORE it enters the append-only
 * log — the log is the one writer, so a record it holds must always be renderable.
 */
export function isDegenerateTarget(target: string | { selector?: { value?: unknown } | Array<{ value?: unknown }> } | undefined): boolean {
  if (!target || typeof target === "string") return false; // a bare IRI target (Library/Exhibit note) has no geometry
  const sels = Array.isArray(target.selector) ? target.selector : target.selector ? [target.selector] : [];
  return sels.some((s) => isDegenerateSelectorValue(typeof s.value === "string" ? s.value : undefined));
}

export type ShapeLabel = "Rect" | "Polygon" | "Ellipse" | "Circle" | "Path" | "Line" | "SVG" | "?";

/** Human-readable shape of a selector (anvil annotation-fields.ts:67). */
export function shapeLabel(selector: W3CSelector): ShapeLabel {
  if (selector.type === "FragmentSelector") return "Rect";
  const v = selector.value;
  if (v.includes("<polygon")) return "Polygon";
  if (v.includes("<ellipse")) return "Ellipse";
  if (v.includes("<circle")) return "Circle";
  if (v.includes("<path")) return "Path";
  if (v.includes("<line")) return "Line";
  return "SVG";
}

/** The v1 shape vocabulary is rect + polygon ONLY (Q-1). Ellipse/path are a v1.1 svgpath gate. */
export function isV1Shape(selector: W3CSelector): boolean {
  const label = shapeLabel(selector);
  return label === "Rect" || label === "Polygon";
}
