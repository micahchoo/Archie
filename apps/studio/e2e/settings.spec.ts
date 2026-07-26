import { test, expect } from "@playwright/test";

// The Settings panel, phase 1 (spec: docs/superpowers/specs/2026-07-26-studio-settings-panel-design.md).
//
// What this spec is NOT for, measured rather than assumed. The obvious justification would be
// .claude/rules/svelte-no-typecheck-net.md's typed-but-unbound prop: `onsettings` is an optional prop
// gating an optional menu item, the exact shape the rule says renders nothing at 0 errors / 0 warnings.
// That was injected here (removed `onsettings` from HelpMenu's destructuring, left it in the type) and
// **svelte-check caught it**, twice: `HelpMenu.svelte 36:12` and `37:32`, "Cannot find name
// 'onsettings'". So this spec is not the only net for that bug, and claiming otherwise would be the
// overclaim the rule itself warns about. (The rule's `oncancel` case stands as recorded; the difference
// worth noting is that this menu item reaches the prop through a `{@const}`, which svelte-check
// resolves against the script scope. Don't generalise either result without re-injecting.)
//
// What it IS for — three things no static gate can answer:
//   • the diagnostics thunk is actually CALLED. A readout wired to nothing still renders every row and
//     every label; it just shows "—", which reads as a legitimate unknown rather than a defect.
//   • Esc dismisses through the shared modality ladder rather than a private keydown.
//   • L7 holds as a NEGATIVE contract — no control that edits authored content has drifted onto the
//     surface. That one can only be asserted against what is actually rendered.
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
