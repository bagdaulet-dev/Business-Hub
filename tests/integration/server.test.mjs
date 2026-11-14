import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {createAppServer} from '../../src/server/http.mjs';
import {createSearchHandler} from '../../src/server/search-handler.mjs';

const rule={card_name:'Charizard ex',card_number:'199/165',set_name:null,language:'English',grader:'PSA',finish:null,grade:9,max_price_cents:45000,min_discount_pct:null};
async function withServer(options,run){
  const server=createAppServer(options);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try{await run(`http://127.0.0.1:${server.address().port}`);}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
const post=(base,body,headers={'content-type':'application/json'})=>fetch(`${base}/api/search`,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});

test('HTTP uses server fixture, live parser tag, peers and price arithmetic with injected completion',async()=>{
  let calls=0;
  await withServer({complete:async({text})=>{calls++;assert.equal(text,'Charizard');return JSON.stringify(rule);}},async base=>{
    const response=await post(base,{text:'Charizard'});assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.results.length,2);
    assert.equal(data.results[0].listing.price_cents,35000);assert.equal(data.results[0].benchmark,46000);
    assert.equal(data.results[0].delta,11000);assert.equal(data.results[0].percent,23.91);
    assert.equal(data.results[0].peers.length,5);assert.equal(data.parserMode,'live-llm');
    assert.equal(data.dataMode,'historical_observations');assert.match(data.warnings.join(' '),/unverified/);
    const spoof=await post(base,{text:'Charizard',listings:[{price_cents:1}]});assert.equal(spoof.status,400);
    assert.equal(calls,1);
  });
});

test('model year filters the server fixture and stays outside the provider prompt', async () => {
  const received = [];
  await withServer({complete: async ({text}) => { received.push(text); return JSON.stringify(rule); }}, async base => {
    const valid = await post(base, {text: 'Charizard', modelYear: 2023});
    assert.equal(valid.status, 200);
    const matches = await valid.json();
    assert.equal(matches.modelYear, 2023);
    assert.equal(matches.results.length, 2);
    assert.ok(matches.results.every(result => result.listing.model_year === 2023));
    assert.equal(matches.results[0].benchmark, 46000);

    const mismatch = await post(base, {text: 'Charizard', modelYear: 2022});
    assert.equal(mismatch.status, 200);
    const empty = await mismatch.json();
    assert.equal(empty.modelYear, 2022);
    assert.deepEqual(empty.results, []);

    for (const modelYear of [null, '2023', 2023.5, 23, 10000]) {
      const invalid = await post(base, {text: 'Charizard', modelYear});
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error.code, 'INVALID_MODEL_YEAR');
    }
    assert.deepEqual(received, ['Charizard', 'Charizard']);
  });
});

test('strict static allowlist exposes app assets only; denies private paths and traversal',async()=>{
  await withServer({},async base=>{
    for(const path of ['/','/index.html','/app.mjs','/style.css','/search.mjs','/data/demo/products.mjs','/data/demo/charizard-psa9-source-observations.json']){
      const response=await fetch(base+path);assert.equal(response.status,200,path);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    }
    for(const path of ['/.env','/src/providers/telecom.mjs','/work/token','/.git/config','/server.mjs','/data/demo/HANDOFF.txt','/%2e%2e%2f.env','/%5c.env']){
      assert.equal((await fetch(base+path)).status,404,path);
    }
    const head=await fetch(base+'/style.css',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  });
});

test('invalid input, size/content type and HTTP methods fail before completion',async()=>{
  let calls=0;
  await withServer({complete:async()=>{calls++;return JSON.stringify(rule);}},async base=>{
    for(const body of ['{',{},[],{text:3},{text:''},{text:'x'.repeat(2001)},{text:'ok',model:'client-choice'}]){
      assert.equal((await post(base,body)).status,400);
    }
    assert.equal((await post(base,'x'.repeat(8193))).status,413);
    assert.equal((await post(base,'text',{'content-type':'text/plain'})).status,415);
    assert.equal((await fetch(base+'/api/search')).status,405);
    assert.equal(calls,0);
  });
});

test('missing configuration is 503; upstream errors are generic and safe',async()=>{
  await withServer({},async base=>{
    const response=await post(base,{text:'Charizard'});assert.equal(response.status,503);
    assert.equal((await response.json()).error.code,'PROVIDER_NOT_CONFIGURED');
  });
  await withServer({complete:async()=>{throw new Error('secret remote body and Authorization');}},async base=>{
    const response=await post(base,{text:'Charizard'});assert.equal(response.status,502);
    const raw=await response.text();assert.match(raw,/PROVIDER_UNAVAILABLE/);assert.doesNotMatch(raw,/secret|Authorization/);
  });
});

test('provider timeout and unsupported model response preserve safe statuses',async()=>{
  await withServer({complete:()=>new Promise(()=>{}),providerTimeoutMs:20},async base=>{
    const response=await post(base,{text:'Charizard'});assert.equal(response.status,502);assert.equal((await response.json()).error.code,'PROVIDER_TIMEOUT');
  });
  await withServer({complete:async()=>JSON.stringify({error:'UNSUPPORTED_QUERY'})},async base=>{
    assert.equal((await post(base,{text:'euros'})).status,400);
  });
});

test('concurrency capped at two and rate attempts capped without retry',async()=>{
  const pending=[];let calls=0;
  await withServer({complete:()=>{calls++;return new Promise(resolve=>pending.push(resolve));}},async base=>{
    const first=post(base,{text:'one'}),second=post(base,{text:'two'});
    for(let i=0;i<100&&pending.length<2;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(pending.length,2);
    assert.equal((await post(base,{text:'three'})).status,429);
    pending.forEach(resolve=>resolve(JSON.stringify(rule)));
    assert.equal((await first).status,200);assert.equal((await second).status,200);assert.equal(calls,2);
  });
  calls=0;
  await withServer({maxAttemptsPerMinute:1,complete:async()=>{calls++;return JSON.stringify(rule);}},async base=>{
    assert.equal((await post(base,{text:'one'})).status,200);
    assert.equal((await post(base,{text:'two'})).status,429);assert.equal(calls,1);
  });
});

test('slow request body times out without provider call',async()=>{
  let calls=0;
  await withServer({requestTimeoutMs:20,complete:async()=>{calls++;return JSON.stringify(rule);}},async base=>{
    const status=await new Promise((resolve,reject)=>{
      const req=request(base+'/api/search',{method:'POST',headers:{'content-type':'application/json'}},res=>{
        res.resume();res.on('end',()=>{req.destroy();resolve(res.statusCode);});
      });
      req.on('error',reject);req.write('{');
    });
    assert.equal(status,408);assert.equal(calls,0);
  });
});

test('Vercel pre-parsed body is supported and revalidated without stream reads',async()=>{
  let calls=0;
  const handler=createSearchHandler({complete:async()=>{calls++;return JSON.stringify(rule);}});
  for(const body of [{text:'Charizard'},JSON.stringify({text:'Charizard'}),Buffer.from(JSON.stringify({text:'Charizard'})),{text:'x'.repeat(9000)}]){
    const req={method:'POST',headers:{'content-type':'application/json'},body,resume(){}};
    let status;let payload;
    const res={setHeader(){},writeHead(code){status=code;},end(raw){payload=JSON.parse(raw);}};
    await handler(req,res);
    assert.equal(status,typeof body==='object'&&!Buffer.isBuffer(body)&&body.text.length>8192?413:200);
    if(status===200)assert.equal(payload.results.length,2);
    else assert.equal(payload.error.code,'BODY_TOO_LARGE');
  }
  assert.equal(calls,3);
});
