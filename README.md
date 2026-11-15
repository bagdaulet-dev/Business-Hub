# CollectWatch

CollectWatch compares archived eBay listings by product, price, year, and item location. The AI server supports Charizard ex 199/165, Sony WH-1000XM5 and Canon EOS R50 using sourced historical observations. Kimi parses the query; deterministic code filters and compares prices. A page-local watch simulation demonstrates a delayed matching listing.

## Run locally

Use Node.js 22. The app requires no dependencies.

```sh
npm start
```

Open http://127.0.0.1:4173. For real model requests, provide the server variables in `.env.example` and run `node --env-file=.env server.mjs`. Keep credentials on the server.

## Search and comparisons

Choose an example or type a product query, then select **Search**. Use **Filters** to override the price, model year, or item location. **All countries** explicitly removes a location restriction. **Clear location** restores the default search behavior.

The Charizard example uses a $300 budget and intentionally has no initial matches. Increase the budget to $400 to see the $350 and $400 offers; the $350 listing is 23.9% below the median of the five other archived prices. Selecting **United States** hides records whose location is unknown. **Price comparison** explains the result and links to each comparable listing. Prices exclude shipping, taxes, and duties.

The server accepts `POST /api/search` with `text` and optional `overrides`:

```json
{"text":"Charizard ex 199/165 English PSA 9 under $200","overrides":{"max_price_cents":48000,"model_year":2023,"item_location_countries":["US"]}}
```

The response includes `effectiveRule`, `overrideSources`, `results`, and `watchRule`. The server applies structured overrides after validating the generalized parser response. Year and item-location countries can be extracted from text or overridden manually. Sony has eight fixed-price observations; comparisons stay within item-location groups. Canon has five historical candidates but no median because regional/warranty equivalence is unresolved. Unknown locations fail a nonempty country filter.

## Watch simulation

After a successful search (including zero results), click **Watch this search**. After 10 seconds a fixed synthetic listing arrives: Charizard $280, Sony $180, or Canon $600, all simulated US locations. It produces an in-page notification only if it matches the saved effective conditions. Stop cancels the timer; Replay starts an explicit new run. Editing the search or filters clears the old watch. No extra model request occurs.

Synthetic offers are labelled, have no purchase link, and never enter the historical price baseline. This is a page-local simulation, not a paid subscription, background eBay polling, or external push notification. Minimum-discount conditions currently disable watch with an explanation. See [watch integration notes](src/engine/DEMO-WATCH-HANDOFF.md).

## Verify locally

```sh
npm test
npm run build
node tests/integration/browser-check.mjs
```

The browser check requires Playwright and a local Chromium installation. It uses injected model completions with the real local HTTP/catalog path for all three products, plus a real ten-second watch timer, without requests to the model provider.

The hero uses original generated artwork with no listing photography. Ambient light and product tilt follow a mouse or trackpad. On touch devices the hero floats, and the interface responds to taps. Reduced-motion settings disable the animations.
