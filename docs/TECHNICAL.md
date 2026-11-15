# Technical guide

Kimi interprets a product query. Deterministic code applies manual overrides and compares saved eBay observations for Charizard ex 199/165, Sony WH-1000XM5 and Canon EOS R50.

## Run locally

Node.js 22, no runtime dependencies:

```sh
node --env-file=.env server.mjs
```

Default URL: http://127.0.0.1:4173. PORT can override it. Server variables are listed in .env.example; never expose the key to the browser.

## Presentation flow

One Search uses AI. Filters override extracted maximum USD price, model year and item-location countries. Empty/default countries follow the query; explicit All countries clears the location restriction.

The examples serve different presentation goals:Charizard shows sequential arrivals, Sony shows ordinary price comparisons, Canon shows country filters and missing comparison evidence:

| Query budget | Delayed real listing | Next initial price |
|---|---:|---:|
| Charizard under$380 | $375 at 10s, then$360 at15s | $400 |
| Sony under$200 | $184 at 10s | $199 (two separate offers) |
| Canon under$800 | $649.95 at 10s | $679.99 |

Search initially excludes the delayed item and excludes it from comparison peers. Watch this search reveals that unchanged real historical record after 10seconds, if it matches the final conditions. View on eBay uses its original source URL. Stop watching pauses the schedule; Resume continues the remaining active-time delay. After completion no Replay button is offered. Editing the search disposes the old watch.

The footer explains the data and timing: saved eBay listings, unverified current prices/availability, staged new-listing arrival. No invented products or prices are used. This is page-local presentation logic, not a live monitor or paid subscription. A closed/reloaded page loses the watch. No extra Kimi call occurs during the timer.

The old$350 Charizard observation remains in its archival source file but is excluded from the active catalog because its source could not be independently reopened. The delayed$360 listing has separate cached-page evidence in watch-scenarios.json. Date of retrieval does not establish current availability.

## API and price comparison

POST /api/search accepts text and optional overrides:{max_price_cents,model_year,item_location_countries}. Returns rule,effectiveRule,overrideSources,results,watchRule and watchArrivals. Pending arrivals are included as explicit scenario data, but not as initial results or peers.

Comparison excludes the current listing and needs at least three other eligible peers. Budget filters candidates, not peers. Sony comparisons stay within item-location groups. Canon has no median because regional/warranty equivalence remains unresolved. Shipping,taxes and duties are excluded. Minimum-discount constraints currently disable watch with an explanation.

## Verification

```sh
node --test tests/engine/*.test.mjs tests/integration/*.test.mjs
node build-static.mjs
node tests/integration/browser-check.mjs
node tests/integration/notification-browser-check.mjs
```

Browser check requires Playwright and Chromium. It uses injected completions with the real local HTTP/catalog path, verifies filters and mobile layout, then checks staged real arrivals at 10s and 15s, their eBay links and ascending price order. No paid model calls are made by the test suite.

Sony’s two$199 offers are separate listing IDs156530320468 and187722965921, both new blackWH-1000XM5 in the same comparison group. Their titles/locations differ; Bluetooth and New In Box wording does not define another model. Canon records claim body-only configuration; unresolved regional warranty and packaging equivalence—not necessarily different lens kits—prevents a shared median.

New matches also appear in a single top toast: a short product identity and price. Notifications use FIFO, with250ms entrance,5seconds reading time,250ms exit and200ms gap; a later arrival never replaces the current toast. Cards update immediately. Clear search cancels active and queued toasts. Reduced-motion removes entrance/exit animation while retaining reading time and separation. These are in-page notifications, not operating-system push alerts.

Newly arrived listings have the same Price comparison details as initial results. They use the fixed initial comparable pool, excluding themselves and all staged arrivals; the budget does not truncate peers. Charizard$375 and$360 compare with the$460median (18.48% and21.74% below). This keeps the baseline stable between arrivals and avoids exposing future listings through comparison links. Canon continues to show no median.

## Help me choose

Click Help me choose above the results to ask Kimi to compare the currently visible listings against the effective search conditions. The response identifies a best fit or no clear winner, explains an alternative and lists missing information to check. Prices and benchmark arithmetic come from server-owned catalog data, not the model. Recommendation links must refer to one of the compared listings.

POST /api/recommend accepts only {effectiveRule,listingIds}. It validates the rule and IDs, reloads trusted data, and rejects price/URL/configuration injection. The server uses a 35-second provider timeout, two simultaneous requests and six attempts per minute per process. No extra call happens automatically on search or arrival. A new visible listing aborts any pending recommendation and marks the previous result stale; Update recommendation requests a fresh comparison. Clearing the search discards it.

Server credentials remain in local environment variables. The recommendation uses the configured Kimi model with a 4000-token generation budget (including model reasoning). No billing, purchasing or risk scoring is implemented. Local recommendation UI validation: `node tests/integration/recommendation-browser-check.mjs` (Playwright required; injected completion, no provider calls). Hosting remains deferred; deployment configuration has not been changed for this feature.
