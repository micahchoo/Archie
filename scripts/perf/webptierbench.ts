// Web-tier parameter sweep (Archie-7280 H2): WebP at q ∈ {0.7, 0.8, 0.9} × maxDim ∈ {1600, 2400, 3200}
// over REAL digitization masters, measured through the encoder Archie actually ships.
//
// Why a browser and not `cwebp`: the product path is `canvas.toBlob(…, "image/webp", q)` —
// `apps/studio/src/bake.ts:45` (display master) and `apps/studio/src/tiff-transcode.ts:72` (TIFF
// transcode). Chromium's canvas encoder is libwebp but with its own method/segment defaults, so a
// CLI `cwebp -q 80` is a DIFFERENT number. Pinning a param against the wrong encoder would pin the
// wrong param. Harness shape donated by `tilingthresholdbench.ts` / `tilingthresholdrun.mjs`.
//
// Two things are measured per (master × maxDim × quality):
//   bytes — what the web tier would publish for that object.
//   SSIM  — against the SAME-dimension lossless (PNG) downscale, so this isolates ENCODER loss from
//           downscale loss. Comparing a 1600px WebP against the 6000px master would conflate them and
//           make every quality look equally bad.
// Global SSIM on luma, 8×8 windows, standard C1/C2 — the usual formulation, not a bespoke metric.

declare global {
  interface Window {
    __BENCH__?: unknown;
  }
}

const MASTER_DIR = "/@fs/tmp/archie-masters";
const MASTERS = [
  "manuscript-folio.jpg",
  "manuscript-foldout.jpg",
  "photo-bw-portrait.jpg",
  "painting-oil.jpg",
  "printed-page-incunabulum.jpg",
  "herbarium-sheet.jpg",
];
const DIMS = [1600, 2400, 3200];
// 0.92 is not a web-tier candidate — it is `bakeDisplayMaster`'s default, swept so the ARCHIVAL
// tier's per-pixel cost is measured on the same corpus rather than extrapolated off q0.9.
const QUALITIES = [0.7, 0.8, 0.9, 0.92];
/** apps/studio ingest cap — `packages/render-core/src/geometry/downscale.ts:8`. */
const MAX_MASTER_DIM = 6000;
/** `bakeDisplayMaster`'s default lossy quality — `apps/studio/src/bake.ts:34`. */
const ARCHIVAL_QUALITY = 0.92;

const logEl = document.getElementById("log")!;
const say = (s: string) => {
  logEl.textContent += `\n${s}`;
  console.log(s);
};

function fitWithin(width: number, height: number, maxDim: number) {
  const longest = Math.max(width, height);
  if (longest <= maxDim || longest === 0) return { width, height };
  const scale = maxDim / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function drawTo(bmp: ImageBitmap, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  return c;
}

const encode = (c: HTMLCanvasElement, mime: string, q?: number): Promise<Blob> =>
  new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(`toBlob null for ${mime}`))), mime, q));

/** Luma plane (Rec. 601) from a canvas — the channel SSIM is conventionally computed on. */
function luma(c: HTMLCanvasElement): Float64Array {
  const { width: w, height: h } = c;
  const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const out = new Float64Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) out[p] = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
  return out;
}

/** Global mean SSIM over non-overlapping 8×8 windows. C1/C2 per Wang et al. 2004 with L=255. */
function ssim(a: Float64Array, b: Float64Array, w: number, h: number): number {
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const W = 8;
  let acc = 0;
  let n = 0;
  for (let by = 0; by + W <= h; by += W) {
    for (let bx = 0; bx + W <= w; bx += W) {
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          const i = (by + y) * w + bx + x;
          const va = a[i]!, vb = b[i]!;
          sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
        }
      }
      const m = W * W;
      const ma = sa / m, mb = sb / m;
      const va = saa / m - ma * ma, vb = sbb / m - mb * mb, cab = sab / m - ma * mb;
      acc += ((2 * ma * mb + C1) * (2 * cab + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      n++;
    }
  }
  return n === 0 ? NaN : acc / n;
}

