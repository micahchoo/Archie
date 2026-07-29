// ADR-0020: L1 `.archie.zip` self-identification marker. publishLibrary writes a root `archie.json`
// alongside collection.json / exhibits.json so a consumer can identify the archive as an Archie
// library — and reject a non-Archie or wrong-schema zip — BEFORE attempting to open it as one. The
// read-only embed viewer (ADR-0019) gates `openPortableLibrary` on this so a stranger's drop/`?src=`
// of an arbitrary zip surfaces a clear "not an Archie library" error instead of a downstream
// undebuggable parse failure deep in the tree reader.

import type { Filesystem } from "../fs/seam.js";
import { fsJsonSource } from "./read.js";
import { SCHEMA_VERSION } from "../migrate/migrate.js";
import { treeMigrationsSince, migrationGapMessage } from "../migrate/tree.js";
import type { ExhibitsJson } from "../iiif/exhibits.js";

/** The marker shape written to the published tree's root `archie.json`. `version` tracks the on-disk
 *  SCHEMA_VERSION (migrate.ts) so the marker check doubles as a schema-compatibility gate. */
export interface ArchieMarker {
  format: "archie-library";
  version: number;
  generator: "archie";
  /** Publish-generation id (STALENESS / Issue 24) — changes when the published tree's content changes.
   *  The Viewer keys hosted fetches on it (`?g=<generation>`) so a caching layer can't serve one file
   *  from generation A next to another from B, and invalidates its session cache when it changes.
   *  Optional: the constant `ARCHIE_LIBRARY_MARKER` omits it; `publishLibrary` fills it per publish. */
  generation?: string;
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
 *     marker is rejected, as before). A version mismatch refuses in BOTH directions, but with
 *     different advice — newer tree: "Update Archie"; older tree: "Re-publish" (Archie-69f9 is the
 *     ticket to make the older direction migrate instead of refuse).
 *   • `archie.json` ABSENT → accept iff the archive is STRUCTURALLY an Archie library: `collection.json`
 *     OR `exhibits.json` parses as JSON. Reject only if NEITHER exists/parses (a genuinely non-Archie zip).
 *
 * Why absent-lenient: ADR-0020 states the marker is a sanity/version GATE, not the security boundary
 * (the decompression cap + sanitization are). A PRE-MARKER real export (`collection.json` +
 * `exhibits.json`, no `archie.json`) must still open — rejecting it on the missing marker alone was a
 * regression. Throws `NotAnArchieLibraryError` with a clear message otherwise; resolves (void) when valid.
 */
export async function validateArchieMarker(fs: Filesystem): Promise<number> {
  const src = fsJsonSource(fs);
  const marker = await src.getOptional<Partial<ArchieMarker>>("archie.json");

  if (marker) {
    // Marker present → it MUST be a valid current-schema Archie marker (forged/foreign zips rejected).
    if (marker.format !== "archie-library") {
      throw new NotAnArchieLibraryError(
        "This file isn't an Archie library. Choose a published .archie.zip exported from Archie.",
      );
    }
    // Both version directions are still REFUSALS — see the note below on why an older tree is not
    // simply accepted — but they are not the same problem and must not give the same advice.
    if (typeof marker.version !== "number" || !Number.isFinite(marker.version)) {
      throw new NotAnArchieLibraryError(
        "This file claims to be an Archie library but its version marker is malformed. Re-publish it from Archie.",
      );
    }
    if (marker.version > SCHEMA_VERSION) {
      // NEWER tree, older reader. ADR-0020:53 is explicit that this refuses cleanly, and it is the
      // only direction that ADR sanctions. Nothing the author can do to the FILE helps here.
      throw new NotAnArchieLibraryError(
        `This library was made with a newer version of Archie (schema v${marker.version}, this reader understands v${SCHEMA_VERSION}). Update Archie to open it.`,
      );
    }
    if (marker.version < SCHEMA_VERSION) {
      // OLDER tree, newer reader — the MIGRATABLE direction (Archie-69f9). Accepted iff the tree
      // migration registry can actually carry it forward; the caller then reads through
      // `migratingJsonSource(src, version)`.
      //
      // The gate is loosened exactly as far as the registry reaches and not one version further. A
      // GAP is still a clean refusal, which is tldraw's rule too (`StoreSchema.mjs:108` returns
      // `Result.err("Incompatible schema?")` for a persisted version absent from its sequence). That
      // is what keeps ADR-0020's guarantee intact: accepting an old marker no longer risks the
      // downstream undebuggable parse failure, because acceptance now MEANS "I have the migrations".
      const resolved = treeMigrationsSince(marker.version, SCHEMA_VERSION);
      if (!resolved.ok) throw new NotAnArchieLibraryError(migrationGapMessage(marker.version, resolved.gap));
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
    return marker.version;
  }

  // No marker → accept iff the zip is STRUCTURALLY an Archie library: `collection.json` OR
  // `exhibits.json` parses. This keeps pre-marker real exports openable (the regression this fixes).
  const exhibits = await src.getOptional<ExhibitsJson>("exhibits.json");
  // No marker → no version to migrate FROM. Report the current version: a pre-marker tree predates
  // versioning entirely, and guessing v0 would send it through a migration chain designed for trees
  // that actually declared v0. Lenient-on-absent means lenient, not speculative.
  if (exhibits !== null) return SCHEMA_VERSION;
  const collection = await src.getOptional<unknown>("collection.json");
  if (collection !== null) return SCHEMA_VERSION;
  throw new NotAnArchieLibraryError(
    "This file isn't an Archie library. Choose a published .archie.zip exported from Archie.",
  );
}
