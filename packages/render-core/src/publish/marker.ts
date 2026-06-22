// ADR-0020: L1 `.archie.zip` self-identification marker. publishLibrary writes a root `archie.json`
// alongside collection.json / exhibits.json so a consumer can identify the archive as an Archie
// library — and reject a non-Archie or wrong-schema zip — BEFORE attempting to open it as one. The
// read-only embed viewer (ADR-0019) gates `openPortableLibrary` on this so a stranger's drop/`?src=`
// of an arbitrary zip surfaces a clear "not an Archie library" error instead of a downstream
// undebuggable parse failure deep in the tree reader.

import type { Filesystem } from "../fs/seam.js";
import { fsJsonSource } from "./read.js";
import { SCHEMA_VERSION } from "../migrate/migrate.js";
import type { ExhibitsJson } from "../iiif/exhibits.js";

/** The marker shape written to the published tree's root `archie.json`. `version` tracks the on-disk
 *  SCHEMA_VERSION (migrate.ts) so the marker check doubles as a schema-compatibility gate. */
export interface ArchieMarker {
  format: "archie-library";
  version: number;
  generator: "archie";
}

/** The marker publishLibrary stamps into every published tree (the current-schema constant). */
export const ARCHIE_LIBRARY_MARKER: ArchieMarker = {
  format: "archie-library",
  version: SCHEMA_VERSION,
  generator: "archie",
};

/** A rejected-marker error — distinct, friendly message the viewer surfaces verbatim on the open path. */
export class NotAnArchieLibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotAnArchieLibraryError";
  }
}

/**
 * Pure validation: assert that `fs` is an Archie library tree (ADR-0020). The rule is
 * **LENIENT-ON-ABSENT**, mirroring the hosted-tree path (`openLibraryFromTree`):
 *
 *   • `archie.json` PRESENT → it MUST be a current-schema Archie marker: assert
 *     `format === "archie-library"` and `version === SCHEMA_VERSION` (a forged/foreign/wrong-version
 *     marker is rejected, as before).
 *   • `archie.json` ABSENT → accept iff the archive is STRUCTURALLY an Archie library: `collection.json`
 *     OR `exhibits.json` parses as JSON. Reject only if NEITHER exists/parses (a genuinely non-Archie zip).
 *
 * Why absent-lenient: ADR-0020 states the marker is a sanity/version GATE, not the security boundary
 * (the decompression cap + sanitization are). A PRE-MARKER real export (`collection.json` +
 * `exhibits.json`, no `archie.json`) must still open — rejecting it on the missing marker alone was a
 * regression. Throws `NotAnArchieLibraryError` with a clear message otherwise; resolves (void) when valid.
 */
export async function validateArchieMarker(fs: Filesystem): Promise<void> {
  const src = fsJsonSource(fs);
  const marker = await src.getOptional<Partial<ArchieMarker>>("archie.json");

  if (marker) {
    // Marker present → it MUST be a valid current-schema Archie marker (forged/foreign zips rejected).
    if (marker.format !== "archie-library") {
      throw new NotAnArchieLibraryError(
        "This file isn't an Archie library. Choose a published .archie.zip exported from Archie.",
      );
    }
    if (marker.version !== SCHEMA_VERSION) {
      throw new NotAnArchieLibraryError(
        `This library was made with a different version of Archie (schema v${String(marker.version)}, this viewer reads v${SCHEMA_VERSION}). Re-publish it from a current Archie.`,
      );
    }
    // The marker is cheap to forge; confirm the archive actually carries a parseable Gallery index —
    // the load path's first read, so an empty/corrupt tree is rejected here, not mid-read.
    try {
      await src.get<ExhibitsJson>("exhibits.json");
    } catch {
      throw new NotAnArchieLibraryError(
        "This Archie library is missing or has a corrupt exhibits index. Re-publish it from Archie.",
      );
    }
    return;
  }

  // No marker → accept iff the zip is STRUCTURALLY an Archie library: `collection.json` OR
  // `exhibits.json` parses. This keeps pre-marker real exports openable (the regression this fixes).
  const exhibits = await src.getOptional<ExhibitsJson>("exhibits.json");
  if (exhibits !== null) return;
  const collection = await src.getOptional<unknown>("collection.json");
  if (collection !== null) return;
  throw new NotAnArchieLibraryError(
    "This file isn't an Archie library. Choose a published .archie.zip exported from Archie.",
  );
}
