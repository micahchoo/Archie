// Archie-4b0a — the quality-tier DECISION layer, which is where every tier bug can be caught cheaply.
//
// Everything asserted here is pure: which transform a MIME gets, what the published file is called,
// how two renames collide, which model fields move with the rename, and when a fallback is counted.
// The canvas/WebCodecs encode itself is injected (`TierEncoders`) exactly so this suite can exist —
// jsdom has no canvas and `.claude/rules/vitest-css-id-empty-string.md` is a standing reminder that a
// suite proving nothing about the seam is worse than no suite. So the encoder is a stub whose OUTPUT
// is asserted to reach the published bytes, and its ABSENCE is asserted to increment a named counter.
import { describe, it, expect, beforeEach } from "vitest";
import { asExhibitId, asLibraryId, asObjectId, type Library } from "@render/core";
import { WEB_TIER } from "./archive-probe.js";
import { WEB_TIER_H264, videoSkipCount, resetVideoSkipCount } from "./video-transcode.js";
import {
  DEFAULT_TIER, applyTier, assetMime, capsFor, projectLibraryForTier, renameForTier, resetTierFallbacks,
  tierDecision, tierFallbackCount, tierFallbacksByReason, tierNameMap,
  type TierCaps, type TierDecision,
} from "./publish-tier.js";

const FULL: TierCaps = { image: true, audio: true, video: WEB_TIER_H264 };
const NONE: TierCaps = { image: false, audio: false, video: null };

beforeEach(() => resetTierFallbacks());

describe("the tier set is TWO, and 'archival' is the default — so wiring the engine in changes nothing", () => {
  it("defaults to archival", () => {
    expect(DEFAULT_TIER).toBe("archival");
  });

  it("archival passes EVERY media type through untouched — no re-encode, no rename", () => {
    for (const mime of ["image/tiff", "image/jpeg", "image/webp", "audio/wav", "video/mp4", "image/svg+xml"]) {
      const d = tierDecision(mime, "archival", FULL);
      expect(d.action, mime).toBe("passthrough");
      expect(d.mime, mime).toBe(mime);
      expect(d.ext, mime).toBeNull();
    }
  });
});

describe("the web tier's transforms are the ones Archie-4b0a decided and Archie-7280 pinned", () => {
  it("images re-encode to WebP", () => {
    for (const mime of ["image/tiff", "image/jpeg", "image/png", "image/webp", "image/avif", "IMAGE/JPEG"]) {
      const d = tierDecision(mime, "web", FULL);
      expect(d.action, mime).toBe("image-webp");
      expect(d.mime, mime).toBe("image/webp");
      expect(d.ext, mime).toBe("webp");
    }
  });

  it("audio re-encodes to Opus", () => {
    const d = tierDecision("audio/wav", "web", FULL);
    expect(d.action).toBe("audio-opus");
    expect(d.ext).toBe("opus");
  });

  // SUPERSEDED BY Archie-7e6f. This used to assert "VIDEO passes through unchanged — Archie-7e6f owns
  // transcode, and this engine must not widen scope", which was correct until 7e6f shipped the
  // transcode and wired it here. Both directions are pinned now, because the interesting property is
  // no longer "video is exempt" but "video follows its CAPABILITY, and the file is named accordingly".
  it("VIDEO transcodes when a profile is reachable, and the published name follows the container", () => {
    const d = tierDecision("video/quicktime", "web", FULL);
    expect(d.action).toBe("video-transcode");
    expect(d.ext).toBe(WEB_TIER_H264.ext);
    // The manifest's `format` is a BARE media type, like its `image/webp` sibling — never the
    // parameterised `<source type>` string. A real defect, caught by this test's earlier form.
    expect(d.mime).toBe("video/mp4");
    expect(d.mime).not.toContain("codecs=");
  });

  it("VIDEO takes a COUNTED passthrough where no profile is reachable — never a silent one", () => {
    // Firefox, Safari, and a desktop build whose ffmpeg lacks codecs all land here. The bytes are the
    // originals, the name is unchanged, and `degraded` is what makes it visible in the fallback tally
    // rather than looking like a policy exemption.
    const d = tierDecision("video/quicktime", "web", { image: true, audio: true, video: null });
    expect(d.action).toBe("passthrough");
    expect(d.mime).toBe("video/quicktime");
    expect(d.ext).toBeNull();
    expect(d.degraded).toBe("no-video-encoder");
  });

  it("SVG and GIF are exempt WITH A STATED REASON — rasterising one and flattening the other are losses with no win", () => {
    expect(tierDecision("image/svg+xml", "web", FULL).action).toBe("passthrough");
    expect(tierDecision("image/svg+xml", "web", FULL).reason).toMatch(/vector/i);
    expect(tierDecision("image/gif", "web", FULL).action).toBe("passthrough");
    expect(tierDecision("image/gif", "web", FULL).reason).toMatch(/animat/i);
  });

  it("the pinned numbers are IMPORTED from the probe, never restated here", () => {
    // The point of the assertion is the identity, not the values: if someone hard-codes 2400/0.8 into
    // publish-tier.ts and the probe later re-measures, this is what notices they drifted apart.
    expect(WEB_TIER.maxDim).toBe(2400);
    expect(WEB_TIER.quality).toBe(0.8);
  });
});

