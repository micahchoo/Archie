import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const CORE_URL = `/studio/@fs${resolve(process.cwd(), '../../packages/render-core/src/index.ts')}`;

async function persistedTargets(page: import('@playwright/test').Page): Promise<any[]> {
  return page.evaluate(async (coreUrl) => {
    const slug = location.hash.split('/')[1] ?? '';
    const store = await import('/studio/src/store.ts');
    const core = await import(/* @vite-ignore */ coreUrl);
    const dir = await store.openExhibitAnnotationsDir(slug);
    if (!dir) throw new Error(`annotation directory unavailable for ${slug}`);
    const session = await core.AnnotationSession.load(dir, 'av-verifier');
    return session.notes().map((n: any) => ({ body: n.body, target: n.target }));
  }, CORE_URL);
}

function seconds(value: string): number {
  const [minutes, sec] = value.split(':').map(Number);
  return minutes * 60 + sec;
}

function makeWav(): Buffer {
  const samples = 32000;
  const data = Buffer.alloc(samples * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(8000, 24); h.writeUInt32LE(16000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function openAv(page: import('@playwright/test').Page, kind: 'audio' | 'video') {
  const fixtureDir = mkdtempSync(`${tmpdir()}/archie-av-${kind}-`);
  const wavPath = `${fixtureDir}/clip.wav`;
  mkdirSync(fixtureDir, { recursive: true });
  if (kind === 'audio') writeFileSync(wavPath, makeWav());
  else execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=2', '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', `${fixtureDir}/clip.mp4`]);
  await page.goto('/studio/');
  await page.getByRole('button', { name: /New exhibit/ }).first().click();
  await page.getByText('From a media folder', { exact: true }).click();
  await page.getByLabel('Choose a folder of media').setInputFiles(fixtureDir);
  await page.getByRole('button', { name: /Create exhibit/ }).click();
  const label = /^1 clip$/;
  await expect(page.getByRole('button', { name: label })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: label }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 15000 });
  if (kind === 'video') await expect(page.locator('video')).toHaveCount(1);
  else await expect(page.locator('video')).toHaveCount(0);
}

test('STU-ANN-013A audio playback and seek', async ({ page }) => {
  await openAv(page, 'audio');
  const wave = page.locator('.wave');
  const waveBox = await wave.boundingBox();
  if (!waveBox) throw new Error('audio waveform has no geometry');
  await page.mouse.click(waveBox.x + waveBox.width * 0.5, waveBox.y + waveBox.height * 0.5);
  await expect(page.locator('.clock')).not.toHaveText('0:00');
  const play = page.getByRole('button', { name: 'Play' });
  await play.click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText(/Now at/)).toBeVisible();
});

