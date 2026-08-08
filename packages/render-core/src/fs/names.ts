// Shared name-containment guard for the PATH-JOINING backends (Tauri joins a segment onto a
// native filesystem path; HTTP joins one onto a base URL). The browser FSA/OPFS backends get
// this for free — getFileHandle/getDirectoryHandle reject a name containing "/" — so any
// backend that string-joins a caller-supplied segment must re-establish it itself (the
// tauri-fs-seam rule; donor pattern go-iiif doctor.go `safeBundleRelative`, landed in 42246f1).
// The rule set itself lives once in `wadm/brand.ts` (`assertSafeSegment`); this module is the
// fs backend's thin re-export with its own wording.

import { assertSafeSegment } from "../wadm/brand.js";

/**
 * Reject a child name that could escape its parent before it is joined onto a real path or URL.
 * Thin re-export of the single predicate in `wadm/brand.ts` — `assertSafeSegment` with the
 * fs-backend wording "unsafe path segment". See brand.ts for the rule set and trust posture.
 */
export function assertSafeName(name: string): void {
  assertSafeSegment(name, "unsafe path segment");
}
