import {createWatchUi} from './watch-ui.mjs';

const form = document.querySelector('#hunt');
const query = form.elements.query;
const year = form.elements.year;
const budget = form.elements.budget;
const panel = document.querySelector('#filters');
const filterToggle = document.querySelector('#filter-toggle');
const filterCount = document.querySelector('#filter-count');
const filterTags = document.querySelector('#active-filters');
const locationMode = document.querySelector('#location-mode');
const locations = [...form.querySelectorAll('[name="countries"]')];
const countryNames = { US: 'United States', JP: 'Japan', KR: 'South Korea' };
const resultSection = document.querySelector('#results');
const status = document.querySelector('#status');
const parsed = document.querySelector('#parsed-rule');
const findings = document.querySelector('#findings');
const submit = document.querySelector('#search');
const watchUi = createWatchUi(document.querySelector('#watch-panel'));

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const money = cents => usd.format(cents / 100).replace(/\.00$/, '');
let explicitAllCountries = false;
let activeSearch;

function setFiltersOpen(open) {
  panel.hidden = !open;
  filterToggle.setAttribute('aria-expanded', String(open));
}

function selectedCountries() {
  return locations.filter(input => input.checked).map(input => input.value);
}

function locationLabel(countries) {
  return countries.length ? countries.map(code => countryNames[code] ?? code).join(', ') : 'All countries';
}

function appendTag(target, label, origin) {
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = label;
  if (origin) {
    const source = document.createElement('small');
    source.textContent = origin;
    tag.append(' ', source);
  }
  target.append(tag);
}

function updateFilters() {
  filterTags.replaceChildren();
  const countries = selectedCountries();
  if (year.value) appendTag(filterTags, `Model year: ${year.value}`);
  if (budget.value) appendTag(filterTags, `Max price: $${budget.value}`);
  if (countries.length || explicitAllCountries) appendTag(filterTags, locationLabel(countries));
  const count = filterTags.childElementCount;
  filterTags.hidden = count === 0;
  filterCount.hidden = count === 0;
  filterCount.textContent = count;
  locationMode.textContent = countries.length || explicitAllCountries
    ? `${locationLabel(countries)} · Set in filters`
    : 'All countries by default.';
}

function clearFilters() {
  year.value = '';
  budget.value = '';
  for (const input of locations) input.checked = false;
  explicitAllCountries = false;
  budget.setCustomValidity('');
  updateFilters();
}

function clearResults() {
  watchUi.clear();
  const previous = activeSearch;
  activeSearch = undefined;
  previous?.abort();
  submit.disabled = false;
  resultSection.hidden = true;
  resultSection.removeAttribute('aria-busy');
  status.textContent = '';
  parsed.hidden = true;
  parsed.replaceChildren();
  findings.replaceChildren();
}

function getOverrides() {
  const overrides = {};
  if (year.value) overrides.model_year = Number(year.value);

  const price = budget.value.trim();
  if (price) {
    const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(price);
    if (!match) {
      setFiltersOpen(true);
      budget.setCustomValidity('Enter a USD price with up to two decimal places, such as 250 or 249.99.');
      budget.reportValidity();
      return null;
    }
    overrides.max_price_cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  }

  const countries = selectedCountries();
  if (countries.length || explicitAllCountries) overrides.item_location_countries = countries;
  return overrides;
}

function ebayLink(listing) {
  const link = document.createElement('a');
  link.className = 'external';
  link.href = new URL('/itm/' + encodeURIComponent(listing.item_id), 'https://www.ebay.com');
  link.textContent = 'View on eBay ↗';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function priceDetails({ listing, peers, benchmark, delta, percent }, countries) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Price comparison';
  const content = document.createElement('div');
  content.className = 'price-details';
  const text = document.createElement('p');
  if (benchmark == null) {
    text.textContent = 'Not enough comparable listings.';
    content.append(text);
  } else {
    const difference = delta === 0 ? 'The price matches the median.'
      : `Difference: ${money(Math.abs(delta))} (${percentFormat.format(Math.abs(percent))}%) ${delta > 0 ? 'lower' : 'higher'}.`;
    text.textContent = `Your price: ${money(listing.price_cents)}. Median of ${peers.length} other comparable saved listings: ${money(benchmark)}. ${difference}`;
    const basis = document.createElement('p');
    basis.textContent = `Item price only. Shipping, taxes, and duties are excluded.${countries?.length ? ` Locations: ${locationLabel(countries)}.` : ''}`;
    const bars = document.createElement('ul');
    bars.className = 'bars';
    const maxPrice = Math.max(1, listing.price_cents, ...peers.map(peer => peer.price_cents));
    for (const peer of [...peers, listing].sort((a,b) => a.price_cents - b.price_cents)) {
      const row = document.createElement('li');
      const current = peer === listing;
      row.classList.toggle('current', current);
      const price = document.createElement('span');
      price.textContent = money(peer.price_cents);
      const bar = document.createElement('span');
      bar.className = 'bar';
      bar.style.setProperty('--width', `${peer.price_cents / maxPrice * 100}%`);
      row.append(price, bar, current ? 'This listing' : ebayLink(peer));
      bars.append(row);
    }
    content.append(text, basis, bars);
  }
  details.append(summary, content);
  return details;
}

