// Disabled by owner request. No provider imports or LLM calls.
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.statusCode=503;
 res.setHeader('Content-Type','application/json');
 res.end(JSON.stringify({error:{code:'SERVICE_DISABLED',message:'This service has been disabled.'}}));
}
