# ADR-0012 — Self-hosted fonts (drop the Google Fonts runtime dependency)

- **Status:** accepted (2026-06-09, /goal cycle 9)
- **Context:** Every Viewer page and Studio loaded its four families (Cormorant
  Garamond, Crimson Text, Work Sans, JetBrains Mono) from `fonts.googleapis.com`.
  Measured on the published dist (Playwright + Chromium, localhost): the Google
  CSS was the dominant render-blocking resource — 148 ms of a 232 ms FCP on the
  gallery route (~64%), worse on real networks (DNS + TLS to two third-party
  hosts, every cold visit). It also breaks two product promises for the GLAM /
  scholarly audience: published exhibits phoned Google on every view (privacy /
  GDPR), and a "static, no server" exhibit didn't actually work offline or on an
  intranet.
- **Decision:** Vendor the latin + latin-ext woff2 subsets (18 files, 562 KB on
  disk; browsers fetch only the unicode-range slices a page renders) into
  `apps/viewer/public/fonts/` and `apps/studio/public/fonts/`, declared by a
  single `fonts.css` with `font-display: swap`. Heads reference it base-aware:
  Astro pages via `import.meta.env.BASE_URL` (gh-pages deploys under
  `/Archie/viewer/`), Studio via vite's index.html base rewriting. Favicon
  hrefs in Astro pages moved to the same base-aware form (they were absolute
  `/favicon.svg`, broken under a subpath deploy).
- **Regeneration:** fetch the original css2 URL (see git history of any page
  head pre-ADR-0012) with a woff2-capable User-Agent, download each latin/
  latin-ext `@font-face` src, rewrite urls to relative — the loop script lives
  in the /goal session transcript; the operation is a one-shot vendoring, not a
  build step.
- **Consequences:** no third-party request on any route (privacy, offline,
  intranet); render-blocking chain is now same-origin; font bytes are pinned
  (Google can't shift glyphs under us); the repo carries 562 KB of font assets;
  adding a new weight/family means re-vendoring instead of editing a URL.
  The OSD bundle budget (240 KB gz) is unaffected — fonts are static assets,
  not part of the measured JS bundle.
