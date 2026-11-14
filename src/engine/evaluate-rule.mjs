/** Internal rule-to-pricing bridge. Adapt to the shared contract when it is published. */
import {validateRule} from '../providers/rule-parser.mjs';
import {evaluatePricing, IDENTITY_FIELDS, validateObservations} from './pricing.mjs';
const norm=v=>v==null?'':String(v).trim().replace(/\s+/g,' ').toLowerCase();
export function evaluateRule(observations, rule, options={}) {
 rule = validateRule(rule);
 validateObservations(observations);
 const fields=['card_name',...IDENTITY_FIELDS];
 const selected=observations.filter(item=>fields.every(key=>rule[key]==null||norm(item[key])===norm(rule[key])));
 const groups=new Map();
 for(const item of selected){
  if(IDENTITY_FIELDS.some(key=>!norm(item[key]))) continue;
  const identity={...Object.fromEntries(IDENTITY_FIELDS.map(key=>[key,item[key]])),card_name:item.card_name??null};
  const key=JSON.stringify([norm(item.card_name),...IDENTITY_FIELDS.map(k=>norm(item[k]))]);
  if(!groups.has(key)) groups.set(key,identity);
 }
 const results=[...groups.values()].map(identity=>evaluatePricing(selected.filter(item=>norm(item.card_name)===norm(identity.card_name)),identity,{
  ...options,maxPriceCents:rule.max_price_cents??null,minDiscountPct:rule.min_discount_pct??null
 }));
 return {data_mode:'historical_observations',live_verified:false,groups:results,
  warnings:['Internal bridge, not the shared application API. No live source verification.',
   ...(selected.some(item=>IDENTITY_FIELDS.some(key=>!norm(item[key])))?['Some matching observations lack identity fields and cannot be compared.']:[])]};
}
