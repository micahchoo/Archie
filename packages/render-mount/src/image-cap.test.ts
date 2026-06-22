import { describe, it, expect } from "vitest";
import { MAX_DECODE_DIM, guardImageDimensions } from "./image-cap.js";
import { MAX_MASTER_DIM } from "@render/core";

// Viewer-side image-decode dimension cap (strategy 5.5). The AUTHOR side caps a bundled display
// master at MAX_MASTER_DIM=6000 on import (downscale.ts / bake.ts). A hand-edited `.archie.zip`
// can smuggle a NON-TILED image whose declared dims exceed that cap, forcing the webview to decode
// a giant bitmap into memory. This guard rejects such a source at the mount seam. Tiled sources
// (DZI / IIIF / XYZ) are pyramids — OSD only decodes the visible tiles — so they are NOT capped.

describe("image-cap — viewer decode-dimension guard (strategy 5.5)", () => {
  it("reuses the author-side cap constant/spirit (MAX_MASTER_DIM)", () => {
    // The viewer cap is anchored to the author cap — not a divergent magic number.
    expect(MAX_DECODE_DIM).toBe(MAX_MASTER_DIM);
  });

  it("accepts a non-tiled image within the cap", () => {
    expect(guardImageDimensions({ tiled: false, width: 4000, height: 3000 })).toEqual({ ok: true });
  });

  it("accepts a non-tiled image exactly at the cap (boundary, longer edge == cap)", () => {
    expect(guardImageDimensions({ tiled: false, width: MAX_DECODE_DIM, height: 100 })).toEqual({ ok: true });
  });

  it("rejects a non-tiled image whose longer edge exceeds the cap", () => {
    const r = guardImageDimensions({ tiled: false, width: 12000, height: 800 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.declared).toEqual({ width: 12000, height: 800 });
      expect(r.cap).toBe(MAX_DECODE_DIM);
    }
  });

  it("rejects when the TALLER edge exceeds the cap (longer-edge semantics, not just width)", () => {
    expect(guardImageDimensions({ tiled: false, width: 800, height: 12000 }).ok).toBe(false);
  });

  it("NEVER caps a tiled source, even one declaring huge dims (pyramids decode per-tile)", () => {
    expect(guardImageDimensions({ tiled: true, width: 100000, height: 100000 })).toEqual({ ok: true });
  });

  it("accepts unknown dims (0) — nothing declared to guard against (degrade-upward, never block)", () => {
    expect(guardImageDimensions({ tiled: false, width: 0, height: 0 })).toEqual({ ok: true });
  });
});
