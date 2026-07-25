import type { Page } from "@playwright/test";

// Every bundled sample exhibit points at a remote image service (Yale IIIF, archive.org, OSM tiles).
// Cutting those off is what makes this suite hermetic — and it also sharpens the assertions: the
// object grid, the filmstrip and the canvas chrome are all rendered from the local manifest, so they
// must be there whether or not a single tile ever arrives. A spec that needed a real tile to pass
// would be testing Yale's uptime.
export async function goOffline(page: Page): Promise<void> {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
}
