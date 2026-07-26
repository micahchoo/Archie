// recipes/smoke.mjs — headless smoke test for the <archie-viewer> embed.
//
//   node recipes/smoke.mjs
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

        return { visible, wrappers, hit, centre, halo };
      })();

      if (clicked.skipped) {
        console.log(`  info  region pointer check skipped: ${clicked.skipped}`);
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
      console.log(`  info  credit check skipped: ${credit.skipped}`);
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

    // ASSERTED LAST, deliberately. Covers are `loading="lazy"`, so the request that exposed V11 is
    // not made until the image is near the viewport — checking earlier in the drive passed against
    // the unfixed code (verified: it did). Give the lazy loads a beat, then judge.
    await page.waitForTimeout(1200);
    record(notFound.length === 0, "no same-origin 404s during the drive (V11)",
      notFound.length ? notFound.slice(0, 5).join(" | ") : "none");
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
