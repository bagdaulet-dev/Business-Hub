import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {createAppServer} from '../../src/server/http.mjs';
import {createSearchHandler} from '../../src/server/search-handler.mjs';

const rule={product_id:'charizard-ex-199-165-psa9',model_year:null,item_location_countries:[],condition:null,color:null,configuration:null,card_name:'Charizard ex',card_number:'199/165',set_name:null,language:'English',grader:'PSA',finish:null,grade:9,max_price_cents:45000,min_discount_pct:null};
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
    const data=await response.json();assert.equal(data.results.length,1);
    assert.equal(data.results[0].listing.price_cents,40000);assert.equal(data.results[0].benchmark,48000);
    assert.equal(data.results[0].delta,8000);assert.equal(data.results[0].percent,16.67);
    assert.equal(data.results[0].peers.length,4);assert.equal(data.watchArrivals[0].price_cents,36000);assert.ok(data.results.every(r=>r.listing.id!==data.watchArrivals[0].id));assert.equal(data.parserMode,'live-llm');
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
    assert.equal(matches.results.length, 1);
    assert.ok(matches.results.every(result => result.listing.model_year === 2023));
    assert.equal(matches.results[0].benchmark, 48000);

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

test('manual price and location filters take precedence in the saved catalog', async () => {
  const requests = [];
  const complete = async ({ text }) => {
    requests.push(text);
    return JSON.stringify({ ...rule, max_price_cents: 20000 });
  };
  await withServer({ complete }, async base => {
    const text = 'Charizard ex under $200';
    const apply = overrides => post(base, { text, overrides }).then(async response => {
      assert.equal(response.status, 200);
      return response.json();
    });
    const expanded = await apply({ max_price_cents: 48000, model_year: 2023 });
    assert.equal(expanded.effectiveRule.max_price_cents, 48000);
    assert.equal(expanded.overrideSources.max_price_cents, 'manual');
    assert.equal(expanded.results[0].listing.price_cents, 40000);
    assert.equal(expanded.results[0].benchmark, 48000);

    const us = await apply({ max_price_cents: 48000, item_location_countries: ['US', 'US'] });
    assert.deepEqual(us.effectiveRule.item_location_countries, ['US']);
    assert.deepEqual(us.results.map(({ listing }) => listing.price_cents), [45999, 46000]);
    assert.equal(us.results[0].benchmark, 50000);

    const all = await apply({ max_price_cents: 48000, item_location_countries: [] });
    assert.deepEqual(all.effectiveRule.item_location_countries, []);
    assert.equal(all.results[0].listing.price_cents, 40000);
    assert.deepEqual((await apply({ max_price_cents: 0 })).results, []);

    for (const overrides of [null, [], { model_year: 2023.5 }, { max_price_cents: -1 },
      { max_price_cents: 1e20 }, { item_location_countries: ['ZZ'] }, { item_location_countries: 'US' }]) {
      const invalid = await post(base, { text, overrides });
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error.code, 'INVALID_OVERRIDES');
    }
    assert.deepEqual(requests, [text, text, text, text]);
  });
});

test('strict static allowlist exposes app assets only; denies private paths and traversal',async()=>{
  await withServer({},async base=>{
    for(const path of ['/','/index.html','/app.mjs','/style.css','/assets/collectwatch-products.webp','/watch-ui.mjs','/src/engine/demo-watch.mjs','/data/demo/watch-scenarios.json']){
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
    if(status===200)assert.equal(payload.results.length,1);
    else assert.equal(payload.error.code,'BODY_TOO_LARGE');
  }
  assert.equal(calls,3);
});
