# CollectWatch

Kimi interprets a product query. Deterministic code applies manual overrides and compares saved eBay observations for Charizard ex 199/165, Sony WH-1000XM5 and Canon EOS R50.

## Run locally

Node.js22, no runtime dependencies:

```sh
node --env-file=.env server.mjs
```

Default URL:http://127.0.0.1:4173. PORT can override it. Server variables are listed in .env.example; never expose the key to the browser.

## Presentation flow

One Search uses AI. Filters override extracted maximum USD price, model year and item-location countries. Empty/default countries follow the query; explicit All countries clears the location restriction.

Each example starts below the cheapest initial offer:

| Query budget | Delayed real listing | Next initial price |
|---|---:|---:|
| Charizard under$380 | $360 | $400 |
| Sony under$190 | $184 | $199 |
| Canon under$660 | $649.95 | $679.99 |

Search initially excludes the delayed item and excludes it from comparison peers. Watch this search reveals that unchanged real historical record after10seconds, if it matches the final conditions. View on eBay uses its original source URL. Stop watching pauses; Resume restarts the delay. After completion no Replay button is offered. Editing the search disposes the old watch.

The footer explains the data and timing: saved eBay listings, unverified current prices/availability, staged new-listing arrival. No invented products or prices are used. This is page-local presentation logic, not a live monitor or paid subscription. A closed/reloaded page loses the watch. No extra Kimi call occurs during the timer.

The old$350 Charizard observation remains in its archival source file but is excluded from the active catalog because its source could not be independently reopened. The delayed$360 listing has separate cached-page evidence in watch-scenarios.json. Date of retrieval does not establish current availability.

## API and price comparison

POST /api/search accepts text and optional overrides:{max_price_cents,model_year,item_location_countries}. Returns rule,effectiveRule,overrideSources,results,watchRule and watchArrivals. Pending arrivals are included as explicit scenario data, but not as initial results or peers.

Comparison excludes the current listing and needs at least three other eligible peers. Budget filters candidates, not peers. Sony comparisons stay within item-location groups. Canon has no median because regional/warranty equivalence remains unresolved. Shipping,taxes and duties are excluded. Minimum-discount constraints currently disable watch with an explanation.

## Verification

```sh
node --test tests/engine/*.test.mjs tests/integration/server.test.mjs
node build-static.mjs
node tests/integration/browser-check.mjs
```

Browser check requires Playwright and Chromium. It uses injected completions with the real local HTTP/catalog path, verifies filters and mobile layout, then waits for a real ten-second staged arrival and checks its original eBay link. No paid model calls are made by the test suite.
