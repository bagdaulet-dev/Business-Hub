import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProductRule,validateProductRule,ATTRIBUTE_KEYS} from '../../src/providers/product-rule-parser.mjs';
import {loadCatalog,searchCatalog} from '../../src/engine/catalog-search.mjs';
import {matchesWatchRule} from '../../src/engine/demo-watch.mjs';
const rule=(product_id,changes={})=>({product_id,...Object.fromEntries(ATTRIBUTE_KEYS.map(k=>[k,null])),max_price_cents:null,min_discount_pct:null,model_year:null,item_location_countries:[],...changes});
test('parser accepts three products, years and countries without implicit attributes',async()=>{
 for(const id of ['sony-wh1000xm5','canon-eos-r50','charizard-ex-199-165-psa9']){
 const expected=rule(id,{model_year:2023,item_location_countries:['JP']});
 assert.deepEqual(await parseProductRule('query',{complete:async({text,system})=>{assert.equal(text,'query');assert.match(system,/product_id/);return JSON.stringify(expected);}}),expected);
 }
});
test('unknown/unsupported and malformed restrictions never silently broaden',async()=>{
 await assert.rejects(parseProductRule('XM4',{complete:async()=>'{"error":"UNSUPPORTED_PRODUCT"}'}),{code:'UNSUPPORTED_PRODUCT'});
 for(const bad of [{model_year:2023.5},{item_location_countries:['GB']},{max_price_cents:-1},{min_discount_pct:101},{risk_score:0}])assert.throws(()=>validateProductRule(rule('sony-wh1000xm5',bad)),{code:'INVALID_MODEL_OUTPUT'});
 await assert.rejects(parseProductRule('Sony',{timeoutMs:5,complete:()=>new Promise(()=>{})}),{code:'PROVIDER_TIMEOUT'});
});
test('Sony uses eight actual fixed prices and country-separated peers; budget does not truncate peers',async()=>{
 const listings=await loadCatalog('sony-wh1000xm5');assert.equal(listings.length,8);
 const all=searchCatalog(listings,rule('sony-wh1000xm5'));assert.equal(all.results.length,8);
 for(const r of all.results)assert.ok(r.peers.every(p=>p.item_location_country_code===r.listing.item_location_country_code));
 const filtered=searchCatalog(listings,rule('sony-wh1000xm5',{max_price_cents:18400,item_location_countries:['US']}));
 assert.equal(filtered.results.length,1);assert.equal(filtered.results[0].peers.length,5);assert.equal(filtered.results[0].benchmark,21880);
 assert.ok(listings.every(r=>r.shipping_cents===null&&!r.live_verified));
});
test('Canon displays five candidates with no median; explicit kit/year/country constraints apply',async()=>{
 const listings=await loadCatalog('canon-eos-r50');assert.equal(listings.length,5);
 const all=searchCatalog(listings,rule('canon-eos-r50'));assert.equal(all.results.length,5);assert.ok(all.results.every(r=>r.benchmark===null&&r.delta===null&&r.percent===null&&r.peers.length===0));
 assert.equal(searchCatalog(listings,rule('canon-eos-r50',{configuration:'lens_kit'})).results.length,0);
 assert.equal(searchCatalog(listings,rule('canon-eos-r50',{model_year:2022})).results.length,0);
 assert.ok(searchCatalog(listings,rule('canon-eos-r50',{item_location_countries:['JP']})).results.every(r=>r.listing.item_location_country_code==='JP'));
});
test('watch rule preserves final constraints; unsupported discount explicitly disables watch',async()=>{
 const listings=await loadCatalog('charizard-ex-199-165-psa9');
 const r=rule('charizard-ex-199-165-psa9',{grade:9,language:'English',max_price_cents:30000,item_location_countries:['US'],model_year:2023});
 const result=searchCatalog(listings,r);assert.deepEqual(result.watchRule.attributes,{language:'English',grade:9});assert.equal(matchesWatchRule(listings[0],result.watchRule),false);
 const noWatch=searchCatalog(listings,{...r,min_discount_pct:0});assert.equal(noWatch.watchRule,null);assert.match(noWatch.watchUnavailableReason,/discount/);
});
test('fewer than three other eligible peers cannot establish a benchmark',async()=>{
 const listings=(await loadCatalog('sony-wh1000xm5')).filter(r=>r.item_location_country_code==='US').slice(0,3);
 const result=searchCatalog(listings,rule('sony-wh1000xm5'));
 assert.ok(result.results.every(r=>r.peers.length===2&&r.benchmark===null));
 listings.push({...listings[0],id:'fourth',eligibility:{eligible_for_median:false}});
 assert.ok(searchCatalog(listings,rule('sony-wh1000xm5')).results.every(r=>r.benchmark===null));
});
test('HTTP manual overrides win over parsed price, year, country and feed watchRule',async()=>{
 const {createSearchHandler}=await import('../../src/server/search-handler.mjs');
 const ai=rule('sony-wh1000xm5',{max_price_cents:1,model_year:2020,item_location_countries:['JP']});
 const handler=createSearchHandler({complete:async()=>JSON.stringify(ai)});
 const req={method:'POST',headers:{'content-type':'application/json'},body:{text:'Sony WH-1000XM5',overrides:{max_price_cents:18400,model_year:2022,item_location_countries:['US']}},resume(){}};
 let status,payload;const res={setHeader(){},writeHead(s){status=s;},end(s){payload=JSON.parse(s);}};
 await handler(req,res);assert.equal(status,200);assert.equal(payload.results.length,0);assert.equal(payload.watchArrivals[0].price_cents,18400);assert.equal(payload.effectiveRule.model_year,2022);assert.equal(payload.watchRule.max_price_cents,18400);assert.deepEqual(payload.watchRule.item_location_countries,['US']);assert.equal(payload.overrideSources.model_year,'manual');assert.equal(payload.rule.max_price_cents,1);
});

