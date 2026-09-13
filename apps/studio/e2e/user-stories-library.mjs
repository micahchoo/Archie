import { chromium } from 'playwright';
import fs from 'node:fs';
const base = 'http://localhost:5198/studio/';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
 p.setDefaultTimeout(4000);
const trace = []; p.on('console', m => trace.push(`console:${m.type()}:${m.text()}`)); p.on('pageerror', e => trace.push(`pageerror:${e.message}`));
const result = [];
async function home() { trace.push('home:start'); await p.goto(base, { waitUntil: 'domcontentloaded', timeout: 8000 }); await p.waitForTimeout(600); trace.push('home:loaded'); }
try {
  await home();
  await p.screenshot({ path: '/tmp/archie-library-before-create.png', fullPage: true });
  await p.getByRole('button', { name: /New exhibit/ }).click();
  trace.push('new-clicked'); await p.screenshot({ path: '/tmp/archie-library-create-dialog.png', fullPage: true });
  trace.push(`dialog:${(await p.locator('[role=dialog]').innerText()).slice(0,1000)}`);
  await p.getByText('Start empty', { exact: true }).click();
  trace.push('empty-clicked'); await p.screenshot({ path: '/tmp/archie-library-empty-path.png', fullPage: true });
  trace.push(`empty:${(await p.locator('[role=dialog]').innerText()).slice(0,1000)}`);
  const title = p.locator('#createTitle'); await title.fill('Baseline Empty Exhibit');
  await p.getByRole('button', { name: 'Create exhibit', exact: true }).click();
  await p.waitForTimeout(900);
  const overview = (await p.locator('body').innerText()).includes('Baseline Empty Exhibit');
  result.push({ id: 'STU-LIB-005', status: overview ? 'Pass' : 'Fail', observed_result: overview ? 'Created title opened an empty overview.' : 'Create did not show the titled overview.' });
  await p.getByRole('button', { name: /Exhibits/ }).first().click(); await p.waitForTimeout(500);
  const card = p.getByRole('button', { name: /Baseline Empty Exhibit/ });
  result.push({ id: 'STU-LIB-005-reopen', status: await card.count() ? 'Pass' : 'Fail', observed_result: await card.count() ? 'Created exhibit remained on library after returning.' : 'Created exhibit absent after returning.' });
  if (await card.count()) {
    await p.getByRole('button', { name: /Details — Baseline Empty Exhibit/ }).click();
    const drawer = p.locator('[role=dialog]');
    const titleField = drawer.locator('input[placeholder*="exhibit"]');
    await titleField.fill('Baseline Renamed Exhibit'); await titleField.press('Tab');
    await drawer.locator('label.visibility input[type=checkbox]').check(); await p.waitForTimeout(1200);
    await p.keyboard.press('Escape'); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
    const renamed = p.getByRole('button', { name: /Baseline Renamed Exhibit/ });
    result.push({ id: 'STU-LIB-007', status: await renamed.count() ? 'Pass' : 'Fail', observed_result: await renamed.count() ? 'Exhibit title remained after reload.' : 'Renamed exhibit was not found after reload.' });
    if (await renamed.count()) {
      await p.getByRole('button', { name: /Details — Baseline Renamed Exhibit/ }).click();
      const checked = await p.locator('[role=dialog] input[type=checkbox]').isChecked();
      result.push({ id: 'STU-LIB-007-unlisted', status: checked ? 'Pass' : 'Fail', observed_result: `Unlisted checkbox after reload: ${checked}` });
      await p.keyboard.press('Escape'); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(600);
      await p.getByRole('button', { name: 'Select' }).click();
      const all = p.getByRole('button', { name: /Select all/ });
      const clear = p.getByRole('button', { name: /Clear/ });
      result.push({ id: 'STU-LIB-009', status: (await all.count() && await clear.count()) ? 'Pass' : 'Fail', observed_result: `Selection actions visible: Select all=${await all.count() > 0}, Clear=${await clear.count() > 0}` });
      if (await all.count()) { await all.click(); const selectedText = await p.locator('body').innerText(); const hasCount = /selected/i.test(selectedText); if (await clear.count()) await clear.click(); const after = await p.locator('body').innerText(); result.push({ id: 'STU-LIB-009-clear', status: hasCount && !/selected/i.test(after) ? 'Pass' : 'Fail', observed_result: `Select-all count shown=${hasCount}; Clear removed selection=${!/selected/i.test(after)}` }); }
      await p.getByRole('button', { name: /Details — Baseline Renamed Exhibit/ }).click();
      const remove = p.getByRole('button', { name: /Remove from library/ });
      if (await remove.count()) { await remove.click(); const confirm = p.getByRole('button', { name: /Confirm/ }); const armed = await confirm.count() > 0; if (armed) await confirm.click(); await p.waitForTimeout(1000); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(500); result.push({ id: 'STU-LIB-008', status: (await p.getByRole('button', { name: /Baseline Renamed Exhibit/ }).count()) === 0 ? 'Pass' : 'Fail', observed_result: `Delete armed=${armed}; card absent after reload=${(await p.getByRole('button', { name: /Baseline Renamed Exhibit/ }).count()) === 0}` }); }
    }
  }
} catch (e) { trace.push(`error:${e}`); result.push({ id: 'STU-LIB-005', status: 'Not tested', error: String(e), trace, body: (await p.locator('body').innerText().catch(() => '')).slice(0,3000) }); }
fs.writeFileSync('/tmp/archie-library-debug.json', JSON.stringify({trace, result}, null, 2));
fs.writeFileSync('/tmp/archie-library-stories.json', JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2)); await b.close();
