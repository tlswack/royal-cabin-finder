// Runs inside a royalcaribbean.com tab (extension content-script world).
// Talks to the same endpoints Royal's own site uses, from the browser's real session.
if (!window.__fcf) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const CLS = ['INTERIOR', 'OUTSIDE', 'BALCONY', 'DELUXE'];

  const Q_SEARCH = `query FcfSearch($filters: String, $sort: CruiseSearchSort, $pagination: CruiseSearchPagination) {
    cruiseSearch(filters: $filters, sort: $sort, pagination: $pagination) {
      results { total cruises { id masterSailing { itinerary { name totalNights
        departurePort { code name } ship { code name } destination { code name } } }
        sailings { bookingLink sailDate } } } } }`;
  const Q_FILTERS = `query FcfFilters { cruiseSearch { filters { key facets { code count }
    ... on CruiseDateRangeFilter { startDate endDate }
    ... on CruiseGroupListFilter { groups { code label options { code label } } }
    ... on CruiseListFilter { options { code label } } } } }`;

  async function gql(query, variables) {
    const r = await fetch('/cruises/graph', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: variables || {} }) });
    if (!r.ok) throw new Error('Royal search returned ' + r.status);
    const j = await r.json();
    if (j.errors && !j.data) throw new Error('Royal search error: ' + j.errors[0].message);
    return j.data;
  }

  // Booking pages embed their data as a React Server Components stream.
  async function page(url) {
    const r = await fetch(url, { credentials: 'include' });
    const t = await r.text();
    const m = [...t.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map((x) => JSON.parse('"' + x[1] + '"')).join('');
    return { status: r.status, m };
  }
  function grab(m, start) {
    let d = 0, inS = false, esc = false;
    for (let j = start; j < m.length; j++) {
      const c = m[j];
      if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue; }
      if (c === '"') { inS = true; continue; }
      if (c === '[' || c === '{') d++;
      else if (c === ']' || c === '}') { d--; if (d === 0) return m.slice(start, j + 1); }
    }
  }
  function all(m, key) {
    const out = []; let i = -1;
    while ((i = m.indexOf('"' + key + '":', i + 1)) >= 0) {
      const s = i + key.length + 3, ch = m[s];
      if (ch === '[' || ch === '{') { try { out.push(JSON.parse(grab(m, s))); } catch (e) {} }
    }
    return out;
  }
  function roomUrl(link, path, rooms, extra) {
    extra = extra || {};
    const b = new URL(link, location.origin);
    const u = new URL('/room-selection/' + path, location.origin);
    ['groupId', 'sailDate', 'shipCode', 'packageCode', 'destinationCode'].forEach((k) => { if (b.searchParams.get(k)) u.searchParams.set(k, b.searchParams.get(k)); });
    u.searchParams.set('selectedCurrencyCode', 'USD'); u.searchParams.set('country', 'USA');
    u.searchParams.set('cabinClassType', extra.cls || 'INTERIOR'); u.searchParams.set('roomIndex', '0');
    rooms.forEach((r, i) => {
      const p = 'r' + i;
      u.searchParams.set(p + 'a', r[0]); u.searchParams.set(p + 'c', r[1]);
      ['b', 'r', 's', 'q', 't'].forEach((x) => u.searchParams.set(p + x, 'n'));
      u.searchParams.set(p + 'd', extra.cls || 'INTERIOR'); u.searchParams.set(p + 'D', 'y');
    });
    u.searchParams.set('rgVisited', 'true'); u.searchParams.set('r0C', 'y');
    if (extra.sub) { u.searchParams.set('r0e', extra.sub); u.searchParams.set('r0f', extra.cat); u.searchParams.set('r0L', 'n'); u.searchParams.set('r0J', 'y'); }
    return u.toString();
  }
  function maxOcc(s) {
    const f = (s.features || []).find((f) => f.code === 'occupancy');
    const mm = f && f.lines.join(' ').match(/(\d+)\s*guests/);
    return mm ? +mm[1] : null;
  }
  function subtypes(m) {
    return all(m, 'stateroomSubtypes').filter(Array.isArray).slice(0, 4).flatMap((arr, i) => arr.map((s) => ({
      cls: CLS[i], cat: s.categoryCode, sub: s.code, name: s.name, conn: !!s.connecting, guar: !!s.guarantee,
      total: s.pricing && s.pricing.invoice && s.pricing.invoice.total,
      avail: +((JSON.stringify(s).match(/"stateroomsAvailable":(\d+)/) || [])[1] || 0) || null,
      maxOcc: maxOcc(s),
    })));
  }

  // Party -> what to ask Royal for. Online booking caps a room at 4 guests.
  function plan(party) {
    const A = Math.max(1, +party.adults || 2), K = Math.max(0, +party.kids || 0), N = A + K;
    const a1 = Math.min(A, 2), one = [a1, Math.min(K, 4 - a1)];
    let two = null;
    if (A >= 2) {
      const r0 = [Math.ceil(A / 2), Math.ceil(K / 2)], r1 = [Math.floor(A / 2), Math.floor(K / 2)];
      r0[1] = Math.min(r0[1], 4 - r0[0]); r1[1] = Math.min(r1[1], 4 - r1[0]);
      two = [r0, r1];
    }
    return { N, one, two };
  }

  function filterString(f) {
    const parts = [];
    if (f.destinations && f.destinations.length) parts.push('destination:' + f.destinations.join(','));
    if (f.ports && f.ports.length) parts.push('departurePort:' + f.ports.join(','));
    if (f.ships && f.ships.length) parts.push('ship:' + f.ships.join(','));
    const from = (f.from || '2027-01') + '-01';
    const [ty, tm] = (f.to || f.from || '2027-12').split('-').map(Number);
    const to = f.to ? `${ty}-${String(tm).padStart(2, '0')}-${String(new Date(ty, tm, 0).getDate()).padStart(2, '0')}` : '';
    parts.push('startDate:' + from + '~' + to);
    if (f.nightsMin || f.nightsMax) parts.push('nights:' + (f.nightsMin || 1) + '~' + (f.nightsMax || 30));
    return { str: parts.join('|'), from, to };
  }

  async function sailings(f) {
    const { str, from, to } = filterString(f);
    const out = []; let itins = 0;
    for (let skip = 0; skip < 2000; skip += 100) {
      const d = await gql(Q_SEARCH, { filters: str, sort: { by: 'PRICE', order: 'ASC' }, pagination: { count: 100, skip } });
      const res = d.cruiseSearch.results; itins = res.total;
      for (const c of res.cruises) {
        const it = c.masterSailing.itinerary;
        for (const s of c.sailings) {
          if (s.sailDate < from || (to && s.sailDate > to)) continue;
          out.push({ ship: it.ship.name, shipCode: it.ship.code, itin: it.name, port: it.departurePort && it.departurePort.name, portCode: it.departurePort && it.departurePort.code,
            dest: it.destination && it.destination.name, nights: it.totalNights, date: s.sailDate, link: s.bookingLink });
        }
      }
      if (skip + 100 >= res.total) break;
      await sleep(300);
    }
    const seen = new Set();
    return { itins, list: out.filter((s) => { const k = s.shipCode + s.date + s.itin; if (seen.has(k)) return false; seen.add(k); return true; }) };
  }

  async function filters() {
    const d = await gql(Q_FILTERS);
    const fl = d.cruiseSearch.filters, g = (k) => fl.find((x) => x.key === k) || {};
    const cnt = (k) => Object.fromEntries((g(k).facets || []).map((x) => [x.code, x.count]));
    const dc = cnt('destination'), sc = cnt('ship'), pc = cnt('departurePort');
    return {
      destinations: (g('destination').options || []).map((o) => ({ code: o.code, label: o.label, count: dc[o.code] || 0 })),
      ships: (g('ship').options || []).map((o) => ({ code: o.code, label: o.label, count: sc[o.code] || 0 })),
      portGroups: (g('departurePort').groups || []).map((gr) => ({ code: gr.code, label: gr.label, ports: gr.options.map((o) => ({ code: o.code, label: o.label.trim(), count: pc[o.code] || 0 })) })),
      months: (g('startDate').facets || []).map((x) => x.code).sort(),
      nights: { min: g('nights').min, max: g('nights').max },
      fetchedAt: Date.now(),
    };
  }

  // ---------- room-level capacity ----------
  // Royal's JSON rooms endpoint lists open rooms for a category, one deck at a time.
  async function roomsApi(link, req, deckCode) {
    const b = new URL(link, location.origin);
    const filter = {
      countryCode: 'USA', packageId: b.searchParams.get('packageCode'), sailDate: b.searchParams.get('sailDate'),
      currencyCode: 'USD', language: 'en', options: true, roomNumbers: true,
      rooms: [{ ...req, accessible: false, selectionFallbackStrategy: 'RECOMMENDATION', taxesAndFeesBundled: true, ...(deckCode ? { room: { deckCode } } : {}) }],
    };
    const r = await fetch('/room-selection/api/v1/rooms?' + new URLSearchParams({ filter: JSON.stringify(filter) }), { credentials: 'include', headers: { brand: 'R', 'content-type': 'application/json', country: 'USA' } });
    if (!r.ok) throw new Error('rooms ' + r.status);
    const j = await r.json();
    const rn = j.rooms && j.rooms[0] && j.rooms[0].roomNumbers;
    return {
      decks: (rn && rn.decks) || [],
      cabins: ((rn && rn.categories) || []).flatMap((c) => c.cabins || []).map((c) => c.cabinNumber),
    };
  }

  // Each deck plan (SVG) marks rooms with Royal's capacity icons: triangle = up to 3,
  // asterisk = up to 4, a boxed "5+" = 5 and up. The box is drawn as separate line strokes.
  const svgCache = {};
  async function deckCapacity(url) {
    if (svgCache[url]) return svgCache[url];
    const key = 'svgocc:' + url;
    const stored = (await chrome.storage.local.get(key))[key];
    if (stored) return (svgCache[url] = stored);
    const t = await (await fetch(url, { credentials: 'include' })).text();
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-99999px;top:0;width:3000px;height:3000px;visibility:hidden';
    host.innerHTML = t.replace(/^[\s\S]*?(<svg)/, '$1');
    document.documentElement.appendChild(host);
    const out = {};
    try {
      const svg = host.querySelector('svg');
      // Older ships name the layer ROOM_ATTRIBUTES; Icon class uses ROOMS_ATTRIBUTES_<hash>.
      const ra = svg && [...svg.querySelectorAll('g[id]')].find((g) => /^ROOMS?_ATTRIBUTES/.test(g.id));
      const leaves = [];
      const walk = (el) => { if (el.tagName === 'g' && el.children.length > 1) [...el.children].forEach(walk); else leaves.push(el); };
      if (ra) [...ra.children].forEach(walk);
      const icons = leaves.map((el) => { const b = el.getBBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }; });
      [...svg.querySelectorAll('[id]')].filter((e) => /^R\d{3,5}$/.test(e.id)).forEach((room) => {
        const bb = room.getBBox();
        const ins = icons.filter((i) => i.x >= bb.x && i.x <= bb.x + bb.width && i.y >= bb.y && i.y <= bb.y + bb.height);
        const hLine = ins.some((i) => i.w >= 1.5 && i.h <= 0.35), vLine = ins.some((i) => i.h >= 1.5 && i.w <= 0.35);
        // Only call a room "4" on a clear asterisk; anything ambiguous stays unknown so it is never dropped.
        // 5+ is either a box drawn from line strokes (older ships) or a solid square badge ~3.3 units (Icon class).
        const badge = ins.some((i) => i.w >= 2.8 && i.w <= 4 && i.h >= 2.8 && i.h <= 4 && Math.abs(i.w - i.h) < 0.5);
        const asterisk = ins.some((i) => i.w >= 1.3 && i.w <= 1.95 && i.h >= 1.3 && i.h <= 1.95 && Math.abs(i.w - i.h) < 0.35);
        let occ = '';
        if ((ins.length >= 4 && hLine && vLine) || badge) occ = '5+';
        else if (asterisk && !ins.some((i) => i.w >= 2.0 && i.h >= 2.0)) occ = '4';
        out[room.id.slice(1)] = occ;
      });
    } finally { host.remove(); }
    svgCache[url] = out;
    await chrome.storage.local.set({ [key]: out });
    return out;
  }

  // For a big-room category: every open room on every deck, with Royal's capacity mark.
  async function openRooms(link, req) {
    const first = await roomsApi(link, req);
    const decks = first.decks.length ? first.decks : [{ code: null, selected: true }];
    const rooms = [];
    for (const d of decks) {
      if (d.roomsLeft === 0) continue;
      const list = d.selected ? first.cabins : (await sleep(250), (await roomsApi(link, req, d.code)).cabins);
      const occ = d.deckPlanUrl ? await deckCapacity(d.deckPlanUrl).catch(() => ({})) : {};
      list.forEach((n) => rooms.push({ n, deck: d.number, occ: occ[n] || '?' }));
    }
    return rooms;
  }

  // Saved scans: one storage key per scan ("scan:<id>") holding its rows, plus a small
  // "savedIndex" list describing each scan. Rows are saved after every sailing, so a scan
  // that's stopped, crashes or loses its tab keeps everything it found.
  const KEEP_UNPINNED = 30;
  const summarize = (rows) => {
    let fam = 0, conn = 0, minFam = null, minConn = null;
    rows.forEach((r) => {
      if ((r.fam || []).length) { fam++; r.fam.forEach((f) => { if (f.price && (minFam == null || f.price < minFam)) minFam = f.price; }); }
      if ((r.conn || []).length) { conn++; r.conn.forEach((c) => { if (c.price && (minConn == null || c.price * 2 < minConn)) minConn = c.price * 2; }); }
    });
    return { fam, conn, minFam, minConn };
  };

  let running = false;
  async function scan(search) {
    if (running) return { error: 'A scan is already running.' };
    running = true;
    const st = { id: Date.now(), phase: 'search', done: 0, total: 0, label: search.label || '', search, started: Date.now() };
    const key = 'scan:' + st.id;
    const results = [];
    let gone = false; // the user deleted this scan while it was running
    const save = () => chrome.storage.local.set({ scan: { ...st, beat: Date.now() } });
    const saveRows = () => gone ? null : chrome.storage.local.set({ [key]: results });
    async function saveIndex(first) {
      if (gone) return;
      const { savedIndex = [] } = await chrome.storage.local.get('savedIndex');
      const i = savedIndex.findIndex((x) => x.id === st.id);
      if (i < 0 && !first) { gone = true; await chrome.storage.local.remove(key); return; }
      const prog = { phase: st.phase, done: st.done, total: st.total, finished: st.finished || null, error: st.error || null, beat: Date.now(), ...summarize(results) };
      let list = savedIndex;
      if (i < 0) {
        list = [{ id: st.id, label: st.label, search, started: st.started, pinned: false, ...prog }, ...savedIndex];
        const unpinned = list.filter((x) => !x.pinned).sort((a, b) => b.started - a.started);
        const drop = new Set(unpinned.slice(KEEP_UNPINNED).map((x) => x.id));
        if (drop.size) { list = list.filter((x) => !drop.has(x.id)); await chrome.storage.local.remove([...drop].map((id) => 'scan:' + id)); }
      } else list[i] = { ...list[i], ...prog }; // keeps the user's name and pin
      await chrome.storage.local.set({ savedIndex: list });
    }
    await chrome.storage.local.set({ cancel: false, [key]: [] });
    await save(); await saveIndex(true);
    try {
      const p = plan(search.party || {});
      const { list } = await sailings(search.filters || {});
      st.total = list.length; st.phase = 'scan'; await save(); await saveIndex();
      let badPages = 0;
      for (const s of list) {
        if ((await chrome.storage.local.get('cancel')).cancel) { st.phase = 'cancelled'; break; }
        const row = { ...s, n: p.N };
        try {
          let a = await page(roomUrl(s.link, 'type-and-subtype', [p.one]));
          if (a.status === 403 || a.status === 429) { await sleep(30000); a = await page(roomUrl(s.link, 'type-and-subtype', [p.one])); }
          if (a.status === 403 || a.status === 429) throw Object.assign(new Error('blocked'), { fatal: 'Royal started refusing requests (status ' + a.status + '). Wait an hour, then scan again.' });
          const A = subtypes(a.m);
          if (!A.length) { badPages++; row.soldOut = true; } else badPages = 0;
          if (badPages >= 8) throw Object.assign(new Error('format'), { fatal: 'Royal’s booking pages didn’t contain room data for 8 sailings in a row. Their page format may have changed and the extension needs an update.' });
          const famCats = A.filter((x) => x.maxOcc && x.maxOcc >= Math.max(p.N, 5) && !x.guar && x.avail);
          row.fam = [];
          for (const x of famCats) {
            const f = { cls: x.cls, cat: x.cat, name: x.name, maxOcc: x.maxOcc, avail: x.avail, price: x.total };
            try {
              await sleep(300);
              const rooms = await openRooms(s.link, { adultCount: p.one[0], childCount: p.one[1], stateroomTypeCode: x.cls, stateroomSubtypeCode: x.sub, categoryCode: x.cat });
              if (rooms.length) {
                f.rooms = rooms.filter((r) => r.occ !== '3' && r.occ !== '4');
                f.dropped = rooms.length - f.rooms.length;
                f.checked = true;
              } else f.checked = false; // nothing came back: keep the category, unverified
            } catch (e) { f.checked = false; }
            if (f.checked && !f.rooms.length) { row.famExcluded = (row.famExcluded || 0) + 1; continue; }
            row.fam.push(f);
          }
          row.cheapest = A.filter((x) => x.total).reduce((m, x) => Math.min(m, x.total), Infinity);
          if (row.cheapest === Infinity) row.cheapest = null;
          if (p.two && A.length) {
            await sleep(400);
            const b = await page(roomUrl(s.link, 'type-and-subtype', p.two));
            const B = subtypes(b.m);
            row.conn = B.filter((x) => x.conn).map((x) => ({ cls: x.cls, cat: x.cat, sub: x.sub, name: x.name, avail: x.avail, price: x.total })).sort((x, y) => x.price - y.price);
            const c0 = row.conn[0];
            if (c0) {
              await sleep(400);
              const c = await page(roomUrl(s.link, 'room-location', p.two, { cls: c0.cls, sub: c0.sub, cat: c0.cat }));
              const decks = all(c.m, 'decks').filter(Array.isArray)[0] || [];
              row.connDecks = decks.filter((d) => d.connectingRoomsLeft).map((d) => ({ deck: d.number, left: d.connectingRoomsLeft }));
              const cabins = all(c.m, 'cabins').filter((x) => Array.isArray(x) && x.length && x[0].cabinNumber).flat();
              const seen = new Set(), open = new Set(cabins.map((x) => x.cabinNumber)); row.pairs = [];
              cabins.forEach((x) => { if (x.connectingCabin && open.has(x.connectingCabin.cabinNumber)) { const k = [x.cabinNumber, x.connectingCabin.cabinNumber].sort().join('–'); if (!seen.has(k)) { seen.add(k); row.pairs.push(k + ' ' + ({ FW: 'fwd', AF: 'aft', MS: 'mid' }[x.positionCode] || x.positionCode || '')); } } });
              row.pairsCat = c0.cat;
            }
          }
          row.urlOne = roomUrl(s.link, 'type-and-subtype', [p.one]);
          if (p.two) row.urlTwo = roomUrl(s.link, 'type-and-subtype', p.two);
        } catch (e) {
          if (e.fatal) { st.phase = 'error'; st.error = e.fatal; break; }
          row.err = String(e && e.message || e).slice(0, 120);
        }
        results.push(row); st.done++;
        await saveRows(); await save();
        if (st.done % 3 === 0) await saveIndex();
        await sleep(500);
      }
      if (st.phase === 'scan') st.phase = 'done';
    } catch (e) {
      st.phase = 'error'; st.error = String(e && e.message || e);
    }
    st.finished = Date.now();
    await saveRows(); await save(); await saveIndex();
    running = false;
    return { ok: true };
  }

  window.__fcf = {
    async run(cmd, payload) {
      if (cmd === 'filters') return filters();
      payload = payload || {};
      if (cmd === 'count') { const r = await sailings(payload.filters || {}); return { sailings: r.list.length, itineraries: r.itins }; }
      if (cmd === 'scan') { scan(payload); return { started: true }; }
    },
  };
}
