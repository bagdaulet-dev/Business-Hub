import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDemoWatch, matchesWatchRule} from '../../src/engine/demo-watch.mjs';
const scenario=JSON.parse(readFileSync(new URL('../../data/demo/watch-scenarios.json',import.meta.url))).scenarios[0].listing;
const rule={product_id:scenario.product_id,max_price_cents:scenario.price_cents+1000,model_year:2023,item_location_countries:['US'],attributes:{grade:9,language:'English'}};
function setup(overrides={}) {
 const timers=[]; const events=[];
 const scheduler={setTimeout(fn,ms){timers.push({fn,ms,cancelled:false});return timers.length-1;},clearTimeout(id){timers[id].cancelled=true;}};
 const watch=createDemoWatch({effectiveRule:rule,incomingListings:[scenario],onEvent:e=>events.push(e),scheduler,...overrides});
 return {watch,timers,events};
}
test('no match initially, explicit start schedules 10 seconds then emits labelled match',()=>{
 const {watch,timers,events}=setup();assert.equal(watch.getSnapshot().results.length,0);assert.equal(timers.length,0);
 assert.equal(watch.start(),true);assert.equal(watch.start(),false);assert.equal(timers.length,1);assert.equal(timers[0].ms,10000);
 assert.equal(watch.getSnapshot().notifications.length,0);timers[0].fn();
 assert.equal(watch.getSnapshot().results[0].price_cents,scenario.price_cents);assert.equal(watch.getSnapshot().notifications.length,1);
 assert.ok(events.every(e=>e.data_mode==='simulation' && e.live_verified===false));
 assert.equal(events.find(e=>e.type==='match_found').listing.url,scenario.url);assert.equal(watch.start(),false);
});
test('existing qualifying offers show immediately without generating new-listing notifications',()=>{
 const initial={...scenario,id:'historical-350',price_cents:35000,synthetic:false,data_mode:'historical_observations'};
 const {watch,timers}=setup({effectiveRule:{...rule,max_price_cents:40000},initialListings:[initial]});
 assert.equal(watch.getSnapshot().results.length,1);assert.equal(watch.getSnapshot().notifications.length,0);
 watch.start();timers[0].fn();assert.equal(watch.getSnapshot().results.length,2);assert.equal(watch.getSnapshot().notifications.length,1);
});
test('fixed demo price is not lowered for budget; strict attributes, year and countries apply',()=>{
 for(const change of [{max_price_cents:scenario.price_cents-1},{max_price_cents:0},{model_year:2022},{item_location_countries:['JP']},{attributes:{grade:10}},{product_id:'sony-wh1000xm5'}]){
  const {watch,timers}=setup({effectiveRule:{...rule,...change}});watch.start();timers[0].fn();assert.equal(watch.getSnapshot().notifications.length,0);
 }
 assert.equal(matchesWatchRule(scenario,{...rule,max_price_cents:scenario.price_cents}),true);
 assert.equal(matchesWatchRule(scenario,{...rule,item_location_countries:['JP','US']}),true);
 assert.equal(matchesWatchRule({...scenario,item_location_country_code:null},{...rule,item_location_countries:[]}),true);
 assert.equal(matchesWatchRule({...scenario,item_location_country_code:null},rule),false);
});
test('stop and restart prevent an old callback from notifying',()=>{
 const {watch,timers}=setup();watch.start();watch.stop();assert.equal(timers[0].cancelled,true);
 watch.start();timers[0].fn();assert.equal(watch.getSnapshot().notifications.length,0);
 timers[1].fn();assert.equal(watch.getSnapshot().notifications.length,1);assert.equal(watch.stop(),false);
});
test('duplicate incoming and previously seen IDs never notify twice',()=>{
 const {watch,timers}=setup({incomingListings:[scenario,scenario]});watch.start();timers[0].fn();timers[0].fn();assert.equal(watch.getSnapshot().notifications.length,1);
 const other=setup({initialListings:[scenario]});other.watch.start();other.timers[0].fn();assert.equal(other.watch.getSnapshot().notifications.length,0);
});
test('rule, data, emitted events and snapshots are isolated from consumer mutations',()=>{
 const externalRule=structuredClone(rule),incoming=structuredClone(scenario);
 const {watch,timers,events}=setup({effectiveRule:externalRule,incomingListings:[incoming]});
 externalRule.max_price_cents=0;incoming.price_cents=99999;watch.getSnapshot().effective_rule.max_price_cents=0;
 watch.start();timers[0].fn();const match=events.find(e=>e.type==='match_found');match.listing.price_cents=1;
 assert.equal(watch.getSnapshot().results[0].price_cents,scenario.price_cents);
});
test('unsupported constraints and unproven or unsafe staged offers reject explicitly',()=>{
 for(const effectiveRule of [{...rule,min_discount_pct:20},{...rule,max_price_cents:-1},{...rule,model_year:2023.5},{...rule,item_location_countries:'US'},{...rule,attributes:{unknown:'x'}}])assert.throws(()=>setup({effectiveRule}),{code:'INVALID_DEMO_WATCH_INPUT'});
 for(const change of [{synthetic:true},{url:'https://www.ebay.com/itm/123'},{price_cents:NaN},{price_cents:1.5},{live_verified:true},{id:'123'}])assert.throws(()=>setup({incomingListings:[{...scenario,...change}]}),{code:'INVALID_DEMO_WATCH_INPUT'});
});
test('all three product scenarios match their saved rules and retain staged-arrival provenance',()=>{
 const {scenarios}=JSON.parse(readFileSync(new URL('../../data/demo/watch-scenarios.json',import.meta.url)));
 for(const {listing} of scenarios){
  const {watch,timers}=setup({effectiveRule:{product_id:listing.product_id,max_price_cents:listing.price_cents,attributes:listing.attributes},incomingListings:[listing]});
  watch.start();timers[0].fn();assert.equal(watch.getSnapshot().notifications.length,1);
 }
});

