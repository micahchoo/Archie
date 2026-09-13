import { test, expect } from '@playwright/test';

test('STU-LIB-006 library details survive Studio boot reconciliation', async ({ page }) => {
  await page.goto('/studio/');
  const ownedTitle = `Boot-owned-${Date.now()}`;
  await page.getByRole('button', { name: /New exhibit/ }).first().click();
  await page.getByText('Start empty', { exact: true }).click();
  await page.getByLabel('Exhibit title').fill(ownedTitle);
  await page.getByRole('button', { name: /Create exhibit/ }).click();
  await expect(page.getByText(ownedTitle, { exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /Exhibits/ }).first().click();
  await expect(page.getByText(ownedTitle, { exact: true })).toBeVisible({ timeout: 10000 });
  const details = page.locator('header').getByRole('button', { name: /Details —/ });
  await details.click();
  const drawer = page.getByRole('dialog', { name: 'Library details' });
  await expect(drawer).toBeVisible();
  await drawer.getByPlaceholder('Name this library').fill('Boot-preserved library');
  await drawer.getByPlaceholder('A short description of this library').fill('Boot summary survives reconciliation');
  await drawer.getByPlaceholder('Who to credit when this library is shown or shared').fill('Boot curator');
  await drawer.getByRole('combobox', { name: 'License' }).selectOption({ label: 'CC BY 4.0' });
  await drawer.getByRole('tab', { name: 'Metadata' }).click();
  const metadata = drawer.getByRole('tabpanel', { name: 'Metadata' });
  await metadata.getByRole('button', { name: 'Add a field' }).click();
  await metadata.getByRole('option').first().click();
  await metadata.locator('input.value').first().fill('Boot metadata survives reconciliation');
  await drawer.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(1200);

  await page.reload();
  await expect(page.locator('h1')).toHaveText('Boot-preserved library');
  await page.getByRole('button', { name: /Details — Boot-preserved library/ }).click();
  const reopened = page.getByRole('dialog', { name: 'Library details' });
  await expect(reopened.getByPlaceholder('Name this library')).toHaveValue('Boot-preserved library');
  await expect(reopened.getByPlaceholder('A short description of this library')).toHaveValue('Boot summary survives reconciliation');
  await expect(reopened.getByPlaceholder('Who to credit when this library is shown or shared')).toHaveValue('Boot curator');
  await expect(reopened.getByRole('combobox', { name: 'License' })).toHaveValue(/by/i);
  await reopened.getByRole('tab', { name: 'Metadata' }).click();
  await expect(reopened.locator('input.value')).toHaveValue('Boot metadata survives reconciliation');
  await reopened.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText(ownedTitle, { exact: true })).toBeVisible();
  await expect(page.getByText('The Rosettes', { exact: true })).toBeVisible();
});

test('STU-LIB-006 preserves library details when saved exhibits are empty', async ({ page }) => {
  await page.goto('/studio/');
  await expect(page.locator('h1')).toBeVisible();
  const storedTitle = await page.evaluate(async () => {
    const store = await import('/studio/src/store.ts');
    const meta = {
      title: 'Empty-store title',
      summary: 'Empty-store summary',
      rights: 'http://creativecommons.org/licenses/by/4.0/',
      requiredStatement: { label: 'Attribution', value: 'Empty-store credit' },
      metadata: [{ property: 'dcterms:creator', value: 'Empty-store metadata' }],
      exhibits: [],
    };
    await store.saveLibraryMeta(meta);
    return (await store.loadLibraryMeta())?.title;
  });
  expect(storedTitle).toBe('Empty-store title');
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Empty-store title');
  await page.getByRole('button', { name: /Details — Empty-store title/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Library details' });
  await expect(drawer.getByPlaceholder('A short description of this library')).toHaveValue('Empty-store summary');
  await expect(drawer.getByPlaceholder('Who to credit when this library is shown or shared')).toHaveValue('Empty-store credit');
  await expect(drawer.getByRole('combobox', { name: 'License' })).toHaveValue(/by/i);
  await drawer.getByRole('tab', { name: 'Metadata' }).click();
  await expect(drawer.getByRole('tabpanel', { name: 'Metadata' }).locator('input.value')).toHaveValue('Empty-store metadata');
});

test('STU-LIB-011 identity change and clear persist from Library details', async ({ page }) => {
  await page.goto('/studio/');
  await page.locator('header').getByRole('button', { name: /Details —/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Library details' });
  const identity = drawer.getByRole('textbox', { name: 'Your name' });
  await identity.fill('Identity tester');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.reload();
  await page.locator('header').getByRole('button', { name: /Details —/ }).click();
  await expect(page.getByRole('dialog', { name: 'Library details' }).getByRole('textbox', { name: 'Your name' })).toHaveValue('Identity tester');
  await page.getByRole('dialog', { name: 'Library details' }).getByRole('textbox', { name: 'Your name' }).fill('');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.reload();
  await page.locator('header').getByRole('button', { name: /Details —/ }).click();
  await expect(page.getByRole('dialog', { name: 'Library details' }).getByRole('textbox', { name: 'Your name' })).toHaveValue('');
});
