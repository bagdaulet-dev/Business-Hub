// Run: node src/engine/demo-watch-cli.mjs [budget-in-cents]. No API key required.
import {readFileSync} from 'node:fs';
import {createDemoWatch} from './demo-watch.mjs';
const budgetText=process.argv[2]??'38000';
if(!/^\d+$/.test(budgetText)||!Number.isSafeInteger(Number(budgetText)))throw new Error('Budget must be nonnegative integer cents');
const {observations,model_year}=JSON.parse(readFileSync(new URL('../../data/demo/charizard-psa9-source-observations.json',import.meta.url)));
const {scenarios}=JSON.parse(readFileSync(new URL('../../data/demo/watch-scenarios.json',import.meta.url)));
const incoming=scenarios.find(s=>s.listing.product_id==='charizard-ex-199-165-psa9').listing;
const fields=['card_name','card_number','set_name','language','grader','grade','finish'];
const initialListings=observations.map(row=>({id:row.item_id,product_id:incoming.product_id,
 price_cents:row.price_cents,currency:row.currency,buying_option:row.buying_option,model_year,item_location_country_code:row.item_location_country_code,
 attributes:Object.fromEntries(fields.map(key=>[key,row[key]])),synthetic:false,data_mode:'historical_observations',url:row.url}));
const start=Date.now();
const watch=createDemoWatch({effectiveRule:{product_id:incoming.product_id,max_price_cents:Number(budgetText),
 model_year:2023,attributes:{card_name:'Charizard ex',card_number:'199/165',language:'English',grader:'PSA',grade:9}},initialListings:initialListings.filter(r=>r.id!==incoming.id&&r.id!=='900054604971'),incomingListings:[incoming],
 onEvent:event=>console.log(JSON.stringify({elapsed_ms:Date.now()-start,...event}))});
console.log(JSON.stringify({type:'initial_results',count:watch.getSnapshot().results.length,prices_cents:watch.getSnapshot().results.map(r=>r.price_cents),budget_cents:Number(budgetText),note:'Historical eBay data; appearance timing is staged, availability is unverified.'}));
watch.start();