test('auction starting bids and unspecified buying options cannot become watch matches',()=>{
 for(const buying_option of ['AUCTION',undefined]){
  const listing={...scenario,buying_option};
  assert.throws(()=>matchesWatchRule(listing,rule),{code:'INVALID_DEMO_WATCH_INPUT'});
  assert.throws(()=>setup({incomingListings:[listing]}),{code:'INVALID_DEMO_WATCH_INPUT'});
  assert.throws(()=>setup({initialListings:[listing]}),{code:'INVALID_DEMO_WATCH_INPUT'});
 }
});

function sequentialSetup(options={}) {
 let time=0,seq=0;
 const tasks=new Map(),events=[];
 const scheduler={now:()=>time,setTimeout(fn,ms){const id=++seq;tasks.set(id,{id,fn,ms,at:time+ms,cancelled:false});return id;},
  clearTimeout(id){if(tasks.has(id))tasks.get(id).cancelled=true;}};
 const first={...scenario,arrival_after_ms:10000};
 const second={...scenario,id:'999000000002',item_id:'999000000002',url:'https://www.ebay.com/itm/999000000002',price_cents:scenario.price_cents-1000,arrival_after_ms:15000};
 const watch=createDemoWatch({effectiveRule:rule,incomingListings:[first,second],onEvent:e=>events.push(e),scheduler,...options});
 function advance(ms){
  const target=time+ms;
  for(;;){
   const task=[...tasks.values()].filter(x=>!x.cancelled&&!x.fired&&x.at<=target).sort((a,b)=>a.at-b.at||a.id-b.id)[0];
   if(!task)break;
   time=task.at;task.fired=true;task.fn();
  }
  time=target;
 }
 return {watch,events,tasks,advance,first,second};
}