describe("a platform that cannot encode degrades CLEANLY — the name and the MIME degrade with the bytes", () => {
  it("no image encoder ⇒ passthrough, so nothing is ever named .webp while holding JPEG", () => {
    const d = tierDecision("image/jpeg", "web", NONE);
    expect(d.action).toBe("passthrough");
    expect(d.mime).toBe("image/jpeg");
    expect(d.ext).toBeNull();
    expect(renameForTier("folio.jpg", d.ext)).toBe("folio.jpg");
  });

  it("no audio encoder ⇒ passthrough (today's real platform state — no Ogg/WebM muxer ships)", () => {
    expect(tierDecision("audio/wav", "web", { image: true, audio: false, video: null }).action).toBe("passthrough");
  });

  it("but the degradation is FLAGGED on the decision, so it can be counted rather than shrugged off", () => {
    expect(tierDecision("image/jpeg", "web", NONE).degraded).toBe("no-image-encoder");
    expect(tierDecision("audio/wav", "web", NONE).degraded).toBe("no-audio-encoder");
    // A decision that is NOT a forced passthrough carries no degradation. SVG is a chosen policy
    // exemption; video under FULL caps is now a real transcode (Archie-7e6f) — different routes to
    // the same "nothing was given up here" answer, which is why both are still listed.
    expect(tierDecision("video/mp4", "web", FULL).action).toBe("video-transcode");
    expect(tierDecision("video/mp4", "web", FULL).degraded).toBeUndefined();
    expect(tierDecision("image/svg+xml", "web", FULL).degraded).toBeUndefined();
    expect(tierDecision("image/jpeg", "archival", FULL).degraded).toBeUndefined();
  });

  it("capability means AN ENCODER IS WIRED — not a probe of whatever runtime happens to be running", () => {
    expect(capsFor({})).toEqual({ image: false, audio: false, video: null });
    expect(capsFor({ encodeImage: async () => new Blob() })).toEqual({ image: true, audio: false, video: null });
    expect(capsFor({ encodeImage: async () => new Blob(), encodeAudio: async () => new Blob() })).toEqual({ image: true, audio: true, video: null });
  });

  it("VIDEO capability needs BOTH halves — a half-configured pair is no capability at all", () => {
    // Found by red-green: this guard had no test, while its comment claimed it made a manifest/bytes
    // mismatch structurally impossible. Each half alone is a distinct way to publish a lie —
    // a target with no encoder NAMES files `.mp4` that nothing writes, and an encoder with no target
    // leaves the decision layer unable to name the file it is about to produce.
    expect(capsFor({ videoTarget: WEB_TIER_H264 }).video).toBeNull();
    expect(capsFor({ encodeVideo: async () => new Blob() }).video).toBeNull();
    expect(capsFor({ encodeVideo: async () => new Blob(), videoTarget: WEB_TIER_H264 }).video).toBe(WEB_TIER_H264);
  });
});

