import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const fixtureDir = "/tmp/archie-caption-fixture";
const wavPath = `${fixtureDir}/clip.wav`;
const vttPath = `${fixtureDir}/captions.vtt`;

function makeWav(): Buffer {
  const sampleRate = 8_000;
  const samples = sampleRate;
  const data = Buffer.alloc(samples * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function createAudioExhibit(page: import("@playwright/test").Page) {
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(wavPath, makeWav());
  writeFileSync(vttPath, "WEBVTT\n\n00:00.000 --> 00:00.500\nBaseline caption cue\n");
  await page.addInitScript(() => localStorage.setItem("archie.displayName.v1", "Baseline Tester"));
  await page.goto("/studio/");
  await page.getByRole("button", { name: /New exhibit/ }).first().click();
  await page.getByText("From a media folder", { exact: true }).click();
  await page.getByLabel("Choose a folder of media").setInputFiles(fixtureDir);
  await page.getByRole("button", { name: /Create exhibit/ }).click();
  await expect(page.getByRole("button", { name: /^1 clip$/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^1 clip$/ }).click();
  await expect(page.locator('label.import input[accept*=".vtt"]')).toBeAttached({ timeout: 15_000 });
}

test("FLOW-049 imports a VTT cue as a timed note and preserves it after reload", async ({ page }) => {
  await createAudioExhibit(page);
  await page.locator('label.import input[type="file"]').setInputFiles(vttPath);
  await expect(page.getByText(/Added 1 note from your captions/)).toBeVisible({ timeout: 15_000 });
  const notes = page.getByRole("list", { name: "Notes on this object" });
  await expect(notes.getByRole("listitem")).toHaveCount(1);
  // The normal save boundary awaits the exhibit session flush; an immediate reload would test the
  // debounce window rather than the durable caption workflow.
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("group", { name: "Overview mode" })).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await page.getByRole("button", { name: /^1 clip(?: 1 note)?$/ }).click();
  await expect(page.getByRole("list", { name: "Notes on this object" }).getByRole("listitem")).toHaveCount(1, { timeout: 15_000 });
});
