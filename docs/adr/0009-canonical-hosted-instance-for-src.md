# A canonical hosted Viewer instance backs `?src=` zip URLs

Status: accepted (2026-05-27)

To let a `.archie.zip` be opened from a shareable URL (not only a local file), the portable Viewer (ADR-0008) accepts a **`?src=<zip-url>` query that composes with any hash route** (`#/?src=…` for the gallery, or `#/voynich/a/n3?src=…` to open *and* deep-link), fetches that zip, and renders it. (Grammar refined 2026-05-27 from the original `#/open?src=` shorthand: `src` is a query param, not a path segment, so it can't collide with a slug and it composes with deep-links — see `render-core/src/url/route.ts`.) These links point at **ONE canonical, publicly-hosted Viewer instance** (e.g. the project's own GitHub Pages) rather than requiring each sender to deploy their own shell. The portable Viewer remains a **pure reader** — it *consumes* `?src=` links authored elsewhere (Studio / by hand); it never mints them (no in-Viewer share/cite affordance).

## Considered options

- **Bring-your-own deployed shell** — rejected: a per-sender deploy costs roughly as much setup as Publish, leaving `?src=` no reason to exist.
- **Drop `?src=`** — rejected: the user wants link-sharing without committing a full expanded publish tree; `?src=` is the lighter "share one zip + a link" path.

Stays within the "no server" lock: a static deploy fetching a cross-origin zip client-side is the same category as fetching museum IIIF (§88) — not running a server.

## Consequences

- **Durability commitment.** Minted `?src=` links break if the canonical host moves or dies (two hosts must stay up: the zip's and the Viewer's). Therefore **Publish (one self-contained tree) remains the citation gold path**; `?src=` is shareable-but-cite-with-caveats.
- **Untrusted-content boundary.** The canonical host renders strangers' zips in one shared origin → **defence-in-depth**: DOMPurify on note bodies (already implemented, `render-svelte/sanitize.ts`; §151) + a Content-Security-Policy on the canonical deploy (no inline script) + a `?src=` content-size cap. **CSP caveat (load-bearing):** the seam (ADR-0010) paints media via `blob:` URLs, so the policy MUST include `img-src 'self' blob:` and `media-src 'self' blob:` — a bare `default-src 'self'` would silently break every embedded image/AV. (Per-library *storage* isolation was an SW-cache concern that the chosen P seam sidesteps: P's blob URLs are in-memory, origin-scoped, per-load — nothing persistent to cross-read.)
- **Self-containment.** A zip is offline-complete only for embedded `/assets/` media; remote-IIIF objects still need the network. The Viewer degrades + warns; truly durable zips require export-side media embedding (a cross-scope dependency on Studio publish, §89.1).
- **Relation to §223 ("Multi-library = NO").** §223 governs *published sites* (one baked Library each, no hub/switcher). The canonical instance is a category §223 did not anticipate: a data-less shell that opens *external* libraries by URL or file. §223 still holds — the instance opens ONE library at a time, swap-to-change ("Open another library"), never a multi-library hub, registry, or switcher. A future reader should not read §223 as prohibiting this.
