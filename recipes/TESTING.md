# Testing the `<archie-viewer>` embed locally

Two ways to exercise the built embed against the baked published tree. Both are
**same-origin** — the bundle (`/dist/archie-viewer.js`) and the library
(`/apps/viewer/public/published/`) are served from the same host, so no CORS and
no internet are required for the gallery/grid (deep-zoom tiles still come from a
remote IIIF service unless you run `offline`).

Prereqs: a built bundle at `dist/archie-viewer.js` (+ `chunk-*.js`, `reader-*.js`)
and the baked tree at `apps/viewer/public/published/` (both already present).

---

## 1. Manual flow (open it in a real browser)

```bash
cd <repo root>            # .../Archie
python3 -m http.server 8000
```

Open <http://localhost:8000/recipes/try.html>.

**What you should see**

- The **gallery**: a grid of exhibit cards — "The Rosettes", "The Whole
  Manuscript", "Reading the Unreadable", "Where Languages Go Silent", "World map".
- Click a card → that exhibit's **object grid** (folio thumbnails, each with a
  note count).
- Click an object → the **deep-zoom reader**: an OpenSeadragon canvas you can
  pan/zoom, with annotation markers.

**Try the variants** (in `recipes/try.html`, swap a commented-out element in for
the live one):

- **Deep-link** — `target="#/voynich/o/o1"` opens straight to a real object (folio
  `o1`). A note deep-link `target="#/voynich/a/0000000001SEBWXFTSHHP00TVY"` uses a
  real note logicalId but **degrades upward** to the object grid on this published
  tree (its inline notes carry only full-URL ids — no inline `archie:logicalId` —
  and the hash router can't carry a slashed URL; ADR-0021 degrade, never an error).
- **Offline** — add the boolean `offline` attribute. The gallery/grid still render
  from the local tree; opening an object whose tiles are remote shows the offline
  notice instead of fetching.
- **Drop screen** — remove `src` entirely → the "Open a library" drop/pick zone.
  Drag a `.archie.zip` onto it, or click **Open a library…**.
- **Production CDN** — replace the local `<script>` with the jsDelivr line
  (`https://cdn.jsdelivr.net/gh/micahchoo/Archie@v1.1/dist/archie-viewer.js`).

  For production integrity (optional), add `integrity="sha384-2kT6KuVJkm08Btoug0L+OxGYjUhlH7ro/4VY4nLSB9Ysc0youBLptzrp7A4UevNl" crossorigin="anonymous"` — the SHA-384 of v1's `dist/archie-viewer.js`. An SRI hash must be re-computed if the bundle is re-released.

---

## 2. Automated flow (headless smoke test)

```bash
node recipes/smoke.mjs
```

The script is self-contained:

1. Starts a tiny static server over the **repo root** on an ephemeral port (vanilla
   Node `http` + `fs`; no external server dep).
2. Launches **Playwright Chromium** headless (WebGL args: `--use-gl=angle
   --use-angle=swiftshader --enable-unsafe-swiftshader`, retried without them if
   unsupported). Playwright is resolved from the repo-root `node_modules`.
3. Loads `recipes/try.html`, capturing `pageerror` + console-error events.
4. **Asserts** (hard fails):
   - `customElements.get('archie-viewer')` is registered;
   - the element's `shadowRoot` renders gallery cards
     (`ul.grid li button[data-slug]`) within ~15 s;
   - no uncaught page error (benign OSD/WebGL/swiftshader warnings are ignored).
5. **Best-effort** (reported, never a hard fail): clicks into the first exhibit →
   first object and checks whether an OpenSeadragon `canvas` mounts in the shadow
   DOM. Headless WebGL is flaky, so a canvas miss is reported, not failed.

It prints a `PASS`/`FAIL` summary (element registered, gallery-card count, object
count, whether the deep-zoom canvas mounted, console-error count) and exits `0`/`1`.

**If Playwright is missing** (it isn't here — it's a repo dependency with Chromium
cached): `npm i -D playwright && npx playwright install chromium`, then re-run.
