// Build the 1,000-master acceptance corpus (Archie-c74e step 1), in real Chromium.
//
// WHY DERIVED FROM REAL MASTERS RATHER THAN SYNTHESISED. `PROBE-tiling-threshold-2026-07-27.md` had
// to caveat every byte figure it reported because its masters were `fillRect` noise, and a lossy
// encoder's output size is almost entirely a function of the input's spatial frequency content —
// synthetic noise is the one thing that behaves least like a digitization master. `PROTO-folder-
// probe-2026-07-27.md` closed that caveat with SIX REAL MASTERS (parchment folio, wide foldout, B&W
// film scan, oil painting, letterpress page, herbarium sheet) and pinned the web tier's 0.1476 bpp
// against them. This corpus is built by CROPPING AND RESCALING those same six, so every output frame
// carries real sensor grain, real parchment texture, real halftone — and the byte totals this run
// reports are directly comparable to the estimate they are meant to reconcile against.
//
// Each output is a distinct crop at a distinct scale, so no two files are byte-identical and the
// deduplication a content-addressed store would get is not accidentally doing the compression's job.
//
// The dimension mix spans 2000–6000 px on the longer edge, which is the band an ingested asset can
// actually occupy: `MAX_MASTER_DIM` is 6000 (`geometry/downscale.ts`), and `TILE_MIN_EDGE` is 4096
// (`publish-flows.svelte.ts:195`) — so the mix deliberately straddles the tiling threshold rather
// than sitting entirely above it, because "how many of a real folder's images tile" is one of the
// numbers this acceptance run has to produce.
const out = document.querySelector("#out")!;
const say = (s: string) => { out.textContent += s + "\n"; console.log(s); };

const params = new URLSearchParams(location.search);
const N = Number(params.get("n") ?? "1000");
const SINK = params.get("sink")!;
const MASTER_BASE = params.get("masters")!;
const QUALITY = Number(params.get("q") ?? "0.92");
/** Fraction of the corpus written as UNCOMPRESSED BASELINE TIFF rather than JPEG. See TIFF below. */
const TIFF_FRACTION = Number(params.get("tiff") ?? "0.15");

const MASTERS = [
  "manuscript-folio.jpg",
  "manuscript-foldout.jpg",
  "photo-bw-portrait.jpg",
  "painting-oil.jpg",
  "printed-page-incunabulum.jpg",
  "herbarium-sheet.jpg",
];

/** mulberry32 — a seeded PRNG, so the corpus is reproducible from its seed alone. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The dimension mix, as (weight, longer-edge band). Chosen to straddle TILE_MIN_EDGE = 4096. */
const BANDS: readonly [number, number, number][] = [
  [0.28, 5400, 6000], // oversize / large-format — always tiles
  [0.24, 4300, 5300], // typical flatbed master   — always tiles
  [0.26, 3000, 4090], // mid-size scan            — never tiles (just under the threshold)
  [0.22, 2000, 2900], // small plate / detail     — never tiles
];
/** Aspect ratios (longer:shorter) a real folder mixes. */
const ASPECTS = [4 / 3, 3 / 2, 16 / 9, 1.1, 1.42];

function pickDims(r: () => number): { w: number; h: number } {
  let acc = 0;
  const t = r();
  let band = BANDS[BANDS.length - 1]!;
  for (const b of BANDS) { acc += b[0]; if (t <= acc) { band = b; break; } }
  const longEdge = Math.round(band[1] + r() * (band[2] - band[1]));
  const aspect = ASPECTS[Math.floor(r() * ASPECTS.length)]!;
  const shortEdge = Math.round(longEdge / aspect);
  // Half the folder is portrait, as a scanned book is.
  return r() < 0.5 ? { w: longEdge, h: shortEdge } : { w: shortEdge, h: longEdge };
}

/**
 * TIFF — why part of the corpus is one, and why it is written by hand.
 *
 * Archie-34a2's reference archive is 10–30 GB for ~1,000 images. A JPEG master at these dimensions is
 * ~0.20 bytes/px, which puts 1,000 mixed 2000–6000 px plates at under 3 GB — so a pure-JPEG corpus
 * cannot reach the map's own byte ballpark WITHOUT changing the image count or the dimensions, which
 * are the two things this ticket pins. The 10–30 GB figure is a statement about TIFF/uncompressed
 * digitization masters, and `PROTO-folder-probe`'s independently-measured 7.7–15x raw-RGB-over-WebP
 * ratio is the same claim from the other side.
 *
 * A TIFF slice therefore does two jobs at once: it makes the source-byte total honest, and it
 * exercises `apps/studio/src/tiff-transcode.ts` — the UTIF decode path that exists precisely because
 * 375 real files died in `createImageBitmap` on a real museum import — at a scale nobody has driven.
 *
 * Baseline uncompressed RGB, little-endian, one strip. That is the most decodable TIFF there is, so a
 * failure downstream is a failure of the pipeline rather than of an exotic encoding.
 * Tags per TIFF 6.0 §2: 256 ImageWidth, 257 ImageLength, 258 BitsPerSample, 259 Compression=1,
 * 262 PhotometricInterpretation=2 (RGB), 273 StripOffsets, 277 SamplesPerPixel=3,
 * 278 RowsPerStrip, 279 StripByteCounts, 284 PlanarConfiguration=1.
 */
