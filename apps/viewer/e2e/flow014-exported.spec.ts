import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("FLOW-014 opens the exact ZIP exported by Studio and shows its authored note", async ({ page }) => {
  const zipPath = "/tmp/archie-flow014-exported.archie.zip";
  const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" }).trim().split("\n");
  let note = "";
  for (const entry of entries.filter((x) => x.endsWith("annotations.json"))) {
    const body = execFileSync("unzip", ["-p", zipPath, entry], { encoding: "utf8" });
    const match = body.match(/E2E publish note [^"\\]+/);
    if (match) { note = match[0]; break; }
  }
  expect(note, "Studio export contains an authored note").not.toBe("");

  await page.goto("./");
  await page.evaluate(() => { document.body.innerHTML = "<archie-viewer></archie-viewer>"; });
  await page.addScriptTag({ path: "packages/archie-viewer/dist-single/archie-viewer.single.js" });
  const viewer = page.locator("archie-viewer");
  await viewer.evaluate(async (el, bytes) => {
    await (el as HTMLElement & { openFile(file: File): Promise<void> }).openFile(
      new File([new Uint8Array(bytes as number[])], "studio-export.archie.zip"),
    );
  }, Array.from(readFileSync(zipPath)));
  await expect(viewer.locator(".intro h1")).toBeVisible({ timeout: 30_000 });
  await viewer.getByText("The Rosettes (copy)", { exact: true }).click();
  await expect(viewer.getByRole("button", { name: /Cosmological/ })).toBeVisible({ timeout: 30_000 });
  await viewer.getByRole("button", { name: /Cosmological/ }).click();
  await expect(viewer).toContainText(note, { timeout: 30_000 });
});