describe("naming: the published file name is a pure function of the stored one, and collisions are resolved", () => {
  it("swaps the extension, case-insensitively, and adds one where there is none", () => {
    expect(renameForTier("folio.tif", "webp")).toBe("folio.webp");
    expect(renameForTier("FOLIO.TIF", "webp")).toBe("FOLIO.webp");
    expect(renameForTier("scan", "webp")).toBe("scan.webp");
    expect(renameForTier("a.b.tiff", "webp")).toBe("a.b.webp");
    expect(renameForTier("folio.tif", null)).toBe("folio.tif");
  });

  it("two sources that WOULD collide get distinct names — otherwise one object's bytes overwrite the other's", () => {
    const { toPublished, toStored } = tierNameMap([{ name: "plate.jpg" }, { name: "plate.png" }, { name: "plate.tif" }], "web", FULL);
    expect(toPublished.get("plate.jpg")).toBe("plate.webp");
    expect(toPublished.get("plate.png")).toBe("plate-2.webp");
    expect(toPublished.get("plate.tif")).toBe("plate-3.webp");
    // Every published name maps back to exactly the stored file it came from.
    expect([...toStored.entries()].sort()).toEqual([["plate-2.webp", "plate.png"], ["plate-3.webp", "plate.tif"], ["plate.webp", "plate.jpg"]]);
  });

  it("an object's recorded `format` wins over the extension; a generic octet-stream does not", () => {
    expect(assetMime("mystery.tif")).toBe("image/tiff"); // extension, through the importer's own table
    expect(assetMime("mystery.bin", "audio/wav")).toBe("audio/wav"); // recorded format wins
    expect(assetMime("folio.tif", "application/octet-stream")).toBe("image/tiff"); // generic ⇒ fall back to the extension
  });
});

// ---------------------------------------------------------------------------------------------

const lib = (objects: Library["exhibits"][number]["objects"]): Library => ({
  id: asLibraryId("lib"),
  title: "L",
  exhibits: [{ id: asExhibitId("ex"), slug: "ex", title: "E", objects }],
});

