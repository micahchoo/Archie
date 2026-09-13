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

async function createWholeNote(page: import('@playwright/test').Page, comment: string) {
  await page.getByRole('button', { name: /Whole image/ }).click();
  const editor = page.locator('.note-editor-region');
  await expect(editor).toBeVisible({ timeout: 8000 });
  await editor.getByRole('textbox').first().fill(comment);
  await editor.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText(comment);
}

test('STU-ANN-006 convert whole note to region mode', async ({ page }) => {
  await openLocalArticle(page);
  await createWholeNote(page, 'Scope conversion probe');
  await page.getByRole('button', { name: 'Scope conversion probe' }).click();
  await expect(page.getByRole('button', { name: 'Draw a region' })).toBeVisible();
  await page.getByRole('button', { name: 'Draw a region' }).click();
  await expect(page.getByRole('button', { name: 'Box', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const plate = await page.locator('.canvas-plate').first().boundingBox();
  if (!plate) throw new Error('scope conversion canvas has no layout box');
  await page.mouse.click(plate.x + plate.width * 0.45, plate.y + plate.height * 0.16);
  await page.mouse.click(plate.x + plate.width * 0.55, plate.y + plate.height * 0.30);
  await page.screenshot({ path: 'test-results/ann006-after-retarget.png', fullPage: true });
  console.log(JSON.stringify({ ann006AfterDraw: { noteCount: await page.getByRole('list', { name: 'Notes on this object' }).locator('li').count(), editors: await page.locator('.note-editor-region').count(), url: page.url() } }));
  const converted = page.locator('.note-editor-region');
  if (await converted.count() === 0) {
    await page.getByRole('button', { name: 'Scope conversion probe' }).last().click();
  }
  await expect(converted).toBeVisible({ timeout: 8000 });
  await expect(converted).toContainText('A region of this object');
  const convertedComment = await converted.getByRole('textbox').first().inputValue();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toBeVisible({ timeout: 10000 });
  await page.getByLabel('Notes inspector').getByRole('button', { name: convertedComment }).click();
  await expect(page.locator('.note-editor-region')).toContainText('A region of this object');
  await page.locator('.note-editor-region').getByRole('button', { name: 'Make whole-object' }).click();
  await expect(page.locator('.note-editor-region')).toContainText('The whole object (no region)');
});

test('STU-ANN-007 delete note', async ({ page }) => {
  await openLocalArticle(page);
  await createWholeNote(page, 'Delete probe');
  await createWholeNote(page, 'Retained probe');
  await page.getByLabel('Notes inspector').getByRole('button', { name: 'Delete probe' }).click();
  await page.getByRole('button', { name: 'Delete note' }).click();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).not.toContainText('Delete probe');
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText('Retained probe');
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).not.toContainText('Delete probe');
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText('Retained probe');
});

test('STU-ANN-008 stacked note navigation', async ({ page }) => {
  await openLocalArticle(page);
  const firstPlate = await page.locator('.canvas-plate').first().boundingBox();
  if (!firstPlate) throw new Error('stacked-note canvas has no layout box');
  const drawPoints = [
    [firstPlate.x + firstPlate.width * 0.45, firstPlate.y + firstPlate.height * 0.16],
    [firstPlate.x + firstPlate.width * 0.55, firstPlate.y + firstPlate.height * 0.30],
  ] as const;
  const draw = async (comment: string) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await page.mouse.click(...drawPoints[0]);
    await page.mouse.click(...drawPoints[1]);
    const editor = page.locator('.note-editor-region');
    await expect(editor).toBeVisible({ timeout: 8000 });
    await editor.getByRole('textbox').first().fill(comment);
    await editor.getByRole('button', { name: 'Done' }).click();
  };
  await draw('Stack first');
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const slug = location.hash.split('/')[1] ?? '';
    const store = await import('/studio/src/store.ts');
    const core = await import('/studio/@fs/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/packages/render-core/src/index.ts');
    const dir = await store.openExhibitAnnotationsDir(slug);
    if (!dir) throw new Error('stack fixture annotation directory unavailable');
    const session = await core.AnnotationSession.load(dir, 'fixture');
    const first = session.notes()[0];
    if (!first) throw new Error('stack fixture first region unavailable');
    session.createNote({ target: first.target, body: { type: 'TextualBody', value: 'Stack second' } });
    await session.save(dir);
  });
  await page.reload();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText('Stack second');
  const storedTargets = await page.evaluate(async () => {
    const slug = location.hash.split('/')[1] ?? '';
    const store = await import('/studio/src/store.ts');
    const core = await import('/studio/@fs/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/packages/render-core/src/index.ts');
    const dir = await store.openExhibitAnnotationsDir(slug);
    if (!dir) return [];
    const session = await core.AnnotationSession.load(dir, 'probe');
    return session.notes().map((n: any) => ({ id: n.logicalId, target: n.target }));
  });
  console.log(JSON.stringify({ storedTargets }));
  console.log(JSON.stringify({ stackAfterCreate: { notes: await page.getByRole('list', { name: 'Notes on this object' }).innerText(), editors: await page.locator('.note-editor-region').count() } }));
  await page.getByLabel('Notes inspector').getByRole('button', { name: /Stack first/ }).click();
  console.log(JSON.stringify({ stackAfterSelect: { editors: await page.locator('.note-editor-region').count(), groups: await page.getByRole('group', { name: 'Stacked notes at this spot' }).count() } }));
  await expect(page.getByRole('group', { name: 'Stacked notes at this spot' })).toBeVisible();
  await page.getByRole('button', { name: 'Next note here' }).click();
  await expect(page.locator('.note-editor-region').getByRole('textbox').first()).toHaveValue('Stack second');
  await page.getByRole('button', { name: 'Previous note here' }).click();
  await expect(page.locator('.note-editor-region').getByRole('textbox').first()).toHaveValue('Stack first');
});

