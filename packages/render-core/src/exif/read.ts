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
const DATETIME_TAG = 0x0132;          // IFD0 "DateTime" (file modification)
const EXIF_IFD_POINTER_TAG = 0x8769;  // IFD0 → Exif sub-IFD
const DATETIME_ORIGINAL_TAG = 0x9003; // sub-IFD "DateTimeOriginal" (capture moment)

/**
 * Scan a JPEG's marker segments and run `handler` over the TIFF block of each APP1/Exif segment,
 * returning the FIRST non-null handler result (or null if none / not a JPEG / malformed). This is the
 * ONE scanner both readers share — extracting it kills the ~20-line byte-identical copy and, with it,
 * the class of divergence bug where one copy silently dropped the `0xff` marker-alignment guard (the
 * guard now lives in ONE place, so the two readers can never drift again). `handler` receives the TIFF
 * start (past the 6-byte "Exif\0\0" signature) and the segment end; it returns its parsed value or null
 * to keep scanning. NB: the not-found sentinel differs per caller (orientation = 1, date = null), so
 * each reader maps this function's `null` to its own — that mapping is NOT shared (different return
 * contracts), only the scan loop is.
 */
function scanJpegApp1<T>(buf: ArrayBuffer, handler: (v: DataView, tiff: number, end: number) => T | null): T | null {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null; // not a JPEG (no SOI)
    let off = 2;
    while (off + 2 <= v.byteLength) {
      if (v.getUint8(off) !== 0xff) return null; // not aligned on a marker — malformed
      // A marker may be preceded by fill 0xFF bytes; skip them to the real marker byte.
      let marker = v.getUint8(off + 1);
      off += 2;
      while (marker === 0xff && off < v.byteLength) { marker = v.getUint8(off); off += 1; }
      if (marker === 0xd9 || marker === 0xda) return null; // EOI / SOS (scan begins) — no Exif found
      if (marker >= 0xd0 && marker <= 0xd7) continue;      // RSTn: standalone, no length
      if (off + 2 > v.byteLength) return null;
      const len = v.getUint16(off); // segment length INCLUDES these 2 bytes
      const dataStart = off + 2;
      const dataEnd = dataStart + (len - 2);
      if (len < 2 || dataEnd > v.byteLength) return null;
      if (marker === 0xe1 && hasExifSignature(v, dataStart)) {
        const r = handler(v, dataStart + EXIF_SIGNATURE.length, dataEnd);
        if (r !== null) return r;
      }
      off = dataEnd; // advance to the next marker (APP0-before-APP1 etc. handled by iterating)
    }
    return null;
  } catch {
    return null; // any out-of-bounds / malformed read → not found
  }
}

/** Read the EXIF Orientation (1..8) from JPEG bytes. Returns 1 when absent/unparseable. */
export function readExifOrientation(buf: ArrayBuffer): number {
  return scanJpegApp1(buf, parseTiffOrientation) ?? 1; // not found → identity
}

/** Read the capture moment from JPEG bytes — DateTimeOriginal (sub-IFD 0x9003) preferred,
 *  IFD0 DateTime (0x0132) as fallback — as epoch ms (the "YYYY:MM:DD HH:MM:SS" is timezone-naive;
 *  parsed as UTC, which is deterministic and order-preserving). Null when absent/unparseable.
 *  Powers capture-date ordering in the folder import (Archie-e1d6 slice B / ⑫). */
export function readExifCaptureDate(buf: ArrayBuffer): number | null {
  return scanJpegApp1(buf, parseTiffCaptureDate);
}

/** Walk IFD0 (DateTime + the Exif-IFD pointer), then the sub-IFD (DateTimeOriginal). */
function parseTiffCaptureDate(v: DataView, tiff: number, end: number): number | null {
  if (tiff + 8 > end) return null;
  const byteOrder = v.getUint16(tiff);
  const le = byteOrder === 0x4949;
  if (!le && byteOrder !== 0x4d4d) return null;
  if (v.getUint16(tiff + 2, le) !== 0x002a) return null;
  const readAscii = (entry: number): string | null => {
    const count = v.getUint32(entry + 4, le);
    if (count < 1 || count > 64) return null;
    // ASCII values over 4 bytes live at an offset from the TIFF start; shorter ones inline.
    const at = count > 4 ? tiff + v.getUint32(entry + 8, le) : entry + 8;
    if (at + count > end) return null;
    let s = "";
    for (let i = 0; i < count; i++) {
      const c = v.getUint8(at + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const walkIfd = (ifd: number, wanted: number): { entry: number } | null => {
    if (ifd + 2 > end) return null;
    const count = v.getUint16(ifd, le);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > end) break;
      if (v.getUint16(entry, le) === wanted) return { entry };
    }
    return null;
  };
  const ifd0 = tiff + v.getUint32(tiff + 4, le);
  let dateStr: string | null = null;
  const subPtr = walkIfd(ifd0, EXIF_IFD_POINTER_TAG);
  if (subPtr) {
    const sub = tiff + v.getUint32(subPtr.entry + 8, le);
    const orig = walkIfd(sub, DATETIME_ORIGINAL_TAG);
    if (orig) dateStr = readAscii(orig.entry);
  }
  if (!dateStr) {
    const dt = walkIfd(ifd0, DATETIME_TAG);
    if (dt) dateStr = readAscii(dt.entry);
  }
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  // Unset camera clocks emit "0000:00:00 00:00:00" — Date.UTC would mint a FINITE garbage epoch
  // that silently ranks those photos first. Range-validate before trusting (review r9).
  const [y, mo, d, h, mi, sec] = [+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, +m[6]!];
  if (y < 1000 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, sec);
  return Number.isFinite(ms) ? ms : null;
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
