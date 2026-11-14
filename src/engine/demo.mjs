// Offline deterministic demo. No model call, network request or implicit environment loading.
import {readFileSync} from 'node:fs';
import {evaluateRule} from './evaluate-rule.mjs';
const {observations}=JSON.parse(readFileSync(new URL('../../data/demo/charizard-psa9-source-observations.json',import.meta.url),'utf8'));
const rule={card_name:'Charizard ex',card_number:'199/165',language:'English',grader:'PSA',grade:9,max_price_cents:45000,min_discount_pct:15};
console.log(JSON.stringify({parser_mode:'preset-demo',rule,...evaluateRule(observations,rule)},null,2));
