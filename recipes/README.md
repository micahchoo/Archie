# Recipes — embedding `<archie-viewer>`

Copy-paste examples for dropping an Archie exhibit into a third-party page (a museum CMS,
WordPress/Ghost, an LMS, a plain HTML file). Each recipe is a complete, minimal page you can
copy, swap the placeholder URLs, and ship.

> ## Honest status banner — READ THIS FIRST
>
> **The `<archie-viewer>` element is being built in phases.** These recipes target the **v1
> public contract** locked in **ADR-0021** (`docs/adr/0021-archie-viewer-target-contract.md`).
> The element ships incrementally — see `docs/plans/EMBED-VIEWER-IMPLEMENTATION-STRATEGY.md`:
>
> | Phase | What works | Recipes it unlocks |
> |-------|-----------|--------------------|
> | **0** | Read-only render path (keystone — no element yet) | — |
> | **1** | The `<archie-viewer>` element + local-zip **drop** | `03-local-drop` |
> | **2** | **`src`** (hosted zip / hosted tree) + **`offline`** | `01`, `02`, `05` |
> | **3** | **`target`** (full cite ladder + degrade-upward) | `04` |
> | **4** | **Multiple instances** on one page | `08` |
>
> So: these recipes are written against the **finished v1 contract**, and they double as
> **integration fixtures** for the phases that deliver each attribute. If you try a recipe before
> its phase lands, it won't work yet — that's expected, not a bug. The contract (attribute names,
> route grammar) is frozen, so a recipe written today stays correct once its phase ships.

---

## What a recipe is

A recipe is the smallest correct way to put one Archie library on one page. It is **not** a
config file or a build step — it is HTML you paste. There is no server, no npm install, no plugin
to install: a `<script>` tag pulls the runtime from a CDN, and one `<archie-viewer>` element
renders the library.

---

## The contract (ADR-0021)

### 1. The script tag

Load the runtime once per page, from **jsDelivr serving a pinned git tag**, with Subresource
Integrity so the host page can't be served tampered code:

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/gh/micahchoo/Archie@v1.1/dist/archie-viewer.js"
  crossorigin="anonymous"></script>
```

- `@v1` is a **pinned tag** — pin it so an upstream change can never silently alter your embed.
- `crossorigin="anonymous"` is required for SRI to work cross-origin.
- A real `integrity="sha384-…"` hash is published with each tagged release; add it to lock the
  exact bytes. (The recipes leave a placeholder so they stay copy-pasteable before a release.)
- `type="module"` — the runtime is an ES module / custom-element definition.

### 2. The element

```html
<archie-viewer
  src="…"
  target="…"
  offline></archie-viewer>
```

Three attributes, and that is the **whole** public surface. Adding attributes later is allowed;
renaming or removing these is not (ADR-0021 — frozen public API).

#### `src` — which library, and from where

| `src` value | Meaning |
|-------------|---------|
| *(absent)* | **Local drop screen** — the visitor drops a `.archie.zip` from their own machine. Nothing is fetched. |
| a `.archie.zip` URL | Fetch + open that hosted zip (e.g. `https://yourmuseum.org/libraries/codex.archie.zip`). |
| a **published-tree base URL** | Open a tree the Studio published to static hosting (e.g. `https://micahchoo.github.io/Archie/viewer/published/` — replace with your own published-tree base URL if you fork). |

A `.archie.zip` carries the **L1 self-identification marker** (`archie.json`, ADR-0020); the
element validates it before parsing and refuses a non-Archie or version-mismatched zip cleanly
instead of rendering garbage.

#### `target` — open to a specific place (the full cite ladder)

`target` is a **native-route address** — *the exact string the viewer shows in its own address
bar*. A curator copies it verbatim. It carries the full five-rung cite ladder:

| Rung | `target` form |
|------|---------------|
| **Exhibit** | `#/{slug}` |
| **Object** | `#/{slug}/o/<objectId>` |
| **Note** | `#/{slug}/a/<logicalId>` |
| **Note + region** | `#/{slug}/a/<logicalId>?xywh=x,y,w,h` |
| **Section** | `#/{slug}/s/<sectionId>` *(new route grammar)* |

