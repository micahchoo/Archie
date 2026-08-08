// ADR-0020: L1 `.archie.zip` self-identification marker. publishLibrary writes a root `archie.json`
// alongside collection.json / exhibits.json so a consumer can identify the archive as an Archie
// library — and reject a non-Archie or wrong-schema zip — BEFORE attempting to open it as one. The
// read-only embed viewer (ADR-0019) gates `openPortableLibrary` on this so a stranger's drop/`?src=`
// of an arbitrary zip surfaces a clear "not an Archie library" error instead of a downstream
// undebuggable parse failure deep in the tree reader.

import type { Filesystem } from "../fs/seam.js";
import { fsJsonSource } from "./read.js";
import { SCHEMA_VERSION } from "../migrate/migrate.js";
import { treeMigrationsSince, migrationGapMessage, type TreeMigrationGap } from "../migrate/tree.js";
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

/**
 * THE ONE version-policy definition (ADR-0020): what a PRESENT marker means. A pure classification —
 * no throwing, no messages — so the zip gate (`validateArchieMarker`) and the tree gate
 * (`assertArchieTreeMarker`) share one branch chain and a schema-policy change lands in exactly one
 * place. The gates keep what legitimately differs by surface: their per-surface message copy and their
 * absent-policy.
 *
 * Verdicts map 1:1 to the ADR-0020 branch chain:
 *   • foreign          — `format !== "archie-library"`: forged/foreign marker, refuse.
 *   • malformed        — `version` present but not a finite number (or missing): refuse.
 *   • newer            — `version > SCHEMA_VERSION`: newer tree, older reader; only the READER can fix it.
 *   • older-gap        — `version < SCHEMA_VERSION` and `treeMigrationsSince` finds NO coverable chain
 *                        (a missing migration or a needs-whole-tree step): refuse, re-publish.
 *   • older-migratable — `version < SCHEMA_VERSION` and the registry CAN carry it forward: accept; the
 *                        caller MUST read through `migratingJsonSource(src, version)` (Archie-69f9).
 *   • current          — `version === SCHEMA_VERSION`: accept.
 *
 * null/undefined means ABSENT — and absent is NOT a verdict here: the gates branch on presence first
 * and own their absent-policy (lenient-on-absent vs `requirePresent`). If a caller forgets that
 * branch, this returns `malformed` as a defensive fail-closed floor rather than fabricate a verdict
 * for a marker that isn't there.
 */
export type ArchieMarkerVerdict =
  | { kind: "current" }
  | { kind: "newer"; version: number }
  | { kind: "older-migratable"; version: number }
  | { kind: "older-gap"; version: number; gap: unknown }
  | { kind: "malformed" }
  | { kind: "foreign" };

export function classifyArchieMarker(marker: Partial<ArchieMarker> | null | undefined): ArchieMarkerVerdict {
  // Absent is not a verdict — the gates branch before calling (see the type doc above). Fail closed:
  // malformed → every gate refuses, so a forgotten absent-branch can never silently accept.
  if (!marker) return { kind: "malformed" };
  if (marker.format !== "archie-library") return { kind: "foreign" };
  if (typeof marker.version !== "number" || !Number.isFinite(marker.version)) return { kind: "malformed" };
  if (marker.version > SCHEMA_VERSION) return { kind: "newer", version: marker.version };
  if (marker.version < SCHEMA_VERSION) {
    // Older is accepted ONLY as far as the registry reaches (Archie-69f9): acceptance means "I have the
    // migrations" — a gap stays a clean refusal (tldraw's rule, StoreSchema.mjs:108). The `gap` payload
    // is the planner's own `TreeMigrationGap`, handed verbatim to `migrationGapMessage` by the gates.
    const resolved = treeMigrationsSince(marker.version, SCHEMA_VERSION);
    if (!resolved.ok) return { kind: "older-gap", version: marker.version, gap: resolved.gap };
    return { kind: "older-migratable", version: marker.version };
  }
  return { kind: "current" };
}

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
 *   • `archie.json` PRESENT → classified by the ONE policy definition, `classifyArchieMarker` (above);
 *     foreign / malformed / newer / older-gap are rejected, current / older-migratable accepted. A
 *     version mismatch refuses in BOTH directions, but with different advice — newer tree: "Update
 *     Archie"; older tree: "Re-publish" (Archie-69f9 is the ticket to make the older direction migrate
 *     instead of refuse).
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
    // ONE version-policy definition (`classifyArchieMarker`, above); this switch supplies only the
    // ZIP-surface message copy — every verdict except current/older-migratable is a refusal.
    const verdict = classifyArchieMarker(marker);
    switch (verdict.kind) {
      case "foreign":
        throw new NotAnArchieLibraryError(
          "This file isn't an Archie library. Choose a published .archie.zip exported from Archie.",
        );
      case "malformed":
        throw new NotAnArchieLibraryError(
          "This file claims to be an Archie library but its version marker is malformed. Re-publish it from Archie.",
        );
      case "newer":
        // NEWER tree, older reader. ADR-0020:53 is explicit that this refuses cleanly, and it is the
        // only direction that ADR sanctions. Nothing the author can do to the FILE helps here.
        throw new NotAnArchieLibraryError(
          `This library was made with a newer version of Archie (schema v${verdict.version}, this reader understands v${SCHEMA_VERSION}). Update Archie to open it.`,
        );
      case "older-gap":
        // OLDER tree, newer reader — the MIGRATABLE direction (Archie-69f9) is refused ONLY when the
        // registry cannot carry it forward (the classifier's `gap` is the planner's TreeMigrationGap).
        // The gate is loosened exactly as far as the registry reaches and not one version further. A
        // GAP is still a clean refusal, which is tldraw's rule too (`StoreSchema.mjs:108` returns
        // `Result.err("Incompatible schema?")` for a persisted version absent from its sequence). That
        // is what keeps ADR-0020's guarantee intact: accepting an old marker no longer risks the
        // downstream undebuggable parse failure, because acceptance now MEANS "I have the migrations".
        throw new NotAnArchieLibraryError(migrationGapMessage(verdict.version, verdict.gap as TreeMigrationGap));
      case "older-migratable":
      case "current":
        break; // accepted — structural probe below
    }
    // The breaking arms (current / older-migratable) only exist when the classifier saw a finite
    // `version` — its malformed verdict throws above, and TS cannot see through the classifier.
    const version = marker.version!;
    // The marker is cheap to forge; confirm the archive actually carries a parseable Gallery index —
    // the load path's first read, so an empty/corrupt tree is rejected here, not mid-read.
    try {
      await src.get<ExhibitsJson>("exhibits.json");
    } catch {
      throw new NotAnArchieLibraryError(
        "This Archie library is missing or has a corrupt exhibits index. Re-publish it from Archie.",
      );
    }
    return version;
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
