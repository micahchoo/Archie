import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { canvasInk, goOffline, openPaintedNote, screenshotNotes } from "./offline.js";
import { withRecording } from "./media-fixtures.js";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.describe("focused user-story baseline", () => {
  test("VIEW-003: unlisted exhibits stay out of cards/wall but direct URL remains reachable", async ({ page }) => {
    await goOffline(page);
    await page.route(/\/published\/exhibits\.json(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      json.exhibits[0].unlisted = true;
      await route.fulfill({ response, json });
    });
    await page.goto("./");
    await expect(page.locator("a.card").first()).toBeVisible();
    await expect(page.locator('a.card[href*="screenshots"]')).toHaveCount(0);
    await page.locator(".views button", { hasText: "All images" }).click();
    await expect(page.locator('a.tile[href*="screenshots"]')).toHaveCount(0);
    await page.goto("./#/screenshots");
    await expect(page.locator("h1").first()).toContainText("Archie, Annotated");
  });

  test("VIEW-004: a failed local cover reaches the visible title fallback", async ({ page }) => {
    await goOffline(page);
    await page.route(/\/published\/screenshots\/assets\//, route => route.abort());
    await page.goto("./");
    await expect(page.locator('a.card[href*="screenshots"] .cover-fallback')).toContainText("Archie, Annotated");
    await page.goto("./#/sampler");
    const imagePlate = page.locator(".thumb.image").first();
    await expect(imagePlate).toBeVisible();
    await imagePlate.scrollIntoViewIfNeeded();
    await expect(imagePlate.locator(".broken")).toContainText("Couldn’t load this image");
  });

  test("VIEW-005: leaving an exhibit returns to the gallery", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich/o/ex-voynich.o1");
    await expect(page.locator("button.frame").first()).toBeVisible();
    const overview = page.locator("aside button.overview");
    await expect(overview).toBeVisible();
    await overview.click();
    await expect(page.locator("button.object").first()).toBeVisible();
    const gallery = page.locator('nav[aria-label="Breadcrumb"] a[href$="#/"]');
    await expect(gallery).toBeVisible();
    await gallery.click();
    await expect(page.locator("a.card").first()).toBeVisible();
  });

  test("VIEW-008: an unknown object falls back to the exhibit with an explanatory notice", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich/o/no-such-object");
    await expect(page.locator("h1")).toContainText("The Whole Manuscript");
    await expect(page.locator("button.arrival")).toContainText(/item isn’t in this exhibit/i);
    await expect(page).toHaveURL(/#\/voynich$/);
  });

  test("VIEW-011: a temporal note URL seeks the real AV player and stays paused", async ({ page }) => {
    await goOffline(page);
    await withRecording(page);
    await page.goto("./#/voynich/a/000000001F81TR8PT6F3DP2W59?t=120,160");
    const audio = page.locator("audio");
    await expect(audio).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => audio.evaluate((el) => (el as HTMLMediaElement).readyState)).toBeGreaterThan(0);
    await expect.poll(() => audio.evaluate((el) => (el as HTMLMediaElement).currentTime), { timeout: 30_000 }).toBeCloseTo(120, 0);
    await expect(audio).toHaveJSProperty("paused", true);
  });

  test("VIEW-050: an embed opens a known Content State and safely degrades malformed state", async ({ page }) => {
    await page.goto("./");
    await page.evaluate(() => { document.body.innerHTML = "<archie-viewer></archie-viewer>"; });
    await page.addScriptTag({ path: "packages/archie-viewer/dist-single/archie-viewer.single.js" });
    const state = {
      type: "Annotation", motivation: "highlighting", id: "urn:archie:test",
      target: {
        type: "SpecificResource",
        source: "https://micahchoo.github.io/Archie/viewer/published/voynich/canvas/ex-voynich.o1",
        selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: "xywh=pixel:1,2,3,4" },
      },
    };
    const encoded = Buffer.from(encodeURIComponent(JSON.stringify(state))).toString("base64url");
    const viewer = page.locator("archie-viewer");
    await viewer.evaluate((el, value) => {
      el.setAttribute("src", "/viewer/published/");
      el.setAttribute("iiif-content", value as string);
    }, encoded);
    await expect.poll(() => viewer.evaluate((el) => !!el.shadowRoot?.querySelector(".reader")), { timeout: 30_000 }).toBe(true);
    await expect(viewer.locator(".topbar [data-act='back']")).toBeVisible();
    await expect(viewer.locator(".topbar .title")).toContainText("f1r");
    await viewer.evaluate((el) => el.setAttribute("iiif-content", "@@@malformed@@@"));
    await expect(viewer.locator(".cold")).toContainText(/whole gallery/i);
  });

  test("VIEW-012: a visitor can copy a IIIF Content State for an opened note", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich/o/ex-voynich.o1");
    await expect(page.locator("button.frame").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("aside button.overview")).toBeVisible();
    await page.locator("aside button.overview").click();
    await expect(page.locator("button.object").first()).toBeVisible();
    await page.locator("button.object").first().click();
    await page.locator("aside li button").first().click();
    await expect(page.locator("button.cite-trigger")).toBeVisible();
    await page.locator("button.cite-trigger").click();
    const copy = page.getByRole("button", { name: "Copy iiif content state" });
    await expect(copy).toBeVisible();
    await copy.click();
    const encoded = await page.evaluate(() => navigator.clipboard.readText());
    expect(encoded.length).toBeGreaterThan(20);
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const decoded = JSON.parse(decodeURIComponent(Buffer.from(padded, "base64").toString("binary")));
    expect(decoded.type).toBe("Annotation");
    expect(decoded.motivation).toBe("highlighting");
    expect(decoded.target.source).toContain("/canvas/");
  });

  test("VIEW-053: a long library summary expands and collapses on a small screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await goOffline(page);
    await page.route(/\/published\/exhibits\.json(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      json.library.summary = "A long library summary. ".repeat(30);
      await route.fulfill({ response, json });
    });
    await page.goto("./");
    const toggle = page.locator("button.summary-toggle");
    await expect(toggle).toHaveText("Read more");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveText("Show less");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveText("Read more");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("VIEW-054: object-grid density persists after reload", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich/o/ex-voynich.o1");
    await expect(page.locator("button.frame").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("aside button.overview")).toBeVisible();
    await page.locator("aside button.overview").click();
    await expect(page.locator("button.object").first()).toBeVisible();
    await page.evaluate(() => localStorage.removeItem("archie:gridDensity"));
    await page.reload();
    const compact = page.locator('.density[aria-label="Grid density"] button', { hasText: "Compact" });
    await expect(compact).toBeVisible();
    await compact.click();
    await expect(compact).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.locator('.density[aria-label="Grid density"] button', { hasText: "Compact" })).toHaveAttribute("aria-pressed", "true");
  });

  test("VIEW-069: image-wall density persists and controls disappear during search", async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("archie:gridDensity"));
    await goOffline(page);
    await page.goto("./");
    await page.locator('.views button', { hasText: "All images" }).click();
    const compact = page.locator('.density[aria-label="Wall density"] button', { hasText: "Compact" });
    await compact.click();
    await expect(compact).toHaveAttribute("aria-pressed", "true");
    await page.locator("input.search").fill("ros");
    await expect(page.locator('.density[aria-label="Wall density"]')).toHaveCount(0);
    await page.locator("input.search").fill("");
    await page.reload();
    await page.locator('.views button', { hasText: "All images" }).click();
    await expect(page.locator('.density[aria-label="Wall density"] button', { hasText: "Compact" })).toHaveAttribute("aria-pressed", "true");
  });

  test("VIEW-039: object details expose the exhibit and object credit metadata", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich-rosettes");
    await expect(page.locator(".reader")).toBeVisible();
    await expect(page.locator(".credit .line[data-level='exhibit']")).toContainText("Beinecke");
    await expect(page.locator(".reader dl.run .pair").first()).toBeVisible();
  });

  test("VIEW-058: keyboard arrows step the active object carousel", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich");
    await page.locator("button.object").first().click();
    const pos = page.locator(".carousel .cpos");
    await expect(pos).toHaveText("1 / 12");
    await page.keyboard.press("ArrowRight");
    await expect(pos).toHaveText("2 / 12");
    await page.keyboard.press("ArrowLeft");
    await expect(pos).toHaveText("1 / 12");
  });

  test("VIEW-073: an exhibit with no objects gives a readable empty state", async ({ page }) => {
    await goOffline(page);
    await page.route(/\/published\/sampler\/manifest\.json(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      json.items = [];
      await route.fulfill({ response, json });
    });
    await page.goto("./#/sampler");
    await expect(page.locator(".empty")).toContainText("Nothing in this exhibit yet");
  });

  test("VIEW-075: a long metadata value expands and collapses", async ({ page }) => {
    await goOffline(page);
    await page.route(/\/published\/voynich-rosettes\/manifest\.json(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      json.metadata[0].value.none[0] = "Long metadata value. ".repeat(30);
      await route.fulfill({ response, json });
    });
    await page.goto("./#/voynich-rosettes");
    await page.locator('button[role="tab"]', { hasText: "Details" }).click();
    const more = page.locator("button.more").first();
    await expect(more).toHaveText("Show more");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.scrollIntoViewIfNeeded();
    await more.click();
    await expect(more).toHaveText("Show less");
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await more.click();
    await expect(more).toHaveText("Show more");
    await expect(more).toHaveAttribute("aria-expanded", "false");
  });

  test("VIEW-022: a broken AV source shows a readable error and keeps navigation", async ({ page }) => {
    await goOffline(page);
    await page.goto("./#/voynich/o/ex-voynich.o12");
    await expect(page.locator(".media-failed")).toContainText(/couldn.t be loaded/i, { timeout: 30_000 });
    await expect(page.locator(".topbar, aside").first()).toBeVisible();
    await expect(page.locator("button.open-another")).toBeVisible();
    await page.locator("button.open-another").click();
    await expect(page.locator("main.hall")).toBeVisible();
    await page.locator("button.cancel").click();
    await expect(page.locator(".media-failed")).toBeVisible();
  });

  test("VIEW-040: delayed published data shows opening state before the gallery", async ({ page }) => {
    await goOffline(page);
    await page.route(/\/published\/exhibits\.json(?:\?.*)?$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route.continue();
    });
    const nav = page.goto("./");
    await expect(page.locator(".state")).toContainText(/Opening the library/i);
    await nav;
    await expect(page.locator("a.card").first()).toBeVisible();
  });

  test("VIEW-041: malformed published data shows an actionable error state", async ({ page }) => {
    await goOffline(page);
    await page.route(/\/published\/exhibits\.json(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{malformed" }));
    await page.goto("./");
    await expect(page.locator(".state.error")).toContainText(/couldn.t|unable|failed|error|republish|library/i, { timeout: 30_000 });
    await expect(page.locator(".state.error")).toContainText(/library|reload|try|again|republish/i);
  });

  test("VIEW-065: an embed opens a saved archive and reports an invalid archive", async ({ page }) => {
    await page.goto("./");
    await page.evaluate(() => { document.body.innerHTML = "<archie-viewer></archie-viewer>"; });
    await page.addScriptTag({ path: "packages/archie-viewer/dist-single/archie-viewer.single.js" });
    const viewer = page.locator("archie-viewer");
    const bytes = Array.from(readFileSync("apps/viewer/libraries/archie-library.archie.zip"));
    await viewer.evaluate(async (el, data) => {
      await (el as HTMLElement & { openFile(file: File): Promise<void> }).openFile(new File([new Uint8Array(data as number[])], "saved.archie.zip"));
    }, bytes);
    await expect(viewer.locator(".intro h1")).toBeVisible({ timeout: 30_000 });
    await viewer.evaluate(async (el) => {
      await (el as HTMLElement & { openFile(file: File): Promise<void> }).openFile(new File([new Uint8Array([1, 2, 3])], "bad.zip"));
    });
    await expect(viewer.locator(".err")).toBeVisible();
  });

  test("VIEW-025: selecting a second AV narrative section seeks its authored start", async ({ page }) => {
    await goOffline(page);
    await withRecording(page);
    await page.route(/\/published\/sampler\/manifest\.json(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      const base = "https://micahchoo.github.io/Archie/viewer/published/sampler/";
      const canvas = `${base}canvas/ex-sampler.sa1`;
      json.structures = [0, 1].map((n) => ({
        id: `${base}range/av-${n + 1}`, type: "Range", label: { none: [`Audio section ${n + 1}`] },
        summary: { none: [`Audio section ${n + 1} prose`] },
        items: [{ id: canvas, type: "Canvas" }],
        start: { id: `${canvas}#t=${n ? "45,80" : "0,30"}`, type: "Canvas" },
      }));
      await route.fulfill({ response, json });
    });
    await page.goto("./#/sampler");
    await expect(page.locator(".canvas-nav .cn-pos")).toHaveText("Section 2 of 2");
    await expect(page.locator("audio")).toBeVisible();
    await expect.poll(() => page.locator("audio").evaluate((el) => (el as HTMLMediaElement).currentTime), { timeout: 30_000 }).toBeCloseTo(45, 0);
    await page.locator(".canvas-nav .cn-step").first().click();
    await expect(page.locator(".canvas-nav .cn-pos")).toHaveText("Section 1 of 2");
    await expect.poll(() => page.locator("audio").evaluate((el) => (el as HTMLMediaElement).currentTime), { timeout: 30_000 }).toBeCloseTo(0, 0);
    await page.locator(".canvas-nav .cn-step").last().click();
    await expect(page.locator(".canvas-nav .cn-pos")).toHaveText("Section 2 of 2");
    await expect.poll(() => page.locator("audio").evaluate((el) => (el as HTMLMediaElement).currentTime), { timeout: 30_000 }).toBeCloseTo(45, 0);
    await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  });

  test("VIEW-044: an embed target opens an object and can return to its exhibit grid", async ({ page }) => {
    await page.goto("./");
    await page.evaluate(() => { document.body.innerHTML = "<archie-viewer></archie-viewer>"; });
    await page.addScriptTag({ path: "packages/archie-viewer/dist-single/archie-viewer.single.js" });
    const viewer = page.locator("archie-viewer");
    await viewer.evaluate((el) => { el.setAttribute("src", "/viewer/published/"); el.setAttribute("target", "#/voynich/o/ex-voynich.o1"); });
    await expect(viewer.locator(".reader")).toBeVisible({ timeout: 30_000 });
    await viewer.evaluate((el) => el.setAttribute("target", "#/voynich"));
    await expect(viewer.locator("button[data-obj]").first()).toBeVisible({ timeout: 30_000 });
  });

  test("VIEW-049: two embeds keep independent target state", async ({ page }) => {
    await page.goto("./");
    await page.evaluate(() => { document.body.innerHTML = "<archie-viewer id='a'></archie-viewer><archie-viewer id='b'></archie-viewer>"; });
    await page.addScriptTag({ path: "packages/archie-viewer/dist-single/archie-viewer.single.js" });
    const a = page.locator("#a"), b = page.locator("#b");
    await a.evaluate((el) => el.setAttribute("src", "/viewer/published/"));
    await b.evaluate((el) => el.setAttribute("src", "/viewer/published/"));
    await expect(a.locator("button[data-slug]").first()).toBeVisible({ timeout: 30_000 });
    await expect(b.locator("button[data-slug]").first()).toBeVisible({ timeout: 30_000 });
    await a.evaluate((el) => el.setAttribute("target", "#/voynich/o/ex-voynich.o1"));
    await expect(a.locator(".reader")).toBeVisible({ timeout: 30_000 });
    await expect(b.locator("button[data-slug]").first()).toBeVisible();
  });

  test("VIEW-061: replacing an embed source removes the old library", async ({ page }) => {
    await page.route(/\/published\/exhibits\.json\?(?:a|b)/, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      json.library.title = route.request().url().includes("?a") ? "Library A" : "Library B";
      await route.fulfill({ response, json });
    });
    await page.goto("./");
    await page.evaluate(() => { document.body.innerHTML = "<archie-viewer></archie-viewer>"; });
    await page.addScriptTag({ path: "packages/archie-viewer/dist-single/archie-viewer.single.js" });
    const viewer = page.locator("archie-viewer");
    await viewer.evaluate((el) => el.setAttribute("src", "/viewer/published/?a"));
    await expect(viewer.locator(".intro h1")).toHaveText("Library A", { timeout: 30_000 });
    await viewer.evaluate((el) => el.setAttribute("src", "/viewer/published/?b"));
    await expect(viewer.locator(".intro h1")).toHaveText("Library B", { timeout: 30_000 });
    await expect(viewer.locator(".intro h1")).not.toHaveText("Library A");
  });

  test("VIEW-062: changing an embed target reuses its loaded tree", async ({ page }) => {
    let manifests = 0;
    await page.on("request", request => {
      if (request.url().includes("/published/exhibits.json")) manifests += 1;
    });
    await page.goto("./");
    await page.evaluate(() => { document.body.innerHTML = "<archie-viewer></archie-viewer>"; });
    await page.addScriptTag({ path: "packages/archie-viewer/dist-single/archie-viewer.single.js" });
    const viewer = page.locator("archie-viewer");
    await viewer.evaluate((el) => { el.setAttribute("src", "/viewer/published/"); el.setAttribute("target", "#/voynich/o/ex-voynich.o1"); });
    await expect(viewer.locator(".reader")).toBeVisible({ timeout: 30_000 });
    const loaded = manifests;
    await viewer.evaluate((el) => el.setAttribute("target", "#/voynich"));
    await expect(viewer.locator("button[data-obj]").first()).toBeVisible({ timeout: 30_000 });
    expect(manifests).toBe(loaded);
  });

  test("VIEW-064: an embed can reveal an unlisted exhibit without changing direct reachability", async ({ page }) => {
    await page.route(/\/published\/exhibits\.json(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      json.exhibits[0].unlisted = true;
      await route.fulfill({ response, json });
    });
    await page.goto("./");
    await page.evaluate(() => { document.body.innerHTML = "<archie-viewer></archie-viewer>"; });
    await page.addScriptTag({ path: "packages/archie-viewer/dist-single/archie-viewer.single.js" });
    const viewer = page.locator("archie-viewer");
    await viewer.evaluate((el) => el.setAttribute("src", "/viewer/published/"));
    await expect(viewer.locator("button[data-slug='voynich']")).toBeVisible({ timeout: 30_000 });
    await expect(viewer.locator("button[data-slug='screenshots']")).toHaveCount(0, { timeout: 5_000 });
    await viewer.evaluate((el) => el.setAttribute("show-unlisted", ""));
    await expect(viewer.locator("button[data-slug='screenshots']")).toHaveCount(1, { timeout: 15_000 });
    await viewer.evaluate((el) => el.setAttribute("target", "#/screenshots"));
    await expect(viewer.locator(".intro h1")).toContainText("Archie, Annotated", { timeout: 30_000 });
    await expect(viewer.locator("button[data-obj]").first()).toBeVisible();
  });

  test("VIEW-067: an embed exposes current Content State only for an opened object", async ({ page }) => {
    await page.goto("./");
    await page.evaluate(() => { document.body.innerHTML = "<archie-viewer></archie-viewer>"; });
    await page.addScriptTag({ path: "packages/archie-viewer/dist-single/archie-viewer.single.js" });
    const viewer = page.locator("archie-viewer");
    await viewer.evaluate((el) => el.setAttribute("src", "/viewer/published/"));
    await expect(viewer.locator("button[data-slug]").first()).toBeVisible({ timeout: 30_000 });
    expect(await viewer.evaluate((el) => (el as HTMLElement & { currentContentState(): string | null }).currentContentState())).toBeNull();
    await viewer.evaluate((el) => el.setAttribute("target", "#/voynich/o/ex-voynich.o1"));
    await expect(viewer.locator(".reader")).toBeVisible({ timeout: 30_000 });
    const state = await viewer.evaluate((el) => (el as HTMLElement & { currentContentState(): string | null }).currentContentState());
    expect(state).toBeTruthy();
    const decoded = JSON.parse(decodeURIComponent(Buffer.from(state!.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(state!.length / 4) * 4, "="), "base64").toString("binary")));
    expect(decoded.type).toBe("Annotation");
    expect(decoded.target.source).toContain("/canvas/");
  });

  test("VIEW-048: offline embed blocks remote media before any remote request", async ({ page }) => {
    const remote: string[] = [];
    await page.on("request", request => { if (/^https?:\/\/(?!localhost)/.test(request.url())) remote.push(request.url()); });
    await page.goto("./");
    await page.evaluate(() => { document.body.innerHTML = "<archie-viewer></archie-viewer>"; });
    await page.addScriptTag({ path: "packages/archie-viewer/dist-single/archie-viewer.single.js" });
    const viewer = page.locator("archie-viewer");
    await viewer.evaluate((el) => { el.setAttribute("src", "/viewer/published/"); el.setAttribute("target", "#/voynich/o/ex-voynich.o1"); });
    await expect(viewer.locator(".reader")).toBeVisible({ timeout: 30_000 });
    remote.length = 0;
    await viewer.evaluate((el) => el.setAttribute("offline", ""));
    await expect(viewer.locator(".notice")).toContainText(/hosted online|offline/i, { timeout: 30_000 });
    const blocked = remote.length;
    await page.waitForTimeout(500);
    expect(remote).toHaveLength(blocked);
  });

  test("VIEW-051: a host iframe receives coalesced embed height messages", async ({ page, baseURL }) => {
    const bundle = readFileSync("packages/archie-viewer/dist-single/archie-viewer.single.js", "utf8");
    await page.route("/test-archie-viewer.js", route => route.fulfill({ contentType: "text/javascript", body: bundle }));
    await page.goto("./");
    const viewerBase = new URL("/viewer/", baseURL).toString();
    await page.evaluate((src) => {
      document.body.innerHTML = `<iframe id="host" title="Archie embed" srcdoc="<!doctype html><base href='${src}'><archie-viewer src='/viewer/published/'></archie-viewer><script src='/test-archie-viewer.js'><\/script>"></iframe>`;
      (window as Window & { heights?: unknown[] }).heights = [];
      window.addEventListener("message", event => {
        if (event.data?.type === "archie-embed:height") (window as unknown as Window & { heights: unknown[] }).heights.push(event.data);
      });
    }, viewerBase);
    const frame = page.locator("iframe#host");
    await expect(frame).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as Window & { heights?: unknown[] }).heights?.length ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
    const first = await page.evaluate(() => (window as unknown as Window & { heights?: { height: number }[] }).heights?.[0]?.height ?? 0);
    expect(first).toBeGreaterThan(0);
    await page.evaluate(() => { const frame = document.querySelector<HTMLIFrameElement>("#host"); if (frame) frame.remove(); });
    await page.waitForTimeout(500);
    const afterRemove = await page.evaluate(() => (window as unknown as Window & { heights?: unknown[] }).heights?.length ?? 0);
    expect(afterRemove).toBeGreaterThan(0);
  });

  test("VIEW-052: an embed exposes keyboard reachable gallery, object, and back controls", async ({ page }) => {
    await page.goto("./");
    await page.evaluate(() => { document.body.innerHTML = "<archie-viewer></archie-viewer>"; });
    await page.addScriptTag({ path: "packages/archie-viewer/dist-single/archie-viewer.single.js" });
    const viewer = page.locator("archie-viewer");
    await viewer.evaluate((el) => el.setAttribute("src", "/viewer/published/"));
    const card = viewer.locator("button[data-slug]").first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.focus();
    await expect(card).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(viewer.locator(".intro h1")).toBeVisible();
    const object = viewer.locator("button[data-obj]").first();
    await object.focus();
    await expect(object).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(viewer.locator(".reader")).toBeVisible({ timeout: 30_000 });
    const back = viewer.locator(".topbar [data-act='back'], .topbar .crumb-link").first();
    await back.focus();
    await expect(back).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(viewer.locator("button[data-obj]").first()).toBeVisible({ timeout: 30_000 });
  });

  test("VIEW-010: a spatial note arrival paints the canvas and its target marker", async ({ page, baseURL }) => {
    const notes = await screenshotNotes(baseURL!);
    const note = notes.find(item => item.halo);
    expect(note).toBeTruthy();
    await goOffline(page);
    await openPaintedNote(page, note!.ulid);
    expect(await canvasInk(page)).toBeGreaterThan(50);
    await expect(page.locator("#archie-selection-halo")).toHaveCount(1);
    await page.waitForTimeout(2_000);
    const wholeObjectArrival = await page.locator(".openseadragon-canvas").screenshot({
      path: "docs/verification/evidence/viewer/spatial-note-arrival.png",
    });
    await page.evaluate((hash) => { location.hash = hash; }, `/screenshots/a/${note!.ulid}?xywh=pixel:20,20,80,80`);
    await expect(page.locator(".openseadragon-canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => canvasInk(page), { timeout: 30_000 }).toBeGreaterThan(50);
    await expect(page.locator("#archie-selection-halo")).toHaveCount(1);
    await page.waitForTimeout(2_000);
    const explicitRegionArrival = await page.locator(".openseadragon-canvas").screenshot({
      path: "docs/verification/evidence/viewer/spatial-note-explicit-xywh.png",
    });
    expect(Buffer.compare(wholeObjectArrival, explicitRegionArrival)).not.toBe(0);
    await page.goto(`./#/screenshots/a/${note!.ulid}`);
    await expect(page.locator(".openseadragon-canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => canvasInk(page), { timeout: 30_000 }).toBeGreaterThan(50);
    await expect(page.locator("#archie-selection-halo")).toHaveCount(1);
    await page.waitForTimeout(3_000);
    const sameNoteWholeHashchange = await page.locator(".openseadragon-canvas").screenshot({
      path: "docs/verification/evidence/viewer/spatial-note-whole-hashchange.png",
    });
    await page.evaluate((hash) => { location.hash = hash; }, `/screenshots/a/${note!.ulid}?xywh=pixel:20,20,80,80`);
    await expect(page.locator(".openseadragon-canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => canvasInk(page), { timeout: 30_000 }).toBeGreaterThan(50);
    await page.waitForTimeout(2_000);
    const sameNoteExplicitHashchange = await page.locator(".openseadragon-canvas").screenshot({
      path: "docs/verification/evidence/viewer/spatial-note-explicit-xywh-hashchange.png",
    });
    expect(Buffer.compare(explicitRegionArrival, sameNoteExplicitHashchange)).toBe(0);
    const sections = page.locator(".sections button");
    await expect(sections).toHaveCount(21);
    await sections.nth(1).click();
    await expect.poll(() => canvasInk(page), { timeout: 30_000 }).toBeGreaterThan(50);
    await sections.nth(0).click();
    await expect.poll(() => canvasInk(page), { timeout: 30_000 }).toBeGreaterThan(50);
    await page.waitForTimeout(2_000);
    const authoredSectionReturn = await page.locator(".openseadragon-canvas").screenshot({
      path: "docs/verification/evidence/viewer/spatial-note-authored-section-return.png",
    });
    expect(Buffer.compare(explicitRegionArrival, authoredSectionReturn)).not.toBe(0);
  });

  test("FLOW-024: a tree embed resolves its relative published media from its own source base", async ({ page }) => {
    let assetResponse: { url: string; status: number } | undefined;
    await page.route("**/viewer/published/screenshots/manifest.json", async (route) => {
      const response = await route.fetch();
      const manifest = await response.json();
      const painting = manifest.items[0].items[0].items[0];
      painting.body.id = "screenshots/assets/o1-e1-embed.png";
      await route.fulfill({ response, json: manifest });
    });
    page.on("response", response => {
      if (response.url().includes("screenshots/assets/o1-e1-embed.png")) {
        assetResponse = { url: response.url(), status: response.status() };
      }
    });
    await page.goto("./");
    await page.evaluate(() => { document.body.innerHTML = "<archie-viewer></archie-viewer>"; });
    await page.addScriptTag({ path: "packages/archie-viewer/dist-single/archie-viewer.single.js" });
    const viewer = page.locator("archie-viewer");
    await viewer.evaluate((el) => { el.setAttribute("src", "/viewer/published/"); el.setAttribute("target", "#/screenshots/o/o1"); });
    await expect(viewer.locator(".reader")).toBeVisible({ timeout: 30_000 });
    await expect(viewer.locator(".reader canvas").first()).toBeVisible({ timeout: 30_000 });
    await viewer.screenshot({ path: "docs/verification/evidence/viewer/flow024-tree-embed.png" });
    expect(assetResponse?.status).toBe(200);
    expect(assetResponse ? new URL(assetResponse.url).pathname : "")
      .toBe("/viewer/published/screenshots/assets/o1-e1-embed.png");
  });

  test("VIEW-063: a saved archive keeps bundled media readable offline", async ({ page }) => {
    const remote: string[] = [];
    const errors: string[] = [];
    const notFound: string[] = [];
    page.on("response", response => { if (response.status() === 404) notFound.push(response.url()); });
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.on("request", request => { if (/^https?:\/\/(?!localhost)/.test(request.url())) remote.push(request.url()); });
    await page.goto("./");
    await page.evaluate(() => { document.body.innerHTML = "<archie-viewer></archie-viewer>"; });
    await page.addScriptTag({ path: "packages/archie-viewer/dist-single/archie-viewer.single.js" });
    const viewer = page.locator("archie-viewer");
    const bytes = Array.from(readFileSync("apps/viewer/libraries/archie-library.archie.zip"));
    await viewer.evaluate(async (el, data) => {
      await (el as HTMLElement & { openFile(file: File): Promise<void> }).openFile(new File([new Uint8Array(data as number[])], "saved.archie.zip"));
    }, bytes);
    await viewer.evaluate((el) => el.setAttribute("offline", ""));
    await expect(viewer.locator(".intro h1")).toContainText("Archie Library", { timeout: 30_000 });
    await viewer.evaluate((el) => el.setAttribute("target", "#/screenshots/o/o1"));
    await page.waitForTimeout(3_000);
    const state = await viewer.evaluate(el => ({ text: el.shadowRoot?.textContent?.slice(0, 1200), html: el.shadowRoot?.innerHTML.slice(0, 1600) }));
    console.log("VIEW063_STATE", JSON.stringify(state), "ERRORS", JSON.stringify(errors), "REMOTE", JSON.stringify(remote));
    await expect(viewer.locator(".reader")).toBeVisible({ timeout: 5_000 });
    const canvas = viewer.locator(".reader canvas").first();
    await expect(canvas).toBeVisible({ timeout: 5_000 });
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(100);
    expect(box?.height ?? 0).toBeGreaterThan(100);
    await viewer.screenshot({ path: "docs/verification/evidence/viewer/offline-media.png" });
    console.log("VIEW063_404S", JSON.stringify(notFound));
    expect(remote).toHaveLength(0);
  });

  test("VIEW-057: finder text combines with multiple OR tag facets", async ({ page }) => {
    await goOffline(page);
    await page.route(/\/published\/voynich\/manifest\.json(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      let changed = 0;
      const patchNotes = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) { for (const item of value) patchNotes(item); return; }
        const record = value as Record<string, unknown>;
        if (typeof record.id === "string" && record.id.includes("/annotations/") && changed < 3) {
          const spec = [
            { text: "orchid", tag: "red" },
            { text: "orchid", tag: "blue" },
            { text: "fern", tag: "red" },
          ][changed++]!;
          record.body = [
            { type: "TextualBody", value: spec.text, purpose: "commenting" },
            { type: "TextualBody", value: spec.tag, purpose: "tagging" },
          ];
        }
        for (const child of Object.values(record)) patchNotes(child);
      };
      patchNotes(json);
      expect(changed).toBe(3);
      await route.fulfill({ response, json });
    });
    await page.goto("./#/voynich");
    await page.locator("button.finder-trigger").click();
    const finder = page.locator(".finder[role='dialog']");
    await expect(finder).toBeVisible();
    const red = finder.locator("button.facet", { hasText: "#red" });
    const blue = finder.locator("button.facet", { hasText: "#blue" });
    await expect(red).toBeVisible();
    await expect(blue).toBeVisible();
    await red.click();
    await blue.click();
    await expect(red).toHaveAttribute("aria-pressed", "true");
    await expect(blue).toHaveAttribute("aria-pressed", "true");
    const results = finder.locator(".finder-results .result");
    await finder.locator("input.finder-input").fill("orchid");
    await expect(results).toHaveCount(2);
    await blue.click();
    await expect(results).toHaveCount(1);
    await finder.locator("input.finder-input").fill("");
    await expect(results).toHaveCount(2);
  });
});
