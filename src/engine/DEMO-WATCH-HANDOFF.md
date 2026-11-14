# Демонаблюдение: передача bagdaulet-dev

Реализована только независимая логика: demo-watch.mjs, CLI demo-watch-cli.mjs, fixtures data/demo/watch-scenarios.json, tests/engine/demo-watch.test.mjs. HTTP endpoints, кнопка и уведомление на сайте ещё НЕ подключены. Не считать текущий localhost готовым UI этой функции.

## Сценарий пользователя

1. Один Search → Kimi разбирает запрос → ручные фильтры переопределяют AI → итоговые условия сохраняются как immutable snapshot.
2. Подходящие сохранённые объявления показываются сразу. Если их нет: «No matching listings yet. Watch this search to receive a demo alert».
3. Кнопка «Watch this search» доступна и при наличии результатов. При активации явно показать «Demo watch — a simulated listing arrives in 10 seconds». Название не должно выдавать симуляцию за работающий мониторинг eBay.
4. Через10сек приходит фиксированный синтетический лот. Если соответствует ВСЕМ сохранённым условиям: добавить карточку «Simulated listing» и уведомление «Demo: a new listing matches your saved search». Реальной ссылки Buy/View on eBay у него НЕТ.
5. Если он не подходит — уведомления о совпадении нет. После завершения объяснить «Simulation finished: no new listings matched your saved filters». Не менять цену/страну/grade ради успешного показа.
6. Watch можно остановить. Для нового запроса создавать новое наблюдение; изменения поисковой формы не должны тайно менять уже сохранённые условия. Можно показать «Watching: …» отдельно от редактируемого текста.
7. «Run demo again» явно создаёт новый экземпляр; повторные нажатия Start в одном экземпляре не дублируют таймер/уведомление. При уходе со страницы остановить локальный экземпляр/освободить ресурсы.

Это однократная имитация прихода объявления после одного условного цикла наблюдения. Нет живого опроса eBay раз в минуту, оплаты, аккаунтов, сохранения между перезагрузками, внешних push/Telegram/email. Закрытая вкладка/перезапуск процесса не поддерживают наблюдение. Browser timers могут задерживаться в фоне;10сек — запрошенная задержка, не SLA. Уведомление для текущего демо — внутри страницы.

## API модуля

```js
import {createDemoWatch} from './demo-watch.mjs';
const watch = createDemoWatch({
  effectiveRule: {
    product_id: 'charizard-ex-199-165-psa9',
    max_price_cents: 30000,
    model_year: 2023,
    item_location_countries: [], // all; apply overrides BEFORE constructing
    attributes: {card_name:'Charizard ex', card_number:'199/165', language:'English', grader:'PSA', grade:9}
  },
  initialListings, // normalized historical records, see below
  incomingListings: [scenario.listing], // from server-owned demo scenarios
  onEvent(event) { /* watching / listing_arrived / match_found / completed / stopped */ }
});
const initial = watch.getSnapshot(); // matching initial results, no new alerts
watch.start(); // exactly one batch after default10000ms
watch.stop(); // cancellation; call before new query/disposal
```

getSnapshot returns status idle/watching/stopped/completed, effective_rule, results, notifications, data_mode:simulation, live_verified:false. results retain individual historical/synthetic provenance. start returns false if already watching/completed. Restart after stop is possible; completed requires explicit new instance. No environment/API key read, model call or network request occurs.

Normalized listing required fields: id, product_id, price_cents (integer USD cents), currency:'USD', buying_option:'FIXED_PRICE', attributes object. Optional model_year and item_location_country_code (US/JP/KR in this demo; null unknown). New arrivals additionally require id beginning demo-watch-, synthetic:true, data_mode:'simulation', live_verified:false,url:null. Initial rows must be already selected as display-eligible: exclude known out-of-stock and unconfirmed buying options using data handoff. The module is not a general source-quality classifier.

product_id supported: charizard-ex-199-165-psa9, sony-wh1000xm5, canon-eos-r50. Attribute whitelist: card_name/card_number/set_name/language/grader/grade/finish/condition/color/configuration. Synthetic Sony configuration='headphones', Canon='body_only'. Normalize real Sony description strings into headphones, don't compare their full prose configuration to the canonical value. Preserve original raw evidence separately. Never hardcode arbitrary card queries to the one supported product.

Missing/null budget or year means no constraint; budget0 means0. Missing/empty country array means all; final country override resolution happens before calling the module. Unknown country fails a nonempty country filter. Countries combine with OR, other filters with AND. Unknown rule keys (including min_discount_pct) reject INVALID_DEMO_WATCH_INPUT: the module does not yet implement discount-threshold monitoring. Do not silently drop an unsupported user condition. No price median is computed by this module and synthetic arrivals must never be inserted into persisted real baseline fixtures. UI can show budget match without claiming a market discount.

initial results do not generate alerts. New IDs are deduplicated per watch; repeated delivery does not alert twice. Event objects, supplied rule and datasets are cloned to avoid mutable state changing saved conditions. Only a scalar event.notification is suitable for a toast; never render raw titles as HTML.

## Integration ownership

bagdaulet-dev owns UI and HTTP/server adapter. Choose one timer owner per watch, not separate UI+server timers. Existing server static whitelist/build do not automatically expose src/engine or the new JSON; explicitly adapt the build or server route. Do NOT assume fetch of src/engine/demo-watch.mjs is already supported. Keep secret-bearing provider code server-only. If watches are held server-side, isolate by session, bound their count/lifetime, cancel on cleanup; no promise of serverless/background durability. No deployment is required now.

aibarC owns engine and data. The current Kimi parser still uses a card-only schema; this module is ready for final normalized rules but does not make the multi-category parser implemented. Before connecting Sony/Canon natural-language watches, finish the previously agreed parser/overrides contract. For UI development use explicit example effectiveRules, clearly marked as fixtures.

## Checks and demo

- node --test tests/engine/demo-watch.test.mjs (9 tests)
- node src/engine/demo-watch-cli.mjs → no initial results at$300, simulated$280 match around10sec.
- node src/engine/demo-watch-cli.mjs 40000 → existing$350/$400 immediately, then$280.
- node src/engine/demo-watch-cli.mjs 25000 → no initial results, no match notification after arrival.

Other fixed synthetic examples: Sony$180, Canon$600. They remain fictional examples and are never represented as sourced eBay observations. Prices do not adapt to user's budget. CountryUS means JP-only searches correctly produce no alert in these three scenarios.

Verified: real timer at10,004ms delivered one$280 notification after empty initial result. Earlier existing suite plus8 new tests:56passed; auction rejection subsequently added and all9 watch tests passed. No live model/eBay calls were needed.
