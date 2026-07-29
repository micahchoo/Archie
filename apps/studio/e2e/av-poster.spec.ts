import { test, expect } from "@playwright/test";

// Archie-0c7f — the ONE claim the unit suite structurally cannot make.
//
// av-probe.test.ts drives the probe's orchestration through an injected seam with a fake element, and
// that is the right shape for timeouts and degradation. But jsdom decodes no media, so nothing there
// has ever seen a real frame. The ticket's whole point is "video plates render BLACK"; a gate that
// cannot look at pixels cannot say the black plate is fixed.
//
// This drives the REAL module in a REAL Chromium against REALLY-DECODED media. No fixture file is
// committed: the page paints a known colour onto a canvas, records it with MediaRecorder, and hands
// the resulting Blob to probeAvFile. That keeps the repo free of a binary and makes the expected
// pixel colour something the test itself chose, so "not black" is checkable rather than eyeballed.

const CANVAS_W = 320;
const CANVAS_H = 180;
/** The colour painted into every frame. Deliberately far from black in all three channels. */
const FILL = { r: 220, g: 40, b: 160 };

test.describe("AV poster extraction against really-decoded media (Archie-0c7f)", () => {
  test("a real video yields a poster whose pixels are NOT black, plus dimensions", async ({ page }) => {
    await page.goto("./");

    const result = await page.evaluate(async ({ w, h, fill }) => {
      // ---- 1. make a real, decodable video in the page -------------------------------------------
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      const paint = () => {
        ctx.fillStyle = `rgb(${fill.r}, ${fill.g}, ${fill.b})`;
        ctx.fillRect(0, 0, w, h);
      };
      paint();

      const stream = canvas.captureStream(30);
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
      rec.start();
      // Keep painting so the stream produces frames rather than a single static one.
      const painter = setInterval(paint, 33);
      await new Promise((res) => setTimeout(res, 700));
      clearInterval(painter);
      rec.stop();
      await stopped;
      const video = new Blob(chunks, { type: rec.mimeType || "video/webm" });
      if (video.size === 0) return { error: "MediaRecorder produced no bytes" };

      // ---- 2. run the REAL probe -----------------------------------------------------------------
      // The vite dev server serves the module graph, so this is the shipping module, not a copy.
      // Specifier held in a variable so TypeScript does not try to resolve a dev-server URL at
      // compile time (TS2307) — it is a runtime path, served by vite, not a module on disk from here.
      const spec = "/studio/src/av-probe.ts";  // vite base is /studio/
      const mod = (await import(/* @vite-ignore */ spec)) as {
        probeAvFile: (b: Blob, k: "video" | "audio") => Promise<{ duration?: number; width?: number; height?: number; poster?: Blob }>;
      };
      const probe = await mod.probeAvFile(video, "video");
      if (!probe.poster) {
        return { error: "no poster", width: probe.width, height: probe.height, duration: probe.duration, videoBytes: video.size };
      }

      // ---- 3. read the poster's actual pixels ----------------------------------------------------
      const bmp = await createImageBitmap(probe.poster);
      const oc = document.createElement("canvas");
      oc.width = bmp.width;
      oc.height = bmp.height;
      const octx = oc.getContext("2d")!;
      octx.drawImage(bmp, 0, 0);
      const { data } = octx.getImageData(0, 0, bmp.width, bmp.height);
      let rSum = 0, gSum = 0, bSum = 0, dark = 0;
      const px = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        rSum += data[i]!; gSum += data[i + 1]!; bSum += data[i + 2]!;
        if (data[i]! < 16 && data[i + 1]! < 16 && data[i + 2]! < 16) dark += 1;
      }
      return {
        width: probe.width,
        height: probe.height,
        duration: probe.duration,
        posterBytes: probe.poster.size,
        posterW: bmp.width,
        posterH: bmp.height,
        mean: { r: Math.round(rSum / px), g: Math.round(gSum / px), b: Math.round(bSum / px) },
        darkFraction: dark / px,
      };
    }, { w: CANVAS_W, h: CANVAS_H, fill: FILL });

    // Print the subject, not just the verdict — a probe that cannot say what it measured has measured
    // nothing (.claude/rules/post-review-fixes-are-unreviewed.md).
    expect(result.error, `probe failed: ${JSON.stringify(result)}`).toBeUndefined();

    // The dimensions came off a real decoded track.
    expect(result.width).toBe(CANVAS_W);
    expect(result.height).toBe(CANVAS_H);
    expect(result.posterW).toBe(CANVAS_W);
    expect(result.posterH).toBe(CANVAS_H);
    expect(result.posterBytes!).toBeGreaterThan(0);

    // THE CLAIM: the plate is not black. Asserted two independent ways so a single odd channel or a
    // mostly-black frame with one bright corner cannot pass.
    expect(result.darkFraction!, `poster is ${Math.round(result.darkFraction! * 100)}% near-black pixels`).toBeLessThan(0.1);
    const m = result.mean!;
    expect(m.r, `mean red ${m.r} (painted ${FILL.r})`).toBeGreaterThan(120);
    expect(m.b, `mean blue ${m.b} (painted ${FILL.b})`).toBeGreaterThan(80);

    // Duration is BEST-EFFORT here and deliberately not asserted: a MediaRecorder webm carries no
    // container duration, so video.duration reads Infinity and the probe correctly REFUSES to store
    // it (storing it would print "Infinity" at a reader). A real muxed file does carry one. Recording
    // the reason so nobody later "fixes" this by asserting a duration and gets a confusing red.
    expect(result.duration === undefined || result.duration > 0).toBe(true);
  });
});