test('absolute 10s and 15s arrivals notify separately, sort by price and complete exactly once',()=>{
 const {watch,events,tasks,advance,first,second}=sequentialSetup();
 watch.start();advance(9999);assert.equal(watch.getSnapshot().results.length,0);
 advance(1);assert.equal(watch.getSnapshot().notifications.length,1);assert.equal(watch.getSnapshot().status,'watching');
 assert.equal(watch.getSnapshot().pending_count,1);assert.equal(events.filter(e=>e.type==='completed').length,0);
 assert.equal([...tasks.values()].at(-1).ms,5000);
 advance(4999);assert.equal(watch.getSnapshot().notifications.length,1);
 advance(1);assert.deepEqual(watch.getSnapshot().results.map(x=>x.id),[second.id,first.id]);
 assert.equal(watch.getSnapshot().notifications.length,2);assert.equal(watch.getSnapshot().status,'completed');
 assert.equal(events.filter(e=>e.type==='completed').length,1);assert.equal(watch.start(),false);
 [...tasks.values()].forEach(task=>task.fn());
 assert.equal(watch.getSnapshot().notifications.length,2);assert.equal(events.filter(e=>e.type==='completed').length,1);
});

test('stop after first arrival blocks second; resume waits remaining active time and cannot replay first',()=>{
 const {watch,events,tasks,advance}=sequentialSetup();
 watch.start();advance(12000);assert.equal(watch.getSnapshot().notifications.length,1);
 const stale=[...tasks.values()].at(-1).fn;
 watch.stop();advance(60000);stale();assert.equal(watch.getSnapshot().notifications.length,1);
 watch.start();assert.equal([...tasks.values()].at(-1).ms,3000);
 advance(2999);assert.equal(watch.getSnapshot().notifications.length,1);
 advance(1);assert.equal(watch.getSnapshot().notifications.length,2);
 assert.equal(events.filter(e=>e.type==='match_found').length,2);
});

test('stop before first arrival preserves remaining delay, independent of wall time paused',()=>{
 const {watch,tasks,advance}=sequentialSetup();watch.start();advance(4000);watch.stop();advance(50000);
 watch.start();assert.equal([...tasks.values()].at(-1).ms,6000);
 advance(6000);assert.equal(watch.getSnapshot().notifications.length,1);
 advance(5000);assert.equal(watch.getSnapshot().notifications.length,2);
});

test('out-of-order input is scheduled by offset; later duplicate IDs and nonmatches still complete without extra notification',()=>{
 const first={...scenario,arrival_after_ms:10000};
 const duplicate={...scenario,arrival_after_ms:15000};
 const nonmatch={...scenario,id:'999000000003',item_id:'999000000003',url:'https://www.ebay.com/itm/999000000003',price_cents:rule.max_price_cents+1,arrival_after_ms:20000};
 const {watch,events,advance}=sequentialSetup({incomingListings:[nonmatch,duplicate,first]});
 watch.start();advance(10000);assert.equal(watch.getSnapshot().notifications.length,1);
 advance(5000);assert.equal(watch.getSnapshot().notifications.length,1);assert.equal(watch.getSnapshot().status,'watching');
 advance(5000);assert.equal(watch.getSnapshot().status,'completed');
 assert.equal(events.filter(e=>e.type==='listing_arrived').length,2);
 assert.equal(events.filter(e=>e.type==='match_found').length,1);
});

test('timing and incoming records are cloned; invalid absolute offsets reject',()=>{
 const a={...scenario,arrival_after_ms:10000};
 const b={...scenario,id:'999000000004',item_id:'999000000004',url:'https://www.ebay.com/itm/999000000004',arrival_after_ms:15000};
 const {watch,advance}=sequentialSetup({incomingListings:[a,b]});
 a.arrival_after_ms=1;b.arrival_after_ms=1;b.price_cents=1;
 watch.start();advance(10000);assert.equal(watch.getSnapshot().notifications.length,1);
 advance(5000);assert.equal(watch.getSnapshot().notifications.length,2);
 assert.ok(watch.getSnapshot().results.every(x=>x.price_cents===scenario.price_cents));
 for(const arrival_after_ms of [0,-1,1.5,60001,NaN,'10000',null]){
  assert.throws(()=>setup({incomingListings:[{...scenario,arrival_after_ms}]}),{code:'INVALID_DEMO_WATCH_INPUT'});
 }
});
