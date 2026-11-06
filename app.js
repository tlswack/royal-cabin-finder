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
  FOLLOW = true;
  const r = await send({ fcf: 'scan', search: s });
  if (!r.ok) { FOLLOW = false; return showError(r.error); }
  $('#progress').hidden = false; $('#prog-text').textContent = 'Finding sailings…'; $('#bar-fill').style.width = '0';
};
let armed = 0;
function confirmInline(msg) { if (Date.now() - armed < 15000) { armed = 0; return true; } armed = Date.now(); $('#estimate').textContent = msg; return false; }
$('#btn-cancel').onclick = () => send({ fcf: 'cancel' });

function showError(m) { $('#error').textContent = m; $('#error').hidden = false; }
function hideError() { $('#error').hidden = true; }

// ---------- progress + results ----------
let ROWS = [], META = null, mode = 'any', sortK = 'date', sortDir = 1;
let INDEX = [], VIEW_ID = null, FOLLOW = false, LIVE_ID = null;
const STALE_MS = 5 * 60e3; // a running scan that hasn't saved in this long has died (Chrome closed, crash)
const isRunning = (s) => s && (s.phase === 'search' || s.phase === 'scan') && Date.now() - (s.beat || s.started || 0) < STALE_MS;
const rowsKey = (id) => 'scan:' + id;

