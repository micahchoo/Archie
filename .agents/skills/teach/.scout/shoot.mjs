import { chromium } from 'playwright';

const BASE = 'http://localhost:8792';
const OUT = '/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/docs/learn/assets/img';

const shots = [
  { url: `${BASE}/`,                  file: 'gallery.png',     wait: 2500 },
  { url: `${BASE}/#/voynich`,         file: 'grid-led.png',    wait: 4000 },
  { url: `${BASE}/#/voynich-reading`, file: 'narrative-led.png', wait: 4500 },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });

for (const s of shots) {
  try {
    await page.goto(s.url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(s.wait);
    await page.screenshot({ path: `${OUT}/${s.file}` });
    const title = await page.title();
    const hasGrid = await page.$$eval('[class*="card"], [class*="grid"]', els => els.length).catch(() => 0);
    const hasAside = await page.$$eval('aside', els => els.length).catch(() => 0);
    console.log(`OK ${s.file} | title="${title}" | cardish=${hasGrid} aside=${hasAside}`);
  } catch (e) {
    console.log(`FAIL ${s.file}: ${e.message}`);
  }
}
await browser.close();
