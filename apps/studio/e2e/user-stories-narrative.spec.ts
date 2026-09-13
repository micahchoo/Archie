import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

async function article(page: import('@playwright/test').Page) {
  await page.goto('/studio/'); await page.getByRole('button', { name: /New exhibit/ }).first().click(); await page.getByText('From a media folder', { exact: true }).click();
  await page.getByLabel('Choose a folder of media').setInputFiles(resolve(process.cwd(), 'public/voynich')); await expect(page.getByText(/image/).first()).toBeVisible(); await page.getByRole('button', { name: /Create exhibit/ }).click();
  await expect(page.getByRole('group', { name: 'Media items — reading order' })).toBeVisible({ timeout: 15000 }); await page.getByRole('button', { name: /^1 article$/ }).click(); await expect(page.getByRole('navigation', { name: 'Exhibit objects' })).toBeVisible();
}

test('STU-NAR-001/003A/003B/003C narrative add edit reorder remove', async ({ page }) => {
  await article(page); await page.getByText('Narrative', { exact: true }).click().catch(() => {}); await page.locator('button[title="Add a new section to this exhibit\'s narrative"]').click();
  const title = page.getByRole('textbox', { name: 'Section title' }).first(); await title.fill('First beat'); await title.press('Tab');
  const prose = page.getByRole('textbox', { name: 'Section prose' }).first(); await prose.fill('First passage'); await prose.press('Tab');
  await page.locator('button[title="Add a new section to this exhibit\'s narrative"]').click(); await expect(page.getByRole('textbox', { name: 'Section title' })).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Section title' }).nth(1).fill('Second beat'); await page.getByRole('textbox', { name: 'Section title' }).nth(1).press('Tab');
  await page.getByRole('button', { name: 'Move up' }).last().click(); await expect(page.getByRole('textbox', { name: 'Section title' }).first()).toHaveValue('Second beat');
  await page.getByRole('button', { name: 'Remove section' }).last().click(); await expect(page.getByRole('textbox', { name: 'Section title' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove section' }).click(); await expect(page.getByRole('alert', { name: 'Remove the last section' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep' }).click(); await expect(page.getByRole('textbox', { name: 'Section title' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove section' }).click(); await page.getByRole('button', { name: 'Remove', exact: true }).click(); await expect(page.getByText('Narrative cleared')).toBeVisible();
});