function renderResults(payload) {
  const { results, rule, effectiveRule = rule, modelYear, overrideSources = {} } = payload;
  const filters = { ...effectiveRule };
  if (filters.model_year == null && modelYear != null) filters.model_year = modelYear;
  const labels = {
    model: 'Model', card_name: 'Card', card_number: 'Card number', set_name: 'Set', language: 'Language',
    grader: 'Grading company', grade: 'Grade', finish: 'Finish', condition: 'Condition', color: 'Color',
    configuration: 'Configuration', max_price_cents: 'Max price', model_year: 'Model year',
    min_discount_pct: 'Minimum discount', item_location_countries: 'Item location'
  };
  for (const [key, label] of Object.entries(labels)) {
    const value = filters[key];
    if (value == null) continue;
    const shown = key === 'max_price_cents' ? money(value) : key === 'item_location_countries' ? locationLabel(value)
      : key === 'min_discount_pct' ? `${value}%` : value;
    appendTag(parsed, `${label}: ${shown}`, overrideSources[key] === 'manual' ? 'Set in filters' : '');
  }
  parsed.hidden = !parsed.childElementCount;
  status.textContent = `${results.length} ${results.length === 1 ? 'match' : 'matches'} in saved listings`;
  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No saved listings match. Try a different model, location, year, or budget.';
    findings.append(empty);
    return;
  }

  results.forEach((finding, index) => {
    const { listing, percent } = finding;
    const row = document.createElement('article');
    row.className = index === 0 ? 'listing featured' : 'listing';
    row.style.setProperty('--delay', `${Math.min(index, 8) * 48}ms`);
    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = listing.title;
    const meta = document.createElement('p');
    meta.textContent = 'Archived eBay listing · Availability unverified';
    const location = document.createElement('p');
    location.className = 'variant';
    location.textContent = [listing.model_year, listing.item_location_text ?? 'Location unknown'].filter(Boolean).join(' · ');
    const price = document.createElement('strong');
    price.className = 'price';
    price.textContent = money(listing.price_cents);
    const comparison = document.createElement('span');
    comparison.className = percent > 0 ? 'comparison favorable' : 'comparison';
    comparison.textContent = percent == null ? 'Not enough comparable listings'
      : percent === 0 ? 'At the saved median'
      : `${percentFormat.format(Math.abs(percent))}% ${percent > 0 ? 'below' : 'above'} the saved median`;
    info.append(meta, title, location, price, comparison);
    row.append(info, ebayLink(listing), priceDetails(finding, filters.item_location_countries));
    findings.append(row);
  });
}

const errors = {
  INVALID_MODEL_YEAR: 'Enter a four-digit model year.',
  INVALID_OVERRIDES: 'Check the year, price, or item location and try again.',
  UNSUPPORTED_QUERY: 'This search condition is not supported. Edit your description and try again.',
  UNSUPPORTED_PRODUCT: 'This product is not in the saved demo catalog. Try one of the examples.',
  QUERY_NEEDS_CARD: 'Name a supported product or card, or try one of the examples.',
  PROVIDER_NOT_CONFIGURED: 'AI search is unavailable on this server.',
  TOO_MANY_REQUESTS: 'The demo request limit was reached. Try again later.',
  PROVIDER_TIMEOUT: 'AI search timed out. Try again.'
};

