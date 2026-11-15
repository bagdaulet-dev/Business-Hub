# Watchlist integration — current state

Connected in app.mjs/watch-ui.mjs. Local HTTP search returns watchRule (final AI conditions after manual overrides) and watchArrivals (real unchanged source records). The UI keeps a page-local createDemoWatch instance, starts the scheduled timers, shows a matching arrival with original eBay link, and offers Stop/Resume before completion. There is no Replay action after completion. Watching remains active between arrivals; Stop pauses and Resume preserves remaining active time. Incoming cards are sorted by price, lower first.

Data: data/demo/watch-scenarios.json. All incoming rows are synthetic:false,data_mode:historical_observations,arrival_mode:staged,live_verified:false. Prices are Charizard37500 at10000ms and36000 at15000ms, Sony18400 andCanon64995 at10000ms. listing.arrival_after_ms defines the active-time schedule. Charizard168684845072 is sourced separately; old900054604971 excluded from activecatalog. Originals remain archived. No source prices are fabricated or adjusted to match budgets.

Server loads the complete eligible historical catalog, then removes staged IDs before searchCatalog. Thus withheld listings cannot leak into initial results or comparison peers. Initial feed is independent of the user's budget: high-budget searches show remaining listings immediately; the staged one still arrives only after Watch. Country/year/attributes still apply to arrivals; a mismatching arrival produces no notification.

The module validates real numeric item IDs and original https www.ebay.com item URLs, fixed buying option, currencies and amounts. It copies saved conditions, deduplicates IDs, cancels stale timer generations and never calls the network/model. Its event data_mode:simulation describes timing; listing data_mode preserves real historical provenance. Only footer describes staging to users; the main flow uses short product language without claiming live monitoring.

Unsupported min_discount_pct constraints do not silently disappear: watchRule is null and watching is unavailable for those conditions. All three model searches support manual price/year/country overrides. The page does not persist watches across reloads or perform external notifications/billing.

Commands: node src/engine/demo-watch-cli.mjs (default38000cents), node --test tests/engine/demo-watch.test.mjs. Full integration commands in README. No deployment done.