function encodeTiffRgb(rgba: Uint8ClampedArray, w: number, h: number): Blob {
  const ENTRIES = 10;
  // header 8 + entry count 2 + entries 12*n + next-IFD 4 + BitsPerSample triple (6 bytes, > 4 so it
  // lives outside the entry) — then the pixel strip.
  const bpsOffset = 8 + 2 + ENTRIES * 12 + 4;
  const dataOffset = bpsOffset + 6;
  const stripBytes = w * h * 3;
  const buf = new ArrayBuffer(dataOffset + stripBytes);
  const dv = new DataView(buf);
  dv.setUint16(0, 0x4949, true);  // "II" little-endian
  dv.setUint16(2, 42, true);      // magic
  dv.setUint32(4, 8, true);       // first IFD at byte 8
  dv.setUint16(8, ENTRIES, true);
  let p = 10;
  const entry = (tag: number, type: number, count: number, value: number) => {
    dv.setUint16(p, tag, true); dv.setUint16(p + 2, type, true);
    dv.setUint32(p + 4, count, true);
    // A SHORT that fits in the 4-byte value field is written in the FIRST two bytes (TIFF 6.0 §2,
    // "Value Offset" — left-justified in the byte order of the file).
    if (type === 3 && count === 1) { dv.setUint16(p + 8, value, true); dv.setUint16(p + 10, 0, true); }
    else dv.setUint32(p + 8, value, true);
    p += 12;
  };
  entry(256, 4, 1, w);            // ImageWidth (LONG)
  entry(257, 4, 1, h);            // ImageLength (LONG)
  entry(258, 3, 3, bpsOffset);    // BitsPerSample -> [8,8,8] out of line
  entry(259, 3, 1, 1);            // Compression = none
  entry(262, 3, 1, 2);            // Photometric = RGB
  entry(273, 4, 1, dataOffset);   // StripOffsets
  entry(277, 3, 1, 3);            // SamplesPerPixel
  entry(278, 4, 1, h);            // RowsPerStrip = whole image
  entry(279, 4, 1, stripBytes);   // StripByteCounts
  entry(284, 3, 1, 1);            // PlanarConfiguration = chunky
  dv.setUint32(p, 0, true);       // no next IFD
  dv.setUint16(bpsOffset, 8, true); dv.setUint16(bpsOffset + 2, 8, true); dv.setUint16(bpsOffset + 4, 8, true);
  const strip = new Uint8Array(buf, dataOffset, stripBytes);
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
    strip[o] = rgba[i]!; strip[o + 1] = rgba[i + 1]!; strip[o + 2] = rgba[i + 2]!;
  }
  return new Blob([buf], { type: "image/tiff" });
}

async function put(rel: string, body: Blob): Promise<void> {
  const res = await fetch(`${SINK}/w/${rel}`, { method: "PUT", body });
  if (!res.ok) throw new Error(`PUT ${rel} -> ${res.status}`);
}

