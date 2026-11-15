import {readFile} from 'node:fs/promises';
import {parseProductRule} from '../providers/product-rule-parser.mjs';
import {loadCatalog,searchCatalog} from '../engine/catalog-search.mjs';
const MAX_BODY_BYTES = 8192;
const supportedLocations = new Set(['US', 'JP', 'KR']);
const overrideKeys = new Set(['max_price_cents', 'model_year', 'item_location_countries']);
const messages = {
  INVALID_QUERY: 'Enter a search between 1 and 2,000 characters.',
  INVALID_JSON: 'Send JSON containing text and optional overrides.',
  INVALID_OVERRIDES: 'Check the year, price, or item location.',
  UNSUPPORTED_PRODUCT: 'AI search for this model is not available yet.',
  INVALID_MODEL_YEAR: 'Model year must be a four-digit integer.',
  UNSUPPORTED_MEDIA_TYPE: 'Use Content-Type: application/json.',
  BODY_TOO_LARGE: 'The request is too large.',
  REQUEST_TIMEOUT: 'The request timed out.',
  METHOD_NOT_ALLOWED: 'Use POST.',
  TOO_MANY_REQUESTS: 'The request limit was reached. Try again later.',
  PROVIDER_NOT_CONFIGURED: 'The AI provider is unavailable on this server.',
  UNSUPPORTED_QUERY: 'AI search does not support those filters.',
  QUERY_NEEDS_CARD: 'Enter a Pokémon card name or number.',
  PROVIDER_TIMEOUT: 'The AI provider timed out.',
  PROVIDER_UNAVAILABLE: 'The AI provider is temporarily unavailable.',
  INVALID_MODEL_OUTPUT: 'The AI provider returned an invalid response.',
  INTERNAL_ERROR: 'The request could not be processed.',
};

export function sendJson(res, status, value) {
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(value);
  res.writeHead(status, {'content-type':'application/json; charset=utf-8',
    'content-length':Buffer.byteLength(body), 'cache-control':'no-store', 'x-content-type-options':'nosniff'});
  res.end(body);
}
const failure = (res,status,code) => sendJson(res,status,{error:{code,message:messages[code]}});

function readBody(req, timeoutMs) {
  // Vercel may have consumed the stream and exposed a parsed req.body already.
  if(req.body!==undefined){
    try{
      const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):
        typeof req.body==='string'?req.body:JSON.stringify(req.body);
      if(typeof raw!=='string')return Promise.reject(Object.assign(new Error(),{code:'INVALID_JSON'}));
      if(Buffer.byteLength(raw)>MAX_BODY_BYTES)return Promise.reject(Object.assign(new Error(),{code:'BODY_TOO_LARGE'}));
      return Promise.resolve(raw);
    }catch{return Promise.reject(Object.assign(new Error(),{code:'INVALID_JSON'}));}
  }
  return new Promise((resolve,reject)=>{
    let size=0, chunks=[], settled=false;
    const finish=(error,value)=>{
      if(settled)return;
      settled=true;clearTimeout(timer);
      req.off('data',onData);req.off('end',onEnd);req.off('error',onError);req.off('aborted',onAborted);
      if(error){req.resume();reject(error);}else resolve(value);
    };
    const onData=chunk=>{
      size+=chunk.length;
      if(size>MAX_BODY_BYTES)finish(Object.assign(new Error(),{code:'BODY_TOO_LARGE'}));
      else chunks.push(chunk);
    };
    const onEnd=()=>finish(null,Buffer.concat(chunks).toString('utf8'));
    const onError=()=>finish(Object.assign(new Error(),{code:'INVALID_JSON'}));
    const onAborted=()=>finish(Object.assign(new Error(),{code:'INVALID_JSON'}));
    const timer=setTimeout(()=>finish(Object.assign(new Error(),{code:'REQUEST_TIMEOUT'})),timeoutMs);
    req.on('data',onData);req.once('end',onEnd);req.once('error',onError);req.once('aborted',onAborted);
    if(req.aborted)onAborted();
  });
}

function validYear(year) {
  return Number.isInteger(year) && year >= 1000 && year <= 9999;
}

function validOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.keys(value).some(key => !overrideKeys.has(key))) return false;
  if (Object.hasOwn(value, 'model_year') && !validYear(value.model_year)) return false;
  if (Object.hasOwn(value, 'max_price_cents') &&
      (!Number.isSafeInteger(value.max_price_cents) || value.max_price_cents < 0)) return false;
  if (!Object.hasOwn(value, 'item_location_countries')) return true;
  const countries = value.item_location_countries;
  return Array.isArray(countries) && countries.every(code => supportedLocations.has(code));
}

