import { matchesQuery, searchListings } from './search.mjs';
import { sampleProducts } from './data/demo/products.mjs';

const form = document.querySelector('#hunt');
const findings = document.querySelector('#findings');
const status = document.querySelector('#status');
const reset = document.querySelector('#reset');
const query = document.querySelector('#query');
const grade = document.querySelector('#grade');
const gradeField = document.querySelector('#grade-field');
const explainEndpoint = document.querySelector('meta[name="collectwatch-explain-endpoint"]').content;
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const money = cents => usd.format(cents / 100).replace(/\.00$/, '');
let listings = [];
let searchRequest = null;
const parsed = document.querySelector('#parsed-rule');
const submitButtons = [...form.querySelectorAll('button[type=submit]')];

function ebayLink({ item_id, title, sample }) {
  const link = document.createElement('a');
  link.className = 'external';
  const url = new URL(sample ? '/sch/i.html' : '/itm/' + encodeURIComponent(item_id), 'https://www.ebay.com');
  if (sample) url.searchParams.set('_nkw', title);
  link.href = url.href;
  link.textContent = sample ? 'Поиск на eBay ↗' : 'Лот на eBay ↗';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function explain({ listing, peers, benchmark, delta }) {
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Почему?';
  const text = document.createElement('p');
  text.textContent = benchmark === null
    ? 'Для сравнения нужно хотя бы три объявления той же модели и комплектации.'
    : `Разница между медианой (${money(benchmark)}) и ценой лота (${money(listing.price_cents)}) составляет ${money(Math.abs(delta))}. В сравнении ${peers.length} других объявлений той же модели и комплектации, включая варианты выше бюджета. Все цены без доставки и налогов.`;
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
    const source = current ? document.createTextNode(listing.sample ? 'Этот вариант' : 'Этот лот')
      : listing.sample ? document.createTextNode('Демо') : ebayLink(peer);
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
    output.textContent = 'Готовим дополнительное объяснение…';
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
      output.textContent = 'Дополнительное объяснение недоступно. Расчёт показан выше.';
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
  searchRequest?.abort();
  searchRequest = null;
  submitButtons.forEach(button=>button.disabled=false);
  parsed.textContent = '';
  const filters = Object.fromEntries(new FormData(form));
  const results = searchListings(listings, filters);
  renderResults(results, filters);
}

function renderResults(results, filters, ai = false) {
  reset.hidden = false;
  status.textContent = ai ? `AI-поиск: ${results.length} совпадений в историческом наборе Pokémon` : `Найдено ${results.length} из ${listings.length} вариантов в демо`;
  findings.replaceChildren();

  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const message = document.createElement('p');
    message.textContent = 'В демо совпадений нет. Измени запрос или бюджет.';
    empty.append(message);
    if (filters.query.trim()) empty.append(ebayLink({ title: filters.query.trim(), sample: true }));
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
    tag.textContent = listing.sample ? 'Пример · смоделированная цена' : 'Историческое объявление · доступность не проверена';
    const variant = document.createElement('p');
    variant.className = 'variant';
    variant.textContent = listing.variant ?? `${listing.grader} ${listing.grade} · ${listing.set_name}`;
    const price = document.createElement('strong');
    price.className = 'price';
    price.textContent = money(listing.price_cents);
    const comparison = document.createElement('p');
    comparison.className = percent > 0 ? 'comparison favorable' : 'comparison';
    comparison.textContent = percent === null ? 'Мало аналогов'
      : percent === 0 ? 'На уровне медианы'
      : `${percentFormat.format(Math.abs(percent))}% ${percent > 0 ? 'ниже' : 'выше'} медианы`;
    info.append(tag, title, variant, price, comparison);
    row.append(info, ebayLink(listing), explain(finding));
    findings.append(row);
  });
}

query.addEventListener('input', updateGrade);
document.querySelector('.examples').addEventListener('click', event => {
  const example = event.target.closest('[data-query]');
  if (!example || !listings.length) return;
  query.value = example.dataset.query;
  updateGrade();
  render();
});

