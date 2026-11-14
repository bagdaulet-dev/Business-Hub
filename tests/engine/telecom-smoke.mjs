// One explicitly requested access check. Run from repo root with Node --env-file=.env.
import {writeFileSync} from 'node:fs';
if (!process.argv.includes('--run')) {
 console.log(JSON.stringify({status:'not_run',network_calls:0,reason:'Explicit --run required'}));
} else {
 const key=process.env.LLM_API_KEY;
 const base=process.env.LLM_BASE_URL;
 if (!key?.trim() || base!=='https://llm.telecom.kz/v1') {
  console.log(JSON.stringify({status:'not_run',network_calls:0,reason:'Missing key or unexpected base URL'}));process.exitCode=2;
 } else {
  let allowed=false;
  try {writeFileSync('.telecom-smoke-attempt.json',JSON.stringify({attempted_at:new Date().toISOString(),endpoint:'/models'}),{flag:'wx',mode:0o600});allowed=true;}
  catch {console.log(JSON.stringify({status:'not_run',network_calls:0,reason:'Attempt marker exists or cannot be created; no automatic repeat'}));process.exitCode=2;}
  if(allowed){
   try{
    const response=await fetch(base+'/models',{headers:{Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok){console.log(JSON.stringify({status:'failed',http_status:response.status,network_calls:1}));process.exitCode=1;}
    else {
     const payload=await response.json();
     if(!Array.isArray(payload.data)) throw new Error('Invalid response');
     const models=payload.data.map(x=>x?.id).filter(x=>typeof x==='string'&&x.length<200&&!x.includes(key)&&!x.startsWith('sk-')).slice(0,100);
     console.log(JSON.stringify({status:'access_verified',network_calls:1,models,generation_tested:false}));
    }
   }catch{console.log(JSON.stringify({status:'failed',network_calls:1,reason:'Transport, timeout or response error; no retry'}));process.exitCode=1;}
  }
 }
}
