// recipes/smoke.mjs — headless smoke test for the <archie-viewer> embed.
//
//   pnpm --filter @archie/viewer run gen     # PRECONDITION — see below
//   pnpm --filter archie-viewer build && node scripts/sync-dist.mjs
//   node recipes/smoke.mjs
//
// TWO PRECONDITIONS, both of which fail LOUDLY now but used to fail silently:
//
//  1. The published fixtures must exist. `apps/viewer/public/published/` is GENERATED, not committed,
//     so on a fresh checkout the exhibits this drive names (`voynich`, `voynich-rosettes`) are simply
//     absent. Until 2026-07-26 that produced `6/6 passed, RESULT: PASS` — every capability assertion
//     skipped with an `info` line. It now fails, and the completeness check names each assertion that
//     never ran. Run the viewer's `gen` first.
//  2. `dist/` at the REPO ROOT is what `recipes/try.html` loads — NOT `packages/archie-viewer/dist/`.
//     Rebuilding the package alone leaves this driving the previous bundle and reporting a fixed bug
//     as broken (or, worse, a broken one as fixed). Always `node scripts/sync-dist.mjs` after a build.
//
// Spins up a tiny static server over the REPO ROOT (no external dep), loads
// recipes/try.html in headless Chromium, and ASSERTS the element registers and
// renders its gallery into the shadow DOM. Best-effort: clicks into an exhibit →
// object and reports whether the OpenSeadragon deep-zoom canvas mounts headlessly
// (WebGL under swiftshader is flaky, so a canvas miss is REPORTED, not a hard fail).
//
// Donor selectors come from packages/archie-viewer/src/element.ts (the gallery is
// `ul.grid li button[data-slug]`; the object grid is `button[data-obj]`; the reader
// is `.reader-surface`). The bundle auto-registers on import and lazy-loads the
// reader chunk when an object opens.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

// ---- tiny static file server (repo root) ----------------------------------------
const MIME = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".txt": "text/plain", ".xml": "application/xml",
};
function makeServer() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      let rel = decodeURIComponent(url.pathname);
      // contain to repo root (no traversal), default index for directories
      let abs = normalize(join(REPO_ROOT, rel));
      if (!abs.startsWith(REPO_ROOT)) { res.writeHead(403).end("forbidden"); return; }
      let s = await stat(abs).catch(() => null);
      if (s?.isDirectory()) { abs = join(abs, "index.html"); s = await stat(abs).catch(() => null); }
      if (!s) { res.writeHead(404).end("not found"); return; }
      const body = await readFile(abs);
      res.writeHead(200, { "content-type": MIME[extname(abs)] ?? "application/octet-stream" }).end(body);
    } catch (e) { res.writeHead(500).end(String(e)); }
  });
}

// ---- resolve Playwright (installed at the repo root) ----------------------------
function loadChromium() {
  const require = createRequire(join(REPO_ROOT, "package.json"));
  try {
    const { chromium } = require("playwright");
    return { chromium, how: "repo-root playwright" };
  } catch {
    try {
      const { chromium } = require("playwright-core");
      return { chromium, how: "repo-root playwright-core" };
    } catch (e) {
      throw new Error("Playwright not found at the repo root. Install it (npm i -D playwright && npx playwright install chromium) then re-run. Original: " + e.message);
    }
  }
}

