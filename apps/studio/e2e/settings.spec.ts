import { test, expect } from "@playwright/test";

// The Settings panel, phase 1 (spec: docs/superpowers/specs/2026-07-26-studio-settings-panel-design.md).
//
// This spec exists for the failure mode .claude/rules/svelte-no-typecheck-net.md documents: `onsettings`
// is an OPTIONAL prop gating an optional menu item, which is the exact shape that can be declared in a
// $props() TYPE and omitted from the destructuring beside it — after which `{#if onsettings}` renders
// nothing while svelte-check reports 0 errors / 0 warnings. Driving the menu is the only thing that
// can see it.
//
// It also pins the two claims the panel makes that a unit test cannot: that the diagnostics thunk is
// actually CALLED (a readout wired to nothing renders "—", which looks like a legitimate unknown), and
// that the surface can be dismissed (it is on the shared modality ladder, not its own ad-hoc handler).
const HASH_EDITOR = "#/voynich-rosettes/o/ex-voynich.o9";

test.setTimeout(60_000);

test("Settings opens from the Help menu and reports real diagnostics", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  await page.goto(`/studio/${HASH_EDITOR}`);

  // The door. If `onsettings` were typed-but-unbound, this item would not exist and the click would
  // time out — which is the whole reason this spec is driven rather than mounted.
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("menuitem", { name: /^settings$/i }).click();

  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();

  // L1: BOTH sections, and the library one names the library — that naming is the entire mechanism by
  // which R7 (app settings vs library settings) is communicated, so it is the thing to assert.
  await expect(dialog.getByRole("heading", { name: /^this app$/i })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: /^this library/i })).toBeVisible();

  // L4: the readouts carry NUMBERS, not the "—" placeholder. A panel whose thunk is never invoked
  // still renders every row and every label; only the values distinguish wired from unwired.
  const workers = dialog.locator(".row", { hasText: "Import workers" }).locator(".r-value");
  await expect(workers).toHaveText(/^\d+$/);
  const fallbacks = dialog.locator(".row", { hasText: "Fell back to the slow path" }).locator(".r-value");
  await expect(fallbacks).toHaveText("0"); // nothing has been imported, so a non-zero here is a real signal
  const tiling = dialog.locator(".row", { hasText: "Publish tiling" }).locator(".r-value");
  await expect(tiling).toHaveText(/in parallel|one at a time/i);

  // L7 is a NEGATIVE contract and worth pinning as one: settings never edits authored content, so no
  // rights/metadata control may appear here. Asserting the absence is what stops it drifting in.
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await expect(dialog.getByText(/licen[cs]e|attribution|required statement/i)).toHaveCount(0);

  // Esc dismisses via the shared ladder (modality.svelte), not a private keydown.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  expect(consoleErrors, "Settings must not log console errors").toEqual([]);
});