test('STU-ANN-010 cite an exhibit into note comment', async ({ page }) => {
  await openLocalArticle(page);
  await createWholeNote(page, 'Citation probe');
  await page.getByRole('button', { name: 'Citation probe' }).click();
  const editor = page.locator('.note-editor-region');
  await editor.getByRole('button', { name: /Comment Citation probe/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Cite a note or exhibit' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button').filter({ hasText: 'article' }).first().click();
  const citedComment = editor.getByRole('textbox').first();
  await expect(citedComment).toHaveValue(/archie:/);
  await expect(citedComment).toHaveValue(/Citation probe.*article.*archie:/i);
  const insertedCitation = await citedComment.inputValue();
  expect(insertedCitation).toMatch(/Citation probe\[article\]\(archie:[^)]+\/#[^)]*\/o\/[^)]+\)$/i);
  await editor.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText('Citation probe');
  await page.getByLabel('Notes inspector').getByRole('button', { name: 'Citation probe' }).click();
  await expect(page.locator('.note-editor-region').getByRole('textbox').first()).toHaveValue(/Citation probe.*article.*archie:/i);
});

test('STU-NAR-002 add a narrative section from a note', async ({ page }) => {
  await openLocalArticle(page);
  await createWholeNote(page, 'Narrative seed');
  await page.getByRole('button', { name: /Narrative Not started/ }).click();
  await page.getByRole('combobox', { name: 'Add a section from an existing note' }).selectOption({ label: 'Narrative seed' });
  await expect(page.getByRole('textbox', { name: 'Section prose' })).toHaveValue('Narrative seed');
});

test('STU-NAR-004 camera frame cancel', async ({ page }) => {
  await openLocalArticle(page);
  await page.getByRole('button', { name: /Narrative Not started/ }).click();
  await page.getByRole('button', { name: 'Add a section' }).click();
  await expect(page.getByRole('textbox', { name: 'Section title' })).toBeVisible();
  await page.getByRole('button', { name: 'Set area' }).click();
  await expect(page.getByText('Set the area on the image')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Set area' })).toBeVisible();
  await page.getByRole('button', { name: 'Set area' }).click();
  const plate = await page.locator('.canvas-plate').first().boundingBox();
  if (!plate) throw new Error('framing canvas has no layout box');
  await page.mouse.click(plate.x + plate.width * 0.45, plate.y + plate.height * 0.16);
  await page.mouse.click(plate.x + plate.width * 0.55, plate.y + plate.height * 0.30);
  await expect(page.getByRole('button', { name: 'Change view' })).toBeVisible({ timeout: 8000 });
});

test('STU-NAR-005 section navigation', async ({ page }) => {
  await openLocalArticle(page);
  await page.getByRole('button', { name: /Narrative Not started/ }).click();
  await page.getByRole('button', { name: 'Add a section' }).click();
  const first = page.getByRole('button', { name: /Center the canvas on this section|Go to article/ }).first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(first).toHaveAttribute('aria-current', 'true');
});

test('STU-VIEW-004 reading filter changes visible notes', async ({ page }) => {
  await openLocalArticle(page);
  await createWholeNote(page, 'Reading filter probe');
  await expect(page.getByLabel('Readings')).toBeVisible();
  await page.getByRole('button', { name: /New reading/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Readings' });
  await dialog.getByLabel('New reading name').fill('Filtered');
  await dialog.getByRole('button', { name: 'Add' }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  const reading = page.getByRole('group', { name: /Filtered — reading/ });
  await expect(reading).toBeVisible();
  await reading.getByRole('radio', { name: 'Draw new notes into Filtered' }).check();
  await page.getByRole('button', { name: /Whole image/ }).click();
  const filteredEditor = page.locator('.note-editor-region');
  await expect(filteredEditor).toBeVisible();
  await filteredEditor.getByRole('textbox').first().fill('Filtered note');
  await filteredEditor.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText('Filtered note');
  await reading.getByLabel('Show Filtered notes').uncheck();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).not.toContainText('Filtered note');
  await reading.getByLabel('Show Filtered notes').check();
  await expect(page.getByRole('list', { name: 'Notes on this object' })).toContainText('Filtered note');
});
