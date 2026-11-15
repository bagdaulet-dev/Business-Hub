<div align="center">

# CollectWatch
### The exact card. A fairer price.

Find matching offers. Understand the trade-offs. Choose with evidence.

**Business Cup 2.0 · Money track · AI-assisted shopping**

[Open the demo](https://collectwatch-business-cup.vercel.app/) · [Explore the economics](#business-model-and-unit-economics) · [Meet the team](#team)

</div>

## Contents

1. [Investment thesis](#investment-thesis)
2. [Market and first customer](#market-and-first-customer)
3. [The problem, measured](#the-problem-measured)
4. [Product and AI](#product-and-ai)
5. [Competition and positioning](#competition-and-positioning)
6. [Business model and unit economics](#business-model-and-unit-economics)
7. [Scale opportunity](#scale-opportunity)
8. [Go-to-market and validation](#go-to-market-and-validation)
9. [Engineering and delivery](#engineering-and-delivery)
10. [Team](#team)
11. [Sources and methodology](#sources-and-methodology)
12. [Run locally](#run-locally)

## Investment thesis

**CollectWatch turns a specific buying intention into a shortlist with an explainable choice.** We start with repeat buyers of graded Pokémon cards in the United States: shoppers for whom edition, language, grading and price all matter. Electronics examples demonstrate how the same workflow can extend to other products.

| Signal | Evidence | Product decision |
|---|---|---|
| Adults already buy Pokémon cards | **19%** reported buying cards for themselves in the preceding six months in Circana’s March 2025 survey [1] | Start with an existing collecting behavior |
| Matching offers can have materially different asking prices | **$400 vs. $480** median of four other saved comparable offers | Show the comparison and its source listings |
| A new offer can change the best choice | Sony example: **two $199 offers → a $184 offer** | Re-evaluate the visible shortlist after a Watchlist match |
| Collectors already have paid research tools | Card Ladder Pro lists **$20/month** on monthly billing [3] | Test an **$18/month** purchase-decision subscription |

Our core loop is **describe → match → compare → watch → choose**. The next commercial milestone is demonstrating that collectors return for their next purchase and renew their subscription.

## Market and first customer

Circana reports that **19% of adults bought Pokémon trading cards for themselves in the previous six months**, and only one-quarter of those buyers played the game. Its release describes collecting, display and resale motivations. This supports a buyer-focused product beyond gameplay. [1]

The pitch’s **approximately 51 million U.S. buyers** is a population extrapolation: `19% × approximately 270 million adults ≈ 51 million`. Census population estimates provide the population context. This is a broad demand indicator, not a count of graded-card buyers or paying software customers. [1][2]

| Market layer | Definition | How we use it |
|---|---|---|
| Broad audience | U.S. adults purchasing Pokémon cards for themselves | Evidence of category demand |
| Initial serviceable segment | Repeat buyers of graded Pokémon cards using eBay | Focus for recruitment and product development |
| First customer profile | Collector seeking an exact card, language and grade within a budget; initial outreach targets ages 25–45 | A targeting hypothesis to test in interviews and acquisition cohorts |
| Expansion | Other collectibles and products with comparable variants and fragmented offers | Sony and Canon illustrate workflow portability |

We will size the initial serviceable segment from measured shopping frequency, marketplace use and willingness to pay, rather than treating the broad population estimate as a subscription market.

## The problem, measured

A matching name is not enough. A buyer must check edition, language, grade, condition and configuration before comparing prices. CollectWatch makes those constraints explicit and exposes the evidence behind the comparison.

### A concrete $80 price gap

For **Charizard ex 199/165 · English · PSA 9**, our saved source observations include:

| eBay listing | Historical asking price | Role in this comparison |
|---|---:|---|
| [318895173729](https://www.ebay.com/itm/318895173729) | $400.00 | Candidate |
| [377243146406](https://www.ebay.com/itm/377243146406) | $459.99 | Comparable |
| [127961223460](https://www.ebay.com/itm/127961223460) | $460.00 | Comparable |
| [307004951111](https://www.ebay.com/itm/307004951111) | $500.00 | Comparable |
| [137285300555](https://www.ebay.com/itm/137285300555) | $600.00 | Comparable |

**Peer median:** `($460 + $500) / 2 = $480`

**Price difference:** `$480 − $400 = $80`

**Relative difference:** `$80 / $480 = 16.7%`

This is a reproducible comparison of archived asking prices, not completed-sale values or a promised saving. Shipping, taxes and present availability are outside this calculation. Source records and evidence levels are preserved in [the dataset](data/demo/charizard-psa9-source-observations.json).

## Product and AI

| Capability | What the buyer gets |
|---|---|
| **AI Search** | Natural-language requests converted into structured product and budget constraints |
| **Exact filters** | Explicit price, model-year and multiple-country choices that override AI interpretation |
| **Price comparison** | Comparable listings, their median and the candidate’s price difference |
| **Watchlist** | A saved search within the session, matching arrivals and sequential in-page notifications |
| **Help me choose** | A reasoned best fit, nearest alternative and concrete checks before purchase |
| **Source links** | Direct access to the original eBay listing |

**Kimi interprets and explains; deterministic code matches and calculates.** Recommendations use the current visible listings and trusted server-side facts. The model cannot introduce an unrelated listing ID as the recommended purchase.

In the Sony example, two matching **$199** offers can produce **“No clear winner.”** After a **$184** match arrives, **Update recommendation** includes all three offers and explains the new choice. The model also identifies missing purchase information such as shipping, warranty and regional version.

The current presentation uses saved real eBay records and staged arrivals. It demonstrates the complete interaction while keeping the original listing identities and prices intact. See [arrival scenarios](data/demo/watch-scenarios.json).

## Competition and positioning

We compete for the buyer’s decision workflow. The audience descriptions below describe the use cases advertised by each product, not independently measured user demographics.

| Alternative | Advertised audience / job | Published offer | CollectWatch positioning |
|---|---|---|---|
| **Card Ladder** | Card collectors researching values, sales and market trends | Free tier; Pro **$20/month or $200/year**; sales history and marketplace shopping [3] | Focus on selecting a specific matching offer with an explanation tied to the shopper’s constraints |
| **Collectr** | TCG collectors organizing portfolios and exploring pricing | Free tier; PRO adds scanning, extended price history and advanced filters; **$7.99/month or $59.99/year** on the reviewed page [4] | Focus on the next purchase decision and comparing the current shortlist |
| **eBay saved searches** | Marketplace buyers returning to a specific search | Saved searches with email alerts for matching new items or updates [5] | Combine structured intent, transparent peer comparison and an explicit recommendation in one workflow |
| **Manual research** | Buyers comparing tabs and checking each variant themselves | Time and attention | Make the comparison reusable and update it when the shortlist changes |

At **$18/month planned**, CollectWatch is **$2/month (10%) below Card Ladder Pro’s monthly price**. Card Ladder’s annual plan has a lower monthly equivalent; this comparison is specifically monthly-to-monthly. Our value proposition is the purchase workflow, not a claim to be the cheapest collector tool.

## Business model and unit economics

**Planned subscription: $18/month per paying customer.** At that price, an active subscription represents **$216 in annualized recurring revenue**. Payment conversion and renewal will validate the pricing decision.

The following financial model comes from the team’s Business Cup pitch. These are **planning scenarios**, not reported customer-cohort results. CAC, margin and paid duration are explicit model inputs.

| Metric | Base scenario | Upside scenario |
|---|---:|---:|
| Monthly revenue per subscriber | $18.00 | $18.00 |
| Gross margin | 85% | 88% |
| Direct service-cost allowance per subscriber/month | $2.70 | $2.16 |
| Expected paid lifetime | 10 months | 15 months |
| Gross-profit LTV | **$153.00** | **$237.60** |
| Customer acquisition cost (CAC) | $35.00 | $30.00 |
| LTV / CAC | **4.37×** | **7.92×** |
| CAC payback | **2.29 months** | **1.89 months** |

```text
Monthly gross profit = subscription price × gross margin
LTV = monthly gross profit × expected paid months
CAC = attributable acquisition spend / new paying customers
CAC payback = CAC / monthly gross profit
```

The cost allowance must cover model inference, hosting, data access, payment processing and other direct service costs. The next validation step is to measure those costs per active subscriber and replace planned CAC and lifetime with observed cohorts. Gross margin is not operating profit.

## Scale opportunity

Subscription revenue scales with **active paying subscribers**, rather than downloads or registered accounts.

| Active paying subscribers | Modeled ARR at $18/month |
|---:|---:|
| 1,000 | $216,000 |
| 10,000 | $2.16 million |
| 100,000 | $21.6 million |
| 465,000 | **$100.44 million** |

`$100 million / ($18 × 12) ≈ 462,963 active paying subscribers.` The pitch rounds the scale scenario to 465,000. These calculations assume the stated monthly price and exclude discounts; they describe the revenue requirement, not an acquisition forecast.

The pitch’s **1 million+ downloads** is a long-term distribution ambition across platforms. Our operating measures will be activation, paid conversion and renewal, because downloads alone do not establish recurring revenue.

## Go-to-market and validation

Start with one collecting community, validate repeat value, then expand to adjacent categories.

| Stage | Experiment | Decision metric |
|---|---|---|
| **Recruit** | Invite repeat graded-card buyers from collector communities and creator audiences | Qualified participants by channel; shopping frequency and current tools |
| **Activate** | Observe a shopper moving from a query to comparison and Help me choose | Completed search-to-decision journeys; listing click-through; time to a useful shortlist |
| **Convert** | Test the planned $18 subscription with eligible pilot participants | Paid conversion and attributable CAC, including creator fees and incentives |
| **Retain** | Follow buyers through a second purchase opportunity | Month-two paid renewal, returning Watchlist use and cancellation reasons |
| **Expand** | Test adjacent products using the same matching workflow | Repeatable demand and service cost per customer in each category |

The strongest early signal will be **renewal after the first useful match**. This distinguishes a recurring shopping assistant from a one-off lookup tool. Interviews, paid conversion and retention will be reported with dates, sample sizes and cohort definitions when collected.

## Engineering and delivery

The implementation includes three product examples, server-side Kimi integration, strict response validation, deterministic comparisons, manual overrides, queued notifications and recommendation refresh after arrivals.

**84 automated tests passed at commit `47efeac`, together with the static build.** This is engineering verification, not an AI accuracy percentage. Tests include configured-provider wiring, matching and arithmetic, API validation, timeouts and notification behavior. Browser scenarios cover filters, mobile layout and recommendation updates.

| Layer | Implementation |
|---|---|
| Client | HTML, CSS and JavaScript ES modules |
| Server | Node.js HTTP API; Vercel function entry points |
| AI | Kimi through Kazakhtelecom’s OpenAI-compatible gateway |
| Data | Source-linked eBay observations and explicit matching attributes |
| Verification | Node.js Test Runner and browser scenarios |

[Search API implementation](src/server/search-handler.mjs) · [Automated tests](tests)

## Team

| Team member | GitHub | Responsibility |
|---|---|---|
| **Айбар Серик / Aibar Serik** | [aibarC](https://github.com/aibarC) | Data, AI integration, product matching and price calculations |
| **Багдаулет Камалбаев / Bagdaulet Kamalbayev** | [bagdaulet-dev](https://github.com/bagdaulet-dev) | Interface, backend integration and deployment infrastructure |

## Sources and methodology

External pages checked on **15 November 2026**. Each numerical claim is attributed to a published source, a reproducible dataset calculation or the team’s financial model.

1. **[Circana — U.S. toy industry, early 2025](https://www.circana.com/post/toy-industry-us-sales-grow-in-early-2025-circana-reports):** March 2025 survey finding of 19% adult self-purchase and one-quarter playing the game. The release does not establish the size of our narrower graded-card segment.
2. **[U.S. Census Bureau — U.S. population estimates](https://www.census.gov/quickfacts/fact/table/US/PST045225):** population context for the pitch’s rounded adult-population base. The approximately 51 million figure is our extrapolation, not a separately measured buyer count.
3. **[Card Ladder — official pricing and features](https://www.cardladder.com/pricing):** $20 monthly / $200 annual Pro plan and product capabilities. No verified download-count claim is used.
4. **[Collectr — official PRO page](https://www.getcollectr.com/pro.html):** advertised collection-management features and monthly/annual pricing; offers and billing options can change.
5. **[eBay — saved searches](https://www.ebay.com/help/buying/search-tips/saved-searches?id=4051):** existing saved-search and email-alert workflow.
6. **[CollectWatch source observations](data/demo/charizard-psa9-source-observations.json) and [arrival scenarios](data/demo/watch-scenarios.json):** archived asking-price examples and listing links; not transaction-price or realized-savings research.
7. **Team pitch — CollectWatch Business Cup, $18 plan:** proposed pricing, Base/Upside financial inputs and long-term scale scenario. These inputs are kept separate from externally measured demand and actual customer performance.

## Run locally

Requires **Node.js 22**. Create a local `.env` from `.env.example` and supply your own API key. Credentials stay server-side and must never be committed.

```sh
node --env-file=.env server.mjs
```

Open [localhost:4173](http://127.0.0.1:4173). Use `PORT` to select another port.

```sh
node --test tests/engine/*.test.mjs tests/integration/*.test.mjs
node build-static.mjs
```
