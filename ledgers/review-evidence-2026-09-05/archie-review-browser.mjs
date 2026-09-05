import { createRequire } from 'node:module';
const require = createRequire('/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/package.json');
const { chromium } = require('playwright');
const b = await chromium.launch({headless: true});
const p = await b.newPage({ viewport: {width:1440,height:1000}});
const errors=[];
p.on('pageerror',e=>errors.push(String(e)));
for (const surface of ['studio','viewer']) {
  await p.goto(`http://localhost:5173/${surface}/`,{waitUntil:'networkidle',timeout:60000});
  await p.screenshot({path:`/tmp/archie-review-${surface}.png`});
  console.log(surface, (await p.locator('body').innerText()).slice(0,7500));
}
console.log('pageerrors',JSON.stringify(errors));
await b.close();
