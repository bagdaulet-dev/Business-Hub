import { matchesQuery, searchListings } from './search.mjs';
import { sampleProducts } from './data/demo/products.mjs';

const form = document.querySelector('#hunt');
const findings = document.querySelector('#findings');
const resultsSection = document.querySelector('#results');
const searchButton = document.querySelector('#search');
const status = document.querySelector('#status');
const reset = document.querySelector('#reset');
const query = document.querySelector('#query');
const year = document.querySelector('#year');
const grade = document.querySelector('#grade');
const gradeField = document.querySelector('#grade-field');
const explainEndpoint = document.querySelector('meta[name="collectwatch-explain-endpoint"]').content;
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const money = cents => usd.format(cents / 100).replace(/\.00$/, '');
let listings = [];

function ebayLink({ item_id, title, sample }) {
  const link = document.createElement('a');
  link.className = 'external';
  const url = new URL(sample ? '/sch/i.html' : '/itm/' + encodeURIComponent(item_id), 'https://www.ebay.com');
  if (sample) url.searchParams.set('_nkw', title);
  link.href = url.href;
  link.textContent = sample ? 'Search eBay ↗' : 'View on eBay ↗';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function explain({ listing, peers, benchmark, delta }) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Why this price?';
  const text = document.createElement('p');
  const comparison = delta === 0
    ? `This price matches the median of ${money(benchmark)}.`
    : `This price (${money(listing.price_cents)}) is ${money(Math.abs(delta))} ${delta > 0 ? 'below' : 'above'} the median of ${money(benchmark)}.`;
  text.textContent = benchmark === null
    ? 'A price comparison needs at least three other offers for the same model and configuration.'
    : `${comparison} The comparison uses ${peers.length} other offers for the same model and configuration, including offers above your budget. Prices exclude shipping and tax.`;
  const bars = document.createElement('ul');
  bars.className = 'bars';
  const maxPrice = Math.max(listing.price_cents, ...peers.map(peer => peer.price_cents));
  for (const peer of [...peers, listing].sort((a, b) => a.price_cents - b.price_cents)) {
    const row = document.createElement('li');
    const current = peer === listing;
    const label = document.createElement('span');
    label.textContent = money(peer.price_cents);
    const bar = document.createElement('span');
    bar.className = 'bar';
    bar.style.setProperty('--width', `${peer.price_cents / maxPrice * 100}%`);
    row.classList.toggle('current', current);
    const source = current ? document.createTextNode(listing.sample ? 'This example' : 'This listing')
      : listing.sample ? document.createTextNode('Sample') : ebayLink(peer);
    row.append(label, bar, source);
    bars.append(row);
  }
  details.append(summary, text, bars);
  if (explainEndpoint) addApiExplanation(details, { listing, peers, benchmark });
  return details;
}

function addApiExplanation(details, { listing, peers, benchmark }) {
  details.addEventListener('toggle', async function requestExplanation() {
    if (!details.open) return;
    details.removeEventListener('toggle', requestExplanation);
    const output = document.createElement('p');
    output.setAttribute('role', 'status');
    output.textContent = 'Loading an additional explanation…';
    details.insertBefore(output, details.querySelector('.bars'));
    try {
      const endpoint = new URL(explainEndpoint, location.href);
      if (endpoint.origin !== location.origin) throw new Error('Explanation endpoint must use the same origin');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: listing.title,
          variant: listing.variant,
          price_cents: listing.price_cents,
          comparable_prices_cents: peers.map(peer => peer.price_cents),
          median_cents: benchmark,
          source: listing.sample ? 'sample' : 'snapshot'
        }),
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error('Explanation unavailable');
      const { explanation } = await response.json();
      if (typeof explanation !== 'string' || !explanation.trim()) throw new Error('Invalid explanation');
      output.textContent = explanation;
    } catch {
      output.textContent = 'The additional explanation is unavailable. You can still see the price comparison above.';
    }
  });
}

