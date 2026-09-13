import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
p.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
for (const [url, file] of [['http://localhost:5173/studio/', '/tmp/archie-studio-phase2.png'], ['http://localhost:5173/viewer/', '/tmp/archie-viewer-phase2.png']]) {
  const r = await p.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await p.screenshot({ path: file, fullPage: true });
  console.log(JSON.stringify({ url, status: r.status(), title: await p.title(), body: (await p.locator('body').innerText()).slice(0, 500) }));
}
console.log(JSON.stringify({ errors: errors.slice(0, 20) }));
await b.close();