store.onChanged.addListener((ch) => {
  if (ch.scan) onScan(ch.scan.newValue);
  if (ch.savedIndex) { INDEX = ch.savedIndex.newValue || []; renderSaved(); }
  if (VIEW_ID && ch[rowsKey(VIEW_ID)] && LIVE_ID === VIEW_ID) {
    const e = INDEX.find((x) => x.id === VIEW_ID);
    loadRows(ch[rowsKey(VIEW_ID)].newValue || [], metaOf(e || META));
  }
});
function onScan(s) {
  if (!s) return;
  const running = isRunning(s);
  $('#progress').hidden = !running;
  $('#btn-scan').disabled = running;
  LIVE_ID = running ? s.id : null;
  if (running) {
    $('#prog-text').textContent = s.phase === 'search' ? 'Finding sailings…' : `Checked ${s.done} of ${s.total} sailings · saving as it goes`;
    $('#bar-fill').style.width = s.total ? (100 * s.done / s.total) + '%' : '0';
    if (FOLLOW && VIEW_ID !== s.id) { FOLLOW = false; openSaved(s.id); }
  } else if (s.phase === 'error' || s.phase === 'interrupted') { if (s.error && VIEW_ID === s.id) showError(s.error); }
  if (!running && VIEW_ID === s.id) openSaved(s.id); // final refresh of the scan being viewed
}
const metaOf = (e) => ({ id: e.id, label: e.label, search: e.search, when: e.finished || e.beat || e.started, started: e.started, phase: e.phase, done: e.done, total: e.total, imported: e.imported });

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
  VIEW_ID = meta.id; renderSaved(); viewing();
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
    const fam = r.famL.length ? r.famL.map((f) => {
      const left = f.checked ? f.rooms.length : f.avail;
      const chip = `<span class="chip fam${left <= 2 ? ' low' : ''}" title="${esc(f.cat)} · category sleeps up to ${f.maxOcc}">${esc(f.name)} <span class="n">${money(f.price)}</span> <span class="n">${left} left</span></span>`;
      if (!f.checked) return chip + `<div class="rooms muted">Room-by-room capacity not checked</div>`;
      const list = f.rooms.map((x) => {
        const ic = icLabel(r.ship, x.n, N);
        return `<span class="room">${esc(x.n)} <span class="occ" title="${x.occ === '5+' ? 'Royal’s deck plan marks this room for 5 or more' : 'Royal’s deck plan has no capacity mark this extension could read'}">${x.occ === '5+' ? '5+' : 'unmarked'}</span>${ic}</span>`;
      }).join('');
      const hidden = f.dropped ? `<div class="rooms muted">${f.dropped} more open, but marked for 4 or fewer</div>` : '';
      return chip + `<div class="rooms">${list}</div>` + hidden;
    }).join('') : '<span class="none">None open</span>';
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
  $('#foot').innerHTML = `<div><b>${esc(META.label || '')}</b> · ${META.phase === 'search' || META.phase === 'scan' ? 'scan in progress, started ' + new Date(META.started || META.when).toLocaleString() : 'scanned ' + new Date(META.when).toLocaleString()}${PHASE_NOTE[META.phase] || ''}.</div>
    <div><b>Big room</b> prices are Royal’s online total for the first ${Math.min(4, N)} guests in a category that sleeps ${Math.max(N, 5)} or more. Royal won’t book more than 4 per room online, so call to add the rest; the phone quote will be higher.</div>
    <div><b>Room numbers</b> are the open rooms in that category. <b>5+</b> means Royal’s deck plan marks the room for 5 or more guests; rooms Royal marks for 4 or fewer are left out. Royal doesn’t publish whether a 5+ room takes 5 or 6. <b>iCruise</b> is a third-party site’s per-room capacity, shown as a hint: it’s unverified and sometimes wrong. Confirm the exact room by phone.</div>
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
  const lines = [['Sail date', 'Ship', 'Class', 'Itinerary', 'Port', 'Nights', 'Cheapest big room', 'Big room type', 'Big rooms open', 'Big room numbers (Royal mark / iCruise)', 'Cheapest connecting pair', 'Connecting type', 'Connecting by deck', 'Connecting pairs'].map(q).join(',')];
  view().forEach((r) => lines.push([r.date, r.ship, r.shipClass, r.itin, r.port, r.nights, r.famBest ? Math.round(r.famBest) : '', r.famL[0] ? r.famL[0].name : '', r.famL.map((f) => `${f.name} (${f.checked ? f.rooms.length : f.avail} left)`).join('; '),
    r.famL.map((f) => (f.rooms || []).map((x) => { const v = IC[icKey(r.ship, x.n)]; return `${x.n} ${x.occ}${v && v.n ? ' / iCruise ' + v.n : ''}`; }).join(', ')).filter(Boolean).join('; '),
    r.connBest ? Math.round(r.connBest) : '', r.connL[0] ? r.connL[0].name : '', (r.connDecks || []).map((d) => `Deck ${d.deck}: ${d.left}`).join('; '), (r.pairs || []).join('; ')].map(q).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = 'cabin-finder-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
};

// ---------- iCruise per-room capacity (third-party hint) ----------
let IC = {}; const icQueue = new Map(); let icRunning = false;
const shipSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const icKey = (ship, n) => shipSlug(ship) + '|' + n;
function icLabel(ship, n, N) {
  const v = IC[icKey(ship, n)];
  if (v === undefined) { icQueue.set(icKey(ship, n), { ship, n }); kickIc(); return '<span class="ic pending" title="Looking up on iCruise">iCruise …</span>'; }
  if (v === null || v.n == null) return '<span class="ic none" title="iCruise has no capacity for this room">iCruise –</span>';
  return `<span class="ic ${v.n >= N ? 'ok' : 'short'}" title="iCruise says this room sleeps up to ${v.n} (third-party, unverified)">iCruise ${v.n}</span>`;
}
async function icFetch(ship, n) {
  for (const host of ['https://www.icruise.com', 'https://m.icruise.com']) {
    try {
      const r = await fetch(`${host}/cabins/royal-caribbean-cruises-${shipSlug(ship)}-cabin-${encodeURIComponent(n)}.html`, { credentials: 'omit' });
      if (!r.ok) continue;
      const m = (await r.text()).match(/accommodate up to\s*(\d+)\s*guests/i);
      return { n: m ? +m[1] : null, at: Date.now() };
    } catch (e) { /* try the other host */ }
  }
  return null;
}
async function kickIc() {
  if (icRunning) return; icRunning = true;
  let since = 0;
  while (icQueue.size) {
    const [k, job] = icQueue.entries().next().value; icQueue.delete(k);
    if (IC[k] !== undefined) continue;
    IC[k] = await icFetch(job.ship, job.n);
    since++;
    if (since >= 4 || !icQueue.size) { since = 0; await store.set({ icruise: IC }); render(); }
    await new Promise((r) => setTimeout(r, 400));
  }
  icRunning = false;
}

// ---------- saved scans ----------
const PHASE = { done: ['Complete', ''], cancelled: ['Stopped early', 'warn'], error: ['Stopped (error)', 'warn'], interrupted: ['Interrupted', 'warn'], scan: ['Running', 'run'], search: ['Running', 'run'] };
const PHASE_NOTE = { cancelled: ' (stopped early)', error: ' (stopped by an error)', interrupted: ' (interrupted; partial results)' };
const summarize = (rows) => {
  let fam = 0, conn = 0, minFam = null, minConn = null;
  rows.forEach((r) => {
    if ((r.fam || []).length) { fam++; r.fam.forEach((f) => { if (f.price && (minFam == null || f.price < minFam)) minFam = f.price; }); }
    if ((r.conn || []).length) { conn++; r.conn.forEach((c) => { if (c.price && (minConn == null || c.price * 2 < minConn)) minConn = c.price * 2; }); }
  });
  return { fam, conn, minFam, minConn };
};
const when = (t) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
function viewing() {
  if (!META) return;
  const e = INDEX.find((x) => x.id === META.id) || META;
  const [ph] = PHASE[e.phase] || ['', ''];
  $('#viewing').innerHTML = `Viewing <b>${esc(e.label || 'Scan')}</b> · ${when(e.started || META.when)} · ${ph}${e.total ? ` · ${e.done} of ${e.total} sailings` : ''}`;
}
function renderSaved() {
  const list = INDEX.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.started - a.started);
  $('#saved-count').textContent = list.length ? `${list.length} saved` : '';
  if (!list.length) { $('#saved-list').innerHTML = '<p class="muted">No saved scans yet. Run a scan and it will show up here.</p>'; return; }
  $('#saved-list').innerHTML = list.map((e) => {
    const [ph, cls] = PHASE[e.phase] || [e.phase, ''];
    const live = e.id === LIVE_ID;
    const bits = [when(e.started), e.total ? `${e.done} of ${e.total} sailings` : `${e.done || 0} sailings`];
    if (e.fam) bits.push(`${e.fam} with a big room, from ${money(e.minFam)}`);
    if (e.conn) bits.push(`${e.conn} with connecting, from ${money(e.minConn)}`);
    return `<div class="si${e.id === VIEW_ID ? ' current' : ''}" data-id="${e.id}">
      <div class="si-main"><button class="si-name" data-act="open" title="Open these results">${esc(e.label || 'Scan')}</button>
        <span class="tag ${cls}">${live ? 'Running' : ph}</span>${e.pinned ? '<span class="tag pin">Pinned</span>' : ''}${e.imported ? '<span class="tag">Imported</span>' : ''}
        <div class="sub">${bits.map(esc).join(' · ')}</div></div>
      <div class="si-acts">
        <button data-act="open">Open</button>
        <button data-act="reuse" title="Put this scan’s settings back in the search form">Use settings</button>
        <button data-act="rename">Rename</button>
        <button data-act="pin">${e.pinned ? 'Unpin' : 'Pin'}</button>
        <button data-act="export" title="Download this scan to open on another computer">Export</button>
        ${live ? '' : '<button data-act="delete" class="danger">Delete</button>'}
      </div></div>`;
  }).join('');
}
async function openSaved(id) {
  const e = INDEX.find((x) => x.id === id);
  if (!e) return;
  hideError();
  const rows = (await store.get(rowsKey(id)))[rowsKey(id)] || [];
  loadRows(rows, metaOf(e));
  if (e.error && !isRunning(e)) showError(e.error);
}
async function updIndex(id, fn) {
  const { savedIndex = [] } = await store.get('savedIndex');
  const e = savedIndex.find((x) => x.id === id);
  if (e) fn(e);
  await store.set({ savedIndex });
}
let delArmed = null;
$('#saved-list').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-act]'); if (!btn) return;
  const id = +btn.closest('.si').dataset.id, e = INDEX.find((x) => x.id === id); if (!e) return;
  const act = btn.dataset.act;
  if (act === 'open') { await openSaved(id); $('#results').scrollIntoView({ behavior: 'smooth' }); }
  if (act === 'reuse') { await store.set({ lastSearch: { ...e.search, label: '' } }); await renderForm(); $('#label').value = ''; $('#search').scrollIntoView({ behavior: 'smooth' }); $('#estimate').textContent = `Loaded the settings from “${e.label}”. Change anything you like, then Scan.`; }
  if (act === 'pin') await updIndex(id, (x) => (x.pinned = !x.pinned));
  if (act === 'rename') {
    const main = btn.closest('.si').querySelector('.si-name');
    const inp = document.createElement('input'); inp.type = 'text'; inp.value = e.label || ''; inp.setAttribute('aria-label', 'Scan name');
    main.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const finish = async (keep) => { if (done) return; done = true; const v = inp.value.trim(); if (keep && v && v !== e.label) { await updIndex(id, (x) => (x.label = v)); if (META && META.id === id) { META.label = v; render(); } } else renderSaved(); viewing(); };
    inp.addEventListener('keydown', (k) => { if (k.key === 'Enter') finish(true); if (k.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
  }
  if (act === 'export') {
    const rows = (await store.get(rowsKey(id)))[rowsKey(id)] || [];
    const { pinned, ...meta } = e;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ type: 'family-cabin-finder-scan', version: 1, meta, rows })], { type: 'application/json' }));
    a.download = 'cabin-scan-' + (e.label || 'scan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) + '-' + new Date(e.started).toISOString().slice(0, 10) + '.json';
    a.click();
  }
  if (act === 'delete') {
    if (delArmed !== id) { delArmed = id; btn.textContent = 'Click again to delete'; btn.classList.add('armed'); setTimeout(() => { if (delArmed === id) { delArmed = null; renderSaved(); } }, 5000); return; }
    delArmed = null;
    const { savedIndex = [] } = await store.get('savedIndex');
    await store.set({ savedIndex: savedIndex.filter((x) => x.id !== id) });
    await store.remove(rowsKey(id));
    if (VIEW_ID === id) { VIEW_ID = null; META = null; $('#results').hidden = true; hideError(); }
  }
});
$('#btn-import').onclick = () => $('#import-file').click();
$('#import-file').onchange = async () => {
  const files = [...$('#import-file').files]; $('#import-file').value = '';
  let ok = 0, bad = [], last = null;
  for (const f of files) {
    try {
      const d = JSON.parse(await f.text());
      if (d.type !== 'family-cabin-finder-scan' || !Array.isArray(d.rows) || !d.meta) throw new Error('not a scan file');
      const { savedIndex = [] } = await store.get('savedIndex');
      let id = d.meta.id || Date.now();
      if (savedIndex.some((x) => x.id === id)) { // already here: replace it with the imported copy only if it's the same scan
        const same = savedIndex.find((x) => x.id === id);
        if (same.started !== d.meta.started) id = Date.now() + ok;
      }
      const phase = d.meta.phase === 'scan' || d.meta.phase === 'search' ? 'interrupted' : d.meta.phase;
      const entry = { ...d.meta, ...summarize(d.rows), id, phase, done: d.meta.done != null ? d.meta.done : d.rows.length, imported: true, pinned: true };
      await store.set({ [rowsKey(id)]: d.rows, savedIndex: [entry, ...savedIndex.filter((x) => x.id !== id)] });
      ok++; last = id;
    } catch (e) { bad.push(f.name); }
  }
  INDEX = (await store.get('savedIndex')).savedIndex || [];
  if (last) await openSaved(last);
  if (bad.length) showError(`Couldn’t import ${bad.join(', ')}: not a Cabin Finder scan file.`);
  else if (ok) $('#estimate').textContent = `Imported ${ok} scan${ok === 1 ? '' : 's'} (pinned so they aren’t auto-removed).`;
};

// One-time move from the old "Past scans" list (last 8 finished scans) to saved scans.
async function migrate() {
  const { history, results, scan, savedIndex } = await store.get(['history', 'results', 'scan', 'savedIndex']);
  if (!history && !results) return;
  const idx = savedIndex || [], put = {};
  (history || []).forEach((h) => {
    if (idx.some((x) => x.id === h.id)) return;
    put[rowsKey(h.id)] = h.rows || [];
    idx.push({ id: h.id, label: h.label, search: h.search, started: h.id, finished: h.finished, phase: h.phase, done: (h.rows || []).length, total: (h.rows || []).length, pinned: false, ...summarize(h.rows || []) });
  });
  // a scan that was cut off before it could be saved to the old list
  if (scan && results && results.length && !idx.some((x) => x.id === scan.id)) {
    put[rowsKey(scan.id)] = results;
    idx.push({ id: scan.id, label: scan.label, search: scan.search, started: scan.started, finished: scan.finished || null, phase: scan.phase === 'done' || scan.phase === 'cancelled' ? scan.phase : 'interrupted', done: results.length, total: scan.total, pinned: false, ...summarize(results) });
  }
  await store.set({ ...put, savedIndex: idx });
  await store.remove(['history', 'results']);
}
// Marks scans that died without finishing (Chrome closed, crash) as interrupted.
async function sweepStale() {
  const { scan, savedIndex = [] } = await store.get(['scan', 'savedIndex']);
  let changed = false;
  savedIndex.forEach((e) => {
    if ((e.phase === 'scan' || e.phase === 'search') && !(scan && scan.id === e.id && isRunning(scan))) {
      e.phase = 'interrupted'; e.error = 'This scan stopped before finishing (Chrome or the Royal tab closed). Results so far are saved.'; changed = true;
    }
  });
  if (changed) await store.set({ savedIndex });
  if (scan && (scan.phase === 'scan' || scan.phase === 'search') && !isRunning(scan)) await store.set({ scan: { ...scan, phase: 'interrupted' } });
  return savedIndex;
}

// ---------- start ----------
(async () => {
  IC = (await store.get('icruise')).icruise || {};
  await loadFilters(false);
  await migrate();
  INDEX = await sweepStale();
  const { scan } = await store.get('scan');
  onScan(scan);
  renderSaved();
  const live = scan && isRunning(scan) && INDEX.find((x) => x.id === scan.id);
  const newest = INDEX.slice().sort((a, b) => b.started - a.started)[0];
  if (live) await openSaved(scan.id); else if (newest) await openSaved(newest.id);
  setInterval(async () => { const { scan } = await store.get('scan'); if (scan && (scan.phase === 'scan' || scan.phase === 'search') && !isRunning(scan)) { INDEX = await sweepStale(); onScan((await store.get('scan')).scan); renderSaved(); } }, 60e3);
})();
