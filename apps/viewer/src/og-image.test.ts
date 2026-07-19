// Archie-80c5 — the og:image upsize is probed at build time instead of assuming a level-2 IIIF
// server. Pins the three probe outcomes (ok / definitive-404 / offline-throw) and the brand-card
// fallback. Each test re-imports the module (vi.resetModules) so the build-scoped probe cache
// can't leak one test's verdict into the next; covers come off the checked-in published fixture
// so no cover url is hardcoded.
import { describe, it, expect, vi, afterEach } from "vitest";
import exhibitsJson from "../public/published/exhibits.json";

const iiifExhibit = exhibitsJson.exhibits.find((e) => /^https?:\/\/.+\/full\/[^/]+\/0\//.test(e.cover ?? ""));

async function freshOgImage() {
  vi.resetModules();
  return import("./og-image.js");
}

function stubHead(status: number | "throw"): ReturnType<typeof vi.fn> {
  const impl = status === "throw" ? () => Promise.reject(new Error("offline")) : () => Promise.resolve(new Response(null, { status }));
  const f = vi.fn(impl);
  vi.stubGlobal("fetch", f);
  return f;
}

afterEach(() => vi.unstubAllGlobals());

describe("Archie-80c5 — ogImageFor probes the upsize instead of assuming level 2", () => {
  it("null slug → brand card, no network", async () => {
    const f = stubHead(200);
    const { ogImageFor, CANONICAL_BASE } = await freshOgImage();
    expect(await ogImageFor(null)).toBe(`${CANONICAL_BASE}og-card.png`);
    expect(f).not.toHaveBeenCalled();
  });

  it.skipIf(!iiifExhibit)("probe ok → the upsized cover (level-2 host, unchanged behavior)", async () => {
    stubHead(200);
    const { ogImageFor } = await freshOgImage();
    expect(await ogImageFor(iiifExhibit!.slug)).toMatch(/\/full\/1200,\/0\//);
  });

  it.skipIf(!iiifExhibit)("probe 404 → falls back to the ORIGINAL cover url, not the brand card", async () => {
    stubHead(404);
    const { ogImageFor } = await freshOgImage();
    expect(await ogImageFor(iiifExhibit!.slug)).toBe(iiifExhibit!.cover);
  });

  it.skipIf(!iiifExhibit)("probe throws (offline build) → optimistic upsized url, same as pre-probe", async () => {
    stubHead("throw");
    const { ogImageFor } = await freshOgImage();
    expect(await ogImageFor(iiifExhibit!.slug)).toMatch(/\/full\/1200,\/0\//);
  });

  it.skipIf(!iiifExhibit)("probe result is cached per url — one HEAD per build, not one per page", async () => {
    const f = stubHead(200);
    const { ogImageFor } = await freshOgImage();
    await ogImageFor(iiifExhibit!.slug);
    await ogImageFor(iiifExhibit!.slug);
    expect(f).toHaveBeenCalledOnce();
  });
});