A `target` that **cannot be resolved degrades upward, never errors**: a missing note → its
exhibit; a missing region → the whole object; an out-of-range section → the nearest valid
section; a missing exhibit → the library gallery (or the lone exhibit if there is only one). The
visitor always sees *something* — never a blank or error screen.

#### `offline` — block remote fetch

A boolean attribute (present = on). With `offline`, the element **blocks remote tile/media
fetch** — useful for a kiosk, an air-gapped display, or a privacy-conscious page that must not
phone home. Pair it with a `src` whose tiles/media are bundled locally (or with the local drop
screen).

---

## The iframe fallback (anvil ADR-0006)

Some hosts **strip `<script>` tags and custom elements** — Notion, Substack, Squarespace, and
many locked-down WordPress themes. The Web Component simply won't run there.

The universal floor, per **anvil ADR-0006** (*"Web Component + iframe, nothing else"* — the prior
art Archie's embed design adopts), is the **iframe**. Host a tiny page that itself contains the
`<script>` + `<archie-viewer>`, then point an `<iframe>` at it. Iframes survive almost every CMS:

```html
<!-- embed-codex.html — host this on your own static hosting -->
<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;height:100%}archie-viewer{display:block;height:100%}</style>
<script type="module"
  src="https://cdn.jsdelivr.net/gh/micahchoo/Archie@v1.1/dist/archie-viewer.js"
  crossorigin="anonymous"></script>
<archie-viewer src="https://yourmuseum.org/libraries/codex.archie.zip"></archie-viewer>
```

```html
<!-- paste THIS into the restricted CMS -->
<iframe src="https://yourmuseum.org/embed-codex.html"
        style="width:100%;height:600px;border:0"
        loading="lazy"
        title="Codex — Archie viewer"></iframe>
```

> **iframe height note:** iframes do not auto-grow with their content. Give the iframe a fixed
> `height` (above), or wire a `postMessage` height-resize handshake (anvil ADR-0006 follow-up F1).
> The fixed height is the no-JavaScript floor and works everywhere.

The WordPress (`06`) and Ghost (`07`) recipes show both: the `<script>`+element first, and the
iframe fallback if the theme strips it.

---

## CORS + HTTPS notes

When `src` points at **another origin** than the host page (the common case — your zip on
`yourmuseum.org`, your page on `someblog.com`):

- **HTTPS is required.** A browser on an `https://` page refuses to fetch an `http://` resource
  (mixed content), and the strict host CSPs these embeds are designed to run under only allow
  `https:`.
- **CORS is required.** The server hosting the `.archie.zip` (or the published tree) must send
  `Access-Control-Allow-Origin` covering the host page's origin (`*` works for fully public
  libraries). Without it, the browser blocks the cross-origin read and the viewer can't load.
  - GitHub Pages and jsDelivr already send permissive CORS — `01` (GitHub Pages tree) and the CDN
    script tag work cross-origin out of the box.
  - A zip on **your own** server (`02`) needs you to set the CORS header yourself.
- **Same-origin needs neither** — if the page and the zip live on the same origin, CORS doesn't
  apply.

---

## The recipes

| File | Scenario |
|------|----------|
| `01-github-pages.html` | Library published to GitHub Pages — `src` = the tree base URL. |
| `02-self-host-zip.html` | A hosted `.archie.zip` — `src` = the zip URL (CORS note). |
| `03-local-drop.html` | No `src` → the drop-a-zip starting screen. |
| `04-deep-link.html` | `target` a specific note and a specific object (two examples). |
| `05-offline.html` | The `offline` attribute (no remote fetch). |
| `06-wordpress.md` | Paste into a Custom HTML block; iframe fallback. |
| `07-ghost.md` | An HTML card; iframe fallback. |
| `08-multiple-on-one-page.html` | Two embeds on one page (multi-instance = **Phase 4**). |

**Replace if you fork** (the recipes resolve live against `micahchoo.github.io/Archie/viewer/published/`):
`micahchoo.github.io/Archie` (your own GitHub Pages published-tree base),
`yourmuseum.org` (your own hosting), `codex` / `voynich` (your library's exhibit slug),
`sha384-PLACEHOLDER…` (the real SRI hash from the tagged release).
