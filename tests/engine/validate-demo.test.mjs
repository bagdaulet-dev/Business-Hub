import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditDemoData} from '../../src/engine/validate-demo.mjs';
const source=JSON.parse(await readFile(new URL('../../data/demo/charizard-psa9-source-observations.json',import.meta.url),'utf8'));
const changed=fn=>{const data=structuredClone(source);fn(data);return auditDemoData(data);};
test('real fixture six unique historical observations with explicit freshness limits',()=>{const r=auditDemoData(source);assert.deepEqual(r.errors,[]);assert.equal(r.summary.unique_ids,6);assert.equal(r.summary.live_verified,false);assert.equal(r.summary.current_availability_verified,false);assert.equal(r.warnings.filter(x=>x.includes('SOURCE_CAPTURE_TIME_UNKNOWN')).length,6);});
test('URL hostname protocol and item identity must agree',()=>{for(const url of ['https://evil.example/itm/318895173729','https://www.ebay.com/itm/123','http://www.ebay.com/itm/318895173729','https://www.ebay.com/p/123?iid=wrong'])assert.ok(changed(d=>{d.observations[0].url=url;}).errors.some(x=>x.includes('URL_ITEM_ID_MISMATCH')));});
test('duplicate IDs and invalid cents rejected',()=>{assert.ok(changed(d=>{d.observations[1].item_id=d.observations[0].item_id;}).errors.some(x=>x.includes('DUPLICATE')));for(const price of [-1,1.5,'40000',Number.MAX_SAFE_INTEGER+1])assert.ok(changed(d=>{d.observations[0].price_cents=price;}).errors.some(x=>x.includes('INVALID_PRICE')));});
test('future capture and invalid calendar date rejected',()=>{assert.ok(changed(d=>{d.observations[0].source_capture_time='2026-11-16T00:00:00Z';}).errors.some(x=>x.includes('CAPTURE_AFTER')));assert.ok(changed(d=>{d.observations[0].retrieved_date='2026-02-30';}).errors.some(x=>x.includes('INVALID_RETRIEVED')));});
test('historical records cannot silently claim current freshness or shipping',()=>{for(const patch of [{live_verified:true},{current_listing_status:'active'},{shipping_cents:0},{cache_age:''},{risk_score:null}])assert.ok(changed(d=>Object.assign(d.observations[0],patch)).errors.length>0);});
test('synthetic data labelled as real is rejected',()=>{const r=changed(d=>{d.observations[0].sample=true;});assert.ok(r.errors.some(x=>x.includes('SYNTHETIC_RECORD_MISLABELLED')));assert.ok(r.warnings.some(x=>x.includes('NOT_REAL_EBAY')));});
test('wrong grade currency and card attributes rejected',()=>{for(const patch of [{grade:10},{currency:'EUR'},{card_number:'201/165'},{buying_option:'AUCTION'}])assert.ok(changed(d=>Object.assign(d.observations[0],patch)).errors.length>0);});
test('malformed roots fail cleanly',()=>{for(const data of [null,[],{},'bad'])assert.ok(auditDemoData(data).errors.length>0);});

test('empty or incomplete curated fixture cannot pass audit',()=>{
 const data=structuredClone(source);data.observations=[];
 assert.ok(auditDemoData(data).errors.includes('EXPECTED_SIX_DEMO_OBSERVATIONS'));
});