describe("the library projection keeps source / thumbnail / format / dimensions in step", () => {
  it("archival returns the library UNCHANGED — same object identity, so an archival publish cannot drift", () => {
    const l = lib([{ id: asObjectId("o1"), source: "/assets/folio.tif", label: "f", format: "image/tiff", width: 6000, height: 4000 }]);
    const p = projectLibraryForTier(l, "archival", FULL);
    expect(p.library).toBe(l);
    expect(p.rescaled).toEqual([]);
    expect(p.stored.size).toBe(0);
  });

  it("web rewrites source, thumbnail ref, format and dimensions together", () => {
    const l = lib([{ id: asObjectId("o1"), source: "/assets/folio.tif", label: "f", format: "image/tiff", width: 6000, height: 4000, thumbnail: "/assets-thumb/folio.tif" }]);
    const p = projectLibraryForTier(l, "web", FULL);
    const o = p.library.exhibits[0]!.objects[0]!;
    expect(o.source).toBe("/assets/folio.webp");
    expect(o.thumbnail).toBe("/assets-thumb/folio.webp");
    expect(o.format).toBe("image/webp");
    expect(o.width).toBe(2400); // fitWithin(6000, 4000, 2400) — the SAME function the encoder uses
    expect(o.height).toBe(1600);
    expect(p.stored.get("ex")!.get("folio.webp")).toBe("folio.tif");
  });

  it("an image already under the cap keeps its dimensions and is NOT reported as rescaled", () => {
    const l = lib([{ id: asObjectId("o1"), source: "/assets/small.jpg", label: "s", format: "image/jpeg", width: 1200, height: 900 }]);
    const p = projectLibraryForTier(l, "web", FULL);
    expect(p.library.exhibits[0]!.objects[0]!.width).toBe(1200);
    expect(p.rescaled).toEqual([]);
  });

  it("REPORTS every object whose pixel space moved — the annotation-geometry blocker must not be silent", () => {
    const l = lib([
      { id: asObjectId("big"), source: "/assets/a.tif", label: "a", format: "image/tiff", width: 6000, height: 4000 },
      { id: asObjectId("small"), source: "/assets/b.jpg", label: "b", format: "image/jpeg", width: 800, height: 600 },
    ]);
    const p = projectLibraryForTier(l, "web", FULL);
    expect(p.rescaled.map((r) => r.objectId)).toEqual(["big"]);
    expect(p.rescaled[0]!.from).toEqual({ width: 6000, height: 4000 });
    expect(p.rescaled[0]!.to).toEqual({ width: 2400, height: 1600 });
    expect(p.rescaled[0]!.scale).toBeCloseTo(0.4, 5);
  });

  it("leaves a remote / IIIF source alone — the tier only owns bytes Archie stores", () => {
    const l = lib([{ id: asObjectId("o1"), source: "https://iiif.example/f1/info.json", label: "r", width: 6000, height: 4000 }]);
    const p = projectLibraryForTier(l, "web", FULL);
    expect(p.library.exhibits[0]!.objects[0]!.source).toBe("https://iiif.example/f1/info.json");
    expect(p.rescaled).toEqual([]);
  });

  it("a video asset is RENAMED to the target container, and its format follows the bytes", () => {
    // Superseded by Archie-7e6f (this used to assert the name and format were untouched). The
    // rename is the load-bearing half: site.ts derives the published file name from `source`, so a
    // `.mov` transcoded to MP4 must SAY `.mp4` or the tree serves H.264 bytes under a QuickTime name.
    const l = lib([{ id: asObjectId("v"), source: "/assets/talk.mov", label: "v", format: "video/quicktime", mediaType: "video" }]);
    const p = projectLibraryForTier(l, "web", FULL);
    expect(p.library.exhibits[0]!.objects[0]!.source).toBe("/assets/talk.mp4");
    expect(p.library.exhibits[0]!.objects[0]!.format).toBe("video/mp4");
  });

  it("a video asset keeps its own name and format where NO profile is reachable", () => {
    // The other direction, and the one that must stay true on Firefox/Safari: a passthrough renames
    // nothing. A name that changed without the bytes changing would be the manifest lying.
    const l = lib([{ id: asObjectId("v"), source: "/assets/talk.mov", label: "v", format: "video/quicktime", mediaType: "video" }]);
    const p = projectLibraryForTier(l, "web", { image: true, audio: true, video: null });
    expect(p.library.exhibits[0]!.objects[0]!.source).toBe("/assets/talk.mov");
    expect(p.library.exhibits[0]!.objects[0]!.format).toBe("video/quicktime");
  });
});

// ---------------------------------------------------------------------------------------------

const blob = (s: string, type: string) => new Blob([s], { type });
const IMG: TierDecision = { action: "image-webp", mime: "image/webp", ext: "webp" };
const AUD: TierDecision = { action: "audio-opus", mime: "audio/ogg", ext: "opus" };

