# Content-addressed working-store assets: measured, and a NO-GO for now

**Archie-8150.** Would content-addressing the OPFS working store (SHA-256 of bytes → one physical
file per unique content) measurably cut storage for real libraries? Deliverable: measured duplication
on a seeded library + go/no-go.

**Answer: no measurable duplication exists in the seeded corpus (0 bytes of 18.44 MB), and the reason
is structural rather than lucky. NO-GO — with one precise condition that would flip it.**

## What the working store actually does

`apps/studio/src/asset-store.ts:5` — imported files persist at
`{PROJECT}/exhibits/{slug}/assets/{name}`. **Per exhibit.** Combined with ADR-0001's exhibit-nested
ownership ("an Exhibit owns its Objects; there is no shared object pool"), importing the same file
into two exhibits genuinely writes two physical copies. The duplication this ticket asks about is
real in principle; the question is only whether it happens.

## Measurement

Over the seeded published tree (`apps/viewer/public/published`), SHA-256 of every media file:

| | |
|---|---|
| media files | 21 |
| total bytes | 18.44 MB |
| unique contents | **21** |
| duplicate groups | **0** |
| reclaimable | **0.00 MB (0.0%)** |

A zero is only interesting if the corpus could have produced a non-zero, so the discriminating
measurement is whether cross-exhibit reuse occurs at all:

| | |
|---|---|
| distinct image sources | 43 |
| sources cited by MORE than one exhibit | **12 (28%)** |
| …of those, LOCAL (imported) assets | **0** |

**That is the finding.** Cross-exhibit reuse is not rare here — it is 28% of all sources. Every
instance is a remote IIIF URL (`collections.library.yale.edu/iiif/2/…`), cited by up to three
exhibits. A referenced IIIF image stores no local bytes at all, so reuse costs nothing to dedupe
because there is nothing to dedupe.

## Why this is a NO-GO rather than a "not yet measured"

Content-addressing would reclaim **exactly zero** on a library shaped like the seed corpus, and the
seed corpus is shaped like Archie's current centre of gravity: IIIF-referencing exhibits. The cost of
the change is not zero — it is a new key ladder, a migration of every existing working store, and a
reference-counting problem on delete (whose master is it when two exhibits point at one blob?), on
the app's data spine.

## The one condition that flips it

A library built by **importing files** rather than referencing IIIF, where the same file lands in
more than one exhibit. That is not hypothetical — it is the small-institution persona
(`Archie-34a2`, "folders to website"), whose whole input is a folder of TIFFs, and where a plate
appearing in both a thematic exhibit and a chronological one is ordinary curatorial practice.

The cost per duplicate there is **not** one master. It is master + baked thumbnail + the DZI pyramid,
and the pyramid is ~1.33× the base level (Σ 1/4ⁿ), so a duplicated 100 MB TIFF costs roughly 230 MB,
not 100. That multiplier is what would make the case, and it is why this should be re-measured — not
re-argued — the moment a file-import library of real size exists.

**Re-run the measurement when `Archie-c74e` ("prove 1,000 images end to end") produces a corpus.**
That ticket generates exactly the library this question needs and cannot be answered without.

## Prior art, checked at the line rather than cited from the ticket

freecut's key ladder is at
`Prior Art/freecut/src/features/media-library/utils/proxy-key.ts:37-57` — note **`utils/`**, not the
`services/` the ticket names. The ladder is as described:

1. `contentHash` (SHA-256 hex) when known;
2. else `fnv1a32(opfsPath)-fileSize` for OPFS-stored media;
3. else a fingerprint of `fileName|fileSize|mimeType|lastModified|width|height`.

Two details worth carrying if this is ever built. The three formats are **distinguishable by shape**
(64-char hex vs dashed fnv), so freecut needs no source-type tag and its on-disk folder names read as
the fingerprint itself. And the ladder exists because a content hash is *not always available* —
hashing requires reading the whole file, which freecut avoids on the handle-based path. Archie has
the same constraint on the Tauri backend, where `TauriFile` is lazy by design
(`.claude/rules/tauri-fs-seam.md`): a content-addressing scheme that assumes it can always hash would
force a full read of every asset at import, which is the opposite of what the lazy-file seam was
built for.
