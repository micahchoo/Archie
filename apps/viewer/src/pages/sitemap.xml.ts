// sitemap.xml (Archie-b4f2, ADR-0013): static pages only — hash-routed deep links can't
// appear (crawlers ignore fragments). Absolute URLs from the ONE config source.
import { CANONICAL_BASE, exhibitSlugs } from "../og-image.js";

// Routes derive from the published exhibits — the next exhibit can't be forgotten (review r8).
const ROUTES = ["", ...exhibitSlugs.map((s) => `${s}/`)];

export async function GET() {
  const base = CANONICAL_BASE;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${ROUTES.map((r) => `  <url><loc>${base}${r}</loc></url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
}
