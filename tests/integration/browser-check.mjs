/** Browser to HTTP to the pricing engine with an injected model completion. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createAppServer } from '../../src/server/http.mjs';

const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
const rule = {
  product_id:'charizard-ex-199-165-psa9',model_year:null,item_location_countries:[],condition:null,color:null,configuration:null,
  card_name: 'Charizard ex', card_number: '199/165', set_name: null, language: 'English', grader: 'PSA',
  finish: null, grade: 9, max_price_cents: 45000, min_discount_pct: null
};
const modelInputs = [];
let complete = async () => JSON.stringify(rule);
const server = createAppServer({
  complete: async input => { modelInputs.push(input.text); return complete(input); }
});

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const page = await browser.newPage({ viewport: { width: 1360, height: 950 } });
  const url = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  const results = page.locator('#results');
  const query = page.locator('#query');
  const filter = page.getByRole('button', { name: /^Filters/ });
  const search = page.getByRole('button', { name: 'Search', exact: true });
  const example = page.getByRole('button', { name: /Charizard ex/ });
  const price = page.locator('.price').first();

  assert.ok(await results.isHidden());
  await page.mouse.move(850, 250);
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--pointer-x') === '850px');
  assert.match(await page.locator('.display').evaluate(el => el.style.getPropertyValue('--tilt-y')), /deg$/);
  assert.ok(await page.locator('.product-rig img').evaluate(img => img.complete && img.naturalWidth > 0));
  if (process.env.DESKTOP_SCREENSHOT) {
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.examples')).opacity === '1');
    await page.screenshot({ path: process.env.DESKTOP_SCREENSHOT });
  }

  await example.click();
  assert.ok(await results.isHidden());
  assert.equal(modelInputs.length, 0);
  await filter.click();
  await page.locator('#budget').fill('480');
  await page.locator('#year').fill('2023');
  await filter.click();
  assert.equal(await page.locator('#filter-count').textContent(), '2');
  assert.ok(await page.locator('#budget').isHidden());
  await search.click();
  await page.getByText('3 matches').waitFor();
  assert.equal(await price.textContent(), '$400');
  assert.match(await page.locator('#parsed-rule').textContent(), /Max price: \$480 Set in filters/);

  await page.getByText('Price comparison', { exact: true }).first().click();
  assert.match(await page.locator('details[open] p').first().textContent(), /Median of 4 other comparable listings: \$480/);
  assert.match(await page.locator('details[open] p').first().textContent(), /16\.7%/);
  if (process.env.RESULT_SCREENSHOT) await page.locator('.listing').first().screenshot({ path: process.env.RESULT_SCREENSHOT });

  await filter.click();
  await page.getByText('United States', { exact: true }).click();
  assert.ok(await results.isHidden());
  await search.click();
  await page.getByText('2 matches').waitFor();
  assert.equal(await price.textContent(), '$459.99');
  await page.getByRole('button', { name: 'All countries', exact: true }).click();
  await search.click();
  await page.getByText('3 matches').waitFor();
  assert.equal(await price.textContent(), '$400');

  await page.locator('#budget').fill('0');
  await search.click();
  await page.getByText('0 matches').waitFor();
  assert.match(await page.locator('#parsed-rule').textContent(), /Max price: \$0 Set in filters/);
  await page.getByRole('button', { name: 'Clear max price' }).click();
  await search.click();
  await page.getByText('1 match').waitFor();
  assert.match(await page.locator('#parsed-rule').textContent(), /Max price: \$450/);

  let started;
  const pending = new Promise(resolve => { started = resolve; });
  let release;
  const pause = new Promise(resolve => { release = resolve; });
  complete = async () => { started(); await pause; return JSON.stringify(rule); };
  try {
    const before = modelInputs.length;
    await search.evaluate(button => { button.click(); button.click(); });
    await pending;
    assert.equal(modelInputs.length, before + 1);
    const canceled = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/search'));
    await query.fill('Different search');
    await canceled;
    assert.ok(await results.isHidden());
  } finally { release(); }

  complete = async () => { throw Error('Simulated provider failure'); };
  await example.click();
  await search.click();
  await page.getByText('Search could not finish. Try again.', { exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Retry search' }).isVisible());

  // Real HTTP + sourced electronics catalog, with deterministic injected model output.
  complete = async () => JSON.stringify({ ...rule, product_id:'canon-eos-r50', card_name:null,
    card_number:null,language:null,grader:null,grade:null,max_price_cents:80000,
    condition:'New',color:'Black',configuration:'body_only' });
  await page.getByRole('button', { name: /Canon EOS R50/ }).click();
  assert.equal(await page.locator('#year').inputValue(), '');
  await search.click();
  await page.getByText('3 matches').waitFor();
  assert.equal(await price.textContent(), '$679.99');
  await page.getByText('Price comparison', { exact: true }).first().click();
  assert.ok(await page.getByText('Not enough comparable listings.', { exact: true }).first().isVisible());

  complete = async () => JSON.stringify({ ...rule, product_id:'sony-wh1000xm5', card_name:null,
    card_number:null,language:null,grader:null,grade:null,max_price_cents:25000,
    condition:'New',color:'Black',configuration:'headphones' });
  await page.getByRole('button', { name: /Sony WH-1000XM5/ }).click();
  await search.click();
  await page.getByText('4 matches').waitFor();
  assert.equal(await price.textContent(), '$199');

  complete = async () => JSON.stringify({ ...rule,max_price_cents:38000 });
  await example.click();
  await search.click();
  await page.getByText('0 matches').waitFor();
  const beforeWatch=modelInputs.length;
  await page.getByRole('button',{name:'Watch this search',exact:true}).click();
  await page.locator('.arrived-listing').waitFor({timeout:16000});
  assert.equal(await page.locator('#status').textContent(),'1 match');
  assert.equal(await page.locator('.arrived-listing .price').first().textContent(),'$375.00');
  assert.ok(await page.locator('#watch-stop').isVisible());
  await page.waitForFunction(()=>document.querySelectorAll('.arrived-listing').length===2,{},{timeout:8000});
  assert.equal(await page.locator('#status').textContent(),'2 matches');
  assert.deepEqual(await page.locator('.arrived-listing .price').allTextContents(),['$360.00','$375.00']);
  assert.equal(await page.locator('#findings .empty').count(),0);
  assert.equal(modelInputs.length,beforeWatch,'Watch must not call Kimi again');
  assert.equal(await page.locator('.arrived-listing .price').first().textContent(),'$360.00');
  assert.equal(await page.locator('.arrived-listing a').first().getAttribute('href'),'https://www.ebay.com/itm/168684845072');
  assert.ok(await page.locator('#watch-start').isHidden());
  assert.ok(await page.locator('#watch-stop').isHidden());
  assert.doesNotMatch(await page.locator('main').innerText(),/simulation|synthetic|demo notification|replay/i);
  assert.match(await page.locator('footer').innerText(),/staged/);
  if(process.env.WATCH_SCREENSHOT) await page.locator('#results').screenshot({path:process.env.WATCH_SCREENSHOT});
  await page.getByRole('button', { name: 'Clear search' }).click();
  assert.equal(await query.inputValue(), '');
  assert.ok(await results.isHidden());

  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.product-rig img').evaluate(img => getComputedStyle(img).animationName), 'none');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), `Overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.MOBILE_SCREENSHOT) {
    await query.blur();
    await page.screenshot({ path: process.env.MOBILE_SCREENSHOT });
  }
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: pointer effects, one search, filters, override precedence, empty and error states, cancellation, sourced electronics, 10s/15s real arrivals sorted by price and mobile layout.');
} finally {
  await browser.close();
  if (server.listening) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
