import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnthropicCompletion} from '../../src/providers/anthropic.mjs';
import {parseRule} from '../../src/providers/rule-parser.mjs';
test('server adapter sends request only when called and passes abort signal',async()=>{
 let calls=0;
 const abort=new AbortController();
 const complete=createAnthropicCompletion({apiKey:'test-not-a-secret',model:'test-model',fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(options.signal,abort.signal);
  const body=JSON.parse(options.body);assert.equal(body.messages[0].content,'query');assert.equal(body.model,'test-model');
  return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:'{}'}]})};
 }});
 assert.equal(calls,0);assert.equal(await complete({system:'prompt',text:'query',signal:abort.signal}),'{}');assert.equal(calls,1);
});
test('truncated response is not accepted or retried',async()=>{
 let calls=0;
 const complete=createAnthropicCompletion({apiKey:'test',model:'test',fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({stop_reason:'max_tokens',content:[{type:'text',text:'{}'}]})};}});
 await assert.rejects(parseRule('Charizard',{complete}),{code:'PROVIDER_UNAVAILABLE'});assert.equal(calls,1);
});
test('missing credentials fail without HTTP',()=>{
 assert.throws(()=>createAnthropicCompletion({model:'test'}),/PROVIDER_NOT_CONFIGURED/);
});
