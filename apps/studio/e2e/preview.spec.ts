import { test, expect } from "@playwright/test";

// "Preview as reader" gate (archie-ux Q-6). This spec exists for a failure mode NO static gate here
// can see, documented in .claude/rules/svelte-no-typecheck-net.md: a prop can be present in a
// component's $props() TYPE annotation and absent from the destructuring pattern beside it, and then
// `{#if thatProp}` silently renders nothing while svelte-check reports 0 errors / 0 warnings. That is
// exactly the shape of this feature — an optional `previewtree` prop gating an optional control — so
// the only thing that can catch a regression is driving the real app and asserting the control exists.
//
// It also covers the wiring vitest structurally cannot: the LAZY `import("@render/archie-viewer")`
// resolving under Vite, the custom element upgrading, and previewTree's tree surviving the element's
// ADR-0020 marker check. All three are green-in-unit and could still be broken in the browser.
//
// Fixture (apps/studio/src/seed-data.ts): "The Rosettes", slug `voynich-rosettes`, single object `o9`.
// The Publish control lives in the OBJECT EDITOR header (App.svelte `.publish-signal`), not the
// library or overview screens, so the walk lands on the editor route directly.
const HASH_EDITOR = "#/voynich-rosettes/o/ex-voynich.o9";

// The walk FORKS the example first, and that is load-bearing rather than incidental setup. Every
// seeded exhibit carries `seedVersion` (seed-data.ts:65-84), and `buildFullLibrary` excludes templates
// — so a fresh profile has NOTHING publishable, and the chooser now refuses outright
// (publish-empty.spec.ts is that path). This spec previously drove the preview in exactly that state
// and rendered an EMPTY gallery: it asserted `.intro h1`, which the shell paints whether or not any
// exhibit made it in, so it passed while previewing nothing. "Keep a copy" (App.svelte `keepCopy`)
// strips `seedVersion`, which is what gives the projection a card to carry — hence the card assertion
// below, which the old shape could not have made.

// 60s: this walk pays two costs a unit test never does — Vite dev-transforming the embed package on
// first lazy import (it is ~930KB of source, unbundled here), and a FULL site projection of the seeded
// library. Both are one-time and neither is what the test is asserting about.
test.setTimeout(60_000);

test("preview renders the reader inside the Publish surface", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(`/studio/${HASH_EDITOR}`);

  // Fork the example so the library has something publishable (see the note above). keepCopy lands on
  // the copy's exhibit; `.publish-signal` is in the object-editor header, so step back into an object.
  // The copy carries its source's object ids verbatim (App.svelte:931), hence the same `ex-voynich.o9`.
  await page.getByRole("button", { name: /^keep a copy$/i }).click();
  await expect(page).toHaveURL(/voynich-rosettes-copy/);
  await page.goto(`/studio/#/voynich-rosettes-copy/o/ex-voynich.o9`);

  await page.locator(".publish-signal").click();

  // First open in a fresh profile asks for a display name before the publish surface (App.svelte
  // `maybePromptIdentity`). Skipping is a first-class path, not a workaround.
  const skip = page.getByRole("button", { name: /skip for now/i });
  if (await skip.isVisible().catch(() => false)) await skip.click();

  // THE assertion this spec exists for: the control renders at all. An unbound prop makes this fail
  // while every static gate stays green.
  const preview = page.getByRole("button", { name: /preview as reader/i });
  await expect(preview).toBeVisible();
  await preview.click();

  // The element upgrades (lazy import resolved + customElements.define ran) and reaches its gallery
  // view — i.e. previewTree's tree passed validateArchieMarker and openFilesystem read its index.
  const host = page.locator("archie-viewer");
  await expect(host).toBeAttached({ timeout: 40_000 });
  await expect(page.locator(".stage.busy")).toHaveCount(0, { timeout: 40_000 });
  await expect(page.locator(".stage .err")).toHaveCount(0);
  await expect(host.locator(".intro h1")).toBeVisible(); // pierces the open shadow root

  // ...and the gallery actually CARRIES the forked exhibit. `.intro h1` alone proves only that the
  // shell painted: element.ts:816-828 renders the same header and an empty `.grid` for a library with
  // zero cards, so that assertion cannot distinguish "previewing the library" from "previewing
  // nothing". toHaveCount waits; a bare .count() here would read 0 against the un-upgraded element
  // (.claude/rules/playwright-count-does-not-wait.md).
  await expect(host.locator(".grid li")).toHaveCount(1);
  await expect(host.locator(".grid .title")).toHaveText(/rosettes \(copy\)/i);

  // Back returns to the chooser rather than closing the surface (the nested-flow contract).
  await page.getByRole("button", { name: /← back/i }).click();
  await expect(preview).toBeVisible();

  expect(consoleErrors, "preview must not log console errors").toEqual([]);
});
