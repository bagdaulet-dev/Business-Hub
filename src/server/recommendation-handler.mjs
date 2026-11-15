import {readFile} from 'node:fs/promises';
import {validateProductRule} from '../providers/product-rule-parser.mjs';
import {loadCatalog,searchCatalog} from '../engine/catalog-search.mjs';
import {recommendCandidates} from '../providers/recommendation.mjs';
import {sendJson} from './search-handler.mjs';
const MAX=16384;
const err=code=>Object.assign(new Error(code),{code});
function readBody(req,timeoutMs){
 if(req.body!==undefined){try{const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):typeof req.body==='string'?req.body:JSON.stringify(req.body);if(typeof raw!=='string')throw err('INVALID_REQUEST');if(Buffer.byteLength(raw)>MAX)throw err('BODY_TOO_LARGE');return Promise.resolve(raw);}catch(e){return Promise.reject(e?.code?e:err('INVALID_REQUEST'));}}
 return new Promise((resolve,reject)=>{let size=0,chunks=[],settled=false;
 const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);req.off('data',data);req.off('end',end);req.off('error',fail);req.off('aborted',fail);if(error){req.resume();reject(error);}else resolve(value);};
 const data=chunk=>{size+=chunk.length;if(size>MAX)finish(err('BODY_TOO_LARGE'));else chunks.push(Buffer.from(chunk));};
 const end=()=>finish(null,Buffer.concat(chunks).toString('utf8'));const fail=()=>finish(err('INVALID_REQUEST'));
 const timer=setTimeout(()=>finish(err('REQUEST_TIMEOUT')),timeoutMs);
 req.on('data',data);req.once('end',end);req.once('error',fail);req.once('aborted',fail);if(req.aborted)fail();
 });
}
export async function buildRecommendationCandidates(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||Object.keys(input).some(k=>!['effectiveRule','listingIds'].includes(k)))throw err('INVALID_REQUEST');
 let rule;try{rule=validateProductRule(input.effectiveRule);}catch{throw err('INVALID_REQUEST');}
 const ids=input.listingIds;
 if(!Array.isArray(ids)||ids.length<1||ids.length>20||ids.some(id=>typeof id!=='string'||!/^\d{8,20}$/.test(id))||new Set(ids).size!==ids.length)throw err('INVALID_REQUEST');
 const catalog=await loadCatalog(rule.product_id);
 const staged=JSON.parse(await readFile(new URL('../../data/demo/watch-scenarios.json',import.meta.url),'utf8'));
 const delayed=new Set(staged.scenarios.map(s=>s.listing.id));
 const baseline=catalog.filter(r=>!delayed.has(r.id));
 const initial=searchCatalog(baseline,rule).results;
 const findings=new Map(initial.map(r=>[r.listing.id,r]));
 for(const row of catalog.filter(r=>delayed.has(r.id))){const found=searchCatalog([...baseline,row],rule).results.find(r=>r.listing.id===row.id);if(found)findings.set(row.id,found);}
 if(ids.some(id=>!findings.has(id)))throw err('INVALID_REQUEST');
 const candidates=ids.map(id=>{const {listing:r,peers,benchmark,delta,percent}=findings.get(id);return {item_id:r.item_id,title:r.title,url:r.url,price_cents:r.price_cents,currency:r.currency,product_id:r.product_id,attributes:r.attributes,model_year:r.model_year,item_location_country_code:r.item_location_country_code??null,item_location_text:r.item_location_text??r.item_location??null,seller_name:r.seller_name??null,shipping_cents:null,benchmark,delta,percent,peer_count:peers.length,comparison_basis:'initial_comparable_listings_item_price',cache_age:r.cache_age??null,retrieved_date:r.retrieved_date??null,live_verified:false,packaging_note:r.packaging_note??null,warranty:r.warranty??null,regional_version:r.regional_version??null};});
 return {effectiveRule:rule,candidates};
}
export function createRecommendationHandler({complete,requestTimeoutMs=5000,providerTimeoutMs=35000,maxConcurrent=2,maxAttemptsPerMinute=6}={}){
 if(!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>2||!Number.isInteger(maxAttemptsPerMinute)||maxAttemptsPerMinute<1||maxAttemptsPerMinute>6||!Number.isInteger(requestTimeoutMs)||requestTimeoutMs<1||requestTimeoutMs>10000||!Number.isInteger(providerTimeoutMs)||providerTimeoutMs<1||providerTimeoutMs>60000)throw err('INVALID_SERVER_LIMITS');
 let active=0,attempts=[];
 return async(req,res)=>{
 const failure=(status,code)=>sendJson(res,status,{error:{code,message:({INVALID_REQUEST:'Choose matching visible listings and valid search filters.',BODY_TOO_LARGE:'The request is too large.',REQUEST_TIMEOUT:'The request timed out.',PROVIDER_NOT_CONFIGURED:'The AI provider is unavailable.',PROVIDER_TIMEOUT:'The AI provider timed out.',PROVIDER_UNAVAILABLE:'The AI provider is temporarily unavailable.',INVALID_MODEL_OUTPUT:'The AI provider returned an invalid response.',INTERNAL_ERROR:'The request could not be processed.',TOO_MANY_REQUESTS:'The request limit was reached.',METHOD_NOT_ALLOWED:'Use POST.',UNSUPPORTED_MEDIA_TYPE:'Use application/json.'})[code]}});
 if(req.method!=='POST'){res.setHeader('allow','POST');failure(405,'METHOD_NOT_ALLOWED');req.resume();return;}
 if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){failure(415,'UNSUPPORTED_MEDIA_TYPE');req.resume();return;}
 const length=req.headers['content-length'];if(length!=null&&(!/^\d+$/.test(length)||Number(length)>MAX)){failure(413,'BODY_TOO_LARGE');req.resume();return;}
 attempts=attempts.filter(t=>Date.now()-t<60000);
 if(active>=maxConcurrent||attempts.length>=maxAttemptsPerMinute){res.setHeader('retry-after','60');failure(429,'TOO_MANY_REQUESTS');req.resume();return;}
 active++;
 try{
 const raw=await readBody(req,requestTimeoutMs);let input;try{input=JSON.parse(raw);}catch{throw err('INVALID_REQUEST');}
 const {effectiveRule,candidates}=await buildRecommendationCandidates(input);
 if(typeof complete!=='function')throw err('PROVIDER_NOT_CONFIGURED');
 attempts=attempts.filter(t=>Date.now()-t<60000);if(attempts.length>=maxAttemptsPerMinute){res.setHeader('retry-after','60');failure(429,'TOO_MANY_REQUESTS');return;}attempts.push(Date.now());
 const recommendation=await recommendCandidates(candidates,effectiveRule,{complete,timeoutMs:providerTimeoutMs});
 sendJson(res,200,{recommendation,candidates,dataMode:'historical_observations',live_verified:false});
 }catch(e){const statuses={INVALID_REQUEST:400,BODY_TOO_LARGE:413,REQUEST_TIMEOUT:408,PROVIDER_NOT_CONFIGURED:503,PROVIDER_TIMEOUT:502,PROVIDER_UNAVAILABLE:502,INVALID_MODEL_OUTPUT:502};const code=Object.hasOwn(statuses,e?.code)?e.code:'INTERNAL_ERROR';failure(statuses[code]??500,code);}finally{active--;}
 };
}
