# Recipe 07 — Ghost

Embed an Archie library in a Ghost post or page. Ghost's editor has an **HTML card** that
keeps raw markup, so the Web Component usually works directly; an iframe fallback covers the
cases where a theme or proxy sanitises scripts.

> Contract: ADR-0021. Delivered by Phase 1+ (drop) / Phase 2+ (hosted `src`).
> Iframe fallback rationale: **anvil ADR-0006** (Web Component + iframe, nothing else —
> restricted hosts strip `<script>`).

---

## Path A — HTML card (the normal case)

Ghost's HTML card preserves `<script>` and custom elements, so the Web Component runs.

1. In the editor, click the **`+`** → choose **HTML** (or type `/html`).
2. Paste this into the card, replacing the placeholder URLs:

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

3. **Preview / publish** to test — the Koenig editor shows a placeholder for HTML cards, so
   you won't see the live embed until you preview the rendered post.

- Swap `src` for a hosted `.archie.zip` (recipe `02`) or drop it for the local drop screen
  (recipe `03`).
- Add `target="#/{slug}/o/{objectId}"` to deep-link (recipe `04`), or `offline` for a
  no-fetch embed (recipe `05`).
- Keep the inline `style` height — the element is `display:inline` by default and would
  otherwise collapse.

---

## Path B — iframe fallback

If your Ghost theme, a reverse proxy, or a content filter strips `<script>` / custom elements
(it happens with hardened setups and some hosted-Ghost plans), fall back to the iframe — the
universal floor per **anvil ADR-0006**.

**Step 1 — host a tiny wrapper page** on static hosting you control. Call it `embed-codex.html`:

```html
<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;height:100%}archie-viewer{display:block;height:100%}</style>
<script type="module"
  src="https://cdn.jsdelivr.net/gh/micahchoo/Archie@v1.1/dist/archie-viewer.js"
  crossorigin="anonymous"></script>
<archie-viewer src="https://yourmuseum.org/libraries/codex.archie.zip"></archie-viewer>
```

**Step 2 — put an iframe in the HTML card** instead of the Web Component:

```html
<iframe src="https://yourmuseum.org/embed-codex.html"
        style="width:100%;height:600px;border:0"
        loading="lazy"
        title="Codex — Archie viewer"></iframe>
```

**iframe height:** iframes don't auto-grow with content — use a fixed `height` (above). A
`postMessage` height handshake is possible (anvil ADR-0006 follow-up F1); the fixed height is
the floor that works everywhere.

---

## Which path?

- HTML card renders the embed in preview → **Path A**.
- HTML card preview is blank → **Path B (iframe)**, which always works.
