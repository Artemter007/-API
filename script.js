'use strict';

/* =========================================================
   Общие утилиты
   ========================================================= */

const timeFmt = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit', minute: '2-digit', second: '2-digit'
});

const numberFmt = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2, maximumFractionDigits: 4
});

function nowTime() { return timeFmt.format(new Date()); }

function setStatus(el, text, kind) {
  el.textContent = text;
  el.classList.remove('status--error', 'status--empty');
  if (kind) el.classList.add('status--' + kind);
}

/* =========================================================
   Список валют
   ========================================================= */

const CURRENCIES = [
  { code: 'USD', name: 'Доллар США',          wiki: 'Доллар США' },
  { code: 'EUR', name: 'Евро',                wiki: 'Евро' },
  { code: 'GBP', name: 'Фунт стерлингов',     wiki: 'Фунт стерлингов' },
  { code: 'CNY', name: 'Китайский юань',      wiki: 'Юань' },
  { code: 'JPY', name: 'Японская йена',       wiki: 'Японская йена' },
  { code: 'CHF', name: 'Швейцарский франк',   wiki: 'Швейцарский франк' },
  { code: 'TRY', name: 'Турецкая лира',       wiki: 'Турецкая лира' },
  { code: 'KZT', name: 'Казахстанский тенге', wiki: 'Тенге' },
  { code: 'BYN', name: 'Белорусский рубль',   wiki: 'Белорусский рубль' },
  { code: 'AMD', name: 'Армянский драм',      wiki: 'Армянский драм' }
];

function fillCurrencySelect(select, selected) {
  select.replaceChildren();
  CURRENCIES.forEach(({ code, name }) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = `${code} — ${name}`;
    select.append(option);
  });
  if (selected) select.value = selected;
}

/* =========================================================
   Виджет 1. Курсы валют — ЦБ РФ
   ========================================================= */

const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';

const ratesEls = {
  refresh: document.querySelector('#rates-refresh'),
  status:  document.querySelector('#rates-status'),
  data:    document.querySelector('#rates-data'),
  meta:    document.querySelector('#rates-meta')
};

let ratesCache = null;
let ratesUpdatedAt = '';
let ratesToken = 0;

