import { searchListings } from './search.mjs';

const form = document.querySelector('#hunt');
const findings = document.querySelector('#findings');
const status = document.querySelector('#status');
const reset = document.querySelector('#reset');
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const money = cents => usd.format(cents / 100).replace(/\.00$/, '');
let listings = [];

function ebayLink(listing) {
  const link = document.createElement('a');
  link.className = 'external';
  link.href = new URL('/itm/' + encodeURIComponent(listing.item_id), 'https://www.ebay.com').href;
  link.textContent = 'На eBay ↗';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function explain({ listing, peers, benchmark, delta }) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Как рассчитано сравнение?';
  const text = document.createElement('p');
  text.textContent = benchmark === null
    ? 'Для сравнения нужно хотя бы три объявления той же версии и грейда.'
    : `Разница между медианой (${money(benchmark)}) и ценой лота (${money(listing.price_cents)}) составляет ${money(Math.abs(delta))}. В сравнении ${peers.length} других объявлений той же версии и грейда, включая варианты выше бюджета. Все цены без доставки и налогов.`;
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
    const source = current ? document.createTextNode('Этот лот') : ebayLink(peer);
    row.append(label, bar, source);
    bars.append(row);
  }
  details.append(summary, text, bars);
  return details;
}

function render() {
  const filters = Object.fromEntries(new FormData(form));
  const results = searchListings(listings, filters);
  reset.hidden = false;
  status.textContent = `Найдено ${results.length} из ${listings.length} сохранённых объявлений`;
  findings.replaceChildren();

  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Совпадений нет. Попробуй Charizard ex, грейд PSA 9 или увеличь бюджет.';
    findings.append(empty);
    return;
  }

  results.forEach((finding, index) => {
    const { listing, percent } = finding;
    const row = document.createElement('article');
    row.className = index === 0 ? 'listing featured' : 'listing';
    row.style.setProperty('--delay', `${index * 45}ms`);
    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = listing.title;
    const tag = document.createElement('p');
    tag.textContent = index === 0 ? 'Самая низкая цена среди результатов' : 'Цена объявления';
    const price = document.createElement('strong');
    price.className = 'price';
    price.textContent = money(listing.price_cents);
    const comparison = document.createElement('p');
    comparison.className = percent > 0 ? 'comparison favorable' : 'comparison';
    comparison.textContent = percent === null ? 'Мало аналогов'
      : percent === 0 ? 'На уровне медианы'
      : `${percentFormat.format(Math.abs(percent))}% ${percent > 0 ? 'ниже' : 'выше'} медианы`;
    info.append(tag, title, price, comparison);
    row.append(info, ebayLink(listing), explain(finding));
    findings.append(row);
  });
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!listings.length) return;
  render();
  const heading = document.querySelector('#results-title');
  heading.focus({ preventScroll: true });
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  heading.scrollIntoView({ behavior: motion ? 'instant' : 'smooth', block: 'start' });
});
reset.addEventListener('click', () => {
  form.reset();
  render();
});

try {
  const response = await fetch('./data/demo/charizard-psa9-source-observations.json');
  if (!response.ok) throw new Error('Listings cannot be loaded');
  ({ observations: listings } = await response.json());
  render();
  reset.hidden = true;
} catch {
  status.textContent = 'Не удалось загрузить данные. Открой демо через HTTP-сервер и обнови страницу.';
  form.querySelector('button').disabled = true;
}
