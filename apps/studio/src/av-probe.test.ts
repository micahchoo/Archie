import { describe, it, expect, vi } from "vitest";
import { probeAvFile, posterSeekTime, type AvProbeDeps } from "./av-probe.js";

// Archie-0c7f. jsdom decodes no media, so the codec half of this is untestable here and is left to a
// browser drive. What IS testable — and is where the bugs would live — is the ORCHESTRATION: which
// waits are bounded, which failures degrade to a partial answer rather than nothing, and which
// platform values are refused. Those go through the injected `AvProbeDeps` seam.

/** A media element that reports whatever the test tells it to, on demand. */
class FakeMedia extends EventTarget {
  preload = "";
  muted = false;
  src = "";
  currentTime = 0;
  duration = NaN;
  videoWidth = 0;
  videoHeight = 0;
  removeAttribute() {}
  load() {}
}

function deps(el: FakeMedia, canvas?: Partial<HTMLCanvasElement>): AvProbeDeps {
  return {
    createMedia: () => el as unknown as HTMLVideoElement,
    createCanvas: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {} }),
      toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(["poster"], { type: "image/jpeg" })),
      ...canvas,
    }) as unknown as HTMLCanvasElement,
    objectUrl: () => "blob:fake",
    revokeUrl: () => {},
  };
}

const FILE = new Blob(["bytes"], { type: "video/mp4" });

describe("posterSeekTime — never frame 0, never past the end", () => {
  it("takes a frame a little way in, not the opening frame", () => {
    // The whole point of the ticket: video opens on a fade-in or a slate, so frame 0 is the black
    // plate being fixed. A 30s clip must not seek to 0.
    expect(posterSeekTime(30)).toBeGreaterThan(0);
  });

  it("caps at one second so a feature-length file does not seek minutes in", () => {
    expect(posterSeekTime(3600)).toBe(1);
  });

  it("stays inside a very short clip", () => {
    // 0.2s sting: 10% would be 0.02s, but the cap logic must not push past the end either.
    const t = posterSeekTime(0.2);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(0.2);
  });

  it("returns 0 for the durations the platform actually hands back for streams", () => {
    expect(posterSeekTime(Infinity)).toBe(0);
    expect(posterSeekTime(NaN)).toBe(0);
    expect(posterSeekTime(0)).toBe(0);
  });
});

describe("probeAvFile — degrades, never throws", () => {
  it("audio: reports duration and never a poster", async () => {
    const el = new FakeMedia();
    el.duration = 42.5;
    const p = probeAvFile(FILE, "audio", deps(el));
    queueMicrotask(() => el.dispatchEvent(new Event("loadedmetadata")));
    expect(await p).toEqual({ duration: 42.5 });
  });

  it("video: reports duration, dimensions and a poster", async () => {
    const el = new FakeMedia();
    el.duration = 12;
    el.videoWidth = 640;
    el.videoHeight = 360;
    const p = probeAvFile(FILE, "video", deps(el));
    queueMicrotask(() => {
      el.dispatchEvent(new Event("loadedmetadata"));
      queueMicrotask(() => el.dispatchEvent(new Event("seeked")));
    });
    const out = await p;
    expect(out.duration).toBe(12);
    expect(out.width).toBe(640);
    expect(out.height).toBe(360);
    expect(out.poster).toBeInstanceOf(Blob);
  });

  it("a non-finite duration is REFUSED, not stored", async () => {
    // A live stream / some VBR files report Infinity. Storing it would print "Infinity" at a reader.
    const el = new FakeMedia();
    el.duration = Infinity;
    const p = probeAvFile(FILE, "audio", deps(el));
    queueMicrotask(() => el.dispatchEvent(new Event("loadedmetadata")));
    expect(await p).toEqual({});
  });

  it("an undecodable file resolves empty instead of rejecting", async () => {
    const el = new FakeMedia();
    const p = probeAvFile(FILE, "video", deps(el));
    queueMicrotask(() => el.dispatchEvent(new Event("error")));
    await expect(p).resolves.toEqual({});
  });

  it("a file that never fires loadedmetadata TIMES OUT rather than hanging the import queue", async () => {
    // The load-bearing one. An unbounded await here wedges every subsequent file in the batch, and a
    // codec the engine lacks fires no event at all — not even 'error' on some engines.
    vi.useFakeTimers();
    try {
      const el = new FakeMedia();
      const p = probeAvFile(FILE, "video", deps(el));
      await vi.advanceTimersByTimeAsync(11_000);
      await expect(p).resolves.toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });

  it("a seek that never completes still keeps the duration and dimensions", async () => {
    // Partial degradation: no plate, but the object is not left blank.
    vi.useFakeTimers();
    try {
      const el = new FakeMedia();
      el.duration = 9;
      el.videoWidth = 100;
      el.videoHeight = 50;
      const p = probeAvFile(FILE, "video", deps(el));
      await vi.advanceTimersByTimeAsync(1);
      el.dispatchEvent(new Event("loadedmetadata"));
      await vi.advanceTimersByTimeAsync(11_000);
      const out = await p;
      expect(out).toEqual({ duration: 9, width: 100, height: 50 });
      expect(out.poster).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("SETUP failing resolves empty — the probe's own construction is inside the guard", async () => {
    // Regression. The first draft created the object URL and the media element ABOVE the try, so in a
    // non-DOM environment `document.createElement` threw straight out of probeAvFile and aborted the
    // whole AV import. Every test in this file injected working deps, so none of them could see it —
    // asset-queue.test.ts caught it with "ReferenceError: document is not defined". Setup can fail,
    // so setup must be guarded.
    const exploding: AvProbeDeps = {
      createMedia: () => { throw new ReferenceError("document is not defined"); },
      createCanvas: () => { throw new Error("nope"); },
      objectUrl: () => "blob:fake",
      revokeUrl: () => {},
    };
    await expect(probeAvFile(FILE, "video", exploding)).resolves.toEqual({});
  });

  it("resolves empty when even objectUrl throws, and does not try to revoke what was never minted", async () => {
    let revoked = 0;
    const exploding: AvProbeDeps = {
      createMedia: () => new FakeMedia() as unknown as HTMLVideoElement,
      createCanvas: () => ({}) as HTMLCanvasElement,
      objectUrl: () => { throw new Error("no URL API"); },
      revokeUrl: () => { revoked += 1; },
    };
    await expect(probeAvFile(FILE, "video", exploding)).resolves.toEqual({});
    expect(revoked, "revokeUrl must not be called for a URL that was never created").toBe(0);
  });

  it("a tainted-canvas toBlob throw degrades to no poster, not a failed import", async () => {
    const el = new FakeMedia();
    el.duration = 5;
    el.videoWidth = 20;
    el.videoHeight = 10;
    const d = deps(el, { toBlob: () => { throw new Error("tainted"); } } as Partial<HTMLCanvasElement>);
    const p = probeAvFile(FILE, "video", d);
    queueMicrotask(() => {
      el.dispatchEvent(new Event("loadedmetadata"));
      queueMicrotask(() => el.dispatchEvent(new Event("seeked")));
    });
    const out = await p;
    expect(out.poster).toBeUndefined();
    expect(out.duration).toBe(5);
  });
});