test('staged arrivals are genuine records withheld from the initial results at every budget',async()=>{
 const {createSearchHandler}=await import('../../src/server/search-handler.mjs');
 for(const [product_id,budget,arrival] of [['charizard-ex-199-165-psa9',38000,37500],['sony-wh1000xm5',19000,18400],['canon-eos-r50',66000,64995]]){
  const handler=createSearchHandler({complete:async()=>JSON.stringify(rule(product_id,{max_price_cents:budget}))});
  for(const overrides of [{},{max_price_cents:1000000}]){
   const req={method:'POST',headers:{'content-type':'application/json'},body:{text:'query',overrides},resume(){}};
   let payload;await handler(req,{setHeader(){},writeHead(s){assert.equal(s,200)},end(s){payload=JSON.parse(s)}});
   const incoming=payload.watchArrivals[0];assert.equal(incoming.price_cents,arrival);assert.equal(incoming.synthetic,false);assert.equal(incoming.arrival_mode,'staged');
   assert.equal(incoming.url,'https://www.ebay.com/itm/'+incoming.item_id);
   assert.ok(payload.results.every(r=>!payload.watchArrivals.some(a=>a.id===r.listing.id)&&r.listing.id!=='900054604971'));
   assert.ok(payload.results.every(r=>r.peers.every(p=>!payload.watchArrivals.some(a=>a.id===p.id))));
   if(!Object.keys(overrides).length)assert.equal(payload.results.length,0);
  }
 }
});

test('arrival comparison uses initial peers, excludes every staged item and ignores budget',async()=>{
 const {createSearchHandler}=await import('../../src/server/search-handler.mjs');
 for(const product_id of ['charizard-ex-199-165-psa9','sony-wh1000xm5','canon-eos-r50']){
  const handler=createSearchHandler({complete:async()=>JSON.stringify(rule(product_id,{max_price_cents:1}))});
  const get=async overrides=>{let out;await handler({method:'POST',headers:{'content-type':'application/json'},body:{text:'query',overrides},resume(){}},{setHeader(){},writeHead(s){assert.equal(s,200)},end(s){out=JSON.parse(s)}});return out;};
  const low=await get({}),high=await get({max_price_cents:1000000});
  for(const [index,arrival] of low.watchArrivals.entries()){
   assert.deepEqual(arrival.comparison,high.watchArrivals[index].comparison);
   assert.ok(arrival.comparison.peers.every(p=>!low.watchArrivals.some(a=>a.id===p.id)));
  }
  if(product_id==='charizard-ex-199-165-psa9'){
   assert.deepEqual(low.watchArrivals.map(a=>a.comparison.benchmark),[46000,46000]);
   assert.deepEqual(low.watchArrivals.map(a=>a.comparison.percent),[18.48,21.74]);
   const us=await get({item_location_countries:['US']});assert.ok(us.watchArrivals.every(a=>a.comparison.peers.every(p=>p.item_location_country_code==='US')));
  } else if(product_id==='sony-wh1000xm5')assert.equal(low.watchArrivals[0].comparison.benchmark,21880);
  else assert.equal(low.watchArrivals[0].comparison.benchmark,null);
 }
});
