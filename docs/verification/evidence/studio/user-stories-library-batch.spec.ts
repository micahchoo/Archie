import { test, expect } from '@playwright/test';

async function createEmpty(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: /New exhibit/ }).first().click();
  await page.getByText('Start empty', { exact: true }).click();
  await page.locator('#createTitle').fill(title);
  await page.getByRole('button', { name: 'Create exhibit', exact: true }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: /Exhibits/ }).first().click();
  await expect(page.getByRole('button', { name: new RegExp(`^${title} \\d+ media items`) })).toBeVisible();
}

async function seedThree(page: import('@playwright/test').Page) {
  await page.goto('/studio/');
  await createEmpty(page, 'Alpha');
  await createEmpty(page, 'Beta');
  await createEmpty(page, 'Gamma');
}

function card(page: import('@playwright/test').Page, title: string) {
  return page.getByRole('button', { name: new RegExp(`^${title} \\d+ media items`) });
}

test('STU-LIB-002 search and clear restore all owned exhibits', async ({ page }) => {
  await seedThree(page);
  const search = page.getByRole('searchbox', { name: 'Search exhibits and media' });
  await search.fill('Alpha');
  await expect(page.getByText('Exhibits (1)', { exact: true })).toBeVisible();
  await expect(card(page, 'Alpha')).toBeVisible();
  await expect(card(page, 'Beta')).toHaveCount(0);
  await search.fill('');
  await expect(card(page, 'Alpha')).toBeVisible();
  await expect(card(page, 'Beta')).toBeVisible();
  await expect(card(page, 'Gamma')).toBeVisible();
});

test('STU-LIB-003 gallery lens persists after reload', async ({ page }) => {
  await seedThree(page);
  await page.getByRole('button', { name: 'All images', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All images', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: 'All images', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Exhibits', exact: true }).click();
  await expect(card(page, 'Alpha')).toBeVisible();
  await expect(card(page, 'Beta')).toBeVisible();
  await expect(card(page, 'Gamma')).toBeVisible();
});

test('STU-LIB-009 modifiers and filtered Select all exclude other exhibits', async ({ page }) => {
  await seedThree(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: /Select all \(3\)/ }).click();
  await expect(page.getByText('3 selected', { exact: true })).toBeVisible();
  const rosettes = page.getByRole('button', { name: /The Rosettes/ }).first();
  if (await rosettes.count()) await expect(rosettes).not.toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await card(page, 'Alpha').click();
  await page.keyboard.down('Shift');
  await card(page, 'Gamma').click();
  await page.keyboard.up('Shift');
  await expect(page.getByText('3 selected', { exact: true })).toBeVisible();
  await expect(page.getByText('3 selected', { exact: true })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search exhibits and media' });
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await search.fill('Beta');
  await page.getByRole('button', { name: /Select all \(1\)/ }).click();
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
  await expect(card(page, 'Alpha')).toHaveCount(0);
  await expect(card(page, 'Beta')).toHaveAttribute('aria-pressed', 'true');
});

test('STU-LIB-010A bulk rights apply to selected exhibits and persist', async ({ page }) => {
  await seedThree(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await card(page, 'Alpha').click();
  await page.keyboard.down('Control');
  await card(page, 'Beta').click();
  await page.keyboard.up('Control');
  await page.getByRole('button', { name: 'Rights…' }).click();
  const dialog = page.getByRole('dialog', { name: /rights/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Change license' }).check();
  await dialog.getByRole('combobox', { name: /License/ }).selectOption({ label: 'CC BY 4.0' });
  await dialog.getByRole('checkbox', { name: 'Change attribution' }).check();
  await dialog.getByPlaceholder(/credit/i).fill('Shared credit');
  await dialog.getByRole('button', { name: /Apply/ }).click();
  await page.waitForTimeout(1200);
  for (const title of ['Alpha', 'Beta']) {
    await page.getByRole('button', { name: `Details — ${title}` }).click();
    const details = page.getByRole('dialog');
    await expect(details.getByRole('combobox', { name: 'License' })).toHaveValue(/by/i);
    await expect(details.getByPlaceholder(/credit/i)).toHaveValue('Shared credit');
    await page.getByRole('button', { name: 'Close' }).click();
  }
  await page.reload();
  await page.getByRole('button', { name: 'Details — Alpha' }).click();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'License' })).toHaveValue(/by/i);
  await expect(page.getByRole('dialog').getByPlaceholder(/credit/i)).toHaveValue('Shared credit');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Details — Beta' }).click();
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'License' })).toHaveValue(/by/i);
  await expect(page.getByRole('dialog').getByPlaceholder(/credit/i)).toHaveValue('Shared credit');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Details — Gamma' }).click();
  await expect(page.getByRole('dialog').getByPlaceholder(/credit/i)).not.toHaveValue('Shared credit');
});

test('STU-LIB-010B bulk delete confirms two and retains third', async ({ page }) => {
  await seedThree(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await card(page, 'Alpha').click();
  await page.keyboard.down('Control');
  await card(page, 'Beta').click();
  await page.keyboard.up('Control');
  const remove = page.getByRole('button', { name: 'Delete…' });
  await remove.click();
  await expect(page.getByRole('button', { name: /Delete 2 exhibits/ })).toBeVisible();
  await page.getByRole('button', { name: /Delete 2 exhibits/ }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(card(page, 'Alpha')).toHaveCount(0);
  await expect(card(page, 'Beta')).toHaveCount(0);
  await expect(card(page, 'Gamma')).toBeVisible();
});