describe("applyTier: the encode is injected, and every fallback is COUNTED", () => {
  it("hands the encoder the PINNED params and ships what it returns", async () => {
    const seen: { maxDim: number; quality: number }[] = [];
    const out = await applyTier(blob("src", "image/tiff"), IMG, {
      encodeImage: async (_s, maxDim, quality) => { seen.push({ maxDim, quality }); return blob("encoded", "image/webp"); },
    }, "image/tiff");
    expect(seen).toEqual([{ maxDim: 2400, quality: 0.8 }]);
    expect(await out.bytes.text()).toBe("encoded");
    expect(out.mime).toBe("image/webp");
    expect(out.fellBack).toBe(false);
    expect(tierFallbackCount()).toBe(0);
  });

  it("no image encoder ⇒ archival bytes, and the counter says so", async () => {
    const src = blob("src", "image/tiff");
    const out = await applyTier(src, IMG, {}, "image/tiff");
    expect(out.bytes).toBe(src);
    expect(out.mime).toBe("image/tiff"); // the SOURCE's mime, not the decision's — a fallback tells the truth
    expect(out.fellBack).toBe(true);
    expect(tierFallbackCount()).toBe(1);
    expect(tierFallbacksByReason()["no-image-encoder"]).toBe(1);
  });

  it("no audio encoder ⇒ archival bytes, counted under its OWN reason (this is today's real state)", async () => {
    const out = await applyTier(blob("wav", "audio/wav"), AUD, {}, "audio/wav");
    expect(out.fellBack).toBe(true);
    expect(tierFallbacksByReason()).toMatchObject({ "no-audio-encoder": 1, "no-image-encoder": 0 });
  });

  // VIDEO's two fallbacks, and the SECOND counter they must also move. `applyTier` is the caller that
  // decides to publish an original after a refusal, and `videoSkipCount()`'s stated contract is that
  // such a caller says so. A tally that reads zero while gigabytes of originals ship is exactly the
  // invisibility that counter exists to prevent — so both routes are pinned, not just the local one.
  it("no video encoder ⇒ archival bytes, counted under its own reason AND in videoSkipCount", async () => {
    resetVideoSkipCount();
    const src = blob("mov", "video/quicktime");
    const decision = tierDecision("video/quicktime", "web", { image: true, audio: true, video: null });
    const out = await applyTier(src, decision, {}, "video/quicktime");
    expect(out.bytes).toBe(src);
    expect(out.fellBack).toBe(true);
    expect(tierFallbacksByReason()["no-video-encoder"]).toBe(1);
    expect(videoSkipCount()).toBe(1);
  });

  it("a video encoder that THROWS falls back under `video-encode-failed`, and also counts as a skip", async () => {
    resetVideoSkipCount();
    const src = blob("mov", "video/quicktime");
    const decision = tierDecision("video/quicktime", "web", FULL);
    const out = await applyTier(
      src,
      decision,
      { encodeVideo: async () => { throw new Error("no decoder for h264"); }, videoTarget: WEB_TIER_H264 },
      "video/quicktime",
    );
    expect(out.bytes).toBe(src);
    // The SOURCE's mime, not the decision's — a publish that fell back must not claim video/mp4.
    expect(out.mime).toBe("video/quicktime");
    expect(tierFallbacksByReason()["video-encode-failed"]).toBe(1);
    expect(videoSkipCount()).toBe(1);
  });

  it("a video encode that SUCCEEDS moves neither counter", async () => {
    // The other direction. Without this, a fallback counter stuck at 1 would pass both tests above.
    resetVideoSkipCount();
    const encoded = blob("mp4bytes", "video/mp4");
    const decision = tierDecision("video/quicktime", "web", FULL);
    const out = await applyTier(
      blob("mov", "video/quicktime"),
      decision,
      { encodeVideo: async () => encoded, videoTarget: WEB_TIER_H264 },
      "video/quicktime",
    );
    expect(out.bytes).toBe(encoded);
    expect(out.mime).toBe("video/mp4");
    expect(out.fellBack).toBe(false);
    expect(tierFallbackCount()).toBe(0);
    expect(videoSkipCount()).toBe(0);
  });

  it("an encoder that THROWS never fails the publish — it falls back, under a distinct reason", async () => {
    const src = blob("src", "image/jpeg");
    const out = await applyTier(src, IMG, { encodeImage: async () => { throw new Error("decode failed"); } }, "image/jpeg");
    expect(out.bytes).toBe(src);
    expect(out.fellBack).toBe(true);
    expect(tierFallbacksByReason()).toMatchObject({ "image-encode-failed": 1, "no-image-encoder": 0 });
  });

  it("counts ACCUMULATE across a publish and reset on demand — a count must belong to one projection", async () => {
    await applyTier(blob("a", "image/jpeg"), IMG, {}, "image/jpeg");
    await applyTier(blob("b", "image/jpeg"), IMG, {}, "image/jpeg");
    expect(tierFallbackCount()).toBe(2);
    resetTierFallbacks();
    expect(tierFallbackCount()).toBe(0);
    expect(Object.values(tierFallbacksByReason()).every((n) => n === 0)).toBe(true);
  });

  it("a passthrough decision is not a fallback — the tier did exactly what it decided", async () => {
    const src = blob("mp4", "video/mp4");
    const out = await applyTier(src, { action: "passthrough", mime: "video/mp4", ext: null }, {}, "video/mp4");
    expect(out.bytes).toBe(src);
    expect(out.fellBack).toBe(false);
    expect(tierFallbackCount()).toBe(0);
  });
});