async function fetchCbr() {
  const response = await fetch(CBR_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function factRow(term, value) {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  return [dt, dd];
}

function renderRates(valute, dateStr, { stale = false } = {}) {
  const list = document.createElement('dl');
  list.className = 'facts';

  CURRENCIES.forEach(({ code, name }) => {
    const item = valute[code];
    if (!item) return;

    const perUnit = item.Value / (item.Nominal || 1);

    const dt = document.createElement('dt');
    dt.textContent = `${name} (${code})`;

    const dd = document.createElement('dd');
    const wrap = document.createElement('div');
    wrap.className = 'rate';

    const codeEl = document.createElement('span');
    codeEl.className = 'rate__code';
    codeEl.textContent = `${item.Nominal || 1} ${code} =`;

    const valueEl = document.createElement('span');
    valueEl.className = 'rate__value';
    valueEl.textContent = `${numberFmt.format(perUnit)} ₽`;

    const hintEl = document.createElement('span');
    hintEl.className = 'rate__hint';
    hintEl.textContent = item.Previous
      ? `· было ${numberFmt.format(item.Previous / (item.Nominal || 1))} ₽`
      : '';

    wrap.append(codeEl, valueEl, hintEl);
    dd.append(wrap);
    list.append(dt, dd);
  });

  ratesEls.data.replaceChildren(list);
  ratesEls.data.hidden = false;
  ratesEls.status.hidden = true;

  ratesEls.meta.textContent =
    (stale ? 'Данные устарели — показан последний удачный ответ. ' : '') +
    `Курсы на ${dateStr}. Источник: ЦБ РФ (cbr-xml-daily.ru). ` +
    `Последнее успешное обновление: ${ratesUpdatedAt}.`;
  ratesEls.meta.classList.toggle('meta--stale', stale);
}

async function loadRates() {
  const token = ++ratesToken;

  ratesEls.status.hidden = false;
  setStatus(ratesEls.status, 'Загрузка…');
  ratesEls.data.hidden = true;

  try {
    const data = await fetchCbr();
    if (token !== ratesToken) return;

    if (!data || !data.Valute || Object.keys(data.Valute).length === 0) {
      setStatus(ratesEls.status, 'Сервис не вернул курсы.', 'empty');
      ratesEls.meta.textContent = 'Источник: ЦБ РФ.';
      return;
    }

    ratesUpdatedAt = nowTime();
    const dateStr = data.Date ? data.Date.slice(0, 10) : '—';

    ratesCache = { valute: data.Valute, date: dateStr };
    renderRates(data.Valute, dateStr);

  } catch (error) {
    if (token !== ratesToken) return;

    if (ratesCache) {
      setStatus(ratesEls.status,
        'Не удалось обновить курсы. Показаны последние полученные данные.', 'error');
      ratesEls.status.hidden = false;
      renderRates(ratesCache.valute, ratesCache.date, { stale: true });
    } else {
      setStatus(ratesEls.status,
        'Не удалось загрузить курсы. Проверьте соединение и попробуйте снова.', 'error');
      ratesEls.meta.textContent = 'Источник: ЦБ РФ. Данных пока нет.';
    }
  }
}

ratesEls.refresh.addEventListener('click', loadRates);

/* =========================================================
   Виджет 2. Валюты мира — справка + рейтинг
   ========================================================= */

// Мировые валюты: роль и описание.
const WORLD_CURRENCIES = [
  {
    code: 'USD',
    name: 'Доллар США',
    role: 'Главная резервная',
    wiki: 'Доллар США',
    about: 'Основная резервная валюта мира и главное средство международных расчётов. На доллар номинирована большая часть мирового долга, сырья и торговых контрактов. Доллар — единственная валюта, которая выполняет все функции международных денег одновременно: меры стоимости, средства обращения и средства накопления. На него приходится около 57% мировых валютных резервов и половина всех платежей через SWIFT.'
  },
  {
    code: 'EUR',
    name: 'Евро',
    role: 'Вторая резервная',
    wiki: 'Евро',
    about: 'Вторая по значимости мировая валюта, официальная денежная единица 20 стран еврозоны. Используется как резервная валюта центральными банками (около 20% мировых резервов), для международных расчётов и как валюта номинирования долговых бумаг. Доля евро в международных платежах — около 23%.'
  },
  {
    code: 'CNY',
    name: 'Китайский юань',
    role: 'Растущая',
    wiki: 'Юань',
    about: 'Денежная единица Китая, крупнейшего экспортёра мира. Юань активно используется в торговых расчётах со странами Азии, Африки и Латинской Америки. Занимает второе место в мире по обслуживанию торгового финансирования и около 3% мировых платежей. Роль юаня растёт, но его доля в резервах пока невелика — около 2%.'
  },
  {
    code: 'JPY',
    name: 'Японская йена',
    role: 'Резервная, «тихая гавань»',
    wiki: 'Японская йена',
    about: 'Третья по популярности резервная валюта. Исторически считается «тихой гаванью»: в периоды нестабильности инвесторы покупают йену как защитный актив. На йену приходится около 5% мировых резервов и около 17% оборота валютного рынка.'
  },
  {
    code: 'GBP',
    name: 'Фунт стерлингов',
    role: 'Старейшая',
    wiki: 'Фунт стерлингов',
    about: 'Старейшая из действующих мировых валют. Сегодня используется как резервная (около 5% мировых резервов) и активно торгуется на валютном рынке. Лондон остаётся крупнейшим центром валютной торговли, что поддерживает роль фунта.'
  },
  {
    code: 'CHF',
    name: 'Швейцарский франк',
    role: 'Защитная',
    wiki: 'Швейцарский франк',
    about: 'Классическая «защитная» валюта. Благодаря стабильной экономике Швейцарии и нейтралитету страны инвесторы покупают франк, когда растёт неопределённость. На франк приходится заметная доля глобального валютного оборота, но в резервах его доля ниже, чем у йены и фунта.'
  }
];

// Рейтинг: доля в мировых резервах (IMF COFER, III кв. 2025).
const RESERVE_RANK = [
  { code: 'USD', value: 56.9, note: 'IMF COFER' },
  { code: 'EUR', value: 20.3, note: 'IMF COFER' },
  { code: 'JPY', value: 5.8,  note: 'IMF COFER' },
  { code: 'GBP', value: 4.5,  note: 'IMF COFER' },
  { code: 'CNY', value: 1.9,  note: 'IMF COFER' }
];

// Рейтинг: доля в международных платежах (SWIFT, дек. 2025).
const PAYMENT_RANK = [
  { code: 'USD', value: 50.5, note: 'SWIFT' },
  { code: 'EUR', value: 23.0, note: 'SWIFT' },
  { code: 'GBP', value: 7.0,  note: 'SWIFT' },
  { code: 'JPY', value: 4.0,  note: 'SWIFT' },
  { code: 'CNY', value: 2.7,  note: 'SWIFT' }
];

const WIKI = 'https://ru.wikipedia.org/w/api.php';

const worldEls = {
  list:      document.querySelector('#currency-list'),
  info:      document.querySelector('#currency-info'),
  infoTitle: document.querySelector('#currency-info-title'),
  infoText:  document.querySelector('#currency-info-text'),
  infoLink:  document.querySelector('#currency-info-link'),
  reserves:  document.querySelector('#rank-reserves'),
  payments:  document.querySelector('#rank-payments'),
  meta:      document.querySelector('#world-meta'),
  refresh:   document.querySelector('#world-refresh')
};

let selectedCurrency = 'USD';
const wikiCache = new Map();
let wikiToken = 0;

function currencyName(code) {
  return CURRENCIES.find(x => x.code === code)?.name
      || WORLD_CURRENCIES.find(x => x.code === code)?.name
      || code;
}

/* Список валют-кнопок слева */
function renderCurrencyList() {
  worldEls.list.replaceChildren();

  WORLD_CURRENCIES.forEach(({ code, name, role }) => {
    const li = document.createElement('li');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'currency-list__item';
    btn.dataset.code = code;
    if (code === selectedCurrency) btn.classList.add('is-active');

    const codeEl = document.createElement('span');
    codeEl.className = 'currency-list__code';
    codeEl.textContent = code;

    const nameEl = document.createElement('span');
    nameEl.className = 'currency-list__name';
    nameEl.textContent = name;

    const roleEl = document.createElement('span');
    roleEl.className = 'currency-list__role';
    roleEl.textContent = role;

    btn.append(codeEl, nameEl, roleEl);
    btn.addEventListener('click', () => selectWorldCurrency(code));

    li.append(btn);
    worldEls.list.append(li);
  });
}

/* Рейтинг-список с полосками */
function renderRank(container, data, leaderCode) {
  container.replaceChildren();

  const max = Math.max(...data.map(x => x.value));

  data.forEach(({ code, value }, i) => {
    const li = document.createElement('li');
    li.className = 'rank__item';
    if (i === 0) li.classList.add('rank__item--gold');

    const codeEl = document.createElement('span');
    codeEl.className = 'rank__code';
    codeEl.textContent = code;

    const bar = document.createElement('div');
    bar.className = 'rank__bar';

    const fill = document.createElement('div');
    fill.className = 'rank__fill';
    fill.style.width = `${(value / max) * 100}%`;

    bar.append(fill);

    const valueEl = document.createElement('span');
    valueEl.className = 'rank__value';
    valueEl.textContent = `${value.toFixed(1)}%`;

    li.append(codeEl, bar, valueEl);
    container.append(li);
  });
}

/* Показать пояснение о валюте и подгрузить справку из Википедии */
async function showCurrencyInfo(code) {
  const item = WORLD_CURRENCIES.find(x => x.code === code)
            || CURRENCIES.find(x => x.code === code);
  if (!item) return;

  worldEls.infoTitle.textContent = `${item.code} · ${item.name}`;
  worldEls.infoText.textContent = item.about || 'Описание недоступно.';
  worldEls.infoLink.href =
    `https://ru.wikipedia.org/wiki/${encodeURIComponent(item.wiki)}`;
  worldEls.info.hidden = false;

  // Пробуем дополнить текст из Википедии (необязательно).
  if (wikiCache.has(code)) {
    worldEls.infoText.textContent = wikiCache.get(code).extract || item.about;
    return;
  }

  const token = ++wikiToken;
  try {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      prop: 'extracts',
      exintro: '1',
      explaintext: '1',
      redirects: '1',
      titles: item.wiki
    });

    const response = await fetch(`${WIKI}?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (token !== wikiToken) return;

    const pages = data && data.query && data.query.pages;
    if (!pages) return;

    const page = Object.values(pages)[0];
    if (!page || page.missing !== undefined) return;

    const extract = (page.extract || '').replace(/\s+/g, ' ').trim();
    if (!extract) return;

    wikiCache.set(code, { extract });
    worldEls.infoText.textContent = extract;
  } catch {
    /* оставляем локальное описание */
  }
}

function selectWorldCurrency(code) {
  selectedCurrency = code;
  renderCurrencyList();
  showCurrencyInfo(code);
}

function renderWorld() {
  renderCurrencyList();
  renderRank(worldEls.reserves, RESERVE_RANK);
  renderRank(worldEls.payments, PAYMENT_RANK);
  showCurrencyInfo(selectedCurrency);

  worldEls.meta.textContent =
    'Резервы: IMF COFER, III квартал 2025. Платежи: SWIFT, декабрь 2025. ' +
    'Справка: Википедия (ru.wikipedia.org).';
}

worldEls.refresh.addEventListener('click', () => {
  wikiCache.clear();
  wikiToken++;
  renderWorld();
});

/* =========================================================
   Виджет 3. Расходы — localStorage
   ========================================================= */

const EXPENSES_KEY = 'personal-budget-expenses-v1';

const expensesEls = {
  form:     document.querySelector('#expenses-form'),
  name:     document.querySelector('#expenses-name'),
  amount:   document.querySelector('#expenses-amount'),
  currency: document.querySelector('#expenses-currency'),
  list:     document.querySelector('#expenses-list'),
  status:   document.querySelector('#expenses-status'),
  reset:    document.querySelector('#expenses-reset')
};

fillCurrencySelect(expensesEls.currency, 'USD');

let expenses = readExpenses();

function readExpenses() {
  try {
    const raw = localStorage.getItem(EXPENSES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(x => x && typeof x.name === 'string')
      .map(x => ({
        id: String(x.id ?? Date.now() + Math.random()),
        name: x.name.slice(0, 60),
        amount: Number(x.amount) || 0,
        currency: /^[A-Z]{3}$/.test(x.currency) ? x.currency : 'USD'
      }));
  } catch { return []; }
}

function saveExpenses() {
  try { localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses)); }
  catch { /* приватный режим */ }
}

function addExpense(name, amount, currency) {
  const value = String(name || '').trim().slice(0, 60);
  const num = Number(amount);
  if (!value) return 'Введите, на что потратили.';
  if (!Number.isFinite(num) || num <= 0) return 'Введите сумму больше нуля.';
  if (!/^[A-Z]{3}$/.test(currency)) return 'Выберите валюту.';

  expenses.push({
    id: String(Date.now() + Math.random()),
    name: value,
    amount: Math.round(num * 100) / 100,
    currency
  });
  saveExpenses();
  renderExpenses();
  return null;
}

function removeExpense(id) {
  expenses = expenses.filter(x => x.id !== id);
  saveExpenses();
  renderExpenses();
}

function renderExpenses() {
  expensesEls.list.replaceChildren();

  if (expenses.length === 0) {
    setStatus(expensesEls.status,
      'Пока пусто — добавьте первую запись.', 'empty');
    return;
  }

  const totals = new Map();
  expenses.forEach(x => {
    totals.set(x.currency, (totals.get(x.currency) || 0) + x.amount);
  });

  expenses.forEach(item => {
    const li = document.createElement('li');
    li.className = 'expenses__item';

    const name = document.createElement('span');
    name.className = 'expenses__name';
    name.textContent = item.name;

    const amount = document.createElement('span');
    amount.className = 'expenses__amount';
    amount.textContent = `${item.amount.toFixed(2)} ${item.currency}`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'expenses__remove';
    remove.textContent = 'Удалить';
    remove.setAttribute('aria-label', `Удалить «${item.name}»`);
    remove.addEventListener('click', () => removeExpense(item.id));

    li.append(name, amount, remove);
    expensesEls.list.append(li);
  });

  const totalLine = document.createElement('div');
  totalLine.className = 'expenses__total';

  const totalsText = Array.from(totals.entries())
    .map(([code, value]) => `${value.toFixed(2)} ${code}`)
    .join(' · ');

  const label = document.createElement('span');
  label.textContent = 'Итого:';

  const value = document.createElement('span');
  value.textContent = totalsText;

  totalLine.append(label, value);
  expensesEls.list.append(totalLine);

  setStatus(expensesEls.status,
    `Записей: ${expenses.length}. Итоги — по каждой валюте отдельно.`);
}

expensesEls.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const error = addExpense(
    expensesEls.name.value,
    expensesEls.amount.value,
    expensesEls.currency.value
  );
  if (error) {
    setStatus(expensesEls.status, error, 'error');
    return;
  }
  expensesEls.name.value = '';
  expensesEls.amount.value = '';
  expensesEls.name.focus();
});

expensesEls.reset.addEventListener('click', () => {
  expenses = [];
  saveExpenses();
  renderExpenses();
});

/* =========================================================
   Старт
   ========================================================= */

loadRates();
renderWorld();
renderExpenses();