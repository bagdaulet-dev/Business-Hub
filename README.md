# CollectWatch

CollectWatch compares archived eBay listings by product, price, year, and item location. The current AI server searches the Charizard fixture. Sony and Canon examples are the next catalog entries described in the [search UI spec](data/demo/TEAMMATE-SEARCH-UI-SPEC.md).

## Run locally

Use Node.js 22. The app requires no dependencies.

```sh
npm start
```

Open http://127.0.0.1:4173. For real model requests, provide the server variables in `.env.example` and run `node --env-file=.env server.mjs`. Keep credentials on the server.

## Search and comparisons

Choose an example or type a product query, then select **Search**. Use **Filters** to override the price, model year, or item location. **All countries** explicitly removes a location restriction. **Clear location** restores the default search behavior.

For the Charizard example with no manual filters, the $350 listing is 23.9% below the median of the five other archived prices. Selecting **United States** hides records whose location is unknown. **Price comparison** explains the result and links to each comparable listing. Prices exclude shipping, taxes, and duties.

The server accepts `POST /api/search` with `text` and optional `overrides`:

```json
{"text":"Charizard ex 199/165 English PSA 9 under $200","overrides":{"max_price_cents":48000,"model_year":2023,"item_location_countries":["US"]}}
```

The response includes `effectiveRule`, `overrideSources`, and `results`. The server applies structured overrides after validating the card parser response. The location and year can be supplied manually in this version. Extracting them from text and serving the electronics catalog require the generalized parser and engine. The archived electronics datasets remain available for that integration.

## Verify locally

```sh
npm test
npm run build
node tests/integration/browser-check.mjs
```

The browser check requires Playwright and a local Chromium installation. It uses an injected model completion for the archived Charizard data and a test response for the electronics rendering, without requests to the model provider.

The hero uses original generated artwork with no listing photography. Ambient light and product tilt follow a mouse or trackpad. On touch devices the hero floats, and the interface responds to taps. Reduced-motion settings disable the animations.
