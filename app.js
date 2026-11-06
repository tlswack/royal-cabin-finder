// Family Cabin Finder app page.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const store = chrome.storage.local;
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => res(r || { ok: false, error: chrome.runtime.lastError && chrome.runtime.lastError.message })));

// Royal doesn't publish ship class, so it lives here. Unknown ships show as "Other".
const CLASSES = {
  Icon: ['IC', 'ST', 'LE', 'HE'],
  Oasis: ['OA', 'AL', 'HM', 'SY', 'WN', 'UT'],
  Quantum: ['QN', 'AN', 'OV', 'SC', 'OY'],
  Freedom: ['FR', 'LB', 'ID'],
  Voyager: ['VY', 'EX', 'AD', 'NV', 'MA'],
  Radiance: ['RD', 'BR', 'SR', 'JW'],
  Vision: ['GR', 'RH', 'EN', 'VI'],
};
const CLASS_ORDER = [...Object.keys(CLASSES), 'Other'];
const classOf = (code) => Object.keys(CLASSES).find((k) => CLASSES[k].includes(code)) || 'Other';
const roomType = (name) => /suite|loft|villa|townhouse/i.test(name) ? 'Suite' : /balcony/i.test(name) ? 'Balcony' : /interior/i.test(name) ? 'Interior' : 'Ocean view';
const money = (v) => v == null || !isFinite(v) ? '' : '$' + Math.round(v).toLocaleString();
const monthName = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 15).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };
const fmtDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- search form ----------
let FILTERS = null;
async function loadFilters(force) {
  const { filters } = await store.get('filters');
  if (filters && !force && Date.now() - filters.fetchedAt < 7 * 864e5) { FILTERS = filters; return renderForm(); }
  $('#estimate').textContent = 'Loading ports, ships and dates from Royal…';
  const r = await send({ fcf: 'filters' });
  if (!r.ok) { showError('Couldn’t load Royal’s lists: ' + r.error); if (filters) { FILTERS = filters; renderForm(); } return; }
  FILTERS = r.data; await store.set({ filters: FILTERS }); $('#estimate').textContent = ''; renderForm();
}

