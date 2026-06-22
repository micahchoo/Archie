# Recipe 06 — WordPress

Embed an Archie library in a WordPress post or page. WordPress has two flavours; the right
recipe depends on whether your theme/plan allows raw `<script>` tags.

> Contract: ADR-0021. Delivered by Phase 1+ (drop) / Phase 2+ (hosted `src`).
> Iframe fallback rationale: **anvil ADR-0006** (Web Component + iframe, nothing else —
> restricted CMSes strip `<script>`).

---

## Path A — Custom HTML block (script-tolerant sites)

Works on self-hosted WordPress (`wordpress.org`) and Business/Commerce plans on
`wordpress.com`, where the block editor's **Custom HTML** block keeps `<script>` and custom
elements.

1. Edit the post → **add a block** → search **"Custom HTML"**.
2. Paste this, replacing the placeholder URLs:

   ```html
   <script
     type="module"
     src="https://cdn.jsdelivr.net/gh/micahchoo/Archie@v1.1/dist/archie-viewer.js"
     crossorigin="anonymous"></script>

   <!-- replace with your own published-tree base URL if you fork -->
   <archie-viewer
     src="https://micahchoo.github.io/Archie/viewer/published/"
     style="display:block;width:100%;height:600px"></archie-viewer>
   ```

3. **Preview** (not just the editor — the editor sometimes blocks scripts even when the
   published page allows them). The library should render.

- Swap `src` for a hosted `.archie.zip` URL (recipe `02`) or drop it entirely for the local
  drop screen (recipe `03`).
- Add `target="#/{slug}/a/{logicalId}"` to deep-link (recipe `04`), or `offline` for a
  no-fetch embed (recipe `05`).
- The inline `style` height matters — the element is `display:inline` by default and would
  otherwise collapse to nothing.

---

## Path B — iframe fallback (script-stripping sites)

Many WordPress themes, security plugins, and `wordpress.com` Free/Personal/Premium plans
**strip `<script>` and custom elements** from post content. The Custom HTML block silently
drops them and you get a blank space. This is exactly the case **anvil ADR-0006** names — the
iframe is the universal floor.

**Step 1 — host a tiny wrapper page** on static hosting you control (GitHub Pages,
`yourmuseum.org`, Netlify — anywhere that serves a raw `.html`). Call it `embed-codex.html`:

```html
<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;height:100%}archie-viewer{display:block;height:100%}</style>
<script type="module"
  src="https://cdn.jsdelivr.net/gh/micahchoo/Archie@v1.1/dist/archie-viewer.js"
  crossorigin="anonymous"></script>
<archie-viewer src="https://yourmuseum.org/libraries/codex.archie.zip"></archie-viewer>
```

**Step 2 — paste an iframe** into the post. An `<iframe>` survives the strippers. Even the
Custom HTML block isn't required on most plans — the classic editor or a shortcode-free HTML
paste works:

```html
<iframe src="https://yourmuseum.org/embed-codex.html"
        style="width:100%;height:600px;border:0"
        loading="lazy"
        title="Codex — Archie viewer"></iframe>
```

**iframe height:** iframes do not auto-grow with content. Use a fixed `height` (above). A
responsive `postMessage` height handshake is possible (anvil ADR-0006 follow-up F1) but the
fixed height is the no-JavaScript floor and works everywhere.

---

## Which path?

- Self-hosted WordPress, or a `.com` Business plan, and the preview renders → **Path A**.
- Preview shows a blank gap where the embed should be, or you're on Free/Personal/Premium →
  **Path B (iframe)**.

When in doubt, **Path B always works** — it's the floor for a reason.
