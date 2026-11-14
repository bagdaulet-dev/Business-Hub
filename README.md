# CollectWatch

CollectWatch is a mobile web demo for finding and comparing products. It runs on Node.js 22 and requires no packages. Standard search runs without an API key.

```sh
npm start
```

Open http://127.0.0.1:4173. The local server listens on the loopback interface.

- Enter a product name. Model year and maximum price are optional. The year refers to the product's original release or edition.
- Tap an example to fill in its name and year. Click **Search** to reveal results.
- Sony and Canon use labeled simulated prices. For Charizard, choose PSA 9 and a maximum price of $500 to see five archived eBay listings. Open **Why this price?** on the $350 listing to see the $460 median from five other listings.
- Search for a product outside the demo catalog to see the **Search eBay** link.

Prices exclude shipping and tax. [Archived card data and limitations](data/demo/HANDOFF.txt).

Model years come from the [Sony WH-1000XM5 announcement](https://www.sony.co.uk/presscentre/sony-re-writes-the-rules-with-their-newest-industry-leading-noise-cancelling-headphones-introducing-the-wh-1000xm5), the [Canon EOS R50 announcement](https://www.usa.canon.com/newsroom/2023/20230207-camera), and the [Pokémon Scarlet & Violet 151 release](https://www.pokemon.com/us/pokemon-tcg/scarlet-violet-151).

## Pokémon AI search

**Search Pokémon with AI** uses the same-origin `POST /api/search` route. It sends the query and any selected budget or grade to the server for interpretation. The server applies the optional `modelYear` integer directly to its archived listings. It calculates price comparisons from the archive and displays the interpreted filters. Sony and Canon use standard search.

Example request:

```json
{"text":"Charizard ex 199/165 PSA 9 under $450, at least 15% below comparable offers","modelYear":2023}
```

Clients may still send `{"text":"..."}`. Successful responses include `rule`, `results`, `parserMode`, `dataMode`, and `warnings`. If supplied, `modelYear` is echoed as a separate filter. Year refers to the product's release or edition.

For local mock verification, run `npm test`. The HTTP tests inject a completion without contacting a provider. The browser check uses the same injected server and requires Playwright and a local browser:

```sh
node tests/integration/browser-check.mjs
```

For a configured environment, set the server-side variables from `.env.example` and run `node --env-file=.env server.mjs`. Vercel uses the repository's Node handler and static build. Use `npm run build` to verify the allowlisted assets.

## Explanation API

By default, **Why this price?** shows a local calculation. To connect a server, set the `collectwatch-explain-endpoint` meta tag in `index.html` to a same-origin path such as `/api/explain`.

When a visitor opens an explanation, the browser sends a JSON POST with `title`, optional `variant`, `price_cents`, `comparable_prices_cents`, `median_cents` (or `null`), and `source` (`sample` or `snapshot`). Return an English response in the form `{"explanation":"Your explanation here."}`. If the request fails, the local calculation stays visible. Keep any provider key on the server.