function ck(name, code, label, count, checked) {
  return `<label class="ck"><input type="checkbox" name="${name}" value="${esc(code)}" ${checked ? 'checked' : ''}> ${esc(label)} <span class="ct">${count || ''}</span></label>`;
}
async function renderForm() {
  const { lastSearch: ls = {} } = await store.get('lastSearch');
  const f = ls.filters || {};
  const has = (arr, c) => (arr || []).includes(c);
  $('#p-dest .opts').innerHTML = FILTERS.destinations.slice().sort((a, b) => a.label.localeCompare(b.label)).map((d) => ck('dest', d.code, d.label, d.count, has(f.destinations, d.code))).join('');
  $('#p-port .opts').innerHTML = FILTERS.portGroups.map((g) => `<div class="grp">${esc(g.label)} <button type="button" data-all="port-${g.code}">all</button></div>` +
    g.ports.slice().sort((a, b) => a.label.localeCompare(b.label)).map((p) => ck('port', p.code, p.label, p.count, has(f.ports, p.code)).replace('<label class="ck">', `<label class="ck" data-g="port-${g.code}">`)).join('')).join('');
  const byClass = {};
  FILTERS.ships.forEach((s) => (byClass[classOf(s.code)] = byClass[classOf(s.code)] || []).push(s));
  $('#p-ship .opts').innerHTML = CLASS_ORDER.filter((c) => byClass[c]).map((c) => `<div class="grp">${c === 'Other' ? 'Other / new ships' : c + ' class'} <button type="button" data-all="ship-${c}">all</button></div>` +
    byClass[c].sort((a, b) => a.label.localeCompare(b.label)).map((s) => ck('ship', s.code, s.label, s.count, has(f.ships, s.code)).replace('<label class="ck">', `<label class="ck" data-g="ship-${c}">`)).join('')).join('');
  const months = FILTERS.months.length ? FILTERS.months : [];
  const opt = (m, sel) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${monthName(m)}</option>`;
  $('#from').innerHTML = months.map((m) => opt(m, f.from || months[0])).join('');
  $('#to').innerHTML = months.map((m) => opt(m, f.to || months[Math.min(5, months.length - 1)])).join('');
  if (ls.party) { $('#adults').value = ls.party.adults; $('#kids').value = ls.party.kids; }
  if (f.nightsMin) $('#nmin').value = f.nightsMin;
  if (f.nightsMax) $('#nmax').value = f.nightsMax;
  updateSummaries();
}
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-all]');
  if (!g) return;
  const boxes = $$(`[data-g="${g.dataset.all}"] input`);
  const on = !boxes.every((b) => b.checked);
  boxes.forEach((b) => (b.checked = on));
  updateSummaries();
});
document.addEventListener('change', (e) => { if (e.target.matches('.opts input')) updateSummaries(); });
function picked(name) { return $$(`input[name="${name}"]:checked`).map((i) => i.value); }
function updateSummaries() {
  const lab = (name, list, key) => { const v = picked(name); if (!v.length) return 'Any'; const names = v.map((c) => (list.find((x) => x.code === c) || {}).label || c); return names.length > 3 ? names.length + ' selected' : names.join(', '); };
  if (!FILTERS) return;
  $('#p-dest .sel').textContent = lab('dest', FILTERS.destinations);
  $('#p-port .sel').textContent = lab('port', FILTERS.portGroups.flatMap((g) => g.ports));
  $('#p-ship .sel').textContent = lab('ship', FILTERS.ships);
}
function currentSearch() {
  const from = $('#from').value, to = $('#to').value < from ? from : $('#to').value;
  return {
    label: $('#label').value.trim(),
    party: { adults: +$('#adults').value || 2, kids: +$('#kids').value || 0 },
    filters: { destinations: picked('dest'), ports: picked('port'), ships: picked('ship'), from, to, nightsMin: +$('#nmin').value || 0, nightsMax: +$('#nmax').value || 0 },
  };
}
function describe(s) {
  const f = s.filters, parts = [];
  const names = (codes, list) => codes.map((c) => (list.find((x) => x.code === c) || {}).label || c);
  if (FILTERS) {
    if (f.destinations.length) parts.push(names(f.destinations, FILTERS.destinations).join(', '));
    if (f.ports.length) parts.push('from ' + names(f.ports, FILTERS.portGroups.flatMap((g) => g.ports)).map((n) => n.split(',')[0]).join(', '));
    if (f.ships.length) parts.push(f.ships.length > 3 ? f.ships.length + ' ships' : names(f.ships, FILTERS.ships).join(', '));
  }
  parts.push(monthName(f.from) + (f.to !== f.from ? ' – ' + monthName(f.to) : ''));
  if (f.nightsMin || f.nightsMax) parts.push(`${f.nightsMin || 1}–${f.nightsMax || 30} nights`);
  parts.push(`${s.party.adults} adults, ${s.party.kids} kids`);
  return parts.join(' · ');
}

$('#btn-refresh').onclick = () => loadFilters(true);
$('#btn-count').onclick = async () => {
  const s = currentSearch(); hideError();
  $('#estimate').textContent = 'Counting sailings…';
  const r = await send({ fcf: 'count', search: s });
  if (!r.ok) return showError(r.error);
  const n = r.data.sailings, mins = Math.max(1, Math.round(n * 9 / 60));
  $('#estimate').textContent = `${n} sailings match (${r.data.itineraries} itineraries). A scan takes about ${mins} minute${mins === 1 ? '' : 's'}.` + (n > 400 ? ' That’s a big scan; narrowing it will be faster and easier on Royal’s site.' : '');
};
$('#btn-scan').onclick = async () => {
  const s = currentSearch(); hideError();
  if (!s.filters.destinations.length && !s.filters.ports.length && !s.filters.ships.length) {
    if (!confirmInline('You haven’t picked a destination, port or ship, so this will scan every sailing in those months. Click Scan again to go ahead.')) return;
  }
  s.label = s.label || describe(s);
  await store.set({ lastSearch: s });
  const r = await send({ fcf: 'scan', search: s });
  if (!r.ok) return showError(r.error);
  $('#progress').hidden = false; $('#prog-text').textContent = 'Finding sailings…'; $('#bar-fill').style.width = '0';
};
let armed = 0;
function confirmInline(msg) { if (Date.now() - armed < 15000) { armed = 0; return true; } armed = Date.now(); $('#estimate').textContent = msg; return false; }
$('#btn-cancel').onclick = () => send({ fcf: 'cancel' });

function showError(m) { $('#error').textContent = m; $('#error').hidden = false; }
function hideError() { $('#error').hidden = true; }

// ---------- progress + results ----------
let ROWS = [], META = null, mode = 'any', sortK = 'date', sortDir = 1;
store.onChanged.addListener((ch) => {
  if (ch.scan) onScan(ch.scan.newValue);
  if (ch.results && META && META.live) loadRows(ch.results.newValue || [], META);
  if (ch.history) fillHistory(ch.history.newValue || []);
});
function onScan(s) {
  if (!s) return;
  const running = s.phase === 'search' || s.phase === 'scan';
  $('#progress').hidden = !running;
  $('#btn-scan').disabled = running;
  if (running) {
    $('#prog-text').textContent = s.phase === 'search' ? 'Finding sailings…' : `Checked ${s.done} of ${s.total} sailings`;
    $('#bar-fill').style.width = s.total ? (100 * s.done / s.total) + '%' : '0';
    META = { live: true, label: s.label, search: s.search, when: s.started };
  }
  if (s.phase === 'error') showError(s.error);
  if (s.phase === 'done' || s.phase === 'cancelled' || s.phase === 'error') store.get('results').then(({ results }) => loadRows(results || [], { label: s.label, search: s.search, when: s.finished, phase: s.phase }));
}
async function fillHistory(h) {
  $('#history').innerHTML = '<option value="">—</option>' + h.map((x) => `<option value="${x.id}">${esc((x.label || 'Scan').slice(0, 70))} · ${new Date(x.finished).toLocaleDateString()}</option>`).join('');
}
$('#history').onchange = async () => {
  const { history = [] } = await store.get('history');
  const h = history.find((x) => String(x.id) === $('#history').value);
  if (h) loadRows(h.rows, { label: h.label, search: h.search, when: h.finished, phase: h.phase });
};

function loadRows(rows, meta) {
  META = meta;
  ROWS = rows.map((r) => ({
    ...r,
    shipClass: classOf(r.shipCode), classRank: CLASS_ORDER.indexOf(classOf(r.shipCode)),
    famAll: (r.fam || []).map((f) => ({ ...f, type: roomType(f.name) })),
    connAll: (r.conn || []).map((c) => ({ ...c, type: roomType(c.name) })),
  }));
  ['#f-class', '#f-ship', '#f-port', '#f-nights', '#f-month'].forEach((s) => { const v = $(s).value; $(s).innerHTML = `<option value="">${s === '#f-nights' || s === '#f-month' ? 'Any' : 'All'}</option>`; $(s).dataset.keep = v; });
  const fill = (sel, vals, fmt) => [...new Set(vals)].sort((a, b) => (a > b ? 1 : -1)).forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = fmt ? fmt(v) : v; $(sel).appendChild(o); });
  CLASS_ORDER.filter((c) => ROWS.some((r) => r.shipClass === c)).forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; $('#f-class').appendChild(o); });
  fill('#f-ship', ROWS.map((r) => r.ship)); fill('#f-port', ROWS.map((r) => r.port)); fill('#f-nights', ROWS.map((r) => r.nights), (v) => v + ' nights');
  fill('#f-month', ROWS.map((r) => r.date.slice(0, 7)), monthName);
  ['#f-class', '#f-ship', '#f-port', '#f-nights', '#f-month'].forEach((s) => { if ([...$(s).options].some((o) => o.value === $(s).dataset.keep)) $(s).value = $(s).dataset.keep; });
  $('#results').hidden = false;
  stats(); render();
}
const typeOk = (t) => { const v = $('#f-type').value; return !v || (v === 'nosuite' ? t !== 'Suite' : t === v); };
function view() {
  const f = { cls: $('#f-class').value, ship: $('#f-ship').value, port: $('#f-port').value, nights: $('#f-nights').value, month: $('#f-month').value };
  return ROWS.map((r) => {
    const famL = r.famAll.filter((x) => typeOk(x.type)).sort((a, b) => a.price - b.price);
    const connL = r.connAll.filter((x) => typeOk(x.type)).sort((a, b) => a.price - b.price);
    return { ...r, famL, connL, famBest: famL.length ? famL[0].price : null, connBest: connL.length ? connL[0].price * 2 : null };
  }).filter((r) => (!f.cls || r.shipClass === f.cls) && (!f.ship || r.ship === f.ship) && (!f.port || r.port === f.port) && (!f.nights || String(r.nights) === f.nights) && (!f.month || r.date.startsWith(f.month)))
    .filter((r) => mode === 'fam' ? r.famL.length : mode === 'conn' ? r.connL.length : (r.famL.length || r.connL.length));
}
function render() {
  const list = view();
  list.sort((a, b) => { const x = a[sortK], y = b[sortK]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
  $$('th[data-k]').forEach((th) => th.setAttribute('aria-sort', th.dataset.k === sortK ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'));
  const N = (ROWS[0] && ROWS[0].n) || 6;
  if (!list.length) { $('#rows').innerHTML = `<tr><td colspan="9" class="empty">${ROWS.length ? 'No sailings match these filters.' : 'No sailings found.'}</td></tr>`; return; }
  $('#rows').innerHTML = list.map((r) => {
    const fam = r.famL.length ? r.famL.map((f) => `<span class="chip fam${f.avail <= 2 ? ' low' : ''}" title="${esc(f.cat)} · sleeps ${f.maxOcc}">${esc(f.name)} <span class="n">${money(f.price)}</span> <span class="n">${f.avail} left</span></span>`).join('') : '<span class="none">None open</span>';
    const conn = r.connL.length ? r.connL.map((c) => `<span class="chip conn" title="${esc(c.cat)}">${esc(c.name)} <span class="n">${money(c.price * 2)}</span>${c.avail ? ` <span class="n">${c.avail} left</span>` : ''}</span>`).join('') : '<span class="none">None open</span>';
    const detail = r.connL.some((c) => c.cat === r.pairsCat);
    const decks = detail ? (r.connDecks || []).map((d) => `Deck ${d.deck}: ${d.left}`).join(' · ') : '';
    const pairs = detail ? (r.pairs || []).join(', ') : '';
    const b0 = r.famL[0], c0 = r.connL[0];
    return `<tr>
      <td class="num">${fmtDate(r.date)}</td>
      <td><div class="ship">${esc(r.ship)}</div><div class="sub">${esc(r.itin)} · ${esc(r.port)}</div></td>
      <td>${r.shipClass}</td>
      <td class="num">${r.nights}</td>
      <td class="num">${b0 ? `${money(b0.price)}<div class="sub">${esc(b0.name)}</div>` : '<span class="none">—</span>'}</td>
      <td>${fam}</td>
      <td class="num">${c0 ? `${money(c0.price * 2)}<div class="sub">${esc(c0.name)}</div>` : '<span class="none">—</span>'}</td>
      <td>${conn}${decks ? `<div class="pairs">Open by deck: ${decks}</div>` : ''}${pairs ? `<div class="pairs">Pairs: ${esc(pairs)}</div>` : ''}</td>
      <td>${r.urlOne ? `<a class="btn" href="${esc(r.urlOne)}" target="_blank" rel="noopener">Big room ↗</a><br>` : ''}${r.urlTwo ? `<a class="btn" href="${esc(r.urlTwo)}" target="_blank" rel="noopener">2 rooms ↗</a>` : ''}</td>
    </tr>`;
  }).join('');
  $('#foot').innerHTML = `<div><b>${esc(META.label || '')}</b> · scanned ${new Date(META.when).toLocaleString()}${META.phase === 'cancelled' ? ' (stopped early)' : ''}.</div>
    <div><b>Big room</b> prices are Royal’s online total for the first ${Math.min(4, N)} guests in a room that sleeps ${Math.max(N, 5)} or more. Royal won’t book more than 4 per room online, so call to add the rest; the phone quote will be higher.</div>
    <div><b>Connecting</b> prices are two rooms, your party split between them, taxes and fees included. These book online: on Royal’s guest step, add a second room and look for the connecting icon.</div>
    <div>Availability and prices change daily. Confirm on Royal before booking.</div>`;
}
function stats() {
  const fam = ROWS.filter((r) => r.famAll.length).length, conn = ROWS.filter((r) => r.connAll.length).length;
  const fMin = Math.min(...ROWS.flatMap((r) => r.famAll.map((f) => f.price)));
  const cMin = Math.min(...ROWS.flatMap((r) => r.connAll.map((c) => c.price * 2)));
  $('#stats').innerHTML = [[ROWS.length, 'Sailings checked'], [fam, 'With a big room open'], [conn, 'With connecting rooms'], [money(fMin), 'Lowest big room'], [money(cMin), 'Lowest connecting pair']]
    .map(([v, l]) => `<div class="stat"><b>${v || '—'}</b><span>${l}</span></div>`).join('');
}
$$('.seg button').forEach((b) => (b.onclick = () => { mode = b.dataset.mode; $$('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render(); }));
['#f-type', '#f-class', '#f-ship', '#f-port', '#f-nights', '#f-month'].forEach((s) => $(s).addEventListener('change', render));
$$('th[data-k]').forEach((th) => (th.onclick = () => { const k = th.dataset.k; if (sortK === k) sortDir *= -1; else { sortK = k; sortDir = 1; } render(); }));

$('#btn-csv').onclick = () => {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [['Sail date', 'Ship', 'Class', 'Itinerary', 'Port', 'Nights', 'Cheapest big room', 'Big room type', 'Big rooms open', 'Cheapest connecting pair', 'Connecting type', 'Connecting by deck', 'Connecting pairs'].map(q).join(',')];
  view().forEach((r) => lines.push([r.date, r.ship, r.shipClass, r.itin, r.port, r.nights, r.famBest ? Math.round(r.famBest) : '', r.famL[0] ? r.famL[0].name : '', r.famL.map((f) => `${f.name} (${f.avail} left)`).join('; '),
    r.connBest ? Math.round(r.connBest) : '', r.connL[0] ? r.connL[0].name : '', (r.connDecks || []).map((d) => `Deck ${d.deck}: ${d.left}`).join('; '), (r.pairs || []).join('; ')].map(q).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = 'cabin-finder-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
};

// ---------- start ----------
(async () => {
  await loadFilters(false);
  const { scan, results, history = [] } = await store.get(['scan', 'results', 'history']);
  fillHistory(history);
  if (scan) { onScan(scan); if (scan.phase === 'scan' || scan.phase === 'search') loadRows(results || [], { live: true, label: scan.label, search: scan.search, when: scan.started }); }
  else if (history[0]) loadRows(history[0].rows, { label: history[0].label, search: history[0].search, when: history[0].finished, phase: history[0].phase });
})();
