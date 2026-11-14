import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runQuery} from '../../src/engine/run-query.mjs';
const {observations}=JSON.parse(readFileSync(new URL('../../data/demo/charizard-psa9-source-observations.json',import.meta.url),'utf8'));
const rule={card_name:'Charizard ex',card_number:'199/165',set_name:null,language:'English',grader:'PSA',finish:null,grade:9,max_price_cents:45000,min_discount_pct:15};
test('whole pipeline uses provider output and computes one qualifying match',async()=>{
 const r=await runQuery({text:'Charizard ex 199/165 English PSA 9 до $450, дешевле на 15%',observations,complete:async()=>JSON.stringify(rule)});
 assert.deepEqual(r.rule,rule);assert.equal(r.groups[0].findings.length,1);assert.equal(r.groups[0].findings[0].below_sample_median_pct,23.91);
 assert.equal(r.live_verified,false);assert.equal(r.parser_mode,'provider');
});
test('valid provider output for absent card returns empty groups',async()=>{
 const r=await runQuery({text:'Pikachu',observations,complete:async()=>JSON.stringify({...rule,card_name:'Pikachu',card_number:null})});
 assert.equal(r.groups.length,0);
});
test('malformed provider output never reaches pricing',async()=>{
 await assert.rejects(runQuery({text:'Charizard',observations:null,complete:async()=>'bad'}),{code:'INVALID_MODEL_OUTPUT'});
});
