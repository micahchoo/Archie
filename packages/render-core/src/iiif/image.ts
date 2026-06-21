// IIIF Image API 3.0 region URLs — the FREE build-time crop path for IIIF-backed objects (ADR-0018
// rich-cite previews / CONTEXT §"Object-level Notes + rich citation rendering"). When an object's
// source is an IIIF image service, a region thumbnail is just a URL the remote server crops — no
// OffscreenCanvas, no baked file. (Local/baked objects use the OffscreenCanvas crop path instead.)
// Pure: strings in, string out. Prior art: IIIF Image API 3.0 spec (iiif-demo/IIIF-generator) +
// field-studio/src/shared/lib/iiif-image-api.ts (the request grammar donor).

import { parseFragmentXYWH } from "../geometry/selector.js";

/** Strip a trailing `/info.json` and any trailing slash to get the bare IIIF Image service id. */
export function iiifServiceBase(idOrInfoUrl: string): string {
  return idOrInfoUrl.replace(/\/info\.json$/i, "").replace(/\/+$/, "");
}

/**
 * Build an IIIF Image API 3.0 request URL for a pixel region of an image service:
 * `{base}/{x,y,w,h}/{size}/0/default.jpg`. `xywh` accepts a media-fragment value
 * (`xywh=pixel:x,y,w,h`, `xywh=x,y,w,h`) or a bare `x,y,w,h`. `size` defaults to `!512,512`
 * (fit within a 512² box, preserving aspect — the `!` confined form). Returns null if the region
 * is unparseable or non-integral (the Image API region is integer pixels). Pure.
 */
export function iiifRegionUrl(serviceId: string, xywh: string, size = "!512,512"): string | null {
  const value = xywh.startsWith("xywh=") ? xywh : `xywh=${xywh}`;
  const box = parseFragmentXYWH(value);
  if (!box) return null;
  // Validate the ROUNDED region (what we actually emit): a sub-pixel width like 0.4 rounds to 0, which the
  // Image API rejects (400). The Image API region is integer pixels, so round first, then guard.
  const rx = Math.round(box.x), ry = Math.round(box.y), rw = Math.round(box.w), rh = Math.round(box.h);
  if (rx < 0 || ry < 0 || rw <= 0 || rh <= 0) return null;
  return `${iiifServiceBase(serviceId)}/${rx},${ry},${rw},${rh}/${size}/0/default.jpg`;
}

/** A whole-image IIIF thumbnail (the `full` region) — for an object/whole-object-note cite preview. */
export function iiifThumbUrl(serviceId: string, size = "!400,400"): string {
  return `${iiifServiceBase(serviceId)}/full/${size}/0/default.jpg`;
}
