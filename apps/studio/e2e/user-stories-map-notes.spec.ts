import { test, expect } from '@playwright/test';

async function openOwnedMap(page: import('@playwright/test').Page) {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/studio/');
  const example = page.locator('button.card').filter({ hasText: 'The Rosettes' }).first();
  await expect(example).toBeVisible();
  await example.click();
  await expect(page.getByRole('group', { name: 'Overview mode' })).toBeVisible();
  await page.goto('/studio/#/voynich-rosettes/o/ex-voynich.o9');
  await expect(page.getByRole('button', { name: 'Keep a copy' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep a copy' }).click();
  await expect(page.getByRole('group', { name: 'Overview mode' })).toBeVisible();
  await page.getByRole('button', { name: 'Add media' }).first().click();
  await page.getByText('A map', { exact: true }).click();
  await page.locator('#mapName').fill('Map note probe');
  await page.getByRole('button', { name: 'Greater London' }).click();
  await page.locator('.dialog').getByRole('button', { name: 'Add to exhibit', exact: true }).click();
  await expect(page.locator('button.plate[title="Map note probe"]')).toBeVisible({ timeout: 15000 });
  await page.locator('button.plate[title="Map note probe"]').click({ force: true });
  await expect(page.getByRole('navigation', { name: 'Exhibit objects' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Box', exact: true })).toBeVisible();
}

test('STU-ANN-015A map Box note persists with geo region', async ({ page }) => {
  await openOwnedMap(page);
  await page.getByRole('button', { name: 'Box', exact: true }).click();
  const map = page.locator('.canvas-plate').first();
  const box = await map.boundingBox();
  if (!box) throw new Error('map canvas has no geometry');
  await page.mouse.click(box.x + box.width * .4, box.y + box.height * .4);
  await page.mouse.click(box.x + box.width * .6, box.y + box.height * .6);
  const editor = page.locator('.note-editor-region');
  await expect(editor).toBeVisible({ timeout: 10000 });
  await editor.getByRole('textbox').first().fill('Map Box note');
  await editor.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText('Map Box note');
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText(/📍|Longitude|latitude/);
});

test('STU-ANN-015B map Outline note persists with geo region', async ({ page }) => {
  await openOwnedMap(page);
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  const map = page.locator('.canvas-plate').first();
  const box = await map.boundingBox();
  if (!box) throw new Error('map canvas has no geometry');
  for (const [x, y] of [[.4, .4], [.6, .4], [.6, .6], [.4, .6]]) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  }
  await page.mouse.dblclick(box.x + box.width * .4, box.y + box.height * .4);
  const editor = page.locator('.note-editor-region');
  await expect(editor).toBeVisible({ timeout: 10000 });
  await editor.getByRole('textbox').first().fill('Map Outline note');
  await editor.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText('Map Outline note');
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText(/📍|Longitude|latitude/);
});
