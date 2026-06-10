// robots.txt — generated so the sitemap pointer consumes the config (no hardcoded origin).
import { CANONICAL_BASE } from "../og-image.js";

export async function GET() {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${CANONICAL_BASE}sitemap.xml\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain" } });
}
