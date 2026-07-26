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

test("preview renders the reader inside the Publish surface", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(`/studio/${HASH_EDITOR}`);
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
  await expect(host).toBeAttached();
  await expect(page.locator(".stage.busy")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator(".stage .err")).toHaveCount(0);
  await expect(host.locator(".intro h1")).toBeVisible(); // pierces the open shadow root

  // Back returns to the chooser rather than closing the surface (the nested-flow contract).
  await page.getByRole("button", { name: /← back/i }).click();
  await expect(preview).toBeVisible();

  expect(consoleErrors, "preview must not log console errors").toEqual([]);
});
