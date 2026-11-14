import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateRule} from '../../src/engine/evaluate-rule.mjs';
const {observations}=JSON.parse(readFileSync(new URL('../../data/demo/charizard-psa9-source-observations.json',import.meta.url),'utf8'));
test('named card and budget produce two matches with full baseline',()=>{
 const r=evaluateRule(observations,{card_name:'Charizard ex',grade:9,max_price_cents:45000});
 assert.equal(r.groups.length,1);assert.equal(r.groups[0].findings.length,2);assert.equal(r.groups[0].findings[0].reference_price_cents,46000);
});
test('different named card or grade never silently maps to fixture',()=>{
 assert.equal(evaluateRule(observations,{card_name:'Pikachu'}).groups.length,0);
 assert.equal(evaluateRule(observations,{card_name:'Charizard ex',grade:10}).groups.length,0);
});
test('conflicting card name cannot contaminate baseline even with matching other fields',()=>{
 const altered=structuredClone(observations);altered[0].card_name='Pikachu';
 const r=evaluateRule(altered,{card_name:'Charizard ex'});
 assert.equal(r.groups[0].matched_pool_count,5);
 assert.ok(r.groups[0].findings.every(x=>!x.comparable_item_ids.includes(altered[0].item_id)));
});
