/** Offline quality audit for the historical Charizard demo fixture, not a live verifier. */
import {MAX_CENTS} from './pricing.mjs';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const expected={currency:'USD',buying_option:'FIXED_PRICE',card_name:'Charizard ex',card_number:'199/165',set_name:'Scarlet & Violet 151',language:'English',grader:'PSA',grade:9,finish:'Special Illustration Rare Holo'};
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const cents=value=>Number.isSafeInteger(value)&&value>=0&&value<=MAX_CENTS;
export function auditDemoData(data){
 const errors=[],warnings=[],ids=new Set();
 const add=(list,code,index)=>list.push(index==null?code:`observations[${index}]: ${code}`);
 if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.observations)) return {errors:['INVALID_DATASET'],warnings,summary:{observation_count:0,unique_ids:0,live_verified:false}};
 if(!validDate(data.retrieved_date))add(errors,'INVALID_RETRIEVED_DATE');
 if(data.live_verified!==false)add(errors,'HISTORICAL_DATASET_MUST_NOT_CLAIM_LIVE');
 const rows=data.observations;
 if(rows.length!==6)add(errors,'EXPECTED_SIX_DEMO_OBSERVATIONS');
 rows.forEach((r,i)=>{
  if(!r||typeof r!=='object'||Array.isArray(r)){add(errors,'INVALID_OBSERVATION',i);return;}
  if(typeof r.item_id!=='string'||!/^\d+$/.test(r.item_id))add(errors,'INVALID_ITEM_ID',i);
  else if(ids.has(r.item_id))add(errors,'DUPLICATE_ITEM_ID',i);else ids.add(r.item_id);
  for(const [key,value] of Object.entries(expected))if(r[key]!==value)add(errors,`INVALID_${key.toUpperCase()}`,i);
  if(!cents(r.price_cents))add(errors,'INVALID_PRICE_CENTS',i);
  if(r.shipping_cents!==null)add(errors,'COMMON_SHIPPING_MUST_BE_UNKNOWN',i);
  if(r.observed_shipping_cents!=null&&!cents(r.observed_shipping_cents))add(errors,'INVALID_OBSERVED_SHIPPING',i);
  let url;try{url=new URL(r.url);}catch{}
  const matching=url&&url.protocol==='https:'&&url.hostname==='www.ebay.com'&&!url.username&&!url.password&&!url.port&&(url.pathname===`/itm/${r.item_id}`||(/^\/p\/\d+$/.test(url.pathname)&&url.searchParams.get('iid')===r.item_id));
  if(!matching)add(errors,'URL_ITEM_ID_MISMATCH',i);
  if(!validDate(r.retrieved_date))add(errors,'INVALID_RETRIEVED_DATE',i);
  else if(validDate(data.retrieved_date)&&r.retrieved_date>data.retrieved_date)add(errors,'RECORD_RETRIEVED_AFTER_DATASET',i);
  if(r.live_verified!==false)add(errors,'HISTORICAL_RECORD_MUST_NOT_CLAIM_LIVE',i);
  if(r.current_listing_status!=null)add(errors,'UNVERIFIED_CURRENT_AVAILABILITY_CLAIM',i);
  if(r.source_capture_time===null)add(warnings,'SOURCE_CAPTURE_TIME_UNKNOWN',i);
  else if(typeof r.source_capture_time!=='string'||!Number.isFinite(Date.parse(r.source_capture_time)))add(errors,'INVALID_SOURCE_CAPTURE_TIME',i);
  else if(validDate(r.retrieved_date)&&Date.parse(r.source_capture_time)>Date.parse(r.retrieved_date+'T23:59:59.999Z'))add(errors,'CAPTURE_AFTER_RETRIEVAL',i);
  if(typeof r.cache_age!=='string'||!r.cache_age.trim())add(errors,'MISSING_CACHE_AGE_SOURCE_NOTE',i);
  if(typeof r.evidence_type!=='string'||!r.evidence_type.trim())add(errors,'MISSING_EVIDENCE_TYPE',i);
  for(const key of Object.keys(r))if(/^risk(?:_|$)/i.test(key))add(errors,'RISK_FIELD_NOT_ALLOWED',i);
  if(r.sample===true||r.synthetic===true){add(warnings,'SYNTHETIC_RECORD_NOT_REAL_EBAY_EVIDENCE',i);if(r.evidence_type!=='synthetic')add(errors,'SYNTHETIC_RECORD_MISLABELLED',i);}
 });
 add(warnings,'MIXED_AGE_CACHED_OBSERVATIONS_NOT_A_SIMULTANEOUS_MARKET_SNAPSHOT');
 add(warnings,'SHIPPING_NOT_COMPARABLE_FOR_COMMON_DESTINATION');
 return {errors,warnings,summary:{observation_count:rows.length,unique_ids:ids.size,live_verified:false,price_basis:'item_price_excluding_shipping_and_tax',current_availability_verified:false,authenticity_verified:false,source_capture_times_known:rows.filter(r=>typeof r?.source_capture_time==='string').length}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const path=process.argv[2]??new URL('../../data/demo/charizard-psa9-source-observations.json',import.meta.url);const result=auditDemoData(JSON.parse(await readFile(path,'utf8')));console.log(JSON.stringify(result,null,2));process.exitCode=result.errors.length?1:0;}
 catch{console.log(JSON.stringify({errors:['DATASET_READ_OR_JSON_ERROR'],warnings:[],summary:null}));process.exitCode=1;}
}
