# CollectWatch

CollectWatch is a mobile web demo for finding and comparing products. It runs on a static HTTP server and requires no API keys or packages.

```sh
python3 -m http.server 4173
```

Open http://localhost:4173. On a phone connected to the same Wi-Fi network, use the computer's address on port 4173.

- Enter a product name. Model year and maximum price are optional. The year refers to the product's original release or edition.
- Tap an example to fill in its name and year. Click **Search** to reveal results.
- Sony and Canon use labeled simulated prices. For Charizard, choose PSA 9 and a maximum price of $500 to see five archived eBay listings. Open **Why this price?** on the $350 listing to see the $460 median from five other listings.
- Search for a product outside the demo catalog to see the **Search eBay** link.

Prices exclude shipping and tax. [Archived card data and limitations](data/demo/HANDOFF.txt).

Model years come from the [Sony WH-1000XM5 announcement](https://www.sony.co.uk/presscentre/sony-re-writes-the-rules-with-their-newest-industry-leading-noise-cancelling-headphones-introducing-the-wh-1000xm5), the [Canon EOS R50 announcement](https://www.usa.canon.com/newsroom/2023/20230207-camera), and the [Pokémon Scarlet & Violet 151 release](https://www.pokemon.com/us/pokemon-tcg/scarlet-violet-151).

## Explanation API

By default, **Why this price?** shows a local calculation. To connect a server, set the `collectwatch-explain-endpoint` meta tag in `index.html` to a same-origin path such as `/api/explain`.

When a visitor opens an explanation, the browser sends a JSON POST with `title`, optional `variant`, `price_cents`, `comparable_prices_cents`, `median_cents` (or `null`), and `source` (`sample` or `snapshot`). Return an English response in the form `{"explanation":"Your explanation here."}`. If the request fails, the local calculation stays visible. Keep any provider key on the server.
