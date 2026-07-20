# Browser storage: quota mechanics, compression, and the FSA escape hatch

**Resolves:** the BHC006_GAWANMUSEUMTRUST ingest failure investigation (2026-07-20) — why a
17.8 GB folder import was refused wholesale, and what levers exist for storing more media.
**Decision-relevant conclusions first; full sourced findings below.**

## The three facts that change Archie's code

1. **The quota `navigator.storage.estimate()` reports is a privacy constant, not a limit.**
   Chromium's `CalculateReportedQuota()` returns `usage + 10 GiB` on any disk ≥ 10 GiB
   (anti-fingerprinting; `kStaticStorageQuota`, default-on since Dec 2024). The *enforced*
   quota is ~60% of total disk with free-space floors, and is deliberately unobservable.
   → `quotaOkFor` (ingest-flows.ts) preflights batches against `quota - usage` ≈ always 10 GiB:
   it refuses any batch over ~9.5 GB *regardless of real headroom*. The Gawan import was refused
   against this phantom. **Fix: attempt-and-catch `QuotaExceededError` per write, roll back
   cleanly; never gate on `estimate()` arithmetic.**
   → The StorageBar chip's fraction (`usage / (usage + 10 GiB)`) can't warn at the moment
   imports start failing (75% needs 30 GB stored). **Fix: show absolute usage; escalate on
   actual write failures.**

2. **Files written through a user-granted directory handle bypass quota entirely.**
   WICG File System Access spec §6.3, verbatim: "Other than files in a bucket file system
   [OPFS], files written by this API are **not subject to storage quota**." Gating is user
   permission + Safe Browsing, not accounting. Archie already owns the machinery
   (`folder-backend.ts`, FSA `Filesystem` seam, handle persistence) but uses the folder as a
   *mirror* — OPFS stays source of truth, so every byte still pays quota. Promoting the bound
   folder to primary store for large media removes the ceiling. Costs: permission re-grant
   gesture on reopen, no sync-access performance, external-writer hazards (mirror-stamp.ts
   documents these). The Tauri build sidesteps all of it (native fs, no quota).

3. **Generic compression is worthless on media; transcoding is not.**
   Measured on this repo's own files: gzip/brotli/zstd recover 0.2–1.8% on JPEG/PNG/MP3
   (brotli *worse* than gzip — entropy-coded input). But LZW-TIFF → WebP measured **8–15×**
   at visually-equivalent quality; `bake.ts` already has the WebP encoder — only a (WASM)
   TIFF decoder is missing, which is the same gap that made TIFFs fail ingest at all.

---

## Full findings

*(Research run 2026-07-20 by a sub-agent fleet against primary sources — Chromium source,
WHATWG/WICG specs, MDN, vendor engineering blogs. Per-claim source noted; unverified items
flagged at the end.)*

### 1. Chrome/Chromium quota — why `estimate()` said exactly 10.00 GB

Two different numbers exist: the quota Chrome **reports** to JavaScript and the quota it
**enforces**.

**Reported:** `CalculateReportedQuota()` — if `total_space_bytes >= 10 GiB`, return
`usage + 10 GiB`; else `usage + (disk rounded up to 1 GiB)`. Controlled by the default-enabled
`kStaticStorageQuota` flag and the `StaticStorageQuotaEnabled` enterprise policy.
*Sources: `storage/browser/quota/quota_manager_impl.cc`, `quota_features.cc` (chromium.googlesource.com);
blink-dev PSA "Predictable reported storage quota" (Dec 2024).*

**Why:** anti-fingerprinting / anti-incognito-detection. The PSA: "Return an artificial quota
equal to usage + 10 GiB … in both incognito mode and regular mode … enforced quota will be
unaffected." Implements WHATWG Storage §6: quota "must not be a function of the available
storage space on the device."

**Enforced:** temporary pool = 80% of total disk (`kPoolSizeRatio`), one origin may use 75%
of the pool (`kDefaultPerStorageKeyRatio`) → up to **60% of total disk** (matches MDN).
Floors from `quota_settings.cc`: `should_remain_available = min(2 GB, 10% of total)` — below
this free space, new origins get 0 quota; `must_remain_available = min(1 GB, 1%)` — below
this, aggressive LRU eviction. Floors are computed from *free* space at enforcement time; the
reported constant is not.

### 2. `navigator.storage.persist()`

Prevents eviction only; **does not increase quota**. Sets the bucket mode `best-effort` →
`persistent`; LRU storage-pressure eviction "skips over origins that have been granted data
persistence" (MDN). Grant criteria — Chrome: no prompt, auto-granted on engagement heuristics
(installed, bookmarked, notification permission) or silently denied; Firefox: user UI prompt.
Baseline Chrome 55 / Firefox 57 / Safari 15.2.
*Sources: WHATWG Storage §5/§8, web.dev "Persistent storage", MDN.*

### 3. CompressionStream / DecompressionStream

Baseline since May 2023; a `TransformStream`, available in Workers (where OPFS sync handles
live). Formats: universal = **gzip / deflate / deflate-raw** (Chrome 80/103, Firefox 113,
Safari 16.4). **brotli and zstd are NOT in Chrome yet** (brotli: Firefox 147, Safari 18.4;
zstd: Firefox 138 only). Mechanically usable to wrap OPFS writes; pays off only for
uncompressed/text-like payloads (JSON, TIFF, raw buffers).
*Sources: MDN CompressionStream + browser-compat-data, WHATWG Compression Standard §1/§3.*