async function bitmapOf(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

async function run() {
  const rows: Record<string, unknown>[] = [];
  const masters: Record<string, unknown>[] = [];

  for (const file of MASTERS) {
    const res = await fetch(`${MASTER_DIR}/${file}`);
    if (!res.ok) throw new Error(`master ${file}: HTTP ${res.status}`);
    const srcBlob = await res.blob();
    const srcBmp = await bitmapOf(srcBlob);
    const sw = srcBmp.width, sh = srcBmp.height;

    // ARCHIVAL tier reference: what ingest stores as the display master today. bakeDisplayMaster
    // re-encodes ONLY when the source exceeds the cap, preserving the source mime (bake.ts:80-98);
    // a within-cap file is stored byte-for-byte.
    const capped = fitWithin(sw, sh, MAX_MASTER_DIM);
    const archivalBytes =
      capped.width === sw && capped.height === sh
        ? srcBlob.size
        : (await encode(drawTo(srcBmp, capped.width, capped.height), srcBlob.type || "image/jpeg", ARCHIVAL_QUALITY)).size;

    // What an ingested TIFF becomes: `transcodeTiff` re-encodes to WebP at the cap (default q0.92,
    // tiff-transcode.ts:35). This is the ARCHIVAL master for the TIFF-sourced corpus the map is about
    // — measured here rather than extrapolated from the q0.9 row.
    const archivalWebpBytes = (await encode(drawTo(srcBmp, capped.width, capped.height), "image/webp", ARCHIVAL_QUALITY)).size;
    // Uncompressed RGB TIFF is exactly 3 bytes/pixel — arithmetic, not a measurement, but it is the
    // floor the "8-15x smaller as WebP" claim in tiff-transcode.ts's header is measured against.
    const rawRgbBytes = sw * sh * 3;

    masters.push({
      file,
      srcW: sw,
      srcH: sh,
      srcBytes: srcBlob.size,
      srcMime: srcBlob.type,
      srcBpp: srcBlob.size / (sw * sh),
      rawRgbBytes,
      archivalW: capped.width,
      archivalH: capped.height,
      archivalBytes,
      archivalBpp: archivalBytes / (capped.width * capped.height),
      archivalWebpBytes,
      archivalWebpBpp: archivalWebpBytes / (capped.width * capped.height),
      rawRgbOverArchivalWebp: rawRgbBytes / archivalWebpBytes,
    });
    say(`${file}  ${sw}x${sh}  src ${(srcBlob.size / 1048576).toFixed(2)} MB  archival ${(archivalBytes / 1048576).toFixed(2)} MB`);

    for (const maxDim of DIMS) {
      const t = fitWithin(sw, sh, maxDim);
      const canvas = drawTo(srcBmp, t.width, t.height);
      // Reference for SSIM: the SAME pixels, losslessly round-tripped through PNG so the reference
      // goes through an identical decode path (and so a decoder colour-management difference cancels).
      const refBmp = await bitmapOf(await encode(canvas, "image/png"));
      const refLuma = luma(drawTo(refBmp, t.width, t.height));

      for (const quality of QUALITIES) {
        const blob = await encode(canvas, "image/webp", quality);
        const back = luma(drawTo(await bitmapOf(blob), t.width, t.height));
        const s = ssim(refLuma, back, t.width, t.height);
        rows.push({
          file, maxDim, quality,
          outW: t.width, outH: t.height,
          bytes: blob.size,
          bpp: blob.size / (t.width * t.height),
          ssim: s,
          vsArchival: archivalBytes / blob.size,
          vsSource: srcBlob.size / blob.size,
        });
        say(`  ${maxDim}px q${quality}  ${(blob.size / 1024).toFixed(0)} KB  bpp ${(blob.size / (t.width * t.height)).toFixed(4)}  ssim ${s.toFixed(4)}  ${(archivalBytes / blob.size).toFixed(1)}x vs archival`);
      }
    }
    srcBmp.close();
  }

  return { masters, rows, dims: DIMS, qualities: QUALITIES, maxMasterDim: MAX_MASTER_DIM, archivalQuality: ARCHIVAL_QUALITY };
}

run().then(
  (r) => { window.__BENCH__ = r; say("\nDONE"); },
  (e) => { window.__BENCH__ = { error: String(e?.stack ?? e) }; say(`\nERROR ${e}`); },
);
