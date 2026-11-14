import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRule, validateRule } from '../../src/providers/rule-parser.mjs';
const base = {card_name:'Charizard ex',card_number:'199/165',set_name:null,language:'English',grader:'PSA',finish:null,grade:9,max_price_cents:45000,min_discount_pct:null};
test('valid extraction keeps unspecified constraints null', async () => {
 assert.deepEqual(await parseRule('Charizard ex 199/165 PSA 9 English до $450', {complete:async()=>JSON.stringify(base)}), base);
});
test('reject malformed output and additional risk fields', async () => {
 for(const output of ['not JSON', JSON.stringify({...base,risk_score:1}), JSON.stringify({...base,max_price_cents:12.5}), JSON.stringify({...base,grade:11})]) {
  await assert.rejects(parseRule('Charizard',{complete:async()=>output}),{code:'INVALID_MODEL_OUTPUT'});
 }
});
test('no provider call on empty input', async () => {
 await assert.rejects(parseRule('',{complete:()=>assert.fail('called')}),{code:'INVALID_QUERY'});
});
test('missing provider is explicit, no silent demo fallback', async()=> {
 await assert.rejects(parseRule('Charizard'),{code:'PROVIDER_NOT_CONFIGURED'});
});
test('unsupported constraints fail explicitly',()=> {
 assert.throws(()=>validateRule({error:'UNSUPPORTED_QUERY'}),{code:'UNSUPPORTED_QUERY'});
});
test('remote error content is redacted', async()=> {
 await assert.rejects(parseRule('Charizard',{complete:async()=>{throw new Error('SECRET');}}),e=>e.code==='PROVIDER_UNAVAILABLE'&&!e.message.includes('SECRET'));
});
test('timeout rejects even if provider ignores signal', async()=> {
 await assert.rejects(parseRule('Charizard',{complete:()=>new Promise(()=>{}),timeoutMs:5}),{code:'PROVIDER_TIMEOUT'});
});
