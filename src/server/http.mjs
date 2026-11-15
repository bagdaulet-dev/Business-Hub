import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createSearchHandler,sendJson} from './search-handler.mjs';

const root=new URL('../../',import.meta.url);
const paths=new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/index.html',['index.html','text/html; charset=utf-8']],
  ['/app.mjs',['app.mjs','text/javascript; charset=utf-8']],
  ['/src/engine/demo-watch.mjs',['src/engine/demo-watch.mjs','text/javascript; charset=utf-8']],
  ['/data/demo/watch-scenarios.json',['data/demo/watch-scenarios.json','application/json; charset=utf-8']],
  ['/watch-ui.mjs',['watch-ui.mjs','text/javascript; charset=utf-8']],
  ['/style.css',['style.css','text/css; charset=utf-8']],
  ['/assets/collectwatch-products.webp',['assets/collectwatch-products.webp','image/webp']],
]);

export function createAppServer(options={}) {
  const search=options.searchHandler??createSearchHandler(options);
  const server=createServer(async(req,res)=>{
    let path;
    try{
      const raw=req.url?.split('?')[0];
      if(!raw?.startsWith('/')||raw.startsWith('//'))throw new Error();
      path=decodeURIComponent(raw);
      if(path.includes('\\')||path.includes('\0')||path.split('/').some(part=>part==='.'||part==='..'))throw new Error();
    }catch{req.resume();sendJson(res,404,{error:{code:'NOT_FOUND',message:'Resource not found.'}});return;}
    if(path==='/api/search'){await search(req,res);return;}
    const file=paths.get(path);
    if(!file){req.resume();sendJson(res,404,{error:{code:'NOT_FOUND',message:'Resource not found.'}});return;}
    if(!['GET','HEAD'].includes(req.method)){req.resume();res.setHeader('allow','GET, HEAD');sendJson(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'Use GET or HEAD.'}});return;}
    try{
      const body=await readFile(new URL(file[0],root));
      res.writeHead(200,{'content-type':file[1],'content-length':body.length,'cache-control':'no-store','x-content-type-options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:body);
    }catch{sendJson(res,404,{error:{code:'NOT_FOUND',message:'Resource not found.'}});}
  });
  server.requestTimeout=10000;
  server.headersTimeout=10000;
  return server;
}
