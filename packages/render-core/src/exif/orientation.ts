// EXIF orientation -> normalization transform (CONTEXT EXIF display-master; orphan gate §39).
// PURE: maps an EXIF Orientation tag (1..8) to the geometric transform that produces an
// upright display-master, plus the normalized dimensions. The actual pixel push (canvas/image
// re-encode) is a browser step that consumes this; the mapping + dimension math is here and
// testable (the half a headless run can verify), matching test/fixtures/exif/manifest.json.

export interface OrientationTransform {
  /** Mirror horizontally (applied before rotation). */
  flipX: boolean;
  /** Mirror vertically. */
  flipY: boolean;
  /** Clockwise rotation in degrees. */
  rotate: 0 | 90 | 180 | 270;
  /** True when the transform swaps width/height (90°/270°). */
  swapsAxes: boolean;
}

// The 8 EXIF orientations. 5 (transpose) and 7 (transverse) are the axis-swapping cases
// "nobody tests" — present here deliberately.
const TABLE: Record<number, Omit<OrientationTransform, "swapsAxes">> = {
  1: { flipX: false, flipY: false, rotate: 0 },
  2: { flipX: true, flipY: false, rotate: 0 },
  3: { flipX: false, flipY: false, rotate: 180 },
  4: { flipX: false, flipY: true, rotate: 0 },
  5: { flipX: true, flipY: false, rotate: 90 },
  6: { flipX: false, flipY: false, rotate: 90 },
  7: { flipX: true, flipY: false, rotate: 270 },
  8: { flipX: false, flipY: false, rotate: 270 },
};

/** The transform that uprights an image with the given EXIF orientation. Unknown -> identity (1). */
export function orientationTransform(orientation: number): OrientationTransform {
  const base = TABLE[orientation] ?? TABLE[1]!;
  return { ...base, swapsAxes: base.rotate === 90 || base.rotate === 270 };
}

/** The stored (pre-normalization) w/h mapped to the upright display-master dimensions. */
export function normalizeDimensions(width: number, height: number, orientation: number): { width: number; height: number } {
  return orientationTransform(orientation).swapsAxes ? { width: height, height: width } : { width, height };
}

/** True when the orientation needs no transform (orientation 1, or absent/unknown). */
export function isOrientationNoop(orientation: number): boolean {
  const t = orientationTransform(orientation);
  return !t.flipX && !t.flipY && t.rotate === 0;
}