/** Trusted fixture only. Request data never supplies listings, prices or provider config. */
export function createSearchHandler({complete,requestTimeoutMs=5000,providerTimeoutMs=15000,
  maxConcurrent=2,maxAttemptsPerMinute=12}={}) {
  if(!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>2||
    !Number.isInteger(maxAttemptsPerMinute)||maxAttemptsPerMinute<1||maxAttemptsPerMinute>12||
    !Number.isInteger(requestTimeoutMs)||requestTimeoutMs<1||requestTimeoutMs>10000||
    !Number.isInteger(providerTimeoutMs)||providerTimeoutMs<1||providerTimeoutMs>60000)throw new Error('INVALID_SERVER_LIMITS');
  let inFlight=0;
  let attempts=[];
  return async function search(req,res) {
    if(req.method!=='POST'){res.setHeader('allow','POST');failure(res,405,'METHOD_NOT_ALLOWED');req.resume();return;}
    if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json'){
      failure(res,415,'UNSUPPORTED_MEDIA_TYPE');req.resume();return;
    }
    const declared=req.headers['content-length'];
    if(declared!=null && (!/^\d+$/.test(declared)||Number(declared)>MAX_BODY_BYTES)){
      failure(res,413,'BODY_TOO_LARGE');req.resume();return;
    }
    const now=Date.now(); attempts=attempts.filter(time=>now-time<60000);
    if(inFlight>=maxConcurrent||attempts.length>=maxAttemptsPerMinute){
      res.setHeader('retry-after','60');failure(res,429,'TOO_MANY_REQUESTS');req.resume();return;
    }
    inFlight++;
    try {
      const raw=await readBody(req,requestTimeoutMs);
      let input;
      try{input=JSON.parse(raw);}catch{failure(res,400,'INVALID_JSON');return;}
      if(!input||Array.isArray(input)||typeof input!=='object'||
        !Object.hasOwn(input,'text')||Object.keys(input).some(key=>key!=='text'&&key!=='modelYear'&&key!=='overrides')){failure(res,400,'INVALID_JSON');return;}
      if(typeof input.text!=='string'||!input.text.trim()||input.text.length>2000){failure(res,400,'INVALID_QUERY');return;}
      if (Object.hasOwn(input, 'modelYear') && !validYear(input.modelYear)) {
        failure(res, 400, 'INVALID_MODEL_YEAR'); return;
      }
      const overrides = Object.hasOwn(input, 'overrides') ? input.overrides : {};
      if (!validOverrides(overrides)) {
        failure(res, 400, 'INVALID_OVERRIDES'); return;
      }
      const modelYear = overrides.model_year ?? input.modelYear;
      const countries = overrides.item_location_countries && [...new Set(overrides.item_location_countries)];
      if(typeof complete!=='function'){failure(res,503,'PROVIDER_NOT_CONFIGURED');return;}
      const beforeCall=Date.now();attempts=attempts.filter(time=>beforeCall-time<60000);
      // Recheck after asynchronous body read: concurrent requests can consume the last slot.
      if(attempts.length>=maxAttemptsPerMinute){res.setHeader('retry-after','60');failure(res,429,'TOO_MANY_REQUESTS');return;}
      attempts.push(beforeCall);
      const rule = await parseProductRule(input.text.trim(), { complete, timeoutMs: providerTimeoutMs });
      const effectiveRule = { ...rule, ...overrides };
      if (modelYear !== undefined) effectiveRule.model_year = modelYear;
      if (countries) effectiveRule.item_location_countries = countries;
      const overrideSources = Object.fromEntries(Object.keys(overrides).map(key => [key, 'manual']));
      if (input.modelYear !== undefined && overrides.model_year === undefined) overrideSources.model_year = 'manual';
      const observations = await loadCatalog(rule.product_id);
      // Fixed historical listing is withheld from the initial feed, never repriced.
      const {scenarios} = JSON.parse(await readFile(new URL('../../data/demo/watch-scenarios.json', import.meta.url), 'utf8'));
      const watchArrivals = scenarios.filter(s => s.listing.product_id === rule.product_id).map(s => s.listing);
      const delayedIds = new Set(watchArrivals.map(item => item.id));
      const output = searchCatalog(observations.filter(item => !delayedIds.has(item.id)), effectiveRule);
      sendJson(res,200,{rule,effectiveRule,overrideSources,...output,watchArrivals,
        ...(effectiveRule.model_year===null?{}:{modelYear:effectiveRule.model_year}),
        parserMode:'live-llm',dataMode:'historical_observations'});
    }catch(error){
      const code=error?.code;
      if(code==='UNSUPPORTED_PRODUCT')failure(res,422,code);
      else if(code==='BODY_TOO_LARGE')failure(res,413,code);
      else if(code==='REQUEST_TIMEOUT')failure(res,408,code);
      else if(['INVALID_QUERY','INVALID_JSON','UNSUPPORTED_QUERY','QUERY_NEEDS_CARD'].includes(code))failure(res,400,code);
      else if(code==='PROVIDER_NOT_CONFIGURED')failure(res,503,code);
      else if(['PROVIDER_TIMEOUT','PROVIDER_UNAVAILABLE','INVALID_MODEL_OUTPUT'].includes(code))failure(res,502,code);
      else failure(res,500,'INTERNAL_ERROR');
    }finally{inFlight--;}
  };
}
