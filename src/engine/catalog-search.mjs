import {readFile} from 'node:fs/promises';
import {ATTRIBUTE_KEYS,validateProductRule} from '../providers/product-rule-parser.mjs';
const SOURCES={
 'charizard-ex-199-165-psa9':['charizard-psa9-source-observations.json',2023],
 'sony-wh1000xm5':['sony-wh1000xm5-source-observations.json',2022],
 'canon-eos-r50':['canon-eos-r50-source-observations.json',2023],
};
const norm=x=>String(x).trim().replace(/\s+/g,' ').toLowerCase();
const median=values=>{values.sort((a,b)=>a-b);const m=Math.floor(values.length/2);return values.length%2?values[m]:(values[m-1]+values[m])/2;};
export async function loadCatalog(productId){
 const [file,year]=SOURCES[productId]??[];if(!file)throw new Error('UNSUPPORTED_PRODUCT');
 const data=JSON.parse(await readFile(new URL('../../data/demo/'+file,import.meta.url),'utf8'));
 const staged=JSON.parse(await readFile(new URL('../../data/demo/watch-scenarios.json',import.meta.url),'utf8'));
 const excluded=new Set(staged.excluded_source_ids??[]);
 const originals=data.observations.filter(row=>!excluded.has(row.item_id));
 const additions=staged.scenarios.map(s=>s.listing).filter(r=>r.product_id===productId&&!originals.some(o=>o.item_id===r.item_id));
 return [...originals,...additions].filter(r=>r.buying_option==='FIXED_PRICE'&&r.listing_status!=='out_of_stock_in_cached_source').map(r=>{
 const attributes=Object.fromEntries(ATTRIBUTE_KEYS.filter(k=>r[k]!=null).map(k=>[k,r[k]]));
 if(productId==='sony-wh1000xm5')attributes.configuration='headphones';
 return {...r,id:r.item_id,product_id:productId,model_year:year,attributes,shipping_cents:null,live_verified:false,data_mode:'historical_observations'};
 });
}
export function searchCatalog(listings,input){
 const rule=validateProductRule(input);
 const selected=listings.filter(r=>r.product_id===rule.product_id&&(rule.model_year===null||rule.model_year===r.model_year)&&(!rule.item_location_countries.length||rule.item_location_countries.includes(r.item_location_country_code))&&ATTRIBUTE_KEYS.every(k=>rule[k]===null||(r.attributes[k]!=null&&norm(rule[k])===norm(r.attributes[k]))));
 const group=r=>r.product_id==='sony-wh1000xm5'?r.comparison_group:JSON.stringify(['card_name','card_number','set_name','language','grader','grade','finish'].map(k=>r.attributes[k]));
 const results=selected.filter(r=>rule.max_price_cents===null||r.price_cents<=rule.max_price_cents).map(listing=>{
 const candidate=rule.product_id==='canon-eos-r50'||listing.eligibility?.eligible_for_median===false;
 const peers=candidate?[]:selected.filter(r=>r.id!==listing.id&&r.eligibility?.eligible_for_median!==false&&group(r)===group(listing)).sort((a,b)=>a.price_cents-b.price_cents);
 const benchmark=peers.length>=3?median(peers.map(r=>r.price_cents)):null;
 const delta=benchmark===null?null:benchmark-listing.price_cents;
 const percent=benchmark===null||benchmark===0?null:Math.round(delta/benchmark*10000)/100;
 return {listing,peers,benchmark,delta,percent};
 }).filter(r=>rule.min_discount_pct===null||(r.percent!==null&&r.percent>=rule.min_discount_pct)).sort((a,b)=>a.listing.price_cents-b.listing.price_cents||a.listing.id.localeCompare(b.listing.id));
 const attributes=Object.fromEntries(ATTRIBUTE_KEYS.filter(k=>rule[k]!==null).map(k=>[k,rule[k]]));
 return {results,watchRule:rule.min_discount_pct!==null?null:{product_id:rule.product_id,max_price_cents:rule.max_price_cents,model_year:rule.model_year,item_location_countries:rule.item_location_countries,attributes},...(rule.min_discount_pct===null?{}:{watchUnavailableReason:'Demo watches do not support a minimum discount constraint.'}),warnings:['Historical cached observations from different dates; current availability is unverified. Item prices exclude unknown shipping, taxes and duties.',...(rule.product_id==='canon-eos-r50'?['Canon candidates have no comparable median: region, warranty and packaging equivalence are unestablished.']:[]),...(rule.product_id==='sony-wh1000xm5'?['Sony comparisons use advertised attributes within item-location groups, not verified regional warranty equivalence.']:[])]};
}
