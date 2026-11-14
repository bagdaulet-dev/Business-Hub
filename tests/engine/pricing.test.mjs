import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluatePricing, matchesExactAttributes } from '../../src/engine/pricing.mjs';

const { observations } = JSON.parse(readFileSync(new URL('../../data/demo/charizard-psa9-source-observations.json', import.meta.url), 'utf8'));
const identity = Object.fromEntries(['card_number', 'set_name', 'language', 'grader', 'grade', 'finish'].map(key => [key, observations[0][key]]));
const copy = () => structuredClone(observations);

test('real historical sample: leave-one-out median, explicit provenance and price-only basis', () => {
  const result = evaluatePricing(observations, identity);
  const cheap = result.findings[0];
  assert.equal(cheap.price_cents, 35000);
  assert.equal(cheap.reference_price_cents, 46000);
  assert.equal(cheap.difference_cents, 11000);
  assert.equal(cheap.below_sample_median_pct, 23.91);
  assert.equal(cheap.comparable_count, 5);
  assert.ok(!cheap.comparable_item_ids.includes(cheap.item_id));
  assert.equal(cheap.delivered_total_cents, null);
  assert.equal(result.live_verified, false);
  assert.equal(result.data_mode, 'historical_observations');
  assert.match(result.warnings[1], /excludes shipping/);
});

test('budget filters candidates without truncating baseline', () => {
  const result = evaluatePricing(observations, identity, { maxPriceCents: 40000 });
  assert.equal(result.findings.length, 2);
  assert.equal(result.matched_pool_count, 6);
  assert.equal(result.findings[0].reference_price_cents, 46000);
  assert.equal(result.findings[0].comparable_count, 5);
});

test('normalizes casing/whitespace; excludes other grade/card, currency, auctions and missing identity', () => {
  const items = copy();
  items[0].grader = '  pSa  ';
  items[1].grade = 10;
  items[2].card_number = '200/165';
  items[3].buying_option = 'AUCTION';
  items[4].currency = 'CAD';
  items[5].finish = null;
  assert.equal(matchesExactAttributes(items[0], identity), true);
  const result = evaluatePricing(items, identity);
  assert.deepEqual(result.findings.map(x => x.item_id), [items[0].item_id]);
  assert.equal(result.findings[0].reference_price_cents, null);
  assert.equal(result.exclusions.length, 5);
  assert.equal(evaluatePricing(observations, {...identity, card_number:'999/999'}).findings.length, 0);
});

test('delivered cost never uses historical shipping or unknown ZIP as zero', () => {
  assert.throws(() => evaluatePricing(observations, identity, {basis:'delivered'}), /destinationZip/);
  const result = evaluatePricing(observations, identity, {basis:'delivered', destinationZip:'30349'});
  assert.equal(result.findings.length, 6);
  assert.ok(result.findings.every(x => x.comparison_cost_cents === null && x.reference_price_cents === null));
  assert.equal(evaluatePricing(observations, identity, {basis:'delivered',destinationZip:'30349',maxPriceCents:999999}).findings.length, 0);
  const items = copy().map(x => ({...x, shipping_cents:0, shipping_destination_zip:'30349'}));
  items[0].shipping_destination_zip = '11111';
  const known = evaluatePricing(items, identity, {basis:'delivered',destinationZip:'30349'});
  assert.equal(known.findings[0].comparison_cost_cents, 35000);
  assert.equal(known.findings[0].comparable_count, 4);
  assert.equal(known.findings.at(-1).comparison_cost_cents, null);
});

test('duplicate IDs and invalid monetary values are rejected rather than silently coerced', () => {
  assert.throws(() => evaluatePricing([...observations, observations[0]], identity), /duplicate/);
  for (const bad of [-1, 1.5, '35000', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null]) {
    const items = copy(); items[0].price_cents = bad;
    assert.throws(() => evaluatePricing(items, identity), /integer cents/);
  }
  const items = copy(); items[0].shipping_cents = -1;
  assert.throws(() => evaluatePricing(items, identity), /shipping_cents/);
});

test('configurable minimum, even-sized baseline and zero denominator', () => {
  assert.equal(evaluatePricing(observations.slice(0,3),identity).findings[0].reference_price_cents,null);
  const sample = observations.slice(0,3).map((x,i)=>({...x,price_cents:[100,200,301][i]}));
  const result = evaluatePricing(sample,identity,{minComparables:2});
  assert.equal(result.findings[0].reference_price_cents,250.5);
  const zero = sample.map(x=>({...x,price_cents:0}));
  assert.equal(evaluatePricing(zero,identity,{minComparables:2}).findings[0].below_sample_median_pct,null);
  assert.throws(()=>evaluatePricing(sample,identity,{minComparables:0}),/minComparables/);
});

test('stable ID tie ordering and no input mutation', () => {
  const items = copy().map(x=>({...x,price_cents:100}));
  const before = JSON.stringify(items);
  const result = evaluatePricing(items.reverse(),identity);
  assert.deepEqual(result.findings.map(x=>x.item_id),items.map(x=>x.item_id).sort());
  assert.equal(JSON.stringify(items.reverse()),before);
});

test('explicit bundle/accessory/replica flags exclude both candidate and baseline; unknown type remains eligible', () => {
  const items = copy();
  items[0].is_lot_or_bundle = true;
  items[1].item_type = '  ACCESSORY ';
  items[2].item_type = 'replica';
  items[3].item_type = 'bundle';
  items[4].item_type = null;
  const result = evaluatePricing(items,identity);
  assert.equal(result.findings.length,2);
  assert.equal(result.matched_pool_count,2);
  assert.ok(result.findings.every(x=>x.comparable_count === 1 && x.reference_price_cents === null));
  assert.equal(result.exclusions.filter(x=>x.reason==='incompatible_item_type').length,4);
});

test('discount threshold applies after complete baseline and rejects unknown/rounded-up discount', () => {
  const result = evaluatePricing(observations,identity,{maxPriceCents:40000,minDiscountPct:20});
  assert.equal(result.findings.length,1);
  assert.equal(result.findings[0].price_cents,35000);
  assert.equal(result.findings[0].reference_price_cents,46000);
  assert.equal(result.findings[0].comparable_count,5);
  assert.equal(evaluatePricing(observations.slice(0,3),identity,{minDiscountPct:0}).findings.length,0);
  // 23.913... displays 23.91 but must not satisfy 23.914.
  assert.equal(evaluatePricing(observations,identity,{minDiscountPct:23.914}).findings.length,0);
  for (const bad of [-1,101,NaN,Infinity,'20']) {
    assert.throws(()=>evaluatePricing(observations,identity,{minDiscountPct:bad}),/minDiscountPct/);
  }
});
