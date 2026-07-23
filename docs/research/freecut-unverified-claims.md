# Freecut study: recovered UNVERIFIED claims

Mined 2026-07-20 from deep-research run `wf_148ce59d-ec5`: 104 claims were extracted, 25
adversarially verified into [freecut-lessons.md](freecut-lessons.md); these are the survivors of
the never-verified 79 after dropping duplicates, marketing, and video-editor-UX items.
**Nothing here has been adversarially verified — check the cited source before acting on any item.**
Companion docs: [freecut-gaps.md](freecut-gaps.md) (source-depth follow-up), freecut clone at
`Prior Art/freecut` (`a3ecfce`).

## Storage durability (sharpens the FSA-primary question / Archie-623e)

1. **`persist()` is advisory, not armor.** Firefox prompts; Safari and most Chromium decide
   silently on site-engagement heuristics. Check the boolean; call near a user gesture at a
   critical save, not at bootstrap. A grant defends against automatic low-disk eviction only —
   not manual clear-site-data, the more common loss vector. (web.dev/persistent-storage)
   *Archie already fires it on first asset write — the gesture-timing part is satisfied.*
2. **WebKit evicts infrequently-opened origins with zero storage pressure.** Directly hits
   Archie's use case (occasionally-opened local libraries) in Safari web studio.
   (web.dev/persistent-storage)
3. **Outside OPFS, every FSA `createWritable()` save pays a full temp-file copy** — no true
   in-place streaming write to user-visible folders; in-place editing exists only via OPFS
   `SyncAccessHandle`. Fine for write-once AV originals; bad for large frequently-rewritten
   files. Feeds the folder-primary design. (fs.spec.whatwg.org)
4. **FSA locking is platform-enforced:** writable streams take shared locks, sync handles
   exclusive; holders block each other — the browser itself serializes concurrent writers.
   (fs.spec.whatwg.org)
5. **Quota writes throw catchable `QuotaExceededError`; Firefox caps non-persisted origins at
   min(10% disk, 10 GiB)**, lifted to 50%/8 TiB with a persistence grant. A hard Firefox
   ceiling worth knowing while AV media lives in OPFS. (MDN storage quotas)

## WebCodecs mechanics (conditional — only bind if frame-level features land)

6. Decode needs **chunk batching + decoder backpressure monitoring**; one-chunk-at-a-time
   loops stall. The decode-side twin of the verified encoder-backpressure lesson. (MDN, W3C explainer)
7. **`postMessage(frame, [frame])` transfer closes the sender's copy** — keeping a local ref
   after transfer silently breaks; move per-frame work + OffscreenCanvas rendering off-main.
   (W3C spec, Chrome best practices)
8. **Capacity math:** a decoded 1080p frame ≈ 8 MB; GPU memory bounds raw-frame buffers to
   ~hundreds of frames (~20 s of 1080p). Size any scrub cache from this. (webcodecsfundamentals.org)
9. **WebCodecs timestamps are microseconds; HTML5 media reports seconds** — a guaranteed
   unit-conversion bug class where they share a timeline. (webcodecsfundamentals.org)
10. **Browsers reclaim idle codecs** (~10 s without queue progress) by closing them with
    `QuotaExceededError` — long transcode jobs must handle mid-stream closure and resume.
    (W3C explainer)
11. `VideoEncoder.flush()` is the awaitable completion primitive before finalizing a container
    write. (Chrome best practices)
12. **Copyable codec fallback ladder:** `avc1.64003e → avc1.4d0034 → avc1.42003e → avc1.42001f`;
    H.264+AAC/MP4 for compatibility, VP9+Opus/WebM when one app controls encode AND playback
    (MDN names the local-first case); widest-support defaults `avc1.4d0034` / `vp09.00.40.08.00`.
    (MDN codec selection)
13. **Native AAC encode is absent on Firefox and all desktop-Linux browsers**, partial on
    Apple — Archie's Linux-first webkitgtk desktop would need `@mediabunny/aac-encoder`, not
    native WebCodecs, for any audio-encode feature. (MDN codec selection)

## Architecture / ecosystem

14. Mediabunny's `registerEncoder/registerDecoder` seam works outside WebCodecs (Node), and
    `@mediabunny/server` targets Node/Bun/Deno — a server-side transcode path. (mediabunny.dev)
15. **Mediabunny tree-shakes to ~5–16 kB gzip for metadata reads, ~70 kB full** — the concrete
    bundle-size answer for the ingest-adoption question. (mediabunny.dev)
16. ffmpeg.wasm costs a ~32 MB binary download; SIMD build only 2–3× the non-SIMD one.
    (freecodecamp.org)
17. Tab memory ceilings (~4 GB Chrome, less Safari) bound in-browser project size independent
    of storage quota. (vidstudio.app)
18. Freecut's bundle format is a schema-validated `.freecut.zip` (streaming fflate, Zod gate on
    import) — raises whether `.archie.zip` import should validate structure beyond the marker,
    in tension with render-core's per-item-tolerant read policy. **Correction:** this claim
    also asserted freecut's timeline undo uses zundo; the source-depth read in
    [freecut-gaps.md](freecut-gaps.md) refutes that (hand-rolled snapshot-command pattern;
    the `.temporal` shim is misleading) — trust the gaps doc on undo.
