## Embed an Archie exhibit

`<archie-viewer>` is a lightweight, read-only Web Component — roughly half the bundle of the
full studio, no `unsafe-eval`, no build step — that drops an Archie library into any web page.
A `<script>` tag pulls the runtime from a CDN and one element renders the exhibit.

### Install (2 lines)

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/gh/micahchoo/Archie@v1.1/dist/archie-viewer.js"
  crossorigin="anonymous"></script>

<!-- replace with your own published-tree base URL if you fork -->
<archie-viewer src="https://micahchoo.github.io/Archie/viewer/published/"></archie-viewer>
```

`@v1` is a pinned git tag — pin it so an upstream change can't silently alter your embed.

For production integrity (optional), add `integrity="sha384-2kT6KuVJkm08Btoug0L+OxGYjUhlH7ro/4VY4nLSB9Ysc0youBLptzrp7A4UevNl" crossorigin="anonymous"` — the SHA-384 of v1's `dist/archie-viewer.js`. An SRI hash must be re-computed if the bundle is re-released.

### Attributes (the whole public surface — ADR-0021, frozen)

- **`src`** — a hosted `.archie.zip` URL, *or* a published-tree base URL, *or* absent → a local
  drop screen where the visitor drops their own `.archie.zip` (nothing is fetched).
- **`target`** — a native-route address (the exact string the viewer shows in its address bar)
  that opens to a specific place; an unresolvable target degrades upward, never errors.
- **`offline`** — boolean; present blocks all remote tile/media fetch (kiosk / air-gapped /
  privacy). Pair with a `src` whose tiles are bundled locally.

### Deep-link to a specific place (the cite ladder)

`target` carries the full ladder: Exhibit `#/{slug}` · Object `#/{slug}/o/<id>` ·
Note `#/{slug}/a/<id>` (add `?xywh=x,y,w,h` for a region) · Section `#/{slug}/s/<id>`.

```html
<archie-viewer
  src="https://micahchoo.github.io/Archie/viewer/published/"
  target="#/voynich/a/n3"></archie-viewer>
```

### IIIF Content State interop (new, additive)

For cross-viewer interop you can point an IIIF Presentation 3 **Content State** at the embed via
`iiif-content` (base64url, decoded by `@render/core` `deeplink.ts`). The native `target` route
stays the primary contract — `iiif-content` is the additive bridge from IIIF tooling.

```html
<archie-viewer
  src="https://micahchoo.github.io/Archie/viewer/published/"
  iiif-content="JTdCJTIyJTQwY29udGV4dCUyMi..."></archie-viewer>
```

### iframe fallback (script-stripping CMSes)

Notion, Substack, Squarespace, and locked-down WordPress strip `<script>` and custom elements.
Per anvil **ADR-0006** ("Web Component + iframe, nothing else"), host a tiny page that contains
the script + element, then point an `<iframe>` at it — iframes survive almost every CMS:

```html
<iframe src="https://yourmuseum.org/embed-codex.html"
        style="width:100%;height:600px;border:0" loading="lazy"
        title="Codex — Archie viewer"></iframe>
```
