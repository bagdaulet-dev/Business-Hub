import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateRule} from '../../src/engine/evaluate-rule.mjs';
const rule = overrides => ({card_name:null,card_number:null,set_name:null,language:null,grader:null,finish:null,grade:null,max_price_cents:null,min_discount_pct:null,...overrides});
const {observations}=JSON.parse(readFileSync(new URL('../../data/demo/charizard-psa9-source-observations.json',import.meta.url),'utf8'));
test('named card and budget produce two matches with full baseline',()=>{
 const r=evaluateRule(observations,rule({card_name:'Charizard ex',grade:9,max_price_cents:45000}));
 assert.equal(r.groups.length,1);assert.equal(r.groups[0].findings.length,2);assert.equal(r.groups[0].findings[0].reference_price_cents,46000);
});
test('different named card or grade never silently maps to fixture',()=>{
 assert.equal(evaluateRule(observations,rule({card_name:'Pikachu'})).groups.length,0);
 assert.equal(evaluateRule(observations,rule({card_name:'Charizard ex',grade:10})).groups.length,0);
});
test('conflicting card name cannot contaminate baseline even with matching other fields',()=>{
 const altered=structuredClone(observations);altered[0].card_name='Pikachu';
 const r=evaluateRule(altered,rule({card_name:'Charizard ex'}));
 assert.equal(r.groups[0].matched_pool_count,5);
 assert.ok(r.groups[0].findings.every(x=>!x.comparable_item_ids.includes(altered[0].item_id)));
});

test('direct entry rejects incomplete and unknown rules instead of ignoring restrictions',()=>{
 assert.throws(()=>evaluateRule(observations,{}),{code:'INVALID_MODEL_OUTPUT'});
 assert.throws(()=>evaluateRule(observations,rule({card_name:'Charizard ex',unknown_filter:'first edition'})),{code:'INVALID_MODEL_OUTPUT'});
});
test('number-only query keeps conflicting card names in separate comparison pools',()=>{
 const altered=structuredClone(observations);altered[0].card_name='Pikachu';
 const r=evaluateRule(altered,rule({card_number:'199/165'}));
 assert.equal(r.groups.length,2);
 for(const g of r.groups)for(const f of g.findings){
  const name=altered.find(x=>x.item_id===f.item_id).card_name;
  assert.ok(f.comparable_item_ids.every(id=>altered.find(x=>x.item_id===id).card_name===name));
 }
});
