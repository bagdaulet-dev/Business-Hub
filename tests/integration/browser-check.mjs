/** Offline browser integration check. Start the local server first; all AI requests are intercepted. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const {chromium} = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'});
const {observations} = JSON.parse(await readFile(new URL('../../data/demo/charizard-psa9-source-observations.json',import.meta.url),'utf8'));
const listing=observations.find(row=>row.price_cents===35000);
const peers=observations.filter(row=>row!==listing);
const payload={rule:{card_name:'Charizard ex',max_price_cents:45000},results:[{listing,peers,benchmark:46000,delta:11000,percent:23.91}]};
const checks=[];
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 let requests=[]; let reply=payload; let fail=false; let release=null;
 await page.route('**/api/search',async route=>{
  requests.push({method:route.request().method(),body:route.request().postDataJSON()});
  if(release) await release;
  try{await route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{error:{code:'PROVIDER_NOT_CONFIGURED'}}:reply)});}catch{}
 });
 await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:4173');
 await page.locator('.listing').first().waitFor();
 await page.locator('[data-query="Sony WH-1000XM5"]').click();
 await page.locator('#reset').click();
 await page.locator('#query').fill('Canon');
 await page.locator('#hunt button.primary').click();
 await page.locator('details summary').first().click();
 assert.equal(requests.length,0);checks.push('load/examples/reset/ordinary search/details make zero AI requests');
 // Empty AI query must not wedge future submissions.
 await page.locator('#query').fill('');
 await page.locator('button[value="ai"]').click();
 assert.equal(requests.length,0);
 await page.locator('#query').fill('Charizard ex 199/165 PSA 9 до $450');
 await page.locator('button[value="ai"]').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('AI-поиск: 1'));
 assert.equal(requests.length,1);assert.equal(requests[0].method,'POST');assert.deepEqual(Object.keys(requests[0].body),['text']);
 assert.equal(await page.locator('.listing').count(),1);
 assert.match(await page.locator('.price').textContent(),/350/);
 assert.match(await page.locator('#parsed-rule').textContent(),/450/);
 checks.push('empty query recovers; explicit AI submit renders one result and parsed conditions');
 reply={...payload,rule:{card_name:'<img src=x onerror="window.__xss=1">',max_price_cents:45000}};
 await page.locator('button[value="ai"]').click();
 await page.waitForFunction(()=>document.querySelector('#parsed-rule').textContent.includes('<img'));
 assert.equal(await page.locator('#parsed-rule img').count(),0);assert.equal(await page.evaluate(()=>window.__xss),undefined);
 checks.push('parsed model text is not executable HTML');
 fail=true;
 await page.locator('button[value="ai"]').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('не настроен'));
 const afterFailure=requests.length;
 await page.locator('[data-query="Sony WH-1000XM5"]').click();
 assert.ok(await page.locator('.listing').count()>0);assert.equal(requests.length,afterFailure);
 checks.push('provider failure leaves ordinary search working');
 fail=false;reply=payload;
 let resolve;release=new Promise(r=>{resolve=r;});
 const before=requests.length;
 await page.locator('#query').fill('Charizard ex');
 await page.locator('button[value="ai"]').evaluate(button=>{button.click();button.click();});
 await page.waitForFunction(()=>document.querySelector('button[value="ai"]').disabled);
 // Ensure intercepted first request has reached the route before checking count.
 await page.waitForTimeout(100);
 assert.equal(requests.length,before+1);
 await page.locator('#reset').click();
 const resetStatus=await page.locator('#status').textContent();
 resolve();release=null;
 await page.waitForTimeout(100);
 assert.equal(await page.locator('#status').textContent(),resetStatus);
 assert.equal(await page.locator('#parsed-rule').textContent(),'');
 checks.push('rapid double click is single request; reset invalidates late response');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
 assert.equal(overflow,false);checks.push('390px mobile viewport has no horizontal overflow');
 await page.screenshot({path:process.env.BROWSER_SCREENSHOT || '/tmp/collectwatch-browser.png',fullPage:true});
 console.log(JSON.stringify({passed:checks.length,checks,aiRequestsIntercepted:requests.length,liveProviderCalls:0},null,2));
} finally {await browser.close();}
