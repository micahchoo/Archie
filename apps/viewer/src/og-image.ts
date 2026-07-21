// One place that mints og:image URLs (review r8: three copies of URL-minting logic is the
// drift pattern ADR-0013 exists to kill). Cover upsizes via the IIIF Image API size segment;
// anything unexpected falls back to the brand card at the canonical base.
import type { ExhibitsJson } from "@render/core";
import config from "../../../archie.config.json";
import exhibitsRaw from "../public/published/exhibits.json";

// Typed through the core shape so the UNLISTED lever (`card.unlisted`, Archie-77b2) is visible on each
// card regardless of which cards the checked-in JSON happens to carry the flag on.
const exhibitsJson = exhibitsRaw as unknown as ExhibitsJson;

export const CANONICAL_BASE = `${config.canonicalOrigin}${config.viewerPath}`;

// The LISTED enumeration (Archie-77b2): sitemap.xml.ts routes from this, so an `unlisted` exhibit
// drops out of the sitemap. NOTE the split — `ogImageFor` below still resolves a cover for ANY slug
// (an unlisted `/{slug}/` page is built and needs its og:image), and `[slug].astro`'s getStaticPaths
// reads `exhibitsJson.exhibits` directly (ALL cards), so unlisted pages are still generated.
export const exhibitSlugs: string[] = exhibitsJson.exhibits.filter((e) => !e.unlisted).map((e) => e.slug);

// The blind /full/1200,/ upsize assumes a level-2 IIIF server (Archie-80c5): Yale serves it, but a
// level-0 host (static tiles — reachable now that Collection import can bring arbitrary hosts) 404s
// it, and the unfurl shows NO image (the brand-card fallback catches non-MATCHING urls, not dead
// ones). So the upsize is probed at build time, once per url:
//   probe ok        → the upsized cover;
//   404 / 501       → the ORIGINAL cover url (known-good — it's what the viewer itself displays);
//   throw / other   → the upsized cover unprobed (an offline or flaky build must not demote every
//                     level-2 unfurl to the small cover; same optimistic behavior as pre-probe).
const probeCache = new Map<string, Promise<string>>();

function probeUpsize(cover: string, upsized: string): Promise<string> {
  let p = probeCache.get(upsized);
  if (!p) {
    p = fetch(upsized, { method: "HEAD" })
      .then((r) => (r.status === 404 || r.status === 501 ? cover : upsized))
      .catch(() => upsized);
    probeCache.set(upsized, p);
  }
  return p;
}

export async function ogImageFor(slug: string | null): Promise<string> {
  const cover = slug ? (exhibitsJson.exhibits.find((e) => e.slug === slug)?.cover ?? "") : "";
  if (!/^https?:\/\/.+\/full\/[^/]+\/0\//.test(cover)) return `${CANONICAL_BASE}og-card.png`;
  const upsized = cover.replace(/\/full\/[^/]+\/0\//, "/full/1200,/0/");
  return upsized === cover ? cover : probeUpsize(cover, upsized);
}
