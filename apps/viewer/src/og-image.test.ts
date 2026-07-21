// Archie-80c5 — the og:image upsize is probed at build time instead of assuming a level-2 IIIF
// server. Pins the three probe outcomes (ok / definitive-404 / offline-throw) and the brand-card
// fallback. Each test re-imports the module (vi.resetModules) so the build-scoped probe cache
// can't leak one test's verdict into the next; covers come off the checked-in published fixture
// so no cover url is hardcoded.
import { describe, it, expect, vi, afterEach } from "vitest";
import exhibitsJson from "../public/published/exhibits.json";

const iiifExhibit = exhibitsJson.exhibits.find((e) => /^https?:\/\/.+\/full\/[^/]+\/0\//.test(e.cover ?? ""));
const isUnlisted = (e: { unlisted?: boolean }) => !!e.unlisted;

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

describe("Archie-77b2 — exhibitSlugs is the LISTED enumeration; ogImageFor still resolves unlisted", () => {
  const unlisted = exhibitsJson.exhibits.filter(isUnlisted);
  const listed = exhibitsJson.exhibits.filter((e) => !isUnlisted(e));

  it("the checked-in fixture proves the case (has both listed and unlisted cards)", () => {
    expect(unlisted.length).toBeGreaterThan(0); // screenshots + sampler
    expect(listed.length).toBeGreaterThan(0);
  });

  it("exhibitSlugs (the sitemap source) EXCLUDES every unlisted card, keeps exactly the listed ones", async () => {
    const { exhibitSlugs } = await freshOgImage();
    for (const e of unlisted) expect(exhibitSlugs).not.toContain(e.slug);
    expect(exhibitSlugs).toEqual(listed.map((e) => e.slug));
  });

  it.skipIf(!unlisted.some((e) => /^https?:\/\/.+\/full\/[^/]+\/0\//.test(e.cover ?? "")))(
    "an unlisted exhibit STILL resolves a real og:image (its page is built + reachable, not the brand card)",
    async () => {
      const withCover = unlisted.find((e) => /^https?:\/\/.+\/full\/[^/]+\/0\//.test(e.cover ?? ""))!;
      stubHead(200);
      const { ogImageFor, CANONICAL_BASE } = await freshOgImage();
      const url = await ogImageFor(withCover.slug);
      expect(url).not.toBe(`${CANONICAL_BASE}og-card.png`); // resolved the cover, not the fallback
      expect(url).toMatch(/\/full\/1200,\/0\//);
    },
  );
});