async function aiSearch() {
  if (searchRequest) return;
  const controller = new AbortController();
  searchRequest = controller;
  const timer = setTimeout(() => controller.abort(), 25000);
  const text = query.value.trim();
  if (!text) { clearTimeout(timer); searchRequest = null; status.textContent = 'Опиши нужную карточку Pokémon.'; return; }
  // Keep form controls explicit; the server parses the query, never trusts client prices.
  const budget = form.elements.budget.value;
  const selectedGrade = grade.disabled ? '' : grade.value;
  const requestText = [text, selectedGrade, budget === '' ? '' : `бюджет до ${budget} долларов США`].filter(Boolean).join('; ');
  submitButtons.forEach(button => button.disabled = true);
  status.textContent = 'Kimi разбирает условия поиска…';
  parsed.textContent = '';
  findings.replaceChildren();
  try {
    const response = await fetch('/api/search', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:requestText}), signal:controller.signal
    });
    const payload = await response.json();
    if (!response.ok) {
      const messages = {
        UNSUPPORTED_QUERY:'Условия пока не поддерживаются. Попробуй одну оценку PSA и бюджет в долларах.',
        QUERY_NEEDS_CARD:'Укажи название или номер карточки.',
        INVALID_QUERY:'Проверь длину и содержание запроса.',
        PROVIDER_NOT_CONFIGURED:'AI-поиск ещё не настроен на сервере. Обычный поиск доступен.',
        TOO_MANY_REQUESTS:'Лимит демо-запросов достигнут. Попробуй позже.',
        PROVIDER_TIMEOUT:'Модель не ответила вовремя. Автоматический повтор не выполнялся.'
      };
      throw new Error(messages[payload.error?.code] ?? 'AI-поиск не завершён. Попробуй обычный поиск или отправь запрос позже.');
    }
    if (searchRequest !== controller) return;
    if (!Array.isArray(payload.results) || !payload.rule) throw new Error('Не удалось прочитать результат AI-поиска.');
    renderResults(payload.results, {query:text}, true);
    const ruleLabels = {card_name:'Карточка',card_number:'Номер',set_name:'Выпуск',language:'Язык',grader:'Оценщик',grade:'Оценка',finish:'Вариант',max_price_cents:'Бюджет, $',min_discount_pct:'Минимальная разница, %'};
    const conditions = Object.entries(ruleLabels).filter(([key])=>payload.rule[key]!=null).map(([key,label])=>`${label}: ${key==='max_price_cents'?payload.rule[key]/100:payload.rule[key]}`);
    parsed.textContent = `Kimi поняла: ${conditions.join(' · ')}. Проверь условия. Сравнение исторических цен без доставки и налогов; доступность не проверена.`;
  } catch(error) {
    if (searchRequest !== controller) return;
    status.textContent = error.name === 'AbortError' ? 'AI-поиск прерван или истекло время ожидания.' : error.message;
  } finally {
    clearTimeout(timer);
    if (searchRequest === controller) {searchRequest = null; submitButtons.forEach(button=>button.disabled=false);}
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!listings.length) return;
  if (event.submitter?.value === 'ai') await aiSearch();
  else render();
  const heading = document.querySelector('#results-title');
  heading.focus({ preventScroll: true });
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  heading.scrollIntoView({ behavior: motion ? 'instant' : 'smooth', block: 'start' });
});
reset.addEventListener('click', () => {
  form.reset();
  updateGrade();
  render();
});

try {
  const response = await fetch('./data/demo/charizard-psa9-source-observations.json');
  if (!response.ok) throw new Error('Listings cannot be loaded');
  const { observations } = await response.json();
  listings = [...observations, ...sampleProducts];
  updateGrade();
  render();
  reset.hidden = true;
} catch {
  status.textContent = 'Не удалось загрузить данные. Открой демо через HTTP-сервер и обнови страницу.';
  form.querySelector('button').disabled = true;
}
