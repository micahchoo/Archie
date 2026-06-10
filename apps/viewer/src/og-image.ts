// One place that mints og:image URLs (review r8: three copies of URL-minting logic is the
// drift pattern ADR-0013 exists to kill). Cover upsizes via the IIIF Image API size segment;
// anything unexpected falls back to the brand card at the canonical base.
import config from "../../../archie.config.json";
import exhibitsJson from "../public/published/exhibits.json";

export const CANONICAL_BASE = `${config.canonicalOrigin}${config.viewerPath}`;

export const exhibitSlugs: string[] = exhibitsJson.exhibits.map((e) => e.slug);

export function ogImageFor(slug: string | null): string {
  const cover = slug ? (exhibitsJson.exhibits.find((e) => e.slug === slug)?.cover ?? "") : "";
  return /^https?:\/\/.+\/full\/[^/]+\/0\//.test(cover)
    ? cover.replace(/\/full\/[^/]+\/0\//, "/full/1200,/0/")
    : `${CANONICAL_BASE}og-card.png`;
}