const results = [];
const record = (ok, label, detail = "") => { results.push({ ok, label, detail }); console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`); };

async function main() {
  const { chromium, how } = loadChromium();
  console.log(`archie-viewer smoke test (${how})`);

  const server = makeServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  console.log(`  static server: ${base} (root: ${REPO_ROOT})`);

  let browser;
  // WebGL-friendly launch args; harmless on engines that ignore them.
  const args = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"];
  try {
    browser = await chromium.launch({ headless: true, args });
  } catch (e) {
    // retry without the GL args if the build rejects them
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  }

  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message || String(err)));
  const consoleWarnings = []; // scanned by the detached-fetch assertion — the 2026-07-20 regression
  page.on("console", (msg) => { //  reached the console only as a DOWNGRADED "transient" warning
    if (msg.type() === "error") consoleErrors.push(msg.text());
    if (msg.type() === "warning") consoleWarnings.push(msg.text());
  });

  // V11 (Archie-84e0): every 404 the drive provokes, so a tree-relative asset resolved against the
  // HOST PAGE cannot hide again. It was visible in exactly this flow — `HTTP 404
  // /recipes/screenshots/assets/o1-e1-embed.png` — and nothing was watching for it, because a
  // missing image degrades to a blank box rather than an error.
  //
  // Same-origin only, and only under the served root: the seed exhibits load folios from remote IIIF
  // services this drive has no control over, and a Yale outage must not read as an Archie regression.
  const notFound = [];
  page.on("response", (res) => {
    if (res.status() !== 404) return;
    const url = res.url();
    if (!url.startsWith(base)) return; // third-party — not ours to assert on
    notFound.push(`${res.status()} ${url.slice(base.length)}`);
  });

  // ADR-0019's DROP-justified row (Annotorious/PixiJS out, the canvas engine lazy) made drivable:
  // every bundle chunk fetched BEFORE the first object is opened, scanned for the deep-zoom engine.
  // `eagerGzKB` ratchets the same claim from the metafile; this watches the wire.
  //
  // BY CONTENT, NOT BY FILENAME — and that distinction was earned. The first version of this matched
  // `/dist/reader-*.js`, and the 2026-07-24 leak REINTRODUCED ON PURPOSE sailed straight past it: a
  // static re-export from reader.js makes esbuild hoist OSD into a shared `chunk-*.js` that the entry
  // imports, so the engine arrives eagerly under a name the filter never looked at. Measured — the
  // assertion passed at 33/33 against a build whose `eagerGzKB` had gone 37.6KB → 270.5KB. An
  // assertion that passes against the broken code is worse than no assertion; this one reads the
  // bytes it just downloaded and asks whether OpenSeadragon is in them.
  const galleryPathScripts = [];
  let watchingGalleryPath = true;
  page.on("response", (res) => {
    if (!watchingGalleryPath) return;
    const url = res.url();
    if (!url.startsWith(base) || !/\/dist\/[^/]*\.js$/.test(url)) return;
    void res.text().then(
      (t) => galleryPathScripts.push({
        name: url.slice(base.length),
        // S3: the DROP-justified row names Annotorious and PixiJS as well as OpenSeadragon, and a
        // PixiJS-only leak contains no "openseadragon" string anywhere — the original one-needle scan
        // could not have seen the very dependency the ADR spends its Context section on.
        engine: [
          [/openseadragon/i, "OpenSeadragon"],
          [/\bpixi(?:js)?\b/i, "PixiJS"],
          [/@annotorious|a9s-annotation/i, "Annotorious"],
        ].filter(([re]) => re.test(t)).map(([, label]) => label),
        bytes: t.length,
      }),
      () => {},
    );
  });

  let canvasMounted = false;
  let galleryCount = 0, objCount = 0;
  try {
    await page.goto(`${base}/recipes/try.html`, { waitUntil: "load", timeout: 20000 });

    // (1) element is defined and registered
    const registered = await page.evaluate(() =>
      typeof customElements !== "undefined" && !!customElements.get("archie-viewer"));
    record(registered, "custom element 'archie-viewer' is registered");

    // (2) shadowRoot renders the gallery (wait up to ~15s for exhibit cards)
    galleryCount = await page.waitForFunction(() => {
      const el = document.querySelector("archie-viewer");
      const sr = el && el.shadowRoot;
      if (!sr) return false;
      const cards = sr.querySelectorAll("ul.grid li button[data-slug]");
      return cards.length > 0 ? cards.length : false;
    }, { timeout: 15000, polling: 250 }).then((h) => h.jsonValue()).catch(() => 0);
    record(galleryCount > 0, "gallery cards render in the shadow DOM", `${galleryCount} exhibit card(s)`);

    // (3) no uncaught pageerror (real errors only)
    const realPageErrors = pageErrors.filter((m) => !/openseadragon|webgl|swiftshader|GroupMarker/i.test(m));
    record(realPageErrors.length === 0, "no uncaught page errors",
      realPageErrors.length ? realPageErrors.join(" | ") : "none");

    // (4) no detached-fetch regression ANYWHERE in the run — hard assertion on the precise signature,
    // flake-proof (immune to the WebGL/network noise the soft canvas check tolerates). The 2026-07-20
    // regression surfaced only as a DOWNGRADED console warning on a lazy path; the 0-cards symptom
    // above catches the gallery seam, this catches any future seam past it (reader, tiles, media).
    // See .claude/rules/bound-fetch-defaults.md.
    const illegal = [...pageErrors, ...consoleErrors, ...consoleWarnings].filter((m) => /Illegal invocation/i.test(m));
    record(illegal.length === 0, "no 'Illegal invocation' (detached fetch) anywhere",
      illegal.length ? illegal[0] : "none");

    // (best-effort) click into the first exhibit, then the first object → OSD canvas
    if (galleryCount > 0) {
      await page.evaluate(() => document.querySelector("archie-viewer")
        .shadowRoot.querySelector("ul.grid li button[data-slug]").click());
      objCount = await page.waitForFunction(() => {
        const sr = document.querySelector("archie-viewer").shadowRoot;
        const objs = sr.querySelectorAll("ul.grid li button[data-obj]");
        return objs.length > 0 ? objs.length : false;
      }, { timeout: 15000, polling: 250 }).then((h) => h.jsonValue()).catch(() => 0);
      console.log(`  info  object grid: ${objCount} object(s)`);

      if (objCount > 0) {
        watchingGalleryPath = false; // past this click, the deep-zoom chunk is SUPPOSED to arrive
        await page.evaluate(() => document.querySelector("archie-viewer")
          .shadowRoot.querySelector("ul.grid li button[data-obj]").click());
        // reader-surface appears immediately; the OSD canvas mounts after lazy import + WebGL init.
        canvasMounted = await page.waitForFunction(() => {
          const sr = document.querySelector("archie-viewer").shadowRoot;
          const surface = sr.querySelector(".reader-surface");
          if (!surface) return false;
          return !!surface.querySelector(".openseadragon-canvas, canvas");
        }, { timeout: 15000, polling: 300 }).then(() => true).catch(() => false);
      }
    }
    console.log(`  info  deep-zoom canvas mounted headlessly: ${canvasMounted ? "yes" : "no (best-effort; not a failure)"}`);

    // ---- V68: a REAL mouse click on an annotation region opens its note ----
    //
    // This is the assertion no unit suite can make. The bug was pure hit-testing: OSD wraps every
    // addOverlay element in its own <div> at the default `pointer-events: auto`, which shielded the
    // region geometry underneath. Keyboard Enter worked, a synthetic click() worked, and a real mouse
    // click did nothing at all — so anything dispatching events programmatically reports success.
    // Only a driven pointer sequence, against the BUILT bundle, can catch it.
    //
    // Uses `voynich` explicitly: the first gallery card is an exhibit with zero notes, so it has no
    // regions to click and would pass this vacuously.
    if (canvasMounted) {
      const clicked = await (async () => {
        await page.goto(`${base}/recipes/try.html`, { waitUntil: "load", timeout: 20000 });
        const ok = await page.waitForFunction(() => {
          const sr = document.querySelector("archie-viewer")?.shadowRoot;
          return !!sr?.querySelector('button[data-slug="voynich"]');
        }, { timeout: 15000, polling: 300 }).then(() => true).catch(() => false);
        if (!ok) return { skipped: "no voynich card in this tree" };

        await page.evaluate(() => document.querySelector("archie-viewer").shadowRoot
          .querySelector('button[data-slug="voynich"]').click());
        await page.waitForFunction(() => document.querySelector("archie-viewer").shadowRoot
          .querySelectorAll("ul.grid li button[data-obj]").length > 0, { timeout: 15000, polling: 300 });
        await page.evaluate(() => document.querySelector("archie-viewer").shadowRoot
          .querySelector("ul.grid li button[data-obj]").click());

        const centre = await page.waitForFunction(() => {
          const sr = document.querySelector("archie-viewer").shadowRoot;
          const svg = sr.querySelector('svg[id^="archie-region-"]');
          if (!svg) return false;
          const r = svg.getBoundingClientRect();
          return r.width > 4 && r.height > 4 ? [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] : false;
        }, { timeout: 20000, polling: 300 }).then((h) => h.jsonValue()).catch(() => null);
        if (!centre) return { skipped: "no region overlay rendered" };

        // The wrappers must be out of the hit path, or the click below lands on a bare div.
        const wrappers = await page.evaluate(() => [...document.querySelector("archie-viewer").shadowRoot
          .querySelectorAll('[id^="overlay-wrapper"]')].map((w) => getComputedStyle(w).pointerEvents));
        const hit = await page.evaluate(([x, y]) => {
          const el = document.querySelector("archie-viewer").shadowRoot.elementFromPoint(x, y);
          return el ? el.tagName.toLowerCase() : "null";
        }, centre);

        await page.mouse.click(centre[0], centre[1]);
        await page.waitForTimeout(900);
        const visible = await page.evaluate(() => {
          const c = document.querySelector("archie-viewer").shadowRoot.querySelector(".archie-note-card");
          return c ? !c.hasAttribute("hidden") : false;
        });

        // ---- V43 (Archie-52a0): the selection halo, measured where it can actually be seen ----
        //
        // The unit suite can prove the ring's ATTRIBUTES; only a browser can prove it was painted
        // with real extent and did not become a click shield. Three things, in order of how they
        // failed in development: the ring exists at all; it has non-zero size (a clipped or
        // zero-box overlay is the silent-degrade mode); and the region under it is STILL the
        // topmost hit target, because the ring is drawn directly over the mark it points at and
        // `pointer-events: none` on the svg is defeated by OSD's wrapper exactly as in V68.
        const halo = await page.evaluate(([x, y]) => {
          const sr = document.querySelector("archie-viewer").shadowRoot;
          const el = sr.querySelector("#archie-selection-halo");
          if (!el) return { present: false };
          const r = el.getBoundingClientRect();
          const wrapper = el.parentElement;
          const top = sr.elementFromPoint(x, y);
          return {
            present: true,
            w: Math.round(r.width),
            h: Math.round(r.height),
            rings: el.children.length,
            selfPE: getComputedStyle(el).pointerEvents,
            wrapperPE: wrapper ? getComputedStyle(wrapper).pointerEvents : "none",
            topTag: top ? top.tagName.toLowerCase() : "null",
          };
        }, centre);

        // ---- V55: the note card must not sit on top of the locator mini-map ----
        //
        // Both wanted the same corner: `note-card.ts` anchors bottom-right, and read-mount asks OSD for
        // `navigatorPosition: "BOTTOM_RIGHT"` (read-mount.ts:245). Measured as an intersection of the
        // two rects rather than by eye — an overlap of a few pixels is a different bug from a card
        // sitting squarely on the map, and only the numbers tell them apart.
        const occlusion = await page.evaluate(() => {
          const sr = document.querySelector("archie-viewer").shadowRoot;
          const card = sr.querySelector(".archie-note-card");
          const nav = sr.querySelector(".navigator");
          if (!card || card.hasAttribute("hidden") || !nav) return { measurable: false, card: !!card, nav: !!nav };
          const c = card.getBoundingClientRect();
          const n = nav.getBoundingClientRect();
          const w = Math.max(0, Math.min(c.right, n.right) - Math.max(c.left, n.left));
          const h = Math.max(0, Math.min(c.bottom, n.bottom) - Math.max(c.top, n.top));
          return {
            measurable: true,
            overlap: Math.round(w * h),
            navBox: [n.x, n.y, n.width, n.height].map(Math.round),
            cardBox: [c.x, c.y, c.width, c.height].map(Math.round),
          };
        });

        return { visible, wrappers, hit, centre, halo, occlusion };
      })();

      if (clicked.skipped) {
        // NOT `console.log`. A drive that cannot find its fixture must FAIL, or the whole assertion
        // set evaporates and the run still reports PASS — see the label-completeness check below.
        record(false, "the region pointer drive found its fixture", clicked.skipped);
      } else {
        record(clicked.wrappers.every((pe) => pe === "none"),
          "OSD overlay wrappers are out of the hit path",
          `pointer-events: [${clicked.wrappers.join(", ")}] (all must be none)`);
        record(clicked.hit !== "div",
          "the region geometry is the topmost hit target",
          `elementFromPoint at the region centre → <${clicked.hit}> (a bare <div> means a wrapper is shielding it)`);
        record(clicked.visible,
          "a real mouse click on a region opens its note",
          `clicked ${clicked.centre}; note card ${clicked.visible ? "opened" : "did NOT open"}`);

        const h = clicked.halo ?? { present: false };
        record(h.present && h.rings === 3,
          "the selected region gains a halo (V43)",
          h.present ? `#archie-selection-halo with ${h.rings} rings` : "no #archie-selection-halo in the shadow DOM");
        record(h.present && h.w > 4 && h.h > 4,
          "the halo has real extent (not clipped to nothing)",
          h.present ? `${h.w}×${h.h}px` : "absent");
        record(h.present && h.selfPE === "none" && h.wrapperPE === "none" && h.topTag !== "div",
          "the halo does not shield the mark it points at",
          h.present
            ? `svg pointer-events: ${h.selfPE}, wrapper: ${h.wrapperPE}, topmost at centre: <${h.topTag}>`
            : "absent");

        const occ = clicked.occlusion ?? { measurable: false };
        record(occ.measurable === true && occ.overlap === 0,
          "the open note card does not cover the locator mini-map (V55)",
          occ.measurable
            ? `overlap ${occ.overlap}px² — navigator ${JSON.stringify(occ.navBox)}, card ${JSON.stringify(occ.cardBox)}`
            : `not measurable (card: ${occ.card}, navigator: ${occ.nav})`);
      }
    }
    // ---- V105 (Archie-b681): the embed ships attribution, licence and metadata ----
    //
    // The embed rendered NONE of it, at any level, against published manifests that DO carry
    // `requiredStatement` — which IIIF makes a MUST-display and which apps/viewer renders from the
    // same bytes. That is legal exposure, not a missing feature.
    //
    // The assertion compares the shadow DOM against the MANIFEST's own value, fetched from the same
    // tree the embed just read. Asserting merely that a `.credit` element exists would pass against a
    // credit line showing the wrong work's attribution — which is the failure that actually matters,
    // and exactly how the two consumers could drift apart.
    const credit = await (async () => {
      await page.goto(`${base}/recipes/try.html`, { waitUntil: "load", timeout: 20000 });
      const ok = await page.waitForFunction(() => {
        const sr = document.querySelector("archie-viewer")?.shadowRoot;
        return !!sr?.querySelector('button[data-slug="voynich"]');
      }, { timeout: 15000, polling: 300 }).then(() => true).catch(() => false);
      if (!ok) return { skipped: "no voynich card in this tree" };

      // EXHIBIT level first — the credit must be on the exhibit view, not only inside the reader.
      await page.evaluate(() => document.querySelector("archie-viewer").shadowRoot
        .querySelector('button[data-slug="voynich"]').click());
      await page.waitForFunction(() => document.querySelector("archie-viewer").shadowRoot
        .querySelectorAll("ul.grid li button[data-obj]").length > 0, { timeout: 15000, polling: 300 });
      const exhibitCredit = await page.evaluate(() => {
        const el = document.querySelector("archie-viewer").shadowRoot.querySelector("header.intro .credit .line");
        return el ? el.textContent.trim() : null;
      });
      // Dublin Core rows (Archie-c6bf) ride the SAME already-resolved RightsFields — no second fetch.
      const exhibitMetaRows = await page.evaluate(() => [...document.querySelector("archie-viewer").shadowRoot
        .querySelectorAll("header.intro .credit .panel p")].map((p) => p.querySelector(".k")?.textContent.trim()));

      // OBJECT level — the reader shows the OBJECT's own credit (no display-time inheritance, the Q5
      // rule apps/viewer's ExhibitView.svelte states and this mirrors).
      const objId = await page.evaluate(() => document.querySelector("archie-viewer").shadowRoot
        .querySelector("ul.grid li button[data-obj]").dataset.obj);
      await page.evaluate(() => document.querySelector("archie-viewer").shadowRoot
        .querySelector("ul.grid li button[data-obj]").click());
      const objectCredit = await page.waitForFunction(() => {
        const el = document.querySelector("archie-viewer").shadowRoot.querySelector(".topbar .credit .line");
        return el ? el.textContent.trim() : false;
      }, { timeout: 15000, polling: 250 }).then((h) => h.jsonValue()).catch(() => null);
      const licenceHref = await page.evaluate(() => {
        const a = document.querySelector("archie-viewer").shadowRoot.querySelector(".topbar .credit .panel a");
        return a ? a.getAttribute("href") : null;
      });

      // The manifest's OWN values, read from the same published tree.
      const truth = await page.evaluate(async ([b, id]) => {
        // The same tree the element's `src=` names in try.html — the server roots at the repo.
        const m = await (await fetch(`${b}/apps/viewer/public/published/voynich/manifest.json`)).json();
        const lm = (v) => (v && typeof v === "object" ? Object.values(v)[0].join(" ") : v);
        const canvas = m.items.find((c) => c.id.endsWith(`/canvas/${id}`));
        return {
          exhibit: m.requiredStatement ? lm(m.requiredStatement.value) : null,
          exhibitMetaLabels: (m.metadata ?? []).map((e) => lm(e.label)),
          object: canvas?.requiredStatement ? lm(canvas.requiredStatement.value) : null,
          objectRights: canvas?.rights ?? null,
        };
      }, [base, objId]);
      return { exhibitCredit, exhibitMetaRows, objectCredit, licenceHref, truth, objId };
    })();

    if (credit.skipped) {
      record(false, "the credit drive found its fixture", credit.skipped);
    } else {
      record(credit.truth.exhibit !== null && credit.exhibitCredit === credit.truth.exhibit,
        "the exhibit view shows the manifest's requiredStatement (V105)",
        `rendered ${JSON.stringify(credit.exhibitCredit)} vs manifest ${JSON.stringify(credit.truth.exhibit)}`);
      record(credit.truth.object !== null && credit.objectCredit === credit.truth.object,
        "the reader shows the OBJECT's own requiredStatement (V105)",
        `${credit.objId}: rendered ${JSON.stringify(credit.objectCredit)} vs manifest ${JSON.stringify(credit.truth.object)}`);
      record(credit.truth.objectRights !== null && credit.licenceHref === credit.truth.objectRights,
        "the reader links the object's licence URI (V105)",
        `href ${JSON.stringify(credit.licenceHref)} vs manifest rights ${JSON.stringify(credit.truth.objectRights)}`);
      // Every Dublin Core label the manifest carries must appear in the disclosure. Asserting the
      // COUNT alone would pass against a panel that rendered the licence row three times.
      const wantLabels = credit.truth.exhibitMetaLabels ?? [];
      const missing = wantLabels.filter((l) => !credit.exhibitMetaRows.includes(l));
      record(wantLabels.length > 0 && missing.length === 0,
        "the disclosure carries the manifest's Dublin Core metadata (V105 / Archie-c6bf)",
        wantLabels.length === 0 ? "no metadata in this manifest — assertion would be vacuous"
          : `manifest labels [${wantLabels.join(", ")}]; rendered [${credit.exhibitMetaRows.join(", ")}]${missing.length ? ` — MISSING ${missing.join(", ")}` : ""}`);
    }

    // ================================================================================================
    // ADR-0019 CAPABILITY CONTRACT — one block per MUST row of the table in that ADR.
    // ================================================================================================
    //
    // WHY THIS IS CAPABILITY-DRIVEN AND NOT FILE-DRIVEN. annomea's EMBED-AUDIT.md found its whole
    // Channel-3 Web Component had evaporated, and explains why the audit before it could not see the
    // loss: that audit compared FILES, annomea had no embed/ directory, so every counterpart "had zero
    // counterpart to compare against and was invisible by construction" (:15). Archie lost object
    // navigation, the note list, Readings, the narrative and its whole visual language exactly that
    // way, with every unit suite green. A check that asks "does the built bundle DO this?" cannot be
    // fooled by the absence of the file that used to do it. annomea proposed no gate — this is ours.
    //
    // Every assertion below was proven RED-GREEN: the capability was deleted, this failed, it was
    // restored. An assertion that passes against the broken code is worse than no assertion.
    const contract = await (async () => {
      const open = async (slug) => {
        await page.goto(`${base}/recipes/try.html`, { waitUntil: "load", timeout: 20000 });
        const ok = await page.waitForFunction((s) => {
          const sr = document.querySelector("archie-viewer")?.shadowRoot;
          return !!sr?.querySelector(`button[data-slug="${s}"]`);
        }, slug, { timeout: 15000, polling: 300 }).then(() => true).catch(() => false);
        if (!ok) return false;
        await page.evaluate((s) => document.querySelector("archie-viewer").shadowRoot
          .querySelector(`button[data-slug="${s}"]`).click(), slug);
        return true;
      };
      const sr = (fn, arg) => page.evaluate(fn, arg);

      if (!(await open("voynich"))) return { skipped: "no voynich card in this tree" };
      await page.waitForFunction(() => document.querySelector("archie-viewer").shadowRoot
        .querySelectorAll("ul.grid li button[data-obj]").length > 1, { timeout: 15000, polling: 300 });
      // Truth for the nav assertion: the SECOND object's label, straight off the grid we are leaving.
      const secondLabel = await sr(() => document.querySelector("archie-viewer").shadowRoot
        .querySelectorAll("ul.grid li button[data-obj]")[1].querySelector(".title").textContent.trim());
      const objId = await sr(() => document.querySelector("archie-viewer").shadowRoot
        .querySelector("ul.grid li button[data-obj]").dataset.obj);
      await page.evaluate(() => document.querySelector("archie-viewer").shadowRoot
        .querySelector("ul.grid li button[data-obj]").click());
      // The reading pane is lazy; wait for it rather than racing it.
      const paneUp = await page.waitForFunction(() => {
        const s = document.querySelector("archie-viewer").shadowRoot;
        return !!s.querySelector(".reader-aside .rc-aside");
      }, { timeout: 20000, polling: 250 }).then(() => true).catch(() => false);
      if (!paneUp) return { paneUp: false };

      // ---- V30: object navigation --------------------------------------------------------------
      // The audit's measurement was the reader's ENTIRE visible control set on a 12-object exhibit:
      // `["← The Whole Manuscript"]`. So the assertion is on the control set, and then on the control
      // actually working — a disabled-looking Next that navigates nowhere is the same failure.
      const controls = await sr(() => [...document.querySelector("archie-viewer").shadowRoot
        .querySelectorAll(".reader-aside button, .topbar button")].map((b) => b.textContent.trim()));
      const posText = await sr(() => document.querySelector("archie-viewer").shadowRoot
        .querySelector(".rc-pos")?.textContent.trim() ?? null);
      await sr(() => document.querySelector("archie-viewer").shadowRoot
        .querySelector('.rc-step[data-act="next"]')?.click());
      const afterNext = await page.waitForFunction((want) => {
        const t = document.querySelector("archie-viewer").shadowRoot.querySelector(".topbar .title");
        return t && t.textContent.trim() === want ? t.textContent.trim() : false;
      }, secondLabel, { timeout: 15000, polling: 250 }).then((h) => h.jsonValue()).catch(() => null);

      // ---- V70 + V56: the note list and the reading legend, back on the FIRST object -------------
      if (!(await open("voynich"))) return { skipped: "no voynich card on the second pass" };
      await page.waitForFunction(() => document.querySelector("archie-viewer").shadowRoot
        .querySelectorAll("ul.grid li button[data-obj]").length > 0, { timeout: 15000, polling: 300 });
      await page.evaluate(() => document.querySelector("archie-viewer").shadowRoot
        .querySelector("ul.grid li button[data-obj]").click());
      await page.waitForFunction(() => !!document.querySelector("archie-viewer").shadowRoot
        .querySelector(".reader-aside .rc-aside"), { timeout: 20000, polling: 250 }).catch(() => {});

      // TRUTH, from the same published tree: the canvas's BASE annotation page, and its per-reading
      // pages. Asserting "the list is non-empty" would pass against a list showing one wrong note.
      const truth = await page.evaluate(async ([b, id]) => {
        const m = await (await fetch(`${b}/apps/viewer/public/published/voynich/manifest.json`)).json();
        const canvas = m.items.find((c) => c.id.endsWith(`/canvas/${id}`));
        const pages = canvas?.annotations ?? [];
        const readings = await (await fetch(`${b}/apps/viewer/public/published/voynich/readings.json`)).json();
        const perReading = {};
        for (const r of readings) {
          const p = pages.find((pg) => pg.id.endsWith(`/annotations-${r.id}.json`));
          perReading[r.id] = (p?.items ?? []).length;
        }
        return {
          base: (pages.find((p) => p.id.endsWith("/annotations.json"))?.items ?? []).length,
          readings,
          perReading,
          // S2: the implementation (reader-chrome.ts) offers the readings that actually have notes on
          // THIS object — a legend row that lights up nothing is a lie. So the expectation has to be
          // the same set. Comparing against EVERY reading in readings.json agreed with the code only
          // by fixture coincidence (all three happen to touch o1) and would have broken, wrongly, the
          // first time someone added a reading that skips a folio.
          readingsHere: readings.filter((r) => (perReading[r.id] ?? 0) > 0),
        };
      }, [base, objId]);

      const list = await sr(() => {
        const s = document.querySelector("archie-viewer").shadowRoot;
        const rows = [...s.querySelectorAll(".rc-notes button")];
        return { count: rows.length, previews: rows.map((r) => r.textContent.trim()) };
      });
      // A row is a DOOR: clicking it must open the note body, not merely highlight itself.
      const rowOpens = await (async () => {
        await sr(() => document.querySelector("archie-viewer").shadowRoot
          .querySelector(".rc-notes button")?.click());
        await page.waitForTimeout(400);
        return sr(() => {
          const s = document.querySelector("archie-viewer").shadowRoot;
          const card = s.querySelector(".archie-note-card");
          return {
            open: card ? !card.hasAttribute("hidden") : false,
            body: card?.querySelector(".archie-note-card__body")?.textContent.trim().slice(0, 60) ?? "",
            current: !!s.querySelector('.rc-notes button[aria-current="true"]'),
          };
        });
      })();

      const legend = await sr(() => {
        const s = document.querySelector("archie-viewer").shadowRoot;
        return [...s.querySelectorAll(".rc-legend .rc-opt")].map((o) => ({
          id: o.dataset.reading,
          name: o.querySelector(".rc-nm").textContent.trim(),
          count: Number(o.querySelector(".rc-ct").textContent.trim()),
          // The swatch IS the mark: these attributes are handed over verbatim from
          // render-core's readingMarkerStyle, so asserting them asserts the shared call.
          stroke: o.querySelector(".rc-sw rect")?.getAttribute("stroke") ?? null,
          strokeOpacity: o.querySelector(".rc-sw rect")?.getAttribute("stroke-opacity") ?? null,
          fillOpacity: o.querySelector(".rc-sw rect")?.getAttribute("fill-opacity") ?? null,
        }));
      });

      // Pick the first reading and check the CANVAS changed colour — the audit's "zero coloured marks"
      // is about the image, not the panel. Compare in resolved rgb(): a hex in `style.color` reads back
      // normalised, so the expectation is normalised the same way through the browser itself.
      // Base notes stay on the canvas when a reading is picked (ADR-0007 / Q16 — a reading OVERLAYS the
      // base), so "every mark is the reading's colour" would be the WRONG assertion: it would demand a
      // regression. The claim that matters is a transition — the reading's hue is absent from the
      // canvas before, present after, and every other mark is the base colour, not a third thing.
      const readMarks = (colour, baseColour) => sr(([c, bc]) => {
        const s = document.querySelector("archie-viewer").shadowRoot;
        const resolve = (hex) => {
          const probe = document.createElement("span");
          probe.style.color = hex;
          document.body.appendChild(probe);
          const v = getComputedStyle(probe).color;
          probe.remove();
          return v;
        };
        const svgs = [...s.querySelectorAll('svg[id^="archie-region-"]')];
        return {
          want: resolve(c),
          wantBase: resolve(bc),
          colours: svgs.map((v) => v.style.color).filter(Boolean),
          widths: svgs.map((v) => v.firstElementChild?.getAttribute("stroke-width")).filter(Boolean),
        };
      }, [colour, baseColour]);

      const firstReading = truth.readingsHere[0];
      // reader-chrome.ts BASE_MARK_COLOUR — the one constant the legend's General swatch and the canvas
      // both read, so the smoke test names it once here too rather than inventing a second expectation.
      const BASE_MARK_COLOUR = "#6B7D6A";
      const marks = firstReading ? await (async () => {
        const before = await readMarks(firstReading.colour, BASE_MARK_COLOUR);
        await sr((id) => document.querySelector("archie-viewer").shadowRoot
          .querySelector(`.rc-legend .rc-opt[data-reading="${id}"]`)?.click(), firstReading.id);
        await page.waitForTimeout(900);
        const after = await readMarks(firstReading.colour, BASE_MARK_COLOUR);
        return { ...after, beforeColours: before.colours };
      })() : null;

      // ---- V56, the path the first drive never walked: STEP an object with a reading active -------
      //
      // This is where V56 came back (2026-07-25). `#markColours` was populated by the pane mount,
      // which runs AFTER the canvas paints, so an object opened with a reading already active painted
      // every mark in the BASE colour and nothing repainted. The legend showed the reading checked,
      // with its green swatch, over a canvas with no green — the audit's original symptom exactly.
      //
      // The old drive could not see it: it picked a reading on a freshly-opened FIRST object (where
      // the mount order happens to work out) and only ever stepped objects with no reading active.
      // Both halves of the ordering matter, so the drive now does both, in that order.
      const stepped = firstReading ? await (async () => {
        await sr(() => document.querySelector("archie-viewer").shadowRoot
          .querySelector('.rc-step[data-act="next"]')?.click());
        await page.waitForFunction(() => !!document.querySelector("archie-viewer").shadowRoot
          .querySelector(".reader-aside .rc-aside"), { timeout: 20000, polling: 250 }).catch(() => {});
        await page.waitForTimeout(1200);
        const after = await readMarks(firstReading.colour, BASE_MARK_COLOUR);
        const legendStillOn = await sr((id) => {
          const sh = document.querySelector("archie-viewer").shadowRoot;
          const opt = sh.querySelector(`.rc-legend .rc-opt[data-reading="${id}"]`);
          return opt ? opt.getAttribute("aria-checked") === "true" : false;
        }, firstReading.id);
        return { ...after, legendStillOn };
      })() : null;

      // ---- V9/V31/V69: the SHARED token layer ----------------------------------------------------
      // Not "does a token exist" — does the value in the shadow root equal the shell's own file? A
      // second, drifted copy is exactly what passes a mere existence check.
      const tokens = await page.evaluate(async (b) => {
        const css = await (await fetch(`${b}/packages/render-core/src/tokens.css`)).text();
        const want = {};
        for (const name of ["--ink-canvas-primary", "--surface-canvas", "--accent", "--radius-md"]) {
          want[name] = (new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1] ?? "").trim();
        }
        const host = document.querySelector("archie-viewer");
        const cs = getComputedStyle(host);
        const got = {};
        for (const name of Object.keys(want)) got[name] = cs.getPropertyValue(name).trim();
        // The retired literals the audit named (white + orange, pre-Verdant). Their presence in the
        // embed's own rules means a second design system came back.
        const style = host.shadowRoot.querySelector("style")?.textContent ?? "";
        const legacy = ["#d2641e", "#f6efe9", "#2a2320", "#c9a98f"].filter((h) => style.includes(h));
        return { want, got, legacy };
      }, base);

      // ---- Reading LIFETIME: a Reading id is exhibit-scoped and must not follow you out ----------
      //
      // `voynich` and `voynich-rosettes` publish reading ids that are literally the same strings
      // (cipher / hoax / abjad). So without a reset at the exhibit boundary, picking "Cipher reading"
      // in one silently activates a DIFFERENT curator's cipher layer in the other — a layer the
      // visitor never chose, presented as if they had. This drives the boundary the `#activeReading`
      // docblock claims: kept across objects (asserted above by the step drive), cleared across
      // exhibits. The docblock has been wrong twice; it is asserted now rather than believed.
      const lifetime = await (async () => {
        // NAVIGATE IN-PAGE. `open()` does a full page.goto, which re-creates the element and gives it
        // a fresh `#activeReading` — so a reload-based version of this assertion passes whether or not
        // the reset exists. Verified: with the reset deleted it still reported 41/41 PASS. Element
        // state can only be tested across navigations the ELEMENT performs, so this walks the reader's
        // own way out (back to the grid, back to the gallery) and opens the sibling exhibit by click.
        const up = async (sel) => {
          const ok = await sr((q) => {
            const b = document.querySelector("archie-viewer").shadowRoot.querySelector(q);
            if (!b) return false;
            b.click();
            return true;
          }, sel);
          if (ok) await page.waitForTimeout(400);
          return ok;
        };
        if (!(await up('.topbar [data-act="back"]'))) return { skipped: "no way back from the reader" };
        if (!(await up('.topbar [data-act="back"]'))) return { skipped: "no way back to the gallery" };
        const opened = await up('button[data-slug="voynich-rosettes"]');
        if (!opened) return { skipped: "no voynich-rosettes card in this tree" };
        await page.waitForFunction(() => document.querySelector("archie-viewer").shadowRoot
          .querySelectorAll("ul.grid li button[data-obj]").length > 0, { timeout: 15000, polling: 300 });
        await page.evaluate(() => document.querySelector("archie-viewer").shadowRoot
          .querySelector("ul.grid li button[data-obj]").click());
        await page.waitForFunction(() => !!document.querySelector("archie-viewer").shadowRoot
          .querySelector(".rc-legend .rc-opt"), { timeout: 20000, polling: 250 }).catch(() => {});
        return sr(() => {
          const sh = document.querySelector("archie-viewer").shadowRoot;
          const opts = [...sh.querySelectorAll(".rc-legend .rc-opt")];
          const on = opts.find((o) => o.getAttribute("aria-checked") === "true");
          return {
            skipped: false,
            checked: on ? (on.dataset.reading || "(base)") : "(none)",
            names: opts.map((o) => o.querySelector(".rc-nm").textContent.trim()),
          };
        });
      })();

      // ---- AV playback: the one MUST row that had no smoke label at all ---------------------------
      //
      // Every other MUST row is asserted here, so the label-completeness check covers them. AV was
      // covered by unit tests only — and a unit test cannot say WHICH body a row displays, which is
      // exactly where the residual S1 defect lived: the uncued whole-recording row took the current
      // styling while still showing the previously-selected row's text. Current-looking, someone
      // else's words. The hole in the contract and the defect were in the same place, which is the
      // argument for closing it rather than documenting it.
      const av = await (async () => {
        if (!(await open("voynich"))) return { skipped: "no voynich card" };
        await page.waitForFunction(() => document.querySelector("archie-viewer").shadowRoot
          .querySelectorAll("ul.grid li button[data-obj]").length > 0, { timeout: 15000, polling: 300 });
        // The sonified folio (ex-voynich.o12) — found by its media kind, not by grid position, so a
        // reordered exhibit reports "no AV object" rather than silently asserting on an image.
        const opened = await page.evaluate(() => {
          const sh = document.querySelector("archie-viewer").shadowRoot;
          const btn = [...sh.querySelectorAll("ul.grid li button[data-obj]")]
            .find((b) => b.querySelector(".cover .kind")?.textContent.trim() === "Audio");
          if (!btn) return null;
          btn.click();
          return btn.dataset.obj;
        });
        if (!opened) return { skipped: "no audio object in this exhibit" };

        const ready = await page.waitForFunction(() => {
          const sh = document.querySelector("archie-viewer").shadowRoot;
          return !!sh.querySelector("audio") && sh.querySelectorAll(".rc-notes button").length > 0;
        }, { timeout: 20000, polling: 250 }).then(() => true).catch(() => false);
        if (!ready) return { skipped: "AV player or note list never mounted" };

        // Partition the reader's rows by whether the PLAYER has a cue for them: a timed note travels,
        // an uncued whole-recording note does not. Read from the DOM rather than hardcoded, so this
        // keeps meaning what it says if the fixture's notes change.
        const rows = await sr(() => {
          const sh = document.querySelector("archie-viewer").shadowRoot;
          // Cue start times come off the player's own "m:ss" labels, so the expectation is the cue's
          // real start rather than a hardcoded number.
          const secs = (t) => t.split(":").reduce((n, part) => n * 60 + Number(part), 0);
          const cues = new Map([...sh.querySelectorAll("[data-cue]")]
            .map((c) => [c.dataset.cue, secs(c.querySelector(".t").textContent.trim())]));
          return [...sh.querySelectorAll(".rc-notes button")].map((b) => ({
            id: b.dataset.note,
            timed: cues.has(b.dataset.note),
            start: cues.get(b.dataset.note) ?? null,
            text: b.textContent.trim().slice(0, 40),
          }));
        });
        // A cue that starts at 0:00 cannot demonstrate a SEEK — the playhead is already there, so
        // "did it travel" is unanswerable. Prefer a cue with somewhere to travel to. (The first timed
        // note in this fixture starts at 0, which is what made the first version of this assertion
        // report a false failure: the code was right and the expectation was not.)
        const timed = rows.find((r) => r.timed && r.start > 0) ?? rows.find((r) => r.timed);
        const uncued = rows.find((r) => !r.timed);

        const read = () => sr(() => {
          const sh = document.querySelector("archie-viewer").shadowRoot;
          const card = sh.querySelector(".archie-note-card");
          const cur = sh.querySelector('.rc-notes button[aria-current="true"]');
          return {
            open: card ? !card.hasAttribute("hidden") : false,
            body: card?.querySelector(".archie-note-card__body")?.textContent.trim().slice(0, 60) ?? "",
            current: cur ? cur.dataset.note : null,
            at: sh.querySelector("audio")?.currentTime ?? -1,
          };
        });

        let afterTimed = null, afterUncued = null;
        if (timed) {
          await sr((id) => document.querySelector("archie-viewer").shadowRoot
            .querySelector(`.rc-notes button[data-note="${id}"]`).click(), timed.id);
          await page.waitForTimeout(600);
          afterTimed = await read();
        }
        if (uncued) {
          await sr((id) => document.querySelector("archie-viewer").shadowRoot
            .querySelector(`.rc-notes button[data-note="${id}"]`).click(), uncued.id);
          await page.waitForTimeout(600);
          afterUncued = await read();
        }
        return { rowCount: rows.length, timed, uncued, afterTimed, afterUncued };
      })();

      // ---- V88: the narrative spine --------------------------------------------------------------
      if (!(await open("voynich-reading"))) return { skipped: "no voynich-reading card in this tree" };
      const narrativeTruth = await page.evaluate(async (b) => {
        const m = await (await fetch(`${b}/apps/viewer/public/published/voynich-reading/manifest.json`)).json();
        const lm = (v) => (v && typeof v === "object" ? Object.values(v)[0].join(" ") : v);
        return { sections: (m.structures ?? []).length, titles: (m.structures ?? []).map((r) => lm(r.label)) };
      }, base);
      const entered = await page.waitForFunction(() => !!document.querySelector("archie-viewer")
        .shadowRoot.querySelector('[data-act="narrative"]'), { timeout: 15000, polling: 250 })
        .then(() => true).catch(() => false);
      let narrative = { entered };
      if (entered) {
        await sr(() => document.querySelector("archie-viewer").shadowRoot
          .querySelector('[data-act="narrative"]').click());
        await page.waitForFunction(() => !!document.querySelector("archie-viewer").shadowRoot
          .querySelector(".nr-sections li"), { timeout: 20000, polling: 250 }).catch(() => {});
        narrative = await sr(() => {
          const s = document.querySelector("archie-viewer").shadowRoot;
          const rows = [...s.querySelectorAll(".nr-sections button")];
          const active = s.querySelector('.nr-sections button[aria-current="true"]');
          return {
            entered: true,
            count: rows.length,
            titles: rows.map((r) => r.querySelector(".nr-num")?.textContent.trim() ?? ""),
            proseChars: active?.querySelector(".nr-prose")?.textContent.trim().length ?? 0,
            activeIndex: rows.indexOf(active),
          };
        });
        await sr(() => document.querySelector("archie-viewer").shadowRoot
          .querySelector('.nr-stepper button[data-act="next-section"]')?.click());
        // WAIT for the condition, do NOT sleep at it. A section step that changes OBJECT tears down
        // and remounts the canvas before the pane comes back, which a fixed 700ms lost a race with —
        // observed as `active section 0 → -1` (no row current, because the pane was mid-remount). The
        // flake was in this assertion, not the product; a timeout here still fails, but only after the
        // app has genuinely had its chance.
        narrative.afterNext = await page.waitForFunction(() => {
          const sh = document.querySelector("archie-viewer").shadowRoot;
          const rows = [...sh.querySelectorAll(".nr-sections button")];
          const i = rows.indexOf(sh.querySelector('.nr-sections button[aria-current="true"]'));
          return i > 0 ? i : false; // 0 is the starting section — keep waiting for the step to land
        }, { timeout: 20000, polling: 200 }).then((h) => h.jsonValue()).catch(() => -1);
      }

      return { controls, posText, secondLabel, afterNext, truth, list, rowOpens, legend, marks, stepped, lifetime, av, tokens, narrative, narrativeTruth };
    })();

    if (contract.skipped) {
      record(false, "the capability-contract drive found its fixtures", contract.skipped);
    } else if (contract.paneUp === false) {
      record(false, "ADR-0019 contract: the reader's reading pane mounts", "no .rc-aside in the shadow DOM after opening an object");
    } else {
      // --- object navigation (MUST) ---
      const hasBack = contract.controls.some((c) => /Back to Exhibit/i.test(c));
      const hasPrev = contract.controls.some((c) => /Prev/i.test(c));
      const hasNext = contract.controls.some((c) => /Next/i.test(c));
      record(hasBack && hasPrev && hasNext,
        "ADR-0019 MUST · object navigation is present in the reader (V30)",
        `control set ${JSON.stringify(contract.controls)}; position ${JSON.stringify(contract.posText)}`);
      record(contract.afterNext === contract.secondLabel,
        "ADR-0019 MUST · Next actually opens the next object (V30)",
        `after Next the reader shows ${JSON.stringify(contract.afterNext)}, grid's 2nd object is ${JSON.stringify(contract.secondLabel)}`);

      // --- note list (MUST) ---
      record(contract.truth.base > 0 && contract.list.count === contract.truth.base,
        "ADR-0019 MUST · the note list indexes every note on the canvas (V70)",
        `list has ${contract.list.count} row(s), the manifest's base annotation page has ${contract.truth.base}`);
      record(contract.list.previews.length > 0 && contract.list.previews.every((p) => p.length > 0 && !/^annotation /.test(p)),
        "ADR-0019 MUST · list rows carry the note's own words, not its id (V70)",
        contract.list.previews.map((p) => JSON.stringify(p.slice(0, 40))).join(", "));
      record(contract.rowOpens.open && contract.rowOpens.body.length > 0 && contract.rowOpens.current,
        "ADR-0019 MUST · a list row opens the note (V70)",
        `card ${contract.rowOpens.open ? "opened" : "did NOT open"} with ${JSON.stringify(contract.rowOpens.body)}; row marked current: ${contract.rowOpens.current}`);

      // --- readings + legend (MUST) ---
      const wantNames = ["General notes", ...contract.truth.readingsHere.map((r) => r.name)];
      const gotNames = contract.legend.map((o) => o.name);
      record(contract.truth.readingsHere.length > 0 && JSON.stringify(gotNames) === JSON.stringify(wantNames),
        "ADR-0019 MUST · the legend lists every reading with notes on this object (V56)",
        `rendered ${JSON.stringify(gotNames)} vs manifest ${JSON.stringify(wantNames)}` +
          ` (readings.json has ${contract.truth.readings.length}; ${contract.truth.readingsHere.length} carry notes here)`);
      const countsOk = contract.legend.every((o) => o.id === ""
        ? o.count === contract.truth.base
        : o.count === contract.truth.perReading[o.id]);
      record(contract.legend.length > 1 && countsOk,
        "ADR-0019 MUST · legend counts match the manifest's per-reading pages (V56)",
        contract.legend.map((o) => `${o.name}=${o.count}`).join(", ") + ` vs base ${contract.truth.base} / ${JSON.stringify(contract.truth.perReading)}`);
      // readingMarkerStyle("<colour>", "normal") = stroke <colour> @0.95, fill @0.18. Asserting the
      // NUMBERS is what proves there is no second copy of them in the embed.
      const swatchesOk = contract.legend.every((o) =>
        o.strokeOpacity === "0.95" && o.fillOpacity === "0.18") &&
        contract.truth.readingsHere.every((r) => contract.legend.some((o) => o.id === r.id && o.stroke === r.colour));
      record(swatchesOk,
        "ADR-0019 MUST · legend swatches come from readingMarkerStyle (V56/V47)",
        contract.legend.map((o) => `${o.name}: stroke ${o.stroke} @${o.strokeOpacity}, fill @${o.fillOpacity}`).join(" | "));
      const m = contract.marks;
      const marksOk = !!m
        && !m.beforeColours.includes(m.want)                       // the hue was NOT on the canvas before
        && m.colours.includes(m.want)                              // it is now
        && m.colours.every((c) => c === m.want || c === m.wantBase); // and nothing took a third colour
      record(marksOk,
        "ADR-0019 MUST · picking a reading colours the MARKS on the canvas (V56)",
        m ? `before ${JSON.stringify([...new Set(m.beforeColours)])} → after ${JSON.stringify([...new Set(m.colours)])}; reading ${JSON.stringify(m.want)}, base ${JSON.stringify(m.wantBase)}`
          : "no readings to pick");
      record(!!m && m.widths.length > 0 && m.widths.every((w) => w === "2"),
        "ADR-0019 MUST · marks take readingMarkerStyle's stroke weight, not the overlay default (V69)",
        m ? `stroke-width ${JSON.stringify([...new Set(m.widths)])} (2 = readingMarkerStyle normal; 1.5 = the un-styled overlay default)` : "no marks");

      const st = contract.stepped;
      const steppedOk = !!st
        && st.legendStillOn                                     // the legend still claims the layer is on
        && st.colours.includes(st.want)                         // ...and the canvas agrees
        && st.colours.every((c) => c === st.want || c === st.wantBase);
      record(steppedOk,
        "ADR-0019 MUST · a reading survives stepping to the next object (V56)",
        st ? `after Next: legend checked ${st.legendStillOn}, marks ${JSON.stringify([...new Set(st.colours)])}` +
             `; reading ${JSON.stringify(st.want)}, base ${JSON.stringify(st.wantBase)}` +
             (st.legendStillOn && !st.colours.includes(st.want)
               ? " — legend says ON, canvas says base: the V56 symptom" : "")
          : "no readings to carry");

      // --- shared tokens (MUST) ---
      const tokenNames = Object.keys(contract.tokens.want);
      const mismatched = tokenNames.filter((n) => contract.tokens.got[n] !== contract.tokens.want[n] || contract.tokens.want[n] === "");
      record(mismatched.length === 0,
        "ADR-0019 MUST · the shadow root's tokens ARE the shell's tokens.css (V9/V31/V69)",
        mismatched.length === 0
          ? tokenNames.map((n) => `${n}=${contract.tokens.got[n]}`).join(", ")
          : mismatched.map((n) => `${n}: embed ${JSON.stringify(contract.tokens.got[n])} vs tokens.css ${JSON.stringify(contract.tokens.want[n])}`).join(" | "));
      record(contract.tokens.legacy.length === 0,
        "ADR-0019 MUST · no retired pre-Verdant literals in the embed's own rules (V9/V31/V69)",
        contract.tokens.legacy.length ? `found ${contract.tokens.legacy.join(", ")}` : "none");

      // --- AV playback (MUST) — the row that had no label until 2026-07-26 ---
      const a = contract.av;
      if (a.skipped) {
        record(false, "ADR-0019 MUST · the AV player and its note list mount (AV)", a.skipped);
      } else {
        record(a.rowCount > 0 && !!a.timed && !!a.uncued,
          "ADR-0019 MUST · the AV player and its note list mount (AV)",
          `${a.rowCount} row(s); timed ${a.timed ? `${JSON.stringify(a.timed.text)} @${a.timed.start}s` : "NONE"};` +
            ` uncued ${a.uncued ? JSON.stringify(a.uncued.text) : "NONE"}` +
            (a.uncued ? "" : " — no whole-recording note here, the uncued assertion below would be vacuous"));
        const seekOk = !!a.afterTimed && a.afterTimed.open
          && a.afterTimed.current === a.timed.id
          && Math.abs(a.afterTimed.at - a.timed.start) < 1; // landed ON the cue, not merely somewhere
        record(seekOk,
          "ADR-0019 MUST · a timed note's row travels the recording and opens it (AV/V70)",
          a.afterTimed
            ? `cue starts ${a.timed.start}s, playhead landed ${a.afterTimed.at}s, card ` +
              `${a.afterTimed.open ? "open" : "SHUT"}, current ${a.afterTimed.current === a.timed.id ? "this row" : a.afterTimed.current}`
            : "not driven");
        // The residual S1 defect, stated as the thing that was wrong: the row was current and the card
        // was showing the OTHER note's body. Both halves are asserted, because either alone passes it.
        const u = a.afterUncued;
        const showsOwn = !!u && u.open && u.body.length > 0 && u.body !== (a.afterTimed?.body ?? null);
        record(!!u && showsOwn && u.current === a.uncued.id,
          "ADR-0019 MUST · an UNCUED note's row shows ITS OWN body, not the last one's (AV/V70)",
          u ? `current ${u.current} (want ${a.uncued.id}); card ${JSON.stringify(u.body)}` +
              ` vs the timed note's ${JSON.stringify(a.afterTimed?.body ?? "")}`
            : "not driven");
        record(!!u && !!a.afterTimed && u.at === a.afterTimed.at,
          "ADR-0019 MUST · showing an uncued note does NOT move the playhead (AV)",
          u && a.afterTimed ? `playhead ${a.afterTimed.at}s → ${u.at}s (a whole-recording note points at no moment)` : "not driven");
      }

      // --- the reading layer's lifetime (V56) ---
      const lt = contract.lifetime;
      record(!lt.skipped && lt.checked === "(base)",
        "ADR-0019 MUST · a Reading does not follow you into another exhibit (V56)",
        lt.skipped
          ? lt.skipped
          : `after picking a reading in voynich, rosettes opens with ${lt.checked} checked` +
            ` (both exhibits publish ids cipher/hoax/abjad, so a carry-over would silently activate` +
            ` a different curator's layer); legend ${JSON.stringify(lt.names)}`);

      // --- narrative (MUST) ---
      const n = contract.narrative;
      record(n.entered === true,
        "ADR-0019 MUST · an exhibit with a spine offers its narrative (V88)",
        n.entered ? "the exhibit view carries the narrative entry" : "no [data-act=narrative] control on an exhibit with sections");
      record(contract.narrativeTruth.sections > 0 && n.count === contract.narrativeTruth.sections,
        "ADR-0019 MUST · every section in the manifest's Ranges renders (V88)",
        `${n.count} section row(s) vs ${contract.narrativeTruth.sections} Range(s): ${JSON.stringify(n.titles ?? [])}`);
      record((n.proseChars ?? 0) > 40,
        "ADR-0019 MUST · the active section renders its PROSE (V88)",
        `${n.proseChars ?? 0} characters of prose in the active section (0 = the thumbnails-only regression)`);
      record(n.activeIndex === 0 && n.afterNext === 1,
        "ADR-0019 MUST · the section stepper advances the spine (V88)",
        `active section ${n.activeIndex} → ${n.afterNext} after Next`);
    }

    // ---- ADR-0019 DROP-justified row, driven: the canvas engine is not on the gallery path ----
    //
    // `eagerGzKB` (build.mjs --check) is the ratchet for this row, and it is the metric that can see
    // the leak. This is its behavioural twin: it asserts nothing was FETCHED, from the same drive the
    // rest of the contract uses, which is the claim a host actually cares about. The 2026-07-24 leak
    // shipped a top-level `import … from "./chunk-<osd>.js"` in the entry — it would fail here too.
    const eagerEngine = galleryPathScripts.filter((s) => s.engine.length > 0);
    const eagerBytes = galleryPathScripts.reduce((n, s) => n + s.bytes, 0);
    record(galleryPathScripts.length > 0 && eagerEngine.length === 0,
      "ADR-0019 DROP-justified · the canvas engine is NOT on the gallery path",
      galleryPathScripts.length === 0
        ? "no /dist/*.js responses observed — the check would be vacuous"
        : `${galleryPathScripts.length} chunk(s), ${Math.round(eagerBytes / 1024)}KB raw` +
          (eagerEngine.length
            ? ` — ${eagerEngine.map((s) => `${s.name} carries ${s.engine.join("+")}`).join("; ")}`
            : "; none of them carries the canvas engine"));

    // The same row's BYTE ceiling on the wire.
    //
    // This is NOT a coverage gap in `eagerGzKB` — that metric is a byte total over the entry's static
    // closure and has no predicate, so any eager growth past its 10KB floor fails it whatever shape it
    // has. (Verified: a ~118KB non-OSD module statically exported from index.ts fails it at
    // 36 → 73.5KB gz.) What this adds is the OTHER surface. `eagerGzKB` reads the metafile — what the
    // bundler intended; this reads the wire — what the browser actually pulled. A runtime-injected
    // script, a chunk arriving through something other than a static import edge, or a CDN-side
    // rewrite lands on the wire and never on the metafile. The pairing was already described at the
    // collector above ("`eagerGzKB` ratchets the same claim from the metafile; this watches the
    // wire"); asserting the total is what finishes it, rather than printing the number and moving on.
    const EAGER_WIRE_MAX_KB = 200; // measured 103KB; roughly 2x headroom, and a leak is ~10x
    record(galleryPathScripts.length > 0 && eagerBytes / 1024 <= EAGER_WIRE_MAX_KB,
      "ADR-0019 DROP-justified · the gallery path stays under its wire budget",
      `${Math.round(eagerBytes / 1024)}KB raw over ${galleryPathScripts.length} chunk(s), ceiling ${EAGER_WIRE_MAX_KB}KB`);

    // ---- ADR-0019: every contracted assertion RAN ---------------------------------------------
    //
    // The gate that makes `ABSENT` mechanically unreachable rather than merely forbidden on paper.
    //
    // WHY IT EXISTS. Every drive above depends on a fixture, and a missing fixture used to be an
    // `info` line with no `record()` — so `results` simply grew shorter and the run still exited 0.
    // Measured: renaming ONE slug in `apps/viewer/public/published/exhibits.json` (`voynich` →
    // `voynich-renamed`) took the run from 33 assertions to 6, PASS, exit 0 — rights, object nav, the
    // note list, readings, the narrative, the tokens, the real-click, the halo and V55 all gone, CI
    // green. That is annomea's "invisible by construction" failure relocated from FILES to FIXTURES,
    // inside the very gate written to close it: a capability with no fixture was going missing exactly
    // as quietly as a capability with no file.
    //
    // It also catches the other direction — an assertion DELETED from this file, which no amount of
    // fixture care would surface.
    //
    // S4 note: `deep zoom` is a MUST row with no assertion of its own, because a headless WebGL canvas
    // under swiftshader is genuinely flaky and a hard assert on it would be a flaky gate. It is
    // enforced INDIRECTLY and completely here instead: the region, halo and V55 labels below only
    // exist if the canvas mounted, so a canvas that does not mount fails this check by absence.
    const CONTRACTED_LABELS = [
      "custom element 'archie-viewer' is registered",
      "gallery cards render in the shadow DOM",
      "no uncaught page errors",
      "no 'Illegal invocation' (detached fetch) anywhere",
      // canvas-dependent (V68 / V43 / V55) — their presence IS the deep-zoom MUST row's enforcement
      "OSD overlay wrappers are out of the hit path",
      "the region geometry is the topmost hit target",
      "a real mouse click on a region opens its note",
      "the selected region gains a halo (V43)",
      "the halo has real extent (not clipped to nothing)",
      "the halo does not shield the mark it points at",
      "the open note card does not cover the locator mini-map (V55)",
      // rights (V105)
      "the exhibit view shows the manifest's requiredStatement (V105)",
      "the reader shows the OBJECT's own requiredStatement (V105)",
      "the reader links the object's licence URI (V105)",
      "the disclosure carries the manifest's Dublin Core metadata (V105 / Archie-c6bf)",
      // the capability contract's MUST rows
      "ADR-0019 MUST · object navigation is present in the reader (V30)",
      "ADR-0019 MUST · Next actually opens the next object (V30)",
      "ADR-0019 MUST · the note list indexes every note on the canvas (V70)",
      "ADR-0019 MUST · list rows carry the note's own words, not its id (V70)",
      "ADR-0019 MUST · a list row opens the note (V70)",
      "ADR-0019 MUST · the legend lists every reading with notes on this object (V56)",
      "ADR-0019 MUST · legend counts match the manifest's per-reading pages (V56)",
      "ADR-0019 MUST · legend swatches come from readingMarkerStyle (V56/V47)",
      "ADR-0019 MUST · picking a reading colours the MARKS on the canvas (V56)",
      "ADR-0019 MUST · marks take readingMarkerStyle's stroke weight, not the overlay default (V69)",
      "ADR-0019 MUST · a reading survives stepping to the next object (V56)",
      "ADR-0019 MUST · a Reading does not follow you into another exhibit (V56)",
      // AV playback — the MUST row that had no label at all until 2026-07-26, which is exactly
      // where S1's residual defect sat. A MUST row with no label is invisible to the check below.
      "ADR-0019 MUST · the AV player and its note list mount (AV)",
      "ADR-0019 MUST · a timed note's row travels the recording and opens it (AV/V70)",
      "ADR-0019 MUST · an UNCUED note's row shows ITS OWN body, not the last one's (AV/V70)",
      "ADR-0019 MUST · showing an uncued note does NOT move the playhead (AV)",
      "ADR-0019 MUST · the shadow root's tokens ARE the shell's tokens.css (V9/V31/V69)",
      "ADR-0019 MUST · no retired pre-Verdant literals in the embed's own rules (V9/V31/V69)",
      "ADR-0019 MUST · an exhibit with a spine offers its narrative (V88)",
      "ADR-0019 MUST · every section in the manifest's Ranges renders (V88)",
      "ADR-0019 MUST · the active section renders its PROSE (V88)",
      "ADR-0019 MUST · the section stepper advances the spine (V88)",
      "ADR-0019 DROP-justified · the canvas engine is NOT on the gallery path",
      "ADR-0019 DROP-justified · the gallery path stays under its wire budget",
      "no same-origin 404s during the drive (V11)",
    ];
    // Covers are `loading="lazy"`, so the request that exposed V11 is not made until the image is near
    // the viewport — checking earlier in the drive passed against the unfixed code (verified: it did).
    // Give the lazy loads a beat, then judge.
    await page.waitForTimeout(1200);
    record(notFound.length === 0, "no same-origin 404s during the drive (V11)",
      notFound.length ? notFound.slice(0, 5).join(" | ") : "none");

    // TRULY last: it reads `results`, so every assertion it accounts for must already be in there.
    const ran = new Set(results.map((r) => r.label));
    const never = CONTRACTED_LABELS.filter((l) => !ran.has(l));
    record(never.length === 0,
      "ADR-0019 · every contracted assertion actually ran",
      never.length === 0
        ? `${CONTRACTED_LABELS.length}/${CONTRACTED_LABELS.length} present`
        : `${never.length} NEVER RAN — ${never.join(" | ")}`);
  } catch (e) {
    record(false, "navigation / interaction", e.message);
  } finally {
    await browser.close().catch(() => {});
    await new Promise((r) => server.close(r));
  }

  // ---- summary ----
  const hardFails = results.filter((r) => !r.ok);
  console.log("\n──────── SUMMARY ────────");
  console.log(`element registered     : ${results[0]?.ok ? "yes" : "no"}`);
  console.log(`gallery cards          : ${galleryCount}`);
  console.log(`object grid (1st exh.) : ${objCount}`);
  console.log(`deep-zoom canvas (hl)  : ${canvasMounted ? "mounted" : "not mounted (best-effort)"}`);
  console.log(`console errors         : ${consoleErrors.length}`);
  console.log(`hard assertions        : ${results.length - hardFails.length}/${results.length} passed`);
  if (hardFails.length) console.log("failures               : " + hardFails.map((f) => f.label).join("; "));
  console.log(hardFails.length ? "\nRESULT: FAIL" : "\nRESULT: PASS");
  process.exit(hardFails.length ? 1 : 0);
}

main().catch((e) => { console.error("smoke test crashed:", e); process.exit(1); });
