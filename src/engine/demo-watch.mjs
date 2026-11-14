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
function validateListing(listing, synthetic = false) {
  if (!plain(listing) || typeof listing.id !== 'string' || !listing.id || !PRODUCTS.has(listing.product_id) || !money(listing.price_cents) || listing.currency !== 'USD' || listing.buying_option !== 'FIXED_PRICE') invalid();
  if (listing.model_year != null && (!Number.isInteger(listing.model_year) || listing.model_year < 1000 || listing.model_year > 9999)) invalid();
  if (listing.item_location_country_code != null && !['US','JP','KR'].includes(listing.item_location_country_code)) invalid();
  attributes(listing.attributes);
  if (synthetic && (listing.synthetic !== true || listing.data_mode !== 'simulation' || listing.live_verified !== false || listing.url !== null || !listing.id.startsWith('demo-watch-'))) invalid();
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

/** Caller supplies FINAL validated AI + manual filters. Unsupported keys reject, never silently disappear.
 * getSnapshot() returns immediate matches. start() schedules ONE demo arrival batch after 10 seconds.
 * stop() cancels it. A completed instance cannot replay; create a new instance to explicitly reset.
 * scheduler injection is for deterministic testing; browser or Node timers work by default.
 */
export function createDemoWatch({effectiveRule, initialListings = [], incomingListings, onEvent = () => {},
  delayMs = 10000, scheduler = {setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id)}}) {
  validateRule(effectiveRule);
  if (!Array.isArray(initialListings) || !Array.isArray(incomingListings) || !incomingListings.length || typeof onEvent !== 'function' || !Number.isSafeInteger(delayMs) || delayMs < 1 || delayMs > 60000 || typeof scheduler?.setTimeout !== 'function' || typeof scheduler?.clearTimeout !== 'function') invalid();
  initialListings.forEach(item => validateListing(item));
  incomingListings.forEach(item => validateListing(item, true));
  const rule = structuredClone(effectiveRule), initial = structuredClone(initialListings), incoming = structuredClone(incomingListings);
  if (new Set(initial.map(x => x.id)).size !== initial.length) invalid();
  let status = 'idle', timer = null, generation = 0;
  const seen = new Set(initial.map(x => x.id));
  const results = initial.filter(item => matches(item, rule));
  const notifications = [];
  const emit = event => onEvent(structuredClone({data_mode:'simulation', live_verified:false, ...event}));
  const getSnapshot = () => structuredClone({status, data_mode:'simulation', live_verified:false, effective_rule:rule, results, notifications});
  function start() {
    if (status === 'watching' || status === 'completed') return false;
    status = 'watching'; const run = ++generation;
    timer = scheduler.setTimeout(() => {
      if (status !== 'watching' || generation !== run) return;
      timer = null;
      // Update state before delivering events; callback failures cannot replay already-consumed arrivals.
      const events = [];
      for (const listing of incoming) {
        if (seen.has(listing.id)) continue;
        seen.add(listing.id);
        const matched = matches(listing, rule);
        events.push({type:'listing_arrived', listing, matched});
        if (matched) {
          results.push(listing);
          const notification = {id:`notification:${listing.id}`, listing_id:listing.id, product_id:listing.product_id,
            price_cents:listing.price_cents, currency:'USD', synthetic:true, data_mode:'simulation',
            title:'Demo: a new listing matches your saved search'};
          notifications.push(notification);
          events.push({type:'match_found', listing, notification});
        }
      }
      status = 'completed';
      events.push({type:'completed', new_match_count:notifications.length});
      for (const event of events) emit(event);
    }, delayMs);
    emit({type:'watching', delay_ms:delayMs});
    return true;
  }
  function stop() {
    if (status !== 'watching') return false;
    scheduler.clearTimeout(timer); timer = null; generation++; status = 'stopped';
    emit({type:'stopped'}); return true;
  }
  return Object.freeze({start, stop, getSnapshot});
}
