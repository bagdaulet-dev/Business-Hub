/** Offline, session-local simulation. No LLM, network, persistence or billing. */
const PRODUCTS = new Set(['charizard-ex-199-165-psa9', 'sony-wh1000xm5', 'canon-eos-r50']);
const ATTRIBUTES = new Set(['card_name','card_number','set_name','language','grader','grade','finish','condition','color','configuration']);
const norm = value => String(value).trim().replace(/\s+/g, ' ').toLowerCase();
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function invalid() { throw Object.assign(new Error('Invalid demo watch input'), {code:'INVALID_DEMO_WATCH_INPUT'}); }
function money(value) { return Number.isSafeInteger(value) && value >= 0; }
function attributes(value) {
  if (!plain(value)) invalid();
  for (const [key, item] of Object.entries(value)) {
    if (!ATTRIBUTES.has(key) || !(typeof item === 'string' && item.trim() || typeof item === 'number' && Number.isFinite(item))) invalid();
  }
}
function validateRule(rule) {
  if (!plain(rule) || Object.keys(rule).some(k => !['product_id','max_price_cents','model_year','item_location_countries','attributes'].includes(k)) || !PRODUCTS.has(rule.product_id)) invalid();
  if (rule.max_price_cents != null && !money(rule.max_price_cents)) invalid();
  if (rule.model_year != null && (!Number.isInteger(rule.model_year) || rule.model_year < 1000 || rule.model_year > 9999)) invalid();
  if (rule.item_location_countries !== undefined && (!Array.isArray(rule.item_location_countries) || rule.item_location_countries.some(c => !['US','JP','KR'].includes(c)))) invalid();
  if (rule.attributes !== undefined) attributes(rule.attributes);
}
function validateListing(listing, staged = false) {
  if (!plain(listing) || typeof listing.id !== 'string' || !listing.id || !PRODUCTS.has(listing.product_id) || !money(listing.price_cents) || listing.currency !== 'USD' || listing.buying_option !== 'FIXED_PRICE') invalid();
  if (listing.model_year != null && (!Number.isInteger(listing.model_year) || listing.model_year < 1000 || listing.model_year > 9999)) invalid();
  if (listing.item_location_country_code != null && !['US','JP','KR'].includes(listing.item_location_country_code)) invalid();
  attributes(listing.attributes);
  if (listing.arrival_after_ms !== undefined && (!Number.isSafeInteger(listing.arrival_after_ms) || listing.arrival_after_ms < 1 || listing.arrival_after_ms > 60000)) invalid();
  if (staged) {
    if (listing.synthetic !== false || listing.data_mode !== 'historical_observations' || listing.arrival_mode !== 'staged' || listing.live_verified !== false || listing.id !== listing.item_id || !/^\d+$/.test(listing.id)) invalid();
    let url; try { url = new URL(listing.url); } catch { invalid(); }
    if (url.protocol !== 'https:' || url.hostname !== 'www.ebay.com' || url.username || url.password ||
      !(url.pathname === '/itm/' + listing.id || url.pathname.startsWith('/p/') && url.searchParams.get('iid') === listing.id)) invalid();
  }
}
function matches(listing, rule) {
  return listing.product_id === rule.product_id
    && (rule.max_price_cents == null || listing.price_cents <= rule.max_price_cents)
    && (rule.model_year == null || listing.model_year === rule.model_year)
    && (!rule.item_location_countries?.length || rule.item_location_countries.includes(listing.item_location_country_code))
    && Object.entries(rule.attributes ?? {}).every(([key,value]) => listing.attributes[key] != null && norm(listing.attributes[key]) === norm(value));
}
export function matchesWatchRule(listing, effectiveRule) {
  validateRule(effectiveRule); validateListing(listing);
  return matches(listing, effectiveRule);
}

/** Caller supplies FINAL validated AI + manual filters. Unsupported keys reject.
 * arrival_after_ms is an absolute offset in ACTIVE watch time, not wall-clock time.
 * Missing offsets use delayMs (legacy simultaneous batch). Stop pauses elapsed time;
 * start resumes only pending arrivals. Completed watches cannot replay.
 * scheduler.now() is optional for deterministic tests; defaults to Date.now().
 */
