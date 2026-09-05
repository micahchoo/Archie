import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire('/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/package.json');
const {chromium}=require('playwright');
const b=await chromium.launch();const p=await b.newPage();
await p.route('http://localhost:5173/review-source/**',async route=>{
 const rel=new URL(route.request().url()).pathname.replace('/review-source/','');
 try {const data=await readFile('/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/apps/viewer/public/published/'+rel);
 await route.fulfill({status:200,contentType:rel.endsWith('.json')?'application/json':'application/octet-stream',body:rel.endsWith('.json')?data.toString().replaceAll('The Rosettes','FOREIGN ROSETTES'):data});}
 catch {await route.fulfill({status:404,body:'Not found'});}
});
await p.goto('http://localhost:5173/viewer/#/voynich-rosettes?src='+encodeURIComponent('http://localhost:5173/review-source/'),{waitUntil:'domcontentloaded'});
await p.getByText('FOREIGN ROSETTES',{exact:true}).first().waitFor({timeout:30000});
await p.waitForFunction(()=>!location.hash.includes('src='),{},{timeout:30000});
console.log('foreign-loaded',p.url(),(await p.locator('body').innerText()).slice(0,250));
await p.reload({waitUntil:'domcontentloaded'});
await p.getByText('The Rosettes',{exact:true}).first().waitFor({timeout:30000});
console.log('after-reload',p.url(),(await p.locator('body').innerText()).slice(0,250));
await b.close();