async function main() {
  say(`loading ${MASTERS.length} real digitization masters…`);
  const bitmaps: ImageBitmap[] = [];
  for (const m of MASTERS) {
    const r = await fetch(`${MASTER_BASE}/${m}`);
    if (!r.ok) throw new Error(`${m}: ${r.status}`);
    const b = await r.blob();
    const bmp = await createImageBitmap(b);
    bitmaps.push(bmp);
    say(`  ${m.padEnd(30)} ${bmp.width}x${bmp.height}  ${(b.size / 1048576).toFixed(2)} MB`);
  }

  const manifest: { name: string; w: number; h: number; bytes: number; src: string; kind: "jpeg" | "tiff" }[] = [];
  const t0 = performance.now();
  let done = 0;

  const one = async (i: number) => {
    const r = rng(0x5eed + i * 2654435761);
    const { w, h } = pickDims(r);
    const src = bitmaps[i % bitmaps.length]!;
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d")!;
    // COVER-fit a crop of the source. `scale` is chosen so the crop is a real sub-region (never an
    // upscale of the whole plate), which keeps the output's spatial-frequency content close to the
    // master's own — an upscaled master would low-pass itself and encode far too small.
    const zoom = 1 + r() * 0.6;
    const cover = Math.max(w / src.width, h / src.height) * zoom;
    const sw = Math.min(src.width, Math.ceil(w / cover));
    const sh = Math.min(src.height, Math.ceil(h / cover));
    const sx = Math.floor(r() * (src.width - sw));
    const sy = Math.floor(r() * (src.height - sh));
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    // Deterministic and evenly spread, so the TIFF slice samples the same dimension bands the JPEG
    // slice does rather than clustering at one end.
    const isTiff = TIFF_FRACTION > 0 && i % Math.max(1, Math.round(1 / TIFF_FRACTION)) === 0;
    const kind = isTiff ? "tiff" as const : "jpeg" as const;
    const blob = isTiff
      ? encodeTiffRgb(ctx.getImageData(0, 0, w, h).data, w, h)
      : await c.convertToBlob({ type: "image/jpeg", quality: QUALITY });
    const name = `plate-${String(i).padStart(4, "0")}.${isTiff ? "tif" : "jpg"}`;
    await put(name, blob);
    manifest.push({ name, w, h, bytes: blob.size, src: MASTERS[i % MASTERS.length]!, kind });
    done++;
    if (done % 100 === 0) {
      const el = (performance.now() - t0) / 1000;
      say(`  ${done}/${N}  ${el.toFixed(0)}s  (${(done / el).toFixed(1)} img/s)`);
    }
  };

  // Bounded concurrency: a 6000x4500 canvas is ~108 MB of RGBA, so 6 in flight is ~650 MB — enough to
  // keep the encoder busy without making this step the memory story.
  const LIMIT = 6;
  let next = 0;
  await Promise.all(Array.from({ length: LIMIT }, async () => {
    for (;;) {
      const i = next++;
      if (i >= N) return;
      await one(i);
    }
  }));

  manifest.sort((a, b) => a.name.localeCompare(b.name));
  const totalBytes = manifest.reduce((n, m) => n + m.bytes, 0);
  const totalPixels = manifest.reduce((n, m) => n + m.w * m.h, 0);
  const tileable = manifest.filter((m) => Math.max(m.w, m.h) > 4096).length;
  const tiffs = manifest.filter((m) => m.kind === "tiff");
  const jpegs = manifest.filter((m) => m.kind === "jpeg");
  const sum = (a: typeof manifest, f: (m: typeof manifest[number]) => number) => a.reduce((n, m) => n + f(m), 0);
  const elapsed = (performance.now() - t0) / 1000;
  say(`\n${manifest.length} masters · ${(totalBytes / 1e9).toFixed(2)} GB · ${(totalPixels / 1e6).toFixed(0)} Mpx · ${tileable} above TILE_MIN_EDGE(4096) · ${elapsed.toFixed(0)}s`);
  say(`  jpeg ${jpegs.length} · ${(sum(jpegs, (m) => m.bytes) / 1e9).toFixed(2)} GB · ${(sum(jpegs, (m) => m.bytes) / sum(jpegs, (m) => m.w * m.h)).toFixed(4)} B/px`);
  say(`  tiff ${tiffs.length} · ${(sum(tiffs, (m) => m.bytes) / 1e9).toFixed(2)} GB · ${(sum(tiffs, (m) => m.bytes) / Math.max(1, sum(tiffs, (m) => m.w * m.h))).toFixed(4)} B/px`);

  await put("_manifest.json", new Blob([JSON.stringify(manifest)], { type: "application/json" }));
  (window as unknown as { __BENCH__: unknown }).__BENCH__ = {
    count: manifest.length, totalBytes, totalPixels, tileable, elapsedSec: elapsed,
    bytesPerPixel: totalBytes / totalPixels,
    jpeg: { n: jpegs.length, bytes: sum(jpegs, (m) => m.bytes), pixels: sum(jpegs, (m) => m.w * m.h) },
    tiff: { n: tiffs.length, bytes: sum(tiffs, (m) => m.bytes), pixels: sum(tiffs, (m) => m.w * m.h) },
    dimHistogram: manifest.reduce<Record<string, number>>((acc, m) => {
      const band = Math.max(m.w, m.h) > 4096 ? (Math.max(m.w, m.h) > 5300 ? "5300-6000" : "4096-5300") : (Math.max(m.w, m.h) > 2900 ? "2900-4096" : "2000-2900");
      acc[band] = (acc[band] ?? 0) + 1; return acc;
    }, {}),
  };
}

main().catch((e) => {
  say(`ERROR: ${e?.stack ?? e}`);
  (window as unknown as { __BENCH__: unknown }).__BENCH__ = { error: String(e?.stack ?? e) };
});
