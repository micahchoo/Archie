// EXIF Orientation reader (CONTEXT §89.1 EXIF display-master; orphan gate). PURE: scans a JPEG's
// APP1/Exif segment for the Orientation tag (0x0112) and returns 1..8, or 1 for anything that
// doesn't conform (no Exif, not a JPEG, truncated, unknown value). The reader is the headless-
// testable half: it decides whether a bake is needed and records the orientation for provenance —
// the actual pixel push (canvas re-encode to an upright display-master) is a browser step.
//
// Pairs with `orientationTransform`/`normalizeDimensions` (orientation.ts, the transform mapping)
// and the corpus spec at test/fixtures/exif/manifest.json.

const EXIF_SIGNATURE = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
const ORIENTATION_TAG = 0x0112;

/** Read the EXIF Orientation (1..8) from JPEG bytes. Returns 1 when absent/unparseable. */
export function readExifOrientation(buf: ArrayBuffer): number {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return 1; // not a JPEG (no SOI)
    let off = 2;
    while (off + 2 <= v.byteLength) {
      if (v.getUint8(off) !== 0xff) return 1; // not aligned on a marker — malformed
      // A marker may be preceded by fill 0xFF bytes; skip them to the real marker byte.
      let marker = v.getUint8(off + 1);
      off += 2;
      while (marker === 0xff && off < v.byteLength) { marker = v.getUint8(off); off += 1; }
      if (marker === 0xd9 || marker === 0xda) return 1; // EOI / SOS (scan begins) — no Exif found
      if (marker >= 0xd0 && marker <= 0xd7) continue;   // RSTn: standalone, no length
      if (off + 2 > v.byteLength) return 1;
      const len = v.getUint16(off); // segment length INCLUDES these 2 bytes
      const dataStart = off + 2;
      const dataEnd = dataStart + (len - 2);
      if (len < 2 || dataEnd > v.byteLength) return 1;
      if (marker === 0xe1 && hasExifSignature(v, dataStart)) {
        const o = parseTiffOrientation(v, dataStart + EXIF_SIGNATURE.length, dataEnd);
        if (o !== null) return o;
      }
      off = dataEnd; // advance to the next marker (APP0-before-APP1 etc. handled by iterating)
    }
    return 1;
  } catch {
    return 1; // any out-of-bounds / malformed read → identity
  }
}

function hasExifSignature(v: DataView, at: number): boolean {
  if (at + EXIF_SIGNATURE.length > v.byteLength) return false;
  return EXIF_SIGNATURE.every((b, i) => v.getUint8(at + i) === b);
}

/** Parse the TIFF block (starting at `tiff`) for the Orientation SHORT in IFD0. Null if absent. */
function parseTiffOrientation(v: DataView, tiff: number, end: number): number | null {
  if (tiff + 8 > end) return null;
  const byteOrder = v.getUint16(tiff);
  const le = byteOrder === 0x4949; // "II" little-endian; "MM" (0x4d4d) big-endian
  if (!le && byteOrder !== 0x4d4d) return null;
  if (v.getUint16(tiff + 2, le) !== 0x002a) return null; // TIFF magic
  const ifd0 = tiff + v.getUint32(tiff + 4, le);
  if (ifd0 + 2 > end) return null;
  const count = v.getUint16(ifd0, le);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > end) break;
    if (v.getUint16(entry, le) === ORIENTATION_TAG) {
      const value = v.getUint16(entry + 8, le); // SHORT(count 1): value in first 2 bytes of the field
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return null;
}
