import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readExifOrientation } from "./read.js";
import { orientationTransform, normalizeDimensions, isOrientationNoop } from "./orientation.js";

// EXIF orphan-gate consumer test (CONTEXT §89.1). The corpus spec lives in
// test/fixtures/exif/manifest.json: the display-master projection must normalize ALL 8 orientations,
// incl. 5 (transpose) and 7 (transverse) — "the ones nobody tests". This test wires the reader +
// the transform mapping to that spec. Real pixel-bearing exif-N.jpg are owed for the browser bake
// verify (can't run headless); here the EXIF segments are synthesized so the parser is exercised
// across both byte orders + the awkward marker layouts.

interface ManifestEntry { exif: number; name: string; noop: boolean; swapsAxes: boolean; }
const manifest = JSON.parse(
  readFileSync(new URL("../../test/fixtures/exif/manifest.json", import.meta.url), "utf8"),
) as { orientations: ManifestEntry[]; expectedNormalizedWxH: { w: number; h: number } };

const EXIF_SIG = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

/** Synthesize a JPEG carrying an APP1/Exif Orientation tag (no pixel data; the reader doesn't decode). */
function buildExifJpeg(orientation: number, opts: { bigEndian?: boolean; withApp0?: boolean } = {}): ArrayBuffer {
  const le = !opts.bigEndian;
  const u16 = (n: number) => (le ? [n & 0xff, (n >> 8) & 0xff] : [(n >> 8) & 0xff, n & 0xff]);
  const u32 = (n: number) => (le ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff] : [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);

  const tiff = le ? [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00] : [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08];
  tiff.push(...u16(1));            // IFD0 entry count
  tiff.push(...u16(0x0112));       // Orientation tag
  tiff.push(...u16(3));            // type SHORT
  tiff.push(...u32(1));            // count
  tiff.push(...u16(orientation), ...u16(0)); // value (first 2 bytes) padded to 4
  tiff.push(...u32(0));            // next-IFD offset = 0
  const payload = [...EXIF_SIG, ...tiff];
  const app1Len = payload.length + 2; // JPEG segment length is ALWAYS big-endian

  const bytes: number[] = [0xff, 0xd8]; // SOI
  if (opts.withApp0) bytes.push(0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00); // APP0 JFIF
  bytes.push(0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff, ...payload); // APP1
  bytes.push(0xff, 0xd9); // EOI
  return new Uint8Array(bytes).buffer;
}

describe("EXIF orphan-gate: all 8 orientations (manifest is the spec) — reader + transform mapping", () => {
  it("has the full corpus incl. the rarely-tested transpose(5)/transverse(7)", () => {
    expect(manifest.orientations.map((o) => o.exif)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  for (const entry of manifest.orientations) {
    it(`orientation ${entry.exif} (${entry.name}): reads, transforms, and normalizes to the master dims`, () => {
      // Reader: parse the Orientation tag, both byte orders + with a leading APP0 (as phones emit).
      expect(readExifOrientation(buildExifJpeg(entry.exif))).toBe(entry.exif);
      expect(readExifOrientation(buildExifJpeg(entry.exif, { bigEndian: true }))).toBe(entry.exif);
      expect(readExifOrientation(buildExifJpeg(entry.exif, { withApp0: true }))).toBe(entry.exif);

      // Transform mapping matches the spec's structured fields (not the prose string).
      expect(isOrientationNoop(entry.exif)).toBe(entry.noop);
      expect(orientationTransform(entry.exif).swapsAxes).toBe(entry.swapsAxes);

      // Display-master dimensions: axis-swapping sources are stored 2x4, all normalize to 4x2.
      const src = entry.swapsAxes ? { w: 2, h: 4 } : { w: 4, h: 2 };
      expect(normalizeDimensions(src.w, src.h, entry.exif)).toEqual({ width: manifest.expectedNormalizedWxH.w, height: manifest.expectedNormalizedWxH.h });
    });
  }
});

describe("readExifOrientation — degrades to identity (1) on anything non-conforming", () => {
  it("returns 1 for a JPEG with no Exif segment", () => {
    expect(readExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).toBe(1);
  });
  it("returns 1 for non-JPEG bytes", () => {
    expect(readExifOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBe(1); // PNG signature
  });
  it("returns 1 for an out-of-range orientation value", () => {
    expect(readExifOrientation(buildExifJpeg(9))).toBe(1);
  });
  it("returns 1 for a truncated APP1 (length runs past EOF)", () => {
    const full = new Uint8Array(buildExifJpeg(6));
    expect(readExifOrientation(full.slice(0, full.length - 12).buffer)).toBe(1);
  });
});
