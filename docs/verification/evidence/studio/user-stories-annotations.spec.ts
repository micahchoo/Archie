import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

async function openLocalArticle(page: import('@playwright/test').Page) {
  await page.goto('/studio/');
  await page.getByRole('button', { name: /New exhibit/ }).first().click();
  await page.getByText('From a media folder', { exact: true }).click();
  await page.getByLabel('Choose a folder of media').setInputFiles(resolve(process.cwd(), 'public/voynich'));
  await expect(page.getByText(/image/).first()).toBeVisible();
  await page.getByRole('button', { name: /Create exhibit/ }).click();
  await expect(page.getByRole('group', { name: 'Media items — reading order' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /^1 article$/ }).click();
  await expect(page.getByRole('navigation', { name: 'Exhibit objects' })).toBeVisible();
  await expect(page.locator('.canvas-plate').first()).toBeVisible({ timeout: 15000 });
}

// Boundary probe for STU-ANN-001. It imports the local PNG fixture, then performs the real Box gesture
// on the rendered canvas rather than substituting Whole image.
test('STU-ANN-001 box note: draw, edit, reload', async ({ page }) => {
  const consoleErrors: string[] = []; const pageErrors: string[] = [];
  page.on('console', m => m.type() === 'error' && consoleErrors.push(m.text())); page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto('/studio/');
  await page.evaluate(() => localStorage.setItem('archie.displayName.v1', 'Annotation tester'));
  await page.goto('/studio/');
  await page.getByRole('button', { name: /New exhibit/ }).first().click();
  await page.getByText('From a media folder', { exact: true }).click();
  await page.getByLabel('Choose a folder of media').setInputFiles(resolve(process.cwd(), 'public/voynich'));
  await expect(page.getByText(/image/).first()).toBeVisible();
  await page.getByRole('button', { name: /Create exhibit/ }).click();
  await expect(page.getByRole('group', { name: 'Media items — reading order' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /^1 article$/ }).click();
  await expect(page.getByRole('navigation', { name: 'Exhibit objects' })).toBeVisible();
  await expect(page.locator('.canvas-plate').first()).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: '/tmp/archie-ann001-local-before-draw.png', fullPage: true });
  await page.getByRole('button', { name: 'Box', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Box', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: '/tmp/archie-ann001-local-box-armed.png', fullPage: true });
  const plate = page.locator('.canvas-plate').first();
  await expect(plate).toBeVisible();
  const box = await plate.boundingBox();
  if (!box) throw new Error('STU-ANN-001 canvas plate has no layout box');
  // The local article is a narrow tall image centered inside the wider canvas plate. Draw inside its
  // visible pixels (roughly the middle 20% of the plate), not the blank margin around the image.
  await page.mouse.click(box.x + box.width * .45, box.y + box.height * .16);
  await page.mouse.click(box.x + box.width * .55, box.y + box.height * .30);
  await page.screenshot({ path: '/tmp/archie-ann001-local-after-draw.png', fullPage: true });
  console.log(JSON.stringify({ afterDraw: { url: page.url(), noteCount: await page.getByRole('list', { name: 'Notes on this object' }).locator('li').count(), editorCount: await page.locator('.note-editor-region').count(), canvas: await page.locator('.canvas-plate').count(), consoleErrors, pageErrors } }));
  await expect(page.locator('.note-editor-region')).toBeVisible({ timeout: 10000 });
  const comment = page.locator('.note-editor-region').getByRole('textbox').first();
  await comment.fill('Box persistence probe'); await comment.blur();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Exhibit objects' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText('Box persistence probe');
});

test('STU-ANN-002 polygon note: vertices and finish gesture', async ({ page }) => {
  await openLocalArticle(page);
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Outline', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const box = await page.locator('.canvas-plate').first().boundingBox(); if (!box) throw new Error('no canvas geometry');
  const pts = [[.45,.16],[.55,.16],[.55,.30],[.45,.30]];
  for (const [x,y] of pts) await page.mouse.click(box.x + box.width*x, box.y + box.height*y);
  await page.mouse.dblclick(box.x + box.width*.45, box.y + box.height*.16);
  await page.screenshot({ path: '/tmp/archie-ann002-local-after-polygon.png', fullPage: true });
  console.log(JSON.stringify({ polygonNotes: await page.getByRole('list', { name: 'Notes on this object' }).locator('li').count() }));
  await expect(page.locator('.note-editor-region')).toBeVisible({ timeout: 8000 });
  await page.locator('.note-editor-region').getByRole('textbox').first().fill('Polygon persistence probe');
  await page.locator('.note-editor-region').getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText('Polygon persistence probe');
  const storedTargets = await page.evaluate(async () => {
    const slug = location.hash.split('/')[1] ?? '';
    const store = await import('/studio/src/store.ts');
    const core = await import('/studio/@fs/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/packages/render-core/src/index.ts');
    const dir = await store.openExhibitAnnotationsDir(slug);
    if (!dir) throw new Error('polygon fixture annotation directory unavailable');
    const session = await core.AnnotationSession.load(dir, 'fixture');
    return session.notes().map((note: any) => note.target);
  });
  expect(JSON.stringify(storedTargets)).toMatch(/SvgSelector|polygon/i);
  await page.getByLabel('Notes inspector').getByRole('button', { name: 'Polygon persistence probe' }).click();
  await expect(page.locator('.note-editor-region').getByRole('textbox').first()).toHaveValue('Polygon persistence probe');
});

test('STU-ANN-003/004 whole-image note: edit comment/tags and reload', async ({ page }) => {
  await openLocalArticle(page);
  await page.getByRole('button', { name: /Whole image/ }).click();
  const editor = page.locator('.note-editor-region'); await expect(editor).toBeVisible({ timeout: 8000 });
  await editor.getByRole('textbox').first().fill('Whole image persistence probe');
  await editor.getByLabel('Tags (comma-separated)').fill('local,article');
  await editor.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(1200); await page.reload();
  await expect(page.locator('.note-editor-region')).toHaveCount(0);
  await page.getByRole('list', { name: 'Notes on this object' }).getByText('Whole image persistence probe').click();
  await expect(page.locator('.note-editor-region').getByRole('textbox').first()).toHaveValue('Whole image persistence probe');
  await expect(page.locator('.note-editor-region').getByLabel('Tags (comma-separated)')).toHaveValue('local, article');
});
