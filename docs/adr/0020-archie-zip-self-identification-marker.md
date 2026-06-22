# ADR-0020 — `.archie.zip` self-identification: L1 marker, validation-not-authentication, never crypto-sealed

**Status:** accepted (2026-06-21, grill — user-gated)

## Context

`<archie-viewer>` (ADR-0019) makes "open/drop a local `.archie.zip`" a first-class, UNTRUSTED-input
path. A probe (2026-06-21) found the zip does NOT self-identify as Archie — the only stamp is a generic
`schemaVersion:1` on `exhibits.json` (`site.ts:198`); no format marker, no checksum, no provenance —
and the reader validates NOTHING before parsing (`ZipFilesystem.fromZip`, `fs/zip.ts:150`, blind-unzips
into a Map; the 256 MB cap is `?src=`-only, the file-drop path `openLibraryFromFile` is uncapped). A
valid-but-non-Archie zip "opens" successfully and only fails later when a read misses a file.

Separately, the user requires the zip's text files to be **hand-editable** (edit in a text editor, or
round-trip through Studio — ADR-0019), and the format to be a transparent, no-lock-in interchange
artifact.

## Decision

Add a **Level-1 validation marker**, not a cryptographic seal:

- **Write side:** `publishLibrary` emits `archie.json = { format: "archie-library", version, generator,
  derivedFrom? }` at the zip root (reuse `SCHEMA_VERSION`, `publish/migrate.ts:12`).
- **Read side (LENIENT-ON-ABSENT):** the marker check (`validateArchieMarker`, shared by the apps/viewer
  file-drop, the `<archie-viewer>` zip path, and `openLibraryFromTree`) runs BEFORE the library is
  opened, with this rule:
  - `archie.json` **PRESENT** → it MUST be a current-schema Archie marker: assert `format ===
    "archie-library"` and `version === SCHEMA_VERSION`, and that `exhibits.json` parses. A
    forged/foreign/wrong-version marker is rejected with the existing user-facing error.
  - `archie.json` **ABSENT** → accept iff the archive is STRUCTURALLY an Archie library: `collection.json`
    OR `exhibits.json` parses as JSON. Reject only when NEITHER exists/parses (a genuinely non-Archie zip).

  Apply a byte / entry-count / uncompressed-ratio cap to the file-drop path too.

  **Why absent-lenient (added 2026-06-21):** the marker is a sanity/version GATE, not the security
  boundary (the decompression cap + sanitization are — see Consequences). A strict marker-required read
  was a regression: a real Archie export made BEFORE the marker landed (`collection.json` +
  `exhibits.json`, no `archie.json`) was rejected with "This file isn't an Archie library." Lenient-on-
  absent keeps such pre-marker exports openable while still rejecting genuine junk, and it matches the
  hosted-tree path (`openLibraryFromTree`), which was already absent-lenient (some static hosts strip
  dotted/unknown files, so a tree need not ship a marker). A PRESENT-but-foreign marker is still rejected
  on both the zip and tree paths.

The marker is **validation, not authentication**: it identifies "a current-version Archie library" and
catches accidents + version drift. **Integrity hashing / signatures (L2/L3) are rejected** because they
would be invalidated by every legitimate hand-edit — crypto-sealing and hand-editability are mutually
exclusive. Provenance/lineage lives as a plain `derivedFrom` *field* (hand-editable attribution), so an
edited, re-exported zip is a **derivative** (new identity + `derivedFrom`), never a silent overwrite.

## Consequences

- The marker + version field is baked into every export forever (the hard-to-reverse part) and doubles
  as the version-compat gate: a pinned-`@v1` `<archie-viewer>` reading a future `v2` zip refuses cleanly
  instead of rendering garbage. The absent-lenient rule does NOT weaken this gate — it applies only when
  there is NO marker to read; a marker that IS present (every current export) is still version-checked.
- **The marker is a sanity gate, NOT a security boundary** — an attacker forges it trivially. Defence
  against hostile zips is the separate hardening checklist (the decompression bomb is the one live High;
  the geometry-only SVG overlay and typed-JSON reads already close XSS / prototype-pollution; an
  `offline` mode handles egress; DOMPurify on note bodies stays). Extends the Portable-Viewer
  untrusted-content boundary to the embed.
- No key distribution, no PKI, no server — consistent with the no-server lock and the parked DID/signing
  decision.
- A `derivedFrom` field needs a UI home when Studio re-exports an opened library (out of scope here;
  flagged for the Studio round-trip grill).

## Alternatives rejected

- **L2 integrity hash / L3 signature over the whole zip:** breaks hand-editability (every edit
  invalidates the seal); needs key distribution with no server. Reserve only for a separately-distributed,
  frozen copy nobody is expected to hand-edit.
- **No marker (status quo):** a non-Archie zip "opens" then fails on first missing file — a confusing
  late failure, and no version gate.
- **Reuse the generic `schemaVersion` on `exhibits.json`:** not Archie-specific and not read as a gate;
  a dedicated root marker is the clean front door.