export function createDemoWatch({effectiveRule, initialListings = [], incomingListings, onEvent = () => {},
  delayMs = 10000, scheduler = {setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id)}}) {
  validateRule(effectiveRule);
  if (!Array.isArray(initialListings) || !Array.isArray(incomingListings) || !incomingListings.length || typeof onEvent !== 'function' || !Number.isSafeInteger(delayMs) || delayMs < 1 || delayMs > 60000 || typeof scheduler?.setTimeout !== 'function' || typeof scheduler?.clearTimeout !== 'function' || scheduler.now !== undefined && typeof scheduler.now !== 'function') invalid();
  initialListings.forEach(item => validateListing(item));
  incomingListings.forEach(item => validateListing(item, true));
  const rule = structuredClone(effectiveRule), initial = structuredClone(initialListings), incoming = structuredClone(incomingListings);
  if (new Set(initial.map(x => x.id)).size !== initial.length) invalid();
  const queue = incoming.map((listing,index) => ({listing,index,at:listing.arrival_after_ms ?? delayMs}))
    .sort((a,b) => a.at-b.at || a.index-b.index);
  const now = () => scheduler.now ? scheduler.now() : Date.now();
  const byPrice = (a,b) => a.price_cents-b.price_cents || (a.id<b.id?-1:a.id>b.id?1:0);
  let status = 'idle', timer = null, generation = 0, timerTicket = 0, nextIndex = 0;
  let activeElapsed = 0, startedAt = null;
  const seen = new Set(initial.map(x => x.id));
  const results = initial.filter(item => matches(item, rule)).sort(byPrice);
  const notifications = [];
  const elapsed = () => activeElapsed + (status === 'watching' ? Math.max(0,now()-startedAt) : 0);
  const emit = event => onEvent(structuredClone({data_mode:'simulation', live_verified:false, ...event}));
  const getSnapshot = () => structuredClone({status, data_mode:'simulation', live_verified:false, effective_rule:rule,
    results, notifications, pending_count:queue.length-nextIndex});

  function scheduleNext(run) {
    const dueAt = queue[nextIndex].at;
    const wait = Math.max(0,dueAt-elapsed());
    const ticket = ++timerTicket;
    timer = scheduler.setTimeout(() => {
      if (status !== 'watching' || generation !== run || timerTicket !== ticket) return;
      timer = null;timerTicket++;
      // At least this scheduled deadline has elapsed. This also supports manual timer
      // callbacks in legacy deterministic tests whose scheduler has no fake clock.
      activeElapsed = Math.max(elapsed(),dueAt);startedAt = now();
      const events = [];
      while (nextIndex < queue.length && queue[nextIndex].at <= activeElapsed) {
        const {listing} = queue[nextIndex++];
        if (seen.has(listing.id)) continue;
        seen.add(listing.id);
        const matched = matches(listing, rule);
        events.push({type:'listing_arrived', listing, matched});
        if (matched) {
          results.push(listing);
          const notification = {id:`notification:${listing.id}`, listing_id:listing.id, product_id:listing.product_id,
            price_cents:listing.price_cents, currency:'USD', synthetic:false, data_mode:'historical_observations', arrival_mode:'staged',
            title:'A listing matches your saved search'};
          notifications.push(notification);
          events.push({type:'match_found', listing, notification});
        }
      }
      results.sort(byPrice);
      if (nextIndex === queue.length) {
        status = 'completed';startedAt = null;
        events.push({type:'completed', new_match_count:notifications.length});
      } else {
        // Schedule before user callbacks, so stop() from a callback cancels the next arrival.
        scheduleNext(run);
      }
      for (const event of events) emit(event);
    }, wait);
    return wait;
  }
  function start() {
    if (status === 'watching' || status === 'completed') return false;
    startedAt = now();status = 'watching';const run = ++generation;
    const wait = scheduleNext(run);
    emit({type:'watching', delay_ms:wait, pending_count:queue.length-nextIndex});
    return true;
  }
  function stop() {
    if (status !== 'watching') return false;
    activeElapsed = elapsed();
    scheduler.clearTimeout(timer);timer = null;generation++;timerTicket++;status = 'stopped';startedAt = null;
    emit({type:'stopped'});return true;
  }
  return Object.freeze({start, stop, getSnapshot});
}