test('STU-ANN-013B audio range note saves and reopens', async ({ page }) => {
  await openAv(page, 'audio');
  const wave = page.locator('.wave');
  const waveBox = await wave.boundingBox();
  if (!waveBox) throw new Error('audio waveform has no geometry');
  await page.getByRole('button', { name: 'Mark start' }).click();
  await expect(page.getByText(/from 0:00/)).toBeVisible();
  await page.getByRole('button', { name: /Add note/ }).click();
  const editor = page.locator('.note-editor-region');
  await expect(editor).toBeVisible();
  await editor.locator('fieldset.time input').nth(1).fill('0:01');
  await editor.locator('fieldset.time input').nth(1).blur();
  await editor.getByRole('textbox').first().fill('Audio range note');
  await editor.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText('Audio range note');
  await page.getByRole('button', { name: 'Audio range note' }).click();
  const values = await page.locator('fieldset.time input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  const [start, end] = values.map(seconds);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(start).toBeLessThan(end);
  expect(end).toBeLessThanOrEqual(4);
  const notes = await persistedTargets(page);
  const selector = notes[0]?.target?.selector?.value;
  expect(selector).toMatch(/^t=\d+(\.\d+)?,\d+(\.\d+)?$/);
});

test('STU-ANN-013C audio immediate interval remains valid', async ({ page }) => {
  await openAv(page, 'audio');
  await page.getByRole('button', { name: 'Mark start' }).click();
  await page.getByRole('button', { name: /Add note/ }).click();
  const editor = page.locator('.note-editor-region');
  await expect(editor).toBeVisible();
  await expect(editor.locator('fieldset.time input')).toHaveCount(2);
  await editor.locator('fieldset.time input').nth(1).fill('0:00');
  await editor.locator('fieldset.time input').nth(1).blur();
  const clamped = await editor.locator('fieldset.time input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(seconds(clamped[1]!)).toBeGreaterThanOrEqual(seconds(clamped[0]!));
  await editor.locator('fieldset.time input').nth(1).fill('0:01');
  await editor.locator('fieldset.time input').nth(1).blur();
  const values = await editor.locator('fieldset.time input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  const [start, end] = values.map(seconds);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(start).toBeLessThan(end);
  expect(end).toBeLessThanOrEqual(4);
});

test('STU-ANN-013D whole audio note', async ({ page }) => {
  await openAv(page, 'audio');
  await page.getByRole('button', { name: 'Whole recording' }).click();
  const editor = page.locator('.note-editor-region');
  await expect(editor).toContainText('The whole object (no region)');
  await editor.getByRole('textbox').first().fill('Whole audio persisted');
  await editor.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  const notes = await persistedTargets(page);
  expect(notes[0]?.target?.selector).toBeUndefined();
});

test('STU-ANN-014A video playback and frame box', async ({ page }) => {
  await openAv(page, 'video');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  const overlay = page.locator('.frame-overlay');
  const box = await overlay.boundingBox();
  if (!box) throw new Error('video frame overlay has no geometry');
  await page.mouse.move(box.x + box.width * .2, box.y + box.height * .2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .7, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText('box set')).toBeVisible();
});

test('STU-ANN-014B video timeline exists and seeks', async ({ page }) => {
  await openAv(page, 'video');
  const timeline = page.getByRole('group', { name: /Notes timeline/ });
  await expect(timeline).toBeVisible();
  const track = timeline.locator('.vt-track');
  const box = await track.boundingBox();
  if (!box) throw new Error('video timeline has no geometry');
  await page.mouse.click(box.x + box.width * .5, box.y + box.height * .5);
  await expect(page.locator('.clock')).toHaveText('0:01');
});

test('STU-ANN-014C video interval and frame note', async ({ page }) => {
  await openAv(page, 'video');
  await page.getByRole('button', { name: 'Mark start' }).click();
  const overlay = page.locator('.frame-overlay');
  const box = await overlay.boundingBox();
  if (!box) throw new Error('video frame overlay has no geometry');
  await page.mouse.move(box.x + box.width * .2, box.y + box.height * .2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .7, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('button', { name: /Add note/ }).click();
  const editor = page.locator('.note-editor-region');
  await expect(editor).toBeVisible();
  await editor.getByRole('textbox').first().fill('Video spatiotemporal note');
  await editor.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(1200);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText('Video spatiotemporal note');
  const notes = await persistedTargets(page);
  const selector = notes[0]?.target?.selector?.value;
  expect(selector).toMatch(/^t=\d+(\.\d+)?,\d+(\.\d+)?&xywh=percent:/);
  const boxValues = selector?.match(/xywh=percent:([\d.]+),([\d.]+),([\d.]+),([\d.]+)/)?.slice(1).map(Number);
  expect(boxValues).toHaveLength(4);
  expect(boxValues?.[2]).toBeGreaterThan(0);
  expect(boxValues?.[3]).toBeGreaterThan(0);
  expect(boxValues?.[0]).toBeGreaterThanOrEqual(0);
  expect(boxValues?.[1]).toBeGreaterThanOrEqual(0);
  expect((boxValues?.[0] ?? 0) + (boxValues?.[2] ?? 0)).toBeLessThanOrEqual(100);
  expect((boxValues?.[1] ?? 0) + (boxValues?.[3] ?? 0)).toBeLessThanOrEqual(100);
});

test('STU-ANN-014D whole video note', async ({ page }) => {
  await openAv(page, 'video');
  await page.getByRole('button', { name: 'Whole recording' }).click();
  const editor = page.locator('.note-editor-region');
  await expect(editor).toBeVisible();
  await editor.getByRole('textbox').first().fill('Whole video persisted');
  await editor.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  const notes = await persistedTargets(page);
  expect(notes[0]?.target?.selector).toBeUndefined();
});