### 4. Generic compression on already-compressed media

Measured on this repo's media (gzip -9, brotli -q9, zstd -19) — **own measurements; no
primary source publishes these figures**:

| Type | n | Total | gzip | brotli | zstd |
|---|---|---|---|---|---|
| JPEG | 12 | 4.76 MB | 1.10% | 0.87% | 1.16% |
| PNG | 12 | 6.35 MB | 1.76% | 1.43% | 1.85% |
| MP3 | 2 | 86.8 MB | 0.20% | 0.00% | — |

Residual 1–2% is container metadata (EXIF/ICC), not pixels. Entropy-coded output (DCT/MDCT +
Huffman/CABAC) has no repeated strings for LZ77 and no skew for Huffman; incompressible input
net-expands (~+0.03% DEFLATE stored-block worst case). Servers don't gzip media: nginx
`gzip_types` defaults to `text/html` only; Cloudflare's compressible list has no
image/jpeg/png/webp or video/*.

**Exception — JPEG-specific recompressors** (re-entropy-code JPEG's weak Huffman stage,
losslessly, bit-exact): Dropbox Lepton **22% avg**, deployed on 16 B images (dropbox.tech);
Google Brunsli **22%**, became JPEG XL's lossless JPEG transport (github.com/google/brunsli).

**LZW-TIFF transcode** (ImageMagick 7.1.2): LZW achieves only 1.32–1.92:1 on clean
continuous-tone sources, 0.97–1.06:1 with scan grain (one file *expanded*; LOC ranks TIFF_LZW
below uncompressed — FDD000074). Transcode to JPEG q85 / WebP q80: ~6–12× (clean), ~8–14×
(grainy); **~8–15× realistic for digitization masters**, 10–50× reachable for 16-bit masters.
WebP averages 25–34% smaller than JPEG at equal SSIM (Google WebP study).

### 5. File System Access API — outside quota

WICG File System Access §6.3, verbatim: "Other than files in a bucket file system [OPFS],
files written by this API are **not subject to storage quota**. As such websites can fill up
a user's disk without being limited by quota…" Gating = `createWritable()` permission prompts,
sensitive-directory blocklist, Safe Browsing checks, temp-file-then-replace writes.
*Sources: WICG spec §6.3, Chrome FSA docs, MDN OPFS contrast section.*

### 6. OPFS — inside quota

"The OPFS is subject to browser storage quota restrictions, just like any other
origin-partitioned storage mechanism (for example IndexedDB). … Clearing storage data for the
site deletes the OPFS" (MDN). No separate/larger limit — OPFS's difference is performance
(`createSyncAccessHandle()`), not capacity. (`localStorage` is a separate 5 MiB cap outside
the pool.)

### 7. How Figma handles browser storage: it doesn't

Client = cache/view over server-authoritative state; **full documents are never durable
locally**. On reconnect the client "downloads a fresh copy of the document, reapplies any
offline edits." IndexedDB holds only the unsynced mutation queue ("Figma only saves the
changes you make to your file, not the entire file" — Figma Help); explicitly not offline
mode; clearing browser data loses unsynced work. Images are content-hashed refs
(`imageHash`/`imageRef`) into a server blob store behind ≤14-day signed URLs — never inline
(PNG/JPEG/GIF, max 4096²). Format: Kiwi (Wallace's schema'd binary, compact-but-uncompressed
by design, same encoder for wire + snapshots). Sync: server-arbitrated per-property
last-writer-wins (OT explicitly rejected), fractional-index ordering — reconciliation by
re-download makes local full-doc persistence unnecessary *by design*. Renderer: C++/Wasm over
one pre-allocated typed-array heap.
*Sources: figma.com/blog multiplayer + Wasm posts, github.com/evanw/kiwi, madebyevan.com/figma,
Figma Help Center, developers.figma.com.*

**Transferable to Archie (local-first, no server):** only the image discipline — the working
store holds display-sized derivatives; originals live elsewhere (for Archie: a user-granted
folder or the Tauri fs, both outside quota).

## Unverified / gaps

- Enforced-quota ratios (60%/80%) read from current Chromium `main` + MDN; can move behind
  `kStorageQuotaSettings`. The 10 GiB reported constant is solid (source + PSA + policy).
- Generic-compression percentages are our own reproducible measurements; H.264/MP4 and
  WebP-lossless unmeasured (expect ≤0.5%). Vienna TIFF study + FADGI raster PDF unretrievable.
  The oft-quoted LOC "LZW halves bitmaps" line could not be found in LOC's actual text.
- Figma: IndexedDB internals, document-store backend, and image blob store are not publicly
  documented; core posts are 2015–2019.

## Follow-ups (agreed 2026-07-20, in priority order)

1. `quotaOkFor` → attempt-and-catch `QuotaExceededError` with clean rollback (stop refusing
   against the cosmetic 10 GiB headroom).
2. StorageBar → absolute usage, escalate on real write failures, not `estimate()` fractions.
3. TIFF → WebP ingest transcode (WASM decoder feeding the existing `bake.ts` WebP encoder).
4. Optional: folder-as-primary-store for AV originals; one `persist()` call at first write.
