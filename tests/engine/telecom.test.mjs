import test from 'node:test';
import assert from 'node:assert/strict';
import {createTelecomCompletion} from '../../src/providers/telecom.mjs';
import {parseRule} from '../../src/providers/rule-parser.mjs';

const credentials = {apiKey:'synthetic-test-token', model:'explicit-test-model'};
const output = {choices:[{finish_reason:'stop',message:{role:'assistant',content:'{"example":true}'}}]};
const request = {system:'Extract constraints',text:'Charizard ex',signal:new AbortController().signal};
const response = payload => ({ok:true,status:200,redirected:false,json:async()=>payload});

test('Telecom construction performs no request; explicit call sends approved request and signal',async()=>{
  let calls=0;
  const complete=createTelecomCompletion({...credentials,fetchImpl:async(url,options)=>{
    calls++;
    assert.equal(url,'https://llm.telecom.kz/v1/chat/completions');
    assert.equal(options.method,'POST');
    assert.equal(options.redirect,'error');
    assert.equal(options.signal,request.signal);
    assert.deepEqual(options.headers,{'content-type':'application/json',Authorization:'Bearer synthetic-test-token'});
    assert.deepEqual(JSON.parse(options.body),{model:'explicit-test-model',max_tokens:700,messages:[
      {role:'system',content:request.system},{role:'user',content:request.text},
    ]});
    return response(output);
  }});
  assert.equal(calls,0);
  assert.equal(await complete(request),'{"example":true}');
  assert.equal(calls,1);
});

test('Telecom refuses unapproved endpoint/configuration before HTTP',()=>{
  let calls=0;
  const fetchImpl=()=>{calls++;};
  for(const baseUrl of ['http://llm.telecom.kz/v1','https://evil.test/v1','https://llm.telecom.kz/v1/','https://llm.telecom.kz.evil.test/v1','https://llm.telecom.kz/v1?next=evil']){
    assert.throws(()=>createTelecomCompletion({...credentials,baseUrl,fetchImpl}),/INVALID_PROVIDER_BASE_URL/);
  }
  assert.throws(()=>createTelecomCompletion({model:'test',fetchImpl}),/PROVIDER_NOT_CONFIGURED/);
  assert.throws(()=>createTelecomCompletion({...credentials,fetchImpl,maxTokens:0}),/INVALID_MAX_TOKENS/);
  assert.equal(calls,0);
});

test('Telecom rejects redirect response and redirect exception without retry or leaking messages',async()=>{
  for(const fetchResult of [
    async()=>({ok:false,status:302}),
    async()=>({...response(output),redirected:true}),
    async()=>{throw new Error('Remote error includes synthetic-test-token');},
  ]){
    let calls=0;
    const complete=createTelecomCompletion({...credentials,fetchImpl:async(...args)=>{calls++;return fetchResult(...args);}});
    await assert.rejects(complete(request),{message:'PROVIDER_UNAVAILABLE'});
    assert.equal(calls,1);
  }
});

test('Telecom rejects malformed, truncated, tools, refusal and HTTP errors',async()=>{
  const invalid=[null,{}, {choices:[]},
    {choices:[{finish_reason:'length',message:{content:'{}'}}]},
    {choices:[{finish_reason:'stop',message:{content:[{type:'text',text:'{}'}]}}]},
    {choices:[{finish_reason:'stop',message:{content:' ',role:'assistant'}}]},
    {choices:[{finish_reason:'stop',message:{content:'{}',tool_calls:[{}]}}]},
    {choices:[{finish_reason:'stop',message:{content:'{}',function_call:{}}}]},
    {choices:[{finish_reason:'stop',message:{content:'{}',refusal:'declined'}}]},
  ];
  for(const payload of invalid){
    const complete=createTelecomCompletion({...credentials,fetchImpl:async()=>response(payload)});
    await assert.rejects(complete(request),{message:'PROVIDER_UNAVAILABLE'});
  }
  const complete=createTelecomCompletion({...credentials,fetchImpl:async()=>({ok:false,status:401})});
  await assert.rejects(parseRule('Charizard',{complete}),{code:'PROVIDER_UNAVAILABLE'});
  const badJson=createTelecomCompletion({...credentials,fetchImpl:async()=>({ok:true,json:async()=>{throw new Error('private body');}})});
  await assert.rejects(badJson(request),{message:'PROVIDER_UNAVAILABLE'});
});

test('Telecom supports custom max_tokens and rejects browser construction',async()=>{
  const complete=createTelecomCompletion({...credentials,maxTokens:120,fetchImpl:async(_,options)=>{
    assert.equal(JSON.parse(options.body).max_tokens,120); return response(output);
  }});
  await complete(request);
  const previous=globalThis.window;
  try {globalThis.window={};assert.throws(()=>createTelecomCompletion(credentials),/SERVER_ONLY/);}
  finally {if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
