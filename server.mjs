// Only this entry reads provider environment. No .env loading or live probes.
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createAppServer} from './src/server/http.mjs';
import {createSearchHandler} from './src/server/search-handler.mjs';
import {createTelecomCompletion} from './src/providers/telecom.mjs';
import {RuleParseError} from './src/providers/rule-parser.mjs';
export {createAppServer};

async function configuredCompletion(input) {
  const apiKey=process.env.LLM_API_KEY;
  const model=process.env.LLM_MODEL?.trim()||'kimi-k3';
  if(!apiKey?.trim()){
    throw new RuleParseError('PROVIDER_NOT_CONFIGURED');
  }
  let complete;
  try{complete=createTelecomCompletion({apiKey,model,baseUrl:process.env.LLM_BASE_URL});}
  catch{throw new RuleParseError('PROVIDER_NOT_CONFIGURED');}
  return complete(input);
}

// Singleton for the process: static Node entry and Vercel share the same bounded handler.
export const configuredSearchHandler=createSearchHandler({complete:configuredCompletion});

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const portText=process.env.PORT??'4173';
  const port=/^\d+$/.test(portText)?Number(portText):NaN;
  if(!Number.isInteger(port)||port<1||port>65535){console.error('INVALID_SERVER_PORT');process.exitCode=1;}
  else{
  const server=createAppServer({searchHandler:configuredSearchHandler});
  server.listen(port,'127.0.0.1',()=>console.log(`CollectWatch available at http://127.0.0.1:${port}`));
  server.on('error',()=>{console.error('SERVER_START_FAILED');process.exitCode=1;});
  }
}
