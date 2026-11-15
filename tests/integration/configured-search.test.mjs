import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredSearchHandler} from '../../server.mjs';
import {ATTRIBUTE_KEYS} from '../../src/providers/product-rule-parser.mjs';

// Exercise the production wiring without a socket or any real provider request.
test('configured search uses 4000 tokens and rejects empty truncated output without retry', async t => {
  const names = ['LLM_API_KEY', 'LLM_MODEL', 'LLM_BASE_URL'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });
  process.env.LLM_API_KEY = 'synthetic-configured-search-test-key';
  process.env.LLM_MODEL = 'synthetic-configured-search-model';
  process.env.LLM_BASE_URL = 'https://llm.telecom.kz/v1';
  const rule = {
    product_id:'sony-wh1000xm5',
    ...Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, null])),
    max_price_cents:20000, min_discount_pct:null, model_year:null, item_location_countries:[],
  };
  async function invoke(payload) {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({url, body:JSON.parse(options.body), redirect:options.redirect});
      return {ok:true, status:200, redirected:false, json:async () => payload};
    };
    let status, output;
    const req = {method:'POST', headers:{'content-type':'application/json'},
      body:{text:'Sony WH-1000XM5 under $200'}, resume(){}};
    const res = {setHeader(){}, writeHead(value){status=value;}, end(value){output=JSON.parse(value);}};
    await configuredSearchHandler(req, res);
    assert.equal(calls.length, 1, 'one explicit search makes exactly one provider call');
    assert.equal(calls[0].url, 'https://llm.telecom.kz/v1/chat/completions');
    assert.equal(calls[0].body.max_tokens, 4000);
    assert.equal(calls[0].body.model, 'synthetic-configured-search-model');
    assert.equal(calls[0].body.messages[1].content, req.body.text);
    assert.equal(calls[0].redirect, 'error');
    return {status, output};
  }
  const success = await invoke({choices:[{finish_reason:'stop', message:{role:'assistant', content:JSON.stringify(rule)}}]});
  assert.equal(success.status, 200);
  assert.equal(success.output.effectiveRule.product_id, 'sony-wh1000xm5');
  assert.ok(success.output.results.length > 0);
  assert.ok(success.output.results.every(result => result.listing.price_cents <= 20000));
  const failure = await invoke({choices:[{finish_reason:'length', message:{role:'assistant', content:''}}]});
  assert.equal(failure.status, 502);
  assert.equal(failure.output.error.code, 'PROVIDER_UNAVAILABLE');
  assert.equal(Object.hasOwn(failure.output, 'results'), false);
  assert.equal(JSON.stringify(failure.output).includes(process.env.LLM_API_KEY), false);
});
