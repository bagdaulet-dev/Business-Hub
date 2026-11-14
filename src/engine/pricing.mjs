/** Internal pure utilities, not the shared analyzeHunt contract. No I/O or API calls. */
export const IDENTITY_FIELDS = Object.freeze([
  'card_number', 'set_name', 'language', 'grader', 'grade', 'finish',
]);
const normalize = value => value == null ? '' : String(value).trim().replace(/\s+/g, ' ').toLowerCase();
// Relevance flags supplied by normalization, not a claim about seller authenticity.
// Unknown item_type is allowed; this utility does not infer product type from titles.
const excludedItemTypes = new Set(['accessory', 'replica', 'bundle', 'proxy', 'display case', 'empty slab']);

export function validateMoney(value, name = 'money', nullable = false) {
  if (nullable && value == null) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be non-negative safe integer cents${nullable ? ' or null' : ''}`);
  }
}

export function validateObservations(observations) {
  if (!Array.isArray(observations)) throw new TypeError('observations must be an array');
  const ids = new Set();
  for (const item of observations) {
    if (!item || typeof item.item_id !== 'string' || !item.item_id.trim()) throw new TypeError('item_id required');
    const id = item.item_id.trim();
    if (ids.has(id)) throw new TypeError(`duplicate item_id: ${id}`);
    ids.add(id);
    validateMoney(item.price_cents, `${id}.price_cents`);
    validateMoney(item.shipping_cents, `${id}.shipping_cents`, true);
    validateMoney(item.observed_shipping_cents, `${id}.observed_shipping_cents`, true);
    if (!normalize(item.currency)) throw new TypeError(`${id}.currency required`);
  }
}

/** Missing identity fields never count as an exact match. */
export function matchesExactAttributes(item, attributes) {
  return IDENTITY_FIELDS.every(field => normalize(item[field]) !== '' &&
    normalize(item[field]) === normalize(attributes[field]));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // Avoid overflowing a safe integer sum when the count is even.
  return sorted.length % 2 ? sorted[mid] : sorted[mid - 1] + (sorted[mid] - sorted[mid - 1]) / 2;
}

/**
 * Exact identity and currency define the comparison pool BEFORE budget filtering.
 * Delivered basis uses normalized shipping_cents only, never historical observed_shipping_cents.
 * All outputs describe historical asking-price observations, regardless of source status flags.
 */
export function evaluatePricing(observations, attributes, {
  basis = 'item_price', currency = 'USD', destinationZip = null,
  maxPriceCents = null, minComparables = 3, minDiscountPct = null,
} = {}) {
  validateObservations(observations);
  if (!attributes || IDENTITY_FIELDS.some(field => !normalize(attributes[field]))) {
    throw new TypeError('All exact identity fields are required');
  }
  if (!['item_price', 'delivered'].includes(basis)) throw new TypeError('Unknown comparison basis');
  if (!normalize(currency)) throw new TypeError('currency required');
  if (!Number.isSafeInteger(minComparables) || minComparables < 1) throw new TypeError('minComparables must be positive');
  validateMoney(maxPriceCents, 'maxPriceCents', true);
  if (minDiscountPct !== null && (typeof minDiscountPct !== 'number' ||
    !Number.isFinite(minDiscountPct) || minDiscountPct < 0 || minDiscountPct > 100)) {
    throw new TypeError('minDiscountPct must be a finite number from 0 to 100 or null');
  }
  const zip = normalize(destinationZip);
  if (basis === 'delivered' && !zip) throw new TypeError('delivered basis requires destinationZip');
  const exclusions = [];
  const pool = observations.filter(item => {
    let reason = null;
    if (normalize(item.buying_option) !== 'fixed_price') reason = 'not_fixed_price';
    else if (item.is_lot_or_bundle === true || excludedItemTypes.has(normalize(item.item_type))) reason = 'incompatible_item_type';
    else if (normalize(item.currency) !== normalize(currency)) reason = 'different_currency';
    else if (!matchesExactAttributes(item, attributes)) reason = 'identity_mismatch';
    if (reason) exclusions.push({ item_id: item.item_id, reason });
    return !reason;
  });
  const cost = item => {
    if (basis === 'item_price') return item.price_cents;
    if (item.shipping_cents == null || normalize(item.shipping_destination_zip) !== zip) return null;
    const total = item.price_cents + item.shipping_cents;
    if (!Number.isSafeInteger(total)) throw new RangeError('Delivered cost exceeds safe integer cents');
    return total;
  };
  const costs = new Map(pool.map(item => [item.item_id, cost(item)]));
  const findings = [];
  for (const item of pool) {
    const amount = costs.get(item.item_id);
    if (maxPriceCents != null && (amount == null || amount > maxPriceCents)) {
      exclusions.push({ item_id: item.item_id, reason: amount == null ? 'budget_unverifiable' : 'over_budget' });
      continue;
    }
    const comparables = pool.filter(other => other.item_id !== item.item_id && costs.get(other.item_id) != null);
    const reference = amount != null && comparables.length >= minComparables
      ? median(comparables.map(other => costs.get(other.item_id))) : null;
    const difference = reference == null ? null : reference - amount;
    const percent = reference != null && reference > 0 ? difference / reference * 100 : null;
    // Thresholds use the unrounded value; display rounding must not admit a failed rule.
    if (minDiscountPct !== null && (percent == null || percent < minDiscountPct)) {
      exclusions.push({item_id:item.item_id, reason:percent == null ? 'discount_unverifiable' : 'below_discount_threshold'});
      continue;
    }
    findings.push({
      item_id: item.item_id, price_cents: item.price_cents, comparison_basis: basis,
      comparison_cost_cents: amount,
      delivered_total_cents: item.shipping_cents != null && zip && normalize(item.shipping_destination_zip) === zip
        ? (() => { const total = item.price_cents + item.shipping_cents; if (!Number.isSafeInteger(total)) throw new RangeError('Delivered cost exceeds safe integer cents'); return total; })() : null,
      comparable_item_ids: comparables.map(other => other.item_id).sort(),
      comparable_count: comparables.length, reference_price_cents: reference,
      difference_cents: difference,
      below_sample_median_pct: percent == null ? null : Math.round(percent * 100) / 100,
      warnings: [
        ...(amount == null ? ['delivered_cost_unknown_for_destination'] : []),
        ...(comparables.length < minComparables ? ['insufficient_comparables'] : []),
        ...(reference === 0 ? ['zero_reference_percentage_undefined'] : []),
      ],
    });
  }
  findings.sort((a, b) => (a.comparison_cost_cents == null) - (b.comparison_cost_cents == null) ||
    (a.comparison_cost_cents ?? 0) - (b.comparison_cost_cents ?? 0) ||
    (a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0));
  return {
    data_mode: 'historical_observations', live_verified: false,
    comparison_basis: basis, currency: currency.trim().toUpperCase(),
    destination_zip: zip || null, matched_pool_count: pool.length,
    findings, exclusions,
    warnings: ['Historical asking prices; current availability and market value are not verified.',
      basis === 'item_price' ? 'Comparison excludes shipping and taxes.' : 'Comparison includes known shipping to the specified ZIP; taxes excluded.'],
  };
}
