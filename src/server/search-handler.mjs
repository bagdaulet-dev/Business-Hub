import {readFile} from 'node:fs/promises';
import {runQuery} from '../engine/run-query.mjs';

const fixtureUrl = new URL('../../data/demo/charizard-psa9-source-observations.json', import.meta.url);
const MAX_BODY_BYTES = 8192;
const messages = {
  INVALID_QUERY:'Введите запрос длиной от 1 до 2000 символов.',
  INVALID_JSON:'Тело запроса должно быть JSON с единственным полем text.',
  UNSUPPORTED_MEDIA_TYPE:'Используйте Content-Type: application/json.',
  BODY_TOO_LARGE:'Запрос слишком большой.',
  REQUEST_TIMEOUT:'Время получения запроса истекло.',
  METHOD_NOT_ALLOWED:'Используйте POST.',
  TOO_MANY_REQUESTS:'Лимит запросов достигнут. Повторите позже.',
  PROVIDER_NOT_CONFIGURED:'AI-провайдер пока не настроен.',
  UNSUPPORTED_QUERY:'Условия запроса пока не поддерживаются. Упростите запрос.',
  QUERY_NEEDS_CARD:'Укажите название или номер карточки.',
  PROVIDER_TIMEOUT:'AI не ответил вовремя. Повторите позже.',
  PROVIDER_UNAVAILABLE:'AI-провайдер временно недоступен.',
  INVALID_MODEL_OUTPUT:'AI вернул неподдерживаемый ответ. Повторите позже.',
  INTERNAL_ERROR:'Не удалось обработать запрос.',
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
        Object.keys(input).length!==1||!Object.hasOwn(input,'text')){failure(res,400,'INVALID_JSON');return;}
      if(typeof input.text!=='string'||!input.text.trim()||input.text.length>2000){failure(res,400,'INVALID_QUERY');return;}
      if(typeof complete!=='function'){failure(res,503,'PROVIDER_NOT_CONFIGURED');return;}
      // Read once per accepted request, from the server-owned path. No client paths.
      const {observations}=JSON.parse(await readFile(fixtureUrl,'utf8'));
      const beforeCall=Date.now();attempts=attempts.filter(time=>beforeCall-time<60000);
      // Recheck after asynchronous body read: concurrent requests can consume the last slot.
      if(attempts.length>=maxAttemptsPerMinute){res.setHeader('retry-after','60');failure(res,429,'TOO_MANY_REQUESTS');return;}
      attempts.push(beforeCall);
      const output=await runQuery({text:input.text.trim(),observations,complete,timeoutMs:providerTimeoutMs});
      const byId=new Map(observations.map(item=>[item.item_id,item]));
      const results=output.groups.flatMap(group=>group.findings.map(finding=>({
        listing:byId.get(finding.item_id),
        peers:finding.comparable_item_ids.map(id=>byId.get(id)).sort((a,b)=>a.price_cents-b.price_cents||a.item_id.localeCompare(b.item_id)),
        benchmark:finding.reference_price_cents,delta:finding.difference_cents,percent:finding.below_sample_median_pct,
      }))).sort((a,b)=>a.listing.price_cents-b.listing.price_cents||a.listing.item_id.localeCompare(b.listing.item_id));
      sendJson(res,200,{rule:output.rule,results,parserMode:'live-llm',dataMode:'historical_observations',
        warnings:[...new Set([...output.warnings,...output.groups.flatMap(g=>g.warnings),
          'Historical cached observations from different dates; current availability is unverified.'])]});
    }catch(error){
      const code=error?.code;
      if(code==='BODY_TOO_LARGE')failure(res,413,code);
      else if(code==='REQUEST_TIMEOUT')failure(res,408,code);
      else if(['INVALID_QUERY','INVALID_JSON','UNSUPPORTED_QUERY','QUERY_NEEDS_CARD'].includes(code))failure(res,400,code);
      else if(code==='PROVIDER_NOT_CONFIGURED')failure(res,503,code);
      else if(['PROVIDER_TIMEOUT','PROVIDER_UNAVAILABLE','INVALID_MODEL_OUTPUT'].includes(code))failure(res,502,code);
      else failure(res,500,'INTERNAL_ERROR');
    }finally{inFlight--;}
  };
}
