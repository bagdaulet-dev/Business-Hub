/** Browser to HTTP to pricing engine, with an injected model completion. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createAppServer } from '../../src/server/http.mjs';

const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
const modelRule = {
  card_name: 'Charizard ex', card_number: '199/165', set_name: null,
  language: 'English', grader: 'PSA', finish: null, grade: 9,
  max_price_cents: 45000, min_discount_pct: 15
};
const modelInputs = [];
let completion = () => JSON.stringify(modelRule);
const server = createAppServer({
  complete: async ({ text }) => {
    modelInputs.push(text);
    return completion();
  }
});

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results = page.locator('#results');
  const query = page.locator('#query');
  const year = page.locator('#year');
  const budget = page.locator('#budget');
  const search = page.getByRole('button', { name: 'Search', exact: true });
  const aiSearch = page.getByRole('button', { name: 'Search Pokémon with AI' });
  const cards = page.locator('.listing');

  assert.ok(await results.isHidden());
  await page.getByRole('button', { name: /Sony WH-1000XM5/ }).click();
  assert.equal(await year.inputValue(), '2022');
  assert.ok(await results.isHidden());
  await year.fill('2023');
  await search.click();
  await page.getByText(/No matches in the demo catalog/).waitFor();
  await year.fill('2022');
  await budget.fill('250');
  await search.click();
  assert.equal(await cards.count(), 1);
  await page.getByText('Why this price?', { exact: true }).click();
  assert.match(await page.locator('details[open] p').textContent(), /\$299/);
  assert.deepEqual(modelInputs, []);

  await page.getByRole('button', { name: /Charizard ex/ }).click();
  assert.ok(await results.isHidden());
  await page.locator('#grade').selectOption('PSA 9');
  await budget.fill('450');
  await aiSearch.click();
  await page.getByText('1 match in archived Pokémon listings').waitFor();
  assert.equal(await cards.count(), 1);
  assert.equal(await page.locator('.price').textContent(), '$350');
  assert.match(await page.locator('#parsed-rule').textContent(), /Model year: 2023/);
  await page.getByText('Why this price?', { exact: true }).click();
  assert.match(await page.locator('details[open] p').textContent(), /\$460/);
  assert.deepEqual(modelInputs, ['Charizard ex 199/165; PSA 9; maximum price USD 450']);

  await year.fill('2022');
  await aiSearch.click();
  await page.getByText('0 matches in archived Pokémon listings').waitFor();
  assert.equal(await cards.count(), 0);
  assert.match(await page.locator('#parsed-rule').textContent(), /Model year: 2022/);

  completion = () => JSON.stringify({ ...modelRule, card_name: '<b>Charizard ex</b>' });
  await aiSearch.click();
  await page.getByText(/AI interpreted your search as Card: <b>Charizard ex<\/b>/).waitFor();
  assert.equal(await page.locator('#parsed-rule b').count(), 0);

  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let started;
  const providerStarted = new Promise(resolve => { started = resolve; });
  completion = async () => {
    started();
    await pending;
    return JSON.stringify(modelRule);
  };
  const callsBefore = modelInputs.length;
  try {
    await aiSearch.evaluate(button => { button.click(); button.click(); });
    await providerStarted;
    assert.equal(modelInputs.length, callsBefore + 1);
    const canceled = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/search'));
    await page.getByRole('button', { name: /Sony WH-1000XM5/ }).click();
    await canceled;
    assert.ok(await results.isHidden());
    assert.equal(await query.inputValue(), 'Sony WH-1000XM5');
  } finally {
    release();
  }

  await page.getByRole('button', { name: /Charizard ex/ }).click();
  completion = () => { throw Error('Simulated provider failure'); };
  await aiSearch.click();
  await page.getByText('AI search could not finish. Try again or use Search.').waitFor();
  await page.getByRole('button', { name: 'Clear search' }).click();
  assert.ok(await results.isHidden());
  assert.equal(await query.inputValue(), '');
  await query.fill('Canon');
  await search.click();
  assert.equal(await cards.count(), 4);

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth));
  }
  console.log('Browser checks passed: standard search, year, AI with an injected model, explanation, error recovery, and responsive layout.');
} finally {
  await browser.close();
  if (server.listening) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
