import { describe, it, expect } from "vitest";
import { assetUrlAgainst } from "./asset-url.js";

// V7 / V11 — one rule, two consumers. The app binds it to `${BASE_URL}published`; the embed binds it
// to whatever tree base its `src=` pointed at. These pin the RULE; each consumer pins its own base.

const BASE = "https://example.org/published";

describe("assetUrlAgainst — tree-relative refs need their library base", () => {
  it("anchors a tree-relative ref to the base", () => {
    // The exact ref that 404'd in the embed drive: measured
    // `HTTP 404 /recipes/screenshots/assets/o1-e1-embed.png`, because `/recipes/` was merely the
    // directory the host page sat in.
    expect(assetUrlAgainst(BASE, "screenshots/assets/o1-e1-embed.png"))
      .toBe("https://example.org/published/screenshots/assets/o1-e1-embed.png");
  });

  it("passes through anything that already knows where it lives", () => {
    for (const u of [
      "https://collections.library.yale.edu/iiif/2/1006231/full/400,/0/default.jpg",
      "http://example.com/a.png",
      "//cdn.example.com/a.png",
      "/published/screenshots/assets/o1.png",
      "data:image/png;base64,iVBORw0KGgo=",
    ]) {
      expect(assetUrlAgainst(BASE, u)).toBe(u);
    }
  });

  it("passes `blob:` through — the ZIP path mints those, and rewriting one breaks it", () => {
    // Covered by the scheme test rather than a special case, but it is WHY the scheme test is first:
    // loadPortableExhibit (ADR-0010) hands out blob URLs for a portable library's assets.
    const blob = "blob:https://example.org/9f0c1b2e-3d4a-4f5b-8c6d-7e8f9a0b1c2d";
    expect(assetUrlAgainst(BASE, blob)).toBe(blob);
  });

  it("does not double the separator when the base carries a trailing slash", () => {
    // The app's base has none and the embed's `src=` conventionally does — `src=".../published/"`.
    // A `//` in the middle of a path is not equivalent to `/` on every static host.
    expect(assetUrlAgainst("https://example.org/published/", "a/b.png"))
      .toBe("https://example.org/published/a/b.png");
    expect(assetUrlAgainst("https://example.org/published///", "a/b.png"))
      .toBe("https://example.org/published/a/b.png");
  });

  it("returns undefined for nothing, so a caller can spread it away", () => {
    // NOT the empty string: `src=""` resolves to the current document, which re-downloads the page
    // as an image — the same class of bug wearing different clothes.
    expect(assetUrlAgainst(BASE, undefined)).toBeUndefined();
    expect(assetUrlAgainst(BASE, null)).toBeUndefined();
    expect(assetUrlAgainst(BASE, "")).toBeUndefined();
    expect(assetUrlAgainst(BASE, "   ")).toBeUndefined();
  });

  it("trims a ref before judging it — whitespace must not defeat the scheme test", () => {
    expect(assetUrlAgainst(BASE, "  https://x.example/a.png  ")).toBe("https://x.example/a.png");
    expect(assetUrlAgainst(BASE, "  a/b.png  ")).toBe(`${BASE}/a/b.png`);
  });

  it("is idempotent, so a double application cannot corrupt a URL", () => {
    // Both consumers may see a ref that has already been resolved (the app applies it at render
    // time over data the embed may have rebased at read time). Applying twice must be a no-op.
    const once = assetUrlAgainst(BASE, "a/b.png")!;
    expect(assetUrlAgainst(BASE, once)).toBe(once);
  });
});