function updateGrade() {
  const term = query.value.trim();
  const matches = term ? listings.filter(listing => matchesQuery(listing, term)) : [];
  const show = matches.length > 0 && matches.every(listing => listing.grader);
  gradeField.hidden = !show;
  grade.disabled = !show;
  if (!show) grade.value = '';
}

function render() {
  const filters = Object.fromEntries(new FormData(form));
  const results = searchListings(listings, filters);
  resultsSection.hidden = false;
  status.textContent = `${results.length} ${results.length === 1 ? 'match' : 'matches'} in the demo catalog`;
  findings.replaceChildren();

  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const message = document.createElement('p');
    message.textContent = 'No matches in the demo catalog. Try a different year, budget, or search term.';
    empty.append(message);
    const ebayQuery = [filters.query, filters.year, filters.grade].filter(Boolean).join(' ');
    empty.append(ebayLink({ title: ebayQuery, sample: true }));
    findings.append(empty);
    return;
  }

  results.forEach((finding, index) => {
    const { listing, percent } = finding;
    const row = document.createElement('article');
    row.className = index === 0 && filters.query.trim() ? 'listing featured' : 'listing';
    row.style.setProperty('--delay', `${index * 45}ms`);
    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = listing.title;
    const tag = document.createElement('p');
    tag.textContent = listing.sample ? 'Demo example · simulated price' : 'Archived eBay listing';
    const variant = document.createElement('p');
    variant.className = 'variant';
    const description = listing.variant ?? `${listing.grader} ${listing.grade} · ${listing.set_name}`;
    variant.textContent = `${listing.model_year} · ${description}`;
    const price = document.createElement('strong');
    price.className = 'price';
    price.textContent = money(listing.price_cents);
    const comparison = document.createElement('p');
    comparison.className = percent > 0 ? 'comparison favorable' : 'comparison';
    comparison.textContent = percent === null ? 'Too few comparable offers'
      : percent === 0 ? 'At the median'
      : `${percentFormat.format(Math.abs(percent))}% ${percent > 0 ? 'below' : 'above'} the median`;
    info.append(tag, title, variant, price, comparison);
    row.append(info, ebayLink(listing), explain(finding));
    findings.append(row);
  });
}

function clearResults() {
  resultsSection.hidden = true;
  findings.replaceChildren();
  status.textContent = '';
}

query.addEventListener('input', () => {
  query.setCustomValidity('');
  updateGrade();
});
document.querySelector('.examples').addEventListener('click', event => {
  const example = event.target.closest('[data-query]');
  if (!example) return;
  query.value = example.dataset.query;
  query.setCustomValidity('');
  year.value = example.dataset.year;
  updateGrade();
  clearResults();
  query.focus({ preventScroll: true });
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!listings.length) return;
  query.value = query.value.trim();
  if (!query.value) {
    query.setCustomValidity('Enter a product name or model.');
    query.reportValidity();
    return;
  }
  updateGrade();
  render();
  const heading = document.querySelector('#results-title');
  heading.focus({ preventScroll: true });
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  heading.scrollIntoView({ behavior: motion ? 'instant' : 'smooth', block: 'start' });
});
reset.addEventListener('click', () => {
  form.reset();
  query.setCustomValidity('');
  updateGrade();
  clearResults();
  query.focus();
});

try {
  const response = await fetch('./data/demo/charizard-psa9-source-observations.json');
  if (!response.ok) throw new Error('Listings cannot be loaded');
  const { observations } = await response.json();
  // These observations all refer to the 2023 Scarlet & Violet—151 release.
  listings = [...observations.map(listing => ({ ...listing, model_year: 2023 })), ...sampleProducts];
  updateGrade();
  searchButton.disabled = false;
} catch {
  const error = document.querySelector('#load-error');
  error.textContent = 'The demo catalog could not load. Refresh the page to try again.';
  error.hidden = false;
}
