import { test, expect } from '@playwright/test';

test('STU-UX-001 modal Escape closes and restores focus', async ({ page }) => {
  await page.goto('/studio/');
  const help = page.getByRole('button', { name: 'Help' });
  await help.click();
  await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();
  await expect(page.getByRole('dialog', { name: /Keyboard shortcuts|Shortcuts/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Keyboard shortcuts|Shortcuts/ })).toHaveCount(0);
  await expect(help).toBeFocused();
});

test('STU-UX-002 shortcuts help lists real keyboard actions', async ({ page }) => {
  await page.goto('/studio/');
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();
  const dialog = page.getByRole('dialog', { name: /Keyboard shortcuts|Shortcuts/ });
  await expect(dialog).toContainText('Cite a note or exhibit');
  await expect(dialog).toContainText('Select all media items');
  await page.keyboard.press('Escape');
});

test('STU-UX-007 tutorial opens, advances, and dismisses', async ({ page }) => {
  await page.goto('/studio/');
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('menuitem', { name: /Start the tutorial/ }).click();
  const dialog = page.getByRole('dialog', { name: /tutorial/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('iframe[title="Archie onboarding tutorial"]')).toBeAttached();
  await dialog.getByRole('button', { name: 'Close tutorial' }).click();
  await expect(dialog).toHaveCount(0);
});

test('STU-UX-010 citation picker supports keyboard and Browse view', async ({ page }) => {
  await page.goto('/studio/');
  await page.getByRole('button', { name: /New exhibit/ }).first().click();
  await page.getByText('From a media folder', { exact: true }).click();
  await page.getByLabel('Choose a folder of media').setInputFiles('public/voynich');
  await page.getByRole('button', { name: /Create exhibit/ }).click();
  await page.getByRole('button', { name: /^1 article$/ }).click();
  await page.getByRole('button', { name: /Whole image/ }).click();
  const editor = page.locator('.note-editor-region');
  await editor.getByRole('textbox').first().fill('Citation UX');
  await editor.getByRole('button', { name: /Comment Citation UX/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Cite a note or exhibit' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: 'Browse' }).click();
  await expect(dialog.getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('tab', { name: 'Search' }).click();
  const search = dialog.getByPlaceholder(/Search for a note or exhibit/);
  await search.fill('term-that-does-not-exist');
  await expect(dialog).toContainText(/No notes, objects, or exhibits match/);
  await search.fill('article');
  await search.fill('article');
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(editor.getByRole('textbox').first()).toHaveValue(/\[article\]\(archie:/);
});

test('STU-UX-003 rail keyboard activates a media item', async ({ page }) => {
  await page.goto('/studio/');
  await page.getByRole('button', { name: /New exhibit/ }).first().click();
  await page.getByText('From a media folder', { exact: true }).click();
  await page.getByLabel('Choose a folder of media').setInputFiles('public/voynich');
  await page.getByRole('button', { name: /Create exhibit/ }).click();
  await page.getByRole('button', { name: /^1 article$/ }).click();
  const rail = page.getByRole('navigation', { name: 'Exhibit objects' });
  const article = rail.getByRole('button', { name: /article/ }).first();
  await article.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /balneological/ }).first()).toBeVisible();
});

test('STU-UX-005 second tab is read-only, then promotes after writer closes', async ({ browser }) => {
  const context = await browser.newContext();
  const writer = await context.newPage();
  await writer.goto('/studio/');
  await writer.getByRole('button', { name: /New exhibit/ }).first().click();
  await writer.getByText('Start empty', { exact: true }).click();
  await writer.locator('#createTitle').fill('Two tab probe');
  await writer.getByRole('button', { name: 'Create exhibit', exact: true }).click();
  await writer.getByRole('button', { name: /Exhibits/ }).first().click();
  await expect(writer.getByRole('button', { name: /Two tab probe 0 media items/ })).toBeVisible();

  const reader = await context.newPage();
  await reader.goto('/studio/');
  await expect(reader.getByRole('button', { name: /Two tab probe 0 media items/ })).toBeVisible();
  await reader.getByRole('button', { name: /Two tab probe 0 media items/ }).click();
  await expect(reader.locator('span.safety-state.read-only')).toBeVisible({ timeout: 8000 });
  await expect(reader.getByRole('button', { name: 'Take over editing' })).toBeVisible();

  await writer.close();
  await expect(reader.locator('span.safety-state.read-only')).toHaveCount(0, { timeout: 10000 });
  await expect(reader.getByRole('button', { name: 'Take over editing' })).toHaveCount(0);
  await reader.close();
  await context.close();
});
