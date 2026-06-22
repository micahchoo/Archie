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
- **Read side:** `openLibraryFromFile` / `openLibraryFromSrc` read + assert `archie.json` (format +
  version) and that `exhibits.json` parses, BEFORE `openPortableLibrary`; throw the existing user-facing
  error otherwise. Apply a byte / entry-count / uncompressed-ratio cap to the file-drop path too.

The marker is **validation, not authentication**: it identifies "a current-version Archie library" and
catches accidents + version drift. **Integrity hashing / signatures (L2/L3) are rejected** because they
would be invalidated by every legitimate hand-edit — crypto-sealing and hand-editability are mutually
exclusive. Provenance/lineage lives as a plain `derivedFrom` *field* (hand-editable attribution), so an
edited, re-exported zip is a **derivative** (new identity + `derivedFrom`), never a silent overwrite.

## Consequences

- The marker + version field is baked into every export forever (the hard-to-reverse part) and doubles
  as the version-compat gate: a pinned-`@v1` `<archie-viewer>` reading a future `v2` zip refuses cleanly
  instead of rendering garbage.
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
