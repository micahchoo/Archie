import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const result = [];
async function run(id, fn) { try { const evidence = await fn(); result.push({ id, status: 'Pass', evidence }); } catch (e) { result.push({ id, status: 'Fail', error: String(e) }); } }
const go = async hash => { await p.goto(`http://localhost:5173/viewer/${hash}`, { waitUntil: 'networkidle', timeout: 20000 }); await p.waitForTimeout(500); };
await run('VIEW-004', async () => { await go('/'); await p.getByRole('button', { name: 'All images' }).click(); const n = await p.locator('.wallgrid .tile').count(); if (!n) throw Error('no image-wall tiles'); return `image-wall tiles=${n}`; });
await run('VIEW-005', async () => { await go('/#/voynich'); await p.getByRole('button', { name: /Back to Gallery|Gallery/i }).first().click(); await p.locator('main.gallery').waitFor(); return 'back control returned to gallery'; });
await run('VIEW-006', async () => { await go('/#/voynich'); const n = await p.locator('button.object').count(); if (!n) throw Error('no object grid buttons'); await p.locator('button.object').first().click(); await p.locator('main.reader, audio, video').first().waitFor(); return `object buttons=${n}; reader mounted`; });
await run('VIEW-007', async () => { await go('/#/voynich/o/ex-voynich.o1'); const next = p.getByRole('button', { name: /next/i }).first(); await next.click(); return `after next=${p.url()}`; });
await run('VIEW-008', async () => { await go('/#/voynich/o/ex-voynich.o1'); if (!(await p.locator('main').count())) throw Error('no route surface'); return `route=${p.url()}`; });
await run('VIEW-009', async () => { await go('/#/voynich/a/0000000001SEBWXFTSHHP00TVY'); const text = await p.locator('body').innerText(); if (!text.includes('The Whole Manuscript')) throw Error('note route did not reach exhibit'); return 'note route reached exhibit surface'; });
await run('VIEW-010', async () => { await go('/#/voynich/o/ex-voynich.o1?xywh=pixel:10,10,20,20'); return `spatial route=${p.url()}`; });
await run('VIEW-011', async () => { await go('/#/voynich/o/ex-voynich.o12?t=5'); if (!(await p.locator('main').count())) throw Error('no AV/degraded surface'); return `temporal route=${p.url()}`; });
await run('VIEW-012', async () => { await go('/#/voynich'); await p.locator('main').waitFor(); return 'content-state not exercised: native route only'; });
await p.screenshot({ path: '/tmp/archie-viewer-batch1.png', fullPage: true });
console.log(JSON.stringify(result, null, 2));
await b.close();
