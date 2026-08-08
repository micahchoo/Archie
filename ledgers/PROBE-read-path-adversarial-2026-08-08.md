# PROBE — read-path adversarial sweep (2026-08-08)

Skill: `/skill:api-testing` (adversarial-api-testing). Scope per user: the HTTP
read path ONLY (GitHub client explicitly out of scope). The read path = the
seam between a published tree (any static host) and its consumers: viewer
hosted mode, the embed, verify-publish.

## Method

Two committed probes, driving the REAL `@render/core` clients:

- `scripts/probe/read-path-transport-adversarial.mts` — real local fault
  server over `apps/viewer/public/published` (7 exhibits): hung responses,
  redirects, 401/403/429/502/418, gzip bombs, non-UTF8, empty bodies, lying
  content-length, query/fragment bases, hostile segments, 404 fail-fast,
  16-way concurrency, chaos (server destroyed mid-read), marker gate over
  HTTP, wrong-shape JSON, get-vs-getOptional.
- `scripts/probe/read-path-in-core-adversarial.mts` — hand-crafted hostile
  zips (raw byte builder: liar sizes, hostile entry names, zip64, method 99,
  encrypted, truncated): fromZip caps + decode, open.ts fetches, name
  containment fuzz, marker classifier edge shapes.

Run: `cd apps/viewer && ./node_modules/.bin/vite-node ../../scripts/probe/<file>.mts`

## Result

Baseline (before fixes): transport 40/43, in-core 72/81 → **8 real findings**.
After fixes: **transport 43/43, in-core 82/82, zero residual findings.**

## Findings → fixes → tickets (all fixed in working tree, all closed)

| # | Finding | Severity | Fix | Ticket |
|---|---|---|---|---|
| 1 | Truncated STORED zip entries decode silently short (declared size never verified) — silent corruption, the corrupt≠empty trap | P1 | fromZip verifies decoded byteLength vs declared originalSize; mismatch → friendly refusal | Archie-e2d4 |
| 2 | No fetch timeout on the read path — hung server hangs viewer/embed/verify-publish forever | P2 | HttpFilesystem timeoutMs opt (default 30s), AbortSignal.timeout inside the fault catch → FailedReadError | Archie-0f07 |
| 3 | Base URL with query/fragment swallows read segments into it — `?src=…?g=GEN` reads `?g=GEN/exhibits.json`, classified absent | P2 | base parsed (absolute → URL pathname splice; relative → string split at ?/#); query/hash kept as a suffix | Archie-9d0f |
| 4 | ZipFilesystem lacks the name-containment gate — hostile entry names addressable via getFile and the read walk | P2 | assertSafeName on ZipDir.getFile/getDirectory (same placement as HttpDir/Tauri) | Archie-b436 |
| 5 | Corrupt zip decode errors surface fflate-raw ("invalid zip data", "unknown compression type 99") | P3 | zipDecodeError friendly wrap; cap refusals keep exact text via sentinel | Archie-7e30 |
| 6 | open.ts torn transfers escape raw (arrayBuffer() unwrapped; fetchZipBytesIfAny violates its own null-swallow contract) | P2 | body reads wrapped: friendly message / null per contract | Archie-d2dc |
| 7 | openArchieLibrary Blob path bypasses the SRC_MAX_BYTES byte cap (in-hand bytes never checked) | P2 | additive opts.maxBytes; Blob.size checked before materialization | Archie-7c77 |
| 8 | Present-but-torn archie.json leaks raw FailedReadError through validateArchieMarker | P3 | marker read wrapped → NotAnArchieLibraryError refusal | Archie-3bd0 |

## Composition gate (2nd-order effect caught before landing)

The base-join fix's first implementation required an absolute base
(`new URL(base)`); the viewer's hosted path passes a ROOT-RELATIVE base
(`/published` — `import.meta.env.BASE_URL` + `'published'`), which threw
`Invalid URL` in Node AND browsers — 9 viewer tests red (probe-staleness ×8,
gallery-view ×1). Fixed: relative bases keep string-join with the same ?/#
splice; regression tests added (http.test.ts relative-base ×2). Final:
render-core 1544/1544, viewer 281/281, all 5 dependent packages at baseline,
all typechecks clean.

## Documented observations (accepted by design, not defects)

- `fsJsonSource.get()` (non-optional) propagates a raw SyntaxError on torn
  JSON — the absent-vs-failed contract is the getOptional surface.
- Wrong-shape valid JSON (exhibits.json = `[]`/`"string"`) fails LOUD
  (TypeError), never silent-empty.
- `assertSafeSegment` accepts `"...."`, leading/trailing space, `%2e%2e`,
  Unicode homoglyph separators (U+2215/U+FF0F not caught by `[/\\/]`) — all
  harmless literal filenames; only exact `""`/`.`/`..`/separator/NUL escape
  semantics. Encoded once for HTTP, inert map keys for zip.
- Encrypted STORED zip entries surface their bytes as-is (no decryption
  signalled); deflate-encrypted fails closed.

## Seeds

8 tickets created + closed with fix references: Archie-e2d4, Archie-0f07,
Archie-9d0f, Archie-b436, Archie-7e30, Archie-d2dc, Archie-7c77, Archie-3bd0.