function showError(message) {
  status.textContent = message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'secondary';
  retry.textContent = 'Retry search';
  retry.addEventListener('click', () => form.requestSubmit(submit));
  findings.replaceChildren(retry);
}

async function search(text, overrides) {
  const controller = new AbortController();
  activeSearch = controller;
  const timer = setTimeout(() => controller.abort(), 25000);
  submit.disabled = true;
  resultSection.hidden = false;
  resultSection.setAttribute('aria-busy', 'true');
  status.textContent = 'Comparing saved listings…';
  const heading = document.querySelector('#results-title');
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });

  try {
    const response = await fetch('./api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.keys(overrides).length ? { text, overrides } : { text }),
      signal: controller.signal
    });
    const payload = await response.json();
    if (activeSearch !== controller) return;
    if (!response.ok) {
      showError(errors[payload.error?.code] ?? 'Search could not finish. Try again.');
      return;
    }
    if (!Array.isArray(payload.results) || !payload.rule) throw new Error('Invalid search response');
    renderResults(payload);
    watchUi.offer(payload);
  } catch {
    if (activeSearch === controller) {
      showError(controller.signal.aborted ? 'AI search timed out. Try again.' : 'Search could not finish. Try again.');
    }
  } finally {
    clearTimeout(timer);
    if (activeSearch === controller) {
      activeSearch = undefined;
      resultSection.removeAttribute('aria-busy');
      submit.disabled = false;
    }
  }
}

filterToggle.addEventListener('click', () => setFiltersOpen(panel.hidden));
form.addEventListener('invalid', event => {
  if (panel.contains(event.target)) setFiltersOpen(true);
}, true);
form.addEventListener('input', event => {
  if (event.target === query || event.target === budget) event.target.setCustomValidity('');
  if (event.target.name === 'countries') explicitAllCountries = false;
  if (!resultSection.hidden) clearResults();
  updateFilters();
});
panel.addEventListener('click', event => {
  const field = event.target.closest('[data-clear]')?.dataset.clear;
  if (field) {
    const input = form.elements[field];
    input.value = '';
    input.setCustomValidity('');
    input.focus();
  } else if (event.target.id === 'all-countries' || event.target.id === 'clear-location') {
    for (const input of locations) input.checked = false;
    explicitAllCountries = event.target.id === 'all-countries';
  } else if (event.target.id === 'clear-filters') {
    clearFilters();
  } else {
    return;
  }
  clearResults();
  updateFilters();
});

document.querySelector('.examples').addEventListener('click', event => {
  const example = event.target.closest('[data-query]');
  if (!example) return;
  clearFilters();
  clearResults();
  query.value = example.dataset.query;
  query.setCustomValidity('');
  query.focus({ preventScroll: true });
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (activeSearch) return;
  const text = query.value.trim();
  if (!text) {
    query.setCustomValidity('Describe the product you want.');
    query.reportValidity();
    return;
  }
  const overrides = getOverrides();
  if (!overrides) return;
  clearResults();
  void search(text, overrides);
});

document.querySelector('#reset').addEventListener('click', () => {
  query.value = '';
  query.setCustomValidity('');
  clearFilters();
  clearResults();
  setFiltersOpen(false);
  query.focus();
});

const motion = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
const scene = document.querySelector('.display');
const root = document.documentElement;
let frame;
function moveLight(event) {
  if (!motion.matches) return;
  const { clientX, clientY } = event;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const rect = scene.getBoundingClientRect();
    root.style.setProperty('--pointer-x', `${clientX}px`);
    root.style.setProperty('--pointer-y', `${clientY}px`);
    const x = Math.max(-.5, Math.min(.5, (clientX - rect.left) / rect.width - .5));
    const y = Math.max(-.5, Math.min(.5, (clientY - rect.top) / rect.height - .5));
    scene.style.setProperty('--tilt-x', `${-y * 22}deg`);
    scene.style.setProperty('--tilt-y', `${x * 26}deg`);
  });
}
window.addEventListener('pointermove', moveLight, { passive: true });
document.documentElement.addEventListener('pointerleave', () => {
  cancelAnimationFrame(frame);
  root.style.removeProperty('--pointer-x');
  root.style.removeProperty('--pointer-y');
  scene.style.removeProperty('--tilt-x');
  scene.style.removeProperty('--tilt-y');
});
