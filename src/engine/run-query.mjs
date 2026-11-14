/** Internal composition for the future server adapter, not a shared HTTP contract. */
import {parseRule} from '../providers/rule-parser.mjs';
import {evaluateRule} from './evaluate-rule.mjs';
export async function runQuery({text, observations, complete, timeoutMs, pricingOptions={}}) {
 const rule=await parseRule(text,{complete,timeoutMs});
 return {rule, parser_mode:'provider', ...evaluateRule(observations,rule,pricingOptions)};
}
