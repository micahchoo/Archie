// Spatiotemporal media-fragment selectors (ADR-0006, Wave 2 — VIDEO). A video annotation targets a
// region on a frame OVER a time window: `xywh=<unit>:x,y,w,h` AND `t=start,end`, joined by `&`
// (W3C Media Fragments). Image = xywh only; audio = t only; video = both. Pure + headless-tested.
// Donor selector model: osd-audio-video video-canvas.html:772 (`t=start,end&xywh=percent:...`).
//
// Why a new parser: `parseFragmentXYWH` anchors `^xywh=…$` (won't match a combined value) and
// `parseTimeFragment` chokes on the trailing `&xywh=…`. This splits the `&`-separated dimensions
// first, then delegates each to the existing single-dimension logic — one source of truth per axis.
import type { Box } from "./selector.js";
import { parseTimeFragment, timeFragmentValue, type TimeRange } from "../av/time.js";

/** Coordinate unit of a spatial fragment: `pixel` (images) or `percent` (video — frame-size-independent). */
export type FragmentUnit = "pixel" | "percent";

export interface MediaFragment {
  /** Spatial region (xywh). Absent for an audio / time-only selector. */
  box?: Box;
  /** Unit of `box`. Defaults to `pixel` (the W3C default when no prefix is given). */
  unit?: FragmentUnit;
  /** Temporal window (t=). Absent for an image / space-only selector. */
  time?: TimeRange;
}

const XYWH_UNIT_RE = /^xywh=(?:(pixel|percent):)?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;

function parseXYWHUnit(dim: string): { box: Box; unit: FragmentUnit } | null {
  const m = dim.match(XYWH_UNIT_RE);
  if (!m) return null;
  const [x, y, w, h] = [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
  if ([x, y, w, h].some((n) => !Number.isFinite(n))) return null;
  return { box: { x, y, w, h }, unit: (m[1] as FragmentUnit | undefined) ?? "pixel" };
}

/**
 * Parse a (possibly combined) media-fragment value into its spatial + temporal parts. Accepts
 * `xywh=…`, `t=…`, and spatiotemporal `t=…&xywh=…` in ANY order. Returns `{}` when neither
 * dimension parses — the caller decides whether an empty fragment is meaningful (a whole-object beat).
 */
export function parseMediaFragment(value: string): MediaFragment {
  const out: MediaFragment = {};
  if (typeof value !== "string") return out;
  for (const dim of value.trim().split("&")) {
    const d = dim.trim();
    if (d.startsWith("xywh=")) {
      const sp = parseXYWHUnit(d);
      if (sp) { out.box = sp.box; out.unit = sp.unit; }
    } else if (d.startsWith("t=")) {
      const t = parseTimeFragment(d);
      if (t) out.time = t;
    }
  }
  return out;
}

/**
 * Serialize a spatiotemporal selector value: `t=start,end` then `xywh=<unit>:x,y,w,h`, joined by `&`
 * (the donor order). Either part may be omitted — a time-only (audio) or space-only (image) selector.
 * The write-side inverse of parseMediaFragment.
 */
export function mediaFragmentValue(frag: MediaFragment): string {
  const parts: string[] = [];
  if (frag.time) parts.push(timeFragmentValue(frag.time.start, frag.time.end));
  if (frag.box) parts.push(`xywh=${frag.unit ?? "pixel"}:${frag.box.x},${frag.box.y},${frag.box.w},${frag.box.h}`);
  return parts.join("&");
}
