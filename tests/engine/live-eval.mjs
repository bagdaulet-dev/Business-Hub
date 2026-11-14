// Explicit, bounded live semantic trial. No .env loading, retries or credential output.
import {readFileSync} from 'node:fs';
import {parseRule} from '../../src/providers/rule-parser.mjs';
import {createTelecomCompletion} from '../../src/providers/telecom.mjs';
import {evaluateRule} from '../../src/engine/evaluate-rule.mjs';

const safeErrors = new Set(['INVALID_MODEL_OUTPUT','UNSUPPORTED_QUERY','QUERY_NEEDS_CARD',
  'INVALID_QUERY','PROVIDER_NOT_CONFIGURED','INVALID_TIMEOUT','PROVIDER_TIMEOUT','PROVIDER_UNAVAILABLE']);
const emit = report => console.log(JSON.stringify(report, null, 2));

async function main() {
  const args = process.argv.slice(2);
  let live = false, limit = 1, limitSeen = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--live' && !live) live = true;
    else if (args[i] === '--limit' && !limitSeen && /^[1-9]\d*$/.test(args[i+1] ?? '')) {
      limit = Number(args[++i]); limitSeen = true;
      if (!Number.isSafeInteger(limit)) throw new Error('INVALID_ARGUMENTS');
    } else throw new Error('INVALID_ARGUMENTS');
  }
  const {cases} = JSON.parse(readFileSync(new URL('./semantic-cases.json',import.meta.url),'utf8'));
  if (!Array.isArray(cases) || !cases.length) throw new Error('INVALID_CASES');
  const selected = cases.slice(0, Math.min(limit, cases.length));
  if (!live) {
    emit({status:'dry_run',network_calls:0,available_cases:cases.length,selected_cases:selected.length,
      note:'No provider called. Explicit --live is required; default limit is one trial case.'});
    return;
  }
  // Access only these configuration names and only after the explicit live switch.
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!apiKey?.trim() || !model?.trim()) throw new Error('MISSING_PROVIDER_CONFIGURATION');
  const complete = createTelecomCompletion({apiKey,model,baseUrl:process.env.LLM_BASE_URL});
  const {observations} = JSON.parse(readFileSync(new URL('../../data/demo/charizard-psa9-source-observations.json',import.meta.url),'utf8'));
  const results=[];
  let providerAttempts=0;
  // Sequential, one parse attempt per selected case. No retry or fallback.
  for (let index=0; index<selected.length; index++) {
    const c=selected[index];
    const allowedErrors=c.expected_errors ?? (c.expected_error ? [c.expected_error] : []);
    try {
      providerAttempts++;
      const rule=await parseRule(c.text,{complete});
      const subsetMatches=Object.entries(c.expected ?? {}).every(([key,value])=>rule[key]===value);
      const actualMatches=c.expected_fixture_matches == null ? null :
        evaluateRule(observations,rule).groups.reduce((sum,group)=>sum+group.findings.length,0);
      const fixtureMatches=c.expected_fixture_matches == null ? null : actualMatches===c.expected_fixture_matches;
      results.push({case_index:index+1,passed:allowedErrors.length===0 && subsetMatches && fixtureMatches!==false,
        expected_subset_matches:subsetMatches,fixture_count_matches:fixtureMatches,error:null});
    } catch(error) {
      const code=safeErrors.has(error?.code) ? error.code : 'EVALUATION_ERROR';
      results.push({case_index:index+1,passed:allowedErrors.includes(code),
        expected_subset_matches:null,fixture_count_matches:null,error:code});
      if (['PROVIDER_UNAVAILABLE','PROVIDER_TIMEOUT','PROVIDER_NOT_CONFIGURED'].includes(code)) break;
    }
  }
  const passed=results.filter(r=>r.passed).length;
  emit({status:'live_evaluation',available_cases:cases.length,selected_cases:selected.length,
    provider_attempts:providerAttempts,completed_cases:results.length,passed,failed:results.length-passed,results});
  if(passed!==results.length) process.exitCode=1;
}

main().catch(error=>{
  const allowed=new Set(['INVALID_ARGUMENTS','INVALID_CASES','MISSING_PROVIDER_CONFIGURATION']);
  emit({status:'not_run',provider_attempts:0,error:allowed.has(error?.message)?error.message:'EVALUATION_SETUP_ERROR'});
  process.exitCode=2;
});
