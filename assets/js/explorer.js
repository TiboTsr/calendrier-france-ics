/**
 * explorer.js — Sidebar, radar, timeline et modal événement
 * Refonte UX complète :
 *  - Modal : label "Cette occurrence", nav visuelle, compteur, lien event, couleur catégorie
 *  - Radar : couleur catégorie sur les cards, badge délai, en cours bien distincts
 *  - Timeline : badge "En cours" visible, zones lisibles (Alsace-Moselle), tags améliorés
 *  - Labels : AM → Alsace-Moselle dans toutes les pills
 */

const CHUNK = 3;

const LS = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v !== null ? v : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch {}
  },
  getJson(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  setJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

function formatEventDescriptionHtml(value) {
  if (!value) return "<i style='color:var(--t3)'>Aucune description.</i>";
  return escHtml(value).replace(/\n/g, '<br>');
}

/* ── Zone label lisible ──────────────────────────────── */
function zoneLabel(z) {
  if (z === 'AM') return 'Alsace-Moselle';
  return `Zone ${z}`;
}

/* ── Helpers couleur catégorie ──────────────────────── */
function _applyCatStyle(el, cat, active) {
  const def = cd(cat);
  if (active) {
    el.style.borderColor = def.b;
    el.style.background  = def.d;
    el.style.color       = def.c;
    el.style.opacity     = '1';
  } else {
    el.style.borderColor = 'var(--b)';
    el.style.background  = 'var(--bg2)';
    el.style.color       = 'var(--t3)';
    el.style.opacity     = '0.45';
  }
  const dot = el.querySelector('.sc-dot');
  if (dot) dot.style.background = def.c;
}

/* ── Sidebar — catégories ───────────────────────────── */
function getSelCats() {
  return [...document.querySelectorAll('#sb-cats .scat.active')].map(el => el.dataset.cat);
}

function buildSbCats(cats) {
  const counts = new Map();
  STATE.srcEvts.forEach(e => (e.categories || []).forEach(c => counts.set(c, (counts.get(c) || 0) + 1)));
  const g = document.getElementById('sb-cats'); g.innerHTML = '';
  cats.forEach(cat => {
    const def = cd(cat);
    const el  = document.createElement('div');
    el.className = 'scat active'; el.dataset.cat = cat;
    el.innerHTML = `<input type="checkbox" checked style="display:none"><span class="sc-dot" style="background:${def.c}"></span><span class="sc-name">${escHtml(cat)}</span><span class="sc-cnt">${counts.get(cat) || 0}</span>`;
    _applyCatStyle(el, cat, true);
    el.addEventListener('click', () => {
      el.classList.toggle('active');
      const isActive = el.classList.contains('active');
      _applyCatStyle(el, cat, isActive);
      LS.setJson(KEYS.favs, getSelCats());
      STATE.renderedMonths = 0; refreshAll();
    });
    g.appendChild(el);
  });
  const saved = LS.getJson(KEYS.favs);
  if (Array.isArray(saved)) {
    const set = new Set(saved);
    g.querySelectorAll('.scat').forEach(el => {
      const active = set.has(el.dataset.cat);
      el.classList.toggle('active', active);
      _applyCatStyle(el, el.dataset.cat, active);
    });
  }
}

document.getElementById('sb-rst').addEventListener('click', () => {
  document.querySelectorAll('#sb-cats .scat').forEach(el => {
    el.classList.add('active');
    _applyCatStyle(el, el.dataset.cat, true);
  });
  LS.remove(KEYS.favs);
  STATE.renderedMonths = 0; refreshAll();
});

document.querySelectorAll('.szp').forEach(b => {
  b.addEventListener('click', () => {
    STATE.expZone = b.dataset.z;
    document.querySelectorAll('.szp').forEach(x => {
      x.className = 'szp';
      if (x.dataset.z === STATE.expZone) {
        if (STATE.expZone === 'all') x.classList.add('sall');
        else if (STATE.expZone === 'AM') x.classList.add('sam');
        else x.classList.add('s' + STATE.expZone.toLowerCase());
      }
    });
    STATE.renderedMonths = 0; refreshAll();
  });
});

document.getElementById('srch').addEventListener('input', () => { STATE.renderedMonths = 0; refreshAll(); });

/* ── Filtre ─────────────────────────────────────────── */
function getFiltered() {
  const search  = norm(document.getElementById('srch').value.trim());
  const selCats = new Set(getSelCats());
  return STATE.srcEvts.filter(e => {
    const cOk = (e.categories || []).some(c => selCats.has(c));
    const zOk = STATE.expZone === 'all' || !(e.zones || []).length || e.zones.includes(STATE.expZone);
    const sOk = !search || norm(e.summary).includes(search) || norm(e.description || '').includes(search);
    return cOk && zOk && sOk;
  }).map(e => ({ ...e, date: e._date, endDate: e._endDate }))
    .sort((a, b) => a.date - b.date || a.summary.localeCompare(b.summary, 'fr'));
}

function getFilteredUpcoming() {
  const search  = norm(document.getElementById('srch').value.trim());
  const selCats = new Set(getSelCats());
  return STATE.upcomingEvts.filter(e => {
    if (!e._date) return false;
    const cOk = (e.categories || []).some(c => selCats.has(c));
    const sOk = !search || norm(e.summary).includes(search);
    return cOk && sOk;
  }).map(e => ({ ...e, date: e._date, endDate: e._endDate }))
    .sort((a, b) => a.date - b.date);
}

/* ── Radar ──────────────────────────────────────────── */
function _dayDiff(from, to) {
  const a = new Date(from); a.setHours(0,0,0,0);
  const b = new Date(to);   b.setHours(0,0,0,0);
  return Math.round((b - a) / 86400000);
}

function _delayBadge(diffDays, def) {
  if (diffDays === 0) return `<span class="rc-delay rc-delay--now" style="background:${def.d};color:${def.c};border-color:${def.b}">Aujourd'hui</span>`;
  if (diffDays === 1) return `<span class="rc-delay rc-delay--soon" style="background:${def.d};color:${def.c};border-color:${def.b}">Demain</span>`;
  if (diffDays <= 7)  return `<span class="rc-delay rc-delay--soon" style="background:${def.d};color:${def.c};border-color:${def.b}">Dans ${diffDays}j</span>`;
  return `<span class="rc-delay" style="background:var(--bg3);color:var(--t3);border-color:var(--b)">Dans ${diffDays}j</span>`;
}

function _ongoingBadge(end, def) {
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = _dayDiff(today, end);
  if (diff === 0) return `<span class="rc-delay" style="background:var(--ambd);color:var(--amb);border-color:rgba(245,160,32,.3)">Termine ce soir</span>`;
  if (diff === 1) return `<span class="rc-delay" style="background:${def.d};color:${def.c};border-color:${def.b}">Encore 1j</span>`;
  return `<span class="rc-delay" style="background:${def.d};color:${def.c};border-color:${def.b}">Encore ${diff}j</span>`;
}

function renderRadar(evts) {
  const root       = document.getElementById('r-root');
  const cnt        = document.getElementById('r-cnt');
  const activeRoot = document.getElementById('r-active');
  const activeCnt  = document.getElementById('r-active-cnt');
  root.innerHTML = ''; activeRoot.innerHTML = '';

  const today = new Date(); today.setHours(0,0,0,0);
  const end30 = new Date(today); end30.setDate(end30.getDate() + 30);

  const upcoming = evts.filter(e => e.date >= today && e.date <= end30).slice(0, 10);
  const ongoing  = evts.filter(e => e.endDate && e.date < today && e.endDate >= today)
    .sort((a, b) => a.endDate - b.endDate).slice(0, 8);

  const countdownEl = document.getElementById('r-countdown');
  const heroEl      = document.getElementById('r-countdown-hero');
  const next = evts.find(e => e.date >= today);
  if (next && countdownEl) {
    const diff  = _dayDiff(today, next.date);
    const label = diff === 0 ? "Aujourd'hui !" : diff === 1 ? 'Demain !' : `Dans ${diff} jour${diff > 1 ? 's' : ''}`;
    const cat   = (next.categories && next.categories[0]) || 'Événement';
    const def   = cd(cat);
    const html  = `<span class="r-countdown-pill" style="background:${def.d};border-color:${def.b};color:${def.c}"><a href="#explorer"><i class="fa-solid fa-calendar-days"></i><strong> ${escHtml(label)}</strong></a><span style="opacity:.8">— ${escHtml(next.summary)}</span></span>`;
    countdownEl.innerHTML = html; countdownEl.style.display = 'block';
    if (heroEl) { heroEl.innerHTML = html; heroEl.style.display = 'block'; }
  } else {
    if (countdownEl) countdownEl.style.display = 'none';
    if (heroEl) heroEl.style.display = 'none';
  }

  /* À venir */
  if (!upcoming.length) {
    root.innerHTML = '<span class="radar-empty">Aucun événement dans les 30 prochains jours.</span>';
    cnt.textContent = '';
  } else {
    cnt.textContent = `${upcoming.length} en approche`;
    upcoming.forEach(e => {
      const cat   = (e.categories || [])[0] || 'Divers';
      const def   = cd(cat);
      const diff  = _dayDiff(today, e.date);
      const card  = document.createElement('div');
      card.className = 'rc';
      card.style.borderColor = def.b;
      card.innerHTML = `
        <div class="rc-cat-bar" style="background:${def.c}" title="${escHtml(cat)}"></div>
        <div class="rc-inner">
          <div class="rc-top-row">
            <div class="rc-date">${escHtml(fmts(e.date))}</div>
            ${_delayBadge(diff, def)}
          </div>
          <div class="rc-name">${escHtml(e.summary)}</div>
          <div class="rc-cat-label" style="color:${def.c};opacity:.75">${escHtml(cat)}</div>
        </div>`;
      card.addEventListener('click', () => openModal(e, STATE.allEvts));
      root.appendChild(card);
    });
  }

  /* En cours */
  if (!ongoing.length) {
    activeRoot.innerHTML = '<span class="radar-empty">Aucun événement long en cours.</span>';
    activeCnt.textContent = '';
  } else {
    activeCnt.textContent = `${ongoing.length} en cours`;
    ongoing.forEach(e => {
      const cat   = (e.categories || [])[0] || 'Divers';
      const def   = cd(cat);
      const card  = document.createElement('div');
      card.className = 'rc rc--ongoing';
      card.style.borderColor  = def.b;
      card.style.background   = def.d;
      card.innerHTML = `
        <div class="rc-cat-bar" style="background:${def.c}" title="${escHtml(cat)}"></div>
        <div class="rc-inner">
          <div class="rc-top-row">
            <div class="rc-ongoing-label"><i class="fa-solid fa-circle-dot" style="font-size:7px;margin-right:4px;color:${def.c}"></i><span style="color:${def.c};font-weight:700;font-size:10px;letter-spacing:.4px;text-transform:uppercase">En cours</span></div>
            ${_ongoingBadge(e.endDate, def)}
          </div>
          <div class="rc-name">${escHtml(e.summary)}</div>
          <div class="rc-cat-label" style="color:${def.c};opacity:.75">${escHtml(cat)}</div>
        </div>`;
      card.addEventListener('click', () => openModal(e, STATE.allEvts));
      activeRoot.appendChild(card);
    });
  }
}

/* ── Year nav ───────────────────────────────────────── */
function buildYrNav(years) {
  const sel = document.getElementById('yr-s'); sel.innerHTML = '';
  [...years].sort((a, b) => b - a).forEach(y => {
    const o = document.createElement('option'); o.value = y; o.textContent = String(y); sel.appendChild(o);
  });
  sel.value = String(STATE.curYear);
}

document.getElementById('yr-s').addEventListener('change', function () {
  STATE.curYear = Number(this.value); STATE.curMonth = 'all'; STATE.renderedMonths = 0; STATE.lastRefreshKey = '';
  LS.set(KEYS.year, String(STATE.curYear));
  renderTL();
});

document.getElementById('yr-p').addEventListener('click', () => shiftYear(-1));
document.getElementById('yr-n').addEventListener('click', () => shiftYear(1));

function shiftYear(d) {
  const opts = [...document.getElementById('yr-s').options].map(o => Number(o.value)).sort((a, b) => a - b);
  const i = opts.indexOf(STATE.curYear);
  const n = opts[Math.max(0, Math.min(opts.length - 1, i + d))];
  if (n !== STATE.curYear) {
    STATE.curYear = n; STATE.curMonth = 'all'; STATE.renderedMonths = 0; STATE.lastRefreshKey = '';
    document.getElementById('yr-s').value = String(STATE.curYear);
    LS.set(KEYS.year, String(STATE.curYear));
    renderTL();
  }
}

document.getElementById('btn-today').addEventListener('click', () => {
  STATE.curYear = new Date().getFullYear(); STATE.curMonth = 'all';
  STATE.showPast = false; STATE.renderedMonths = 0;
  document.getElementById('yr-s').value = String(STATE.curYear);
  LS.set(KEYS.year, String(STATE.curYear));
  refreshAll({ autoScrollToday: true });
});

/* ── Timeline ───────────────────────────────────────── */
function renderTL(opts = {}) {
  const root  = document.getElementById('ev-root');
  const moNav = document.getElementById('mo-nav');
  root.innerHTML = ''; moNav.innerHTML = '';

  if (window._tlObserver) { window._tlObserver.disconnect(); window._tlObserver = null; }

  const today  = new Date(); today.setHours(0,0,0,0);
  const thisYr = new Date().getFullYear();
  const yEvts  = STATE.allEvts.filter(e => e.date.getFullYear() === STATE.curYear);
  const yUpcoming = getFilteredUpcoming().filter(e => e.date.getFullYear() === STATE.curYear);

  const grp = new Map();
  yEvts.forEach(e => { const k = e.date.getMonth(); if (!grp.has(k)) grp.set(k, []); grp.get(k).push(e); });
  yUpcoming.forEach(e => { const k = e.date.getMonth(); if (!grp.has(k)) grp.set(k, []); grp.get(k).push(e); });

  const allEntries = [...grp.entries()].sort((a, b) => a[0] - b[0]);
  const isCurYr    = STATE.curYear === thisYr;

  const aBtn = document.createElement('button');
  aBtn.className = 'mb' + (STATE.curMonth === 'all' ? ' on' : ''); aBtn.textContent = 'Tout';
  aBtn.addEventListener('click', () => { STATE.curMonth = 'all'; STATE.renderedMonths = 0; renderTL(); });
  moNav.appendChild(aBtn);
  allEntries.forEach(([k]) => {
    const b = document.createElement('button'); b.className = 'mb' + (STATE.curMonth === k ? ' on' : '');
    b.textContent = MONTHS[k].substring(0, 4) + '.';
    b.addEventListener('click', () => { STATE.curMonth = k; STATE.renderedMonths = 0; renderTL(); });
    moNav.appendChild(b);
  });

  const filtered = STATE.curMonth === 'all' ? allEntries : allEntries.filter(([k]) => k === STATE.curMonth);
  if (!filtered.length) {
    root.innerHTML = '<div class="empty"><div class="empty-ico"><i class="fa-regular fa-envelope-open"></i></div><p>Aucun événement pour cette sélection.</p></div>';
    if (typeof initMoSelect === 'function') initMoSelect();
    return;
  }

  if (STATE.curMonth !== 'all') {
    filtered.forEach(([k, e]) => root.appendChild(buildMoBlock(k, e, today, new Date(STATE.curYear, k + 1, 0) < today)));
    if (opts.autoScrollToday && isCurYr) scrollToToday();
    if (typeof initMoSelect === 'function') initMoSelect();
    return;
  }

  const pastEntries   = isCurYr ? filtered.filter(([k]) => new Date(STATE.curYear, k + 1, 0) < today) : [];
  const futureEntries = isCurYr ? filtered.filter(([k]) => !pastEntries.some(([pk]) => pk === k)) : filtered;
  const totalFuture   = futureEntries.length;
  const toRender      = Math.min(totalFuture, Math.max(CHUNK, STATE.renderedMonths || CHUNK));
  const remaining     = totalFuture - toRender;

  if (isCurYr && pastEntries.length) {
    if (!STATE.showPast) {
      const cnt = pastEntries.reduce((a, [, e]) => a + e.length, 0);
      const b = document.createElement('button'); b.className = 'show-past-btn';
      b.innerHTML = `<i class="fa-solid fa-chevron-up ui-ico"></i>Afficher les mois passés (${pastEntries.length} mois, ${cnt} événements)`;
      b.addEventListener('click', () => { STATE.showPast = true; renderTL(); setTimeout(scrollToToday, 120); });
      root.appendChild(b);
    } else {
      const div = document.createElement('div'); div.innerHTML = '<div class="past-line">Passé</div>'; root.appendChild(div);
      pastEntries.forEach(([k, e]) => root.appendChild(buildMoBlock(k, e, today, true)));
    }
  }

  const sliced = (isCurYr ? futureEntries : filtered).slice(0, toRender);
  if (!sliced.length && isCurYr) {
    root.innerHTML += '<div class="empty"><div class="empty-ico"><i class="fa-solid fa-champagne-glasses"></i></div><p>Aucun événement à venir cette année.</p></div>';
  }
  sliced.forEach(([k, e]) => root.appendChild(buildMoBlock(k, e, today, false)));

  if (opts.autoScrollToday && isCurYr) setTimeout(scrollToToday, 80);

  if (remaining > 0) {
    const nextSlice      = (isCurYr ? futureEntries : filtered).slice(toRender, toRender + CHUNK);
    const nextMonthNames = nextSlice.map(([k]) => MONTHS[k]).join(', ');
    const moreCount      = Math.min(remaining, CHUNK);
    const btn = document.createElement('button');
    btn.className = 'load-more-btn';
    btn.innerHTML = `
      <i class="fa-solid fa-chevron-down ui-ico"></i>
      Voir ${moreCount} mois de plus
      <span class="load-more-hint">${escHtml(nextMonthNames)}</span>
      <span class="load-more-rest">${remaining} mois restants</span>`;
    btn.addEventListener('click', () => {
      STATE.renderedMonths = toRender + CHUNK;
      renderTL();
      setTimeout(() => {
        const blocks   = document.querySelectorAll('.mo-block');
        const newBlock = blocks[toRender + (STATE.showPast ? pastEntries.length : 0)];
        if (newBlock) {
          const offset = getStickyOffset() + 12;
          window.scrollTo({ top: window.scrollY + newBlock.getBoundingClientRect().top - offset, behavior: 'smooth' });
        }
      }, 80);
    });
    root.appendChild(btn);
  }

  if (typeof initMoSelect === 'function') initMoSelect();
}

function getStickyOffset() {
  const topbar = document.querySelector('.topbar');
  const exTb   = window.innerWidth >= 861 ? document.querySelector('.ex-tb') : null;
  return (topbar ? topbar.getBoundingClientRect().height : 0) + (exTb ? exTb.getBoundingClientRect().height : 0) + 10;
}

function scrollToToday() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const marker = document.getElementById('today-marker'); if (!marker) return;
    const rect   = marker.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - getStickyOffset()), behavior: 'smooth' });
  }));
}

function buildDateBadge(ev, def, isPast) {
  const end     = ev.endDate || ev.date;
  const isRange = end && end.getTime() > ev.date.getTime();
  const bc = isPast ? 'var(--b)' : def.b;
  const bg = isPast ? 'var(--bg2)' : def.d;
  const fc = isPast ? 'var(--t3)' : def.c;
  if (ev.approximate) {
    return `<div class="ev-d ev-d--approx" style="border-color:${def.b};background:${def.d};border-style:dashed">
      <span class="ev-day ev-day--approx" style="color:${def.c}">??</span><span class="ev-wd">—</span></div>`;
  }
  if (!isRange) {
    return `<div class="ev-d" style="border-color:${bc};background:${bg}"><span class="ev-day" style="color:${fc}">${ev.date.getDate()}</span><span class="ev-wd">${escHtml(fmtwd(ev.date))}</span></div>`;
  }
  return `<div class="ev-d ev-d-range" style="border-color:${bc};background:${bg}">
    <div class="ev-range-line"><span class="ev-range-day" style="color:${fc}">${ev.date.getDate()}</span><span class="ev-range-wd">${escHtml(fmtwd(ev.date))}</span></div>
    <div class="ev-range-sep">-</div>
    <div class="ev-range-line"><span class="ev-range-day" style="color:${fc}">${end.getDate()}</span><span class="ev-range-wd">${escHtml(fmtwd(end))}</span></div>
  </div>`;
}

function _isOngoing(ev) {
  const today = new Date(); today.setHours(0,0,0,0);
  return ev.endDate && ev.date < today && ev.endDate >= today;
}

function buildEvRow(ev, isPast, today) {
  const row     = document.createElement('div');
  row.className = 'ev-row' + (ev.approximate ? ' ev-row--approx' : '');
  const isToday   = ev.date.getTime() === today.getTime();
  const pastEv    = (ev.endDate || ev.date) < today;
  const isOngoing = _isOngoing(ev);
  if (isToday)   row.classList.add('today-ev');
  if (pastEv && !isToday && !ev.approximate) row.classList.add('past-ev');
  if (isOngoing) row.classList.add('ongoing-ev');

  const cat  = (ev.categories || [])[0] || 'Divers';
  const def  = cd(cat);

  // Max 2 catégories affichées pour ne pas saturer la ligne
  const visibleCats = (ev.categories || []).slice(0, 2);
  const catTags = visibleCats.map((name, idx) => {
    const catDef = cd(name);
    const bg     = idx === 0 ? catDef.d : 'var(--bg3)';
    const color  = idx === 0 ? catDef.c : 'var(--t2)';
    const border = idx === 0 ? catDef.b : 'var(--b)';
    return `<span class="ev-tag${idx > 0 ? ' ev-tag--subtle' : ''}" style="background:${bg};color:${color};border:1px solid ${border}">${escHtml(name)}</span>`;
  }).join('');

  // Zones avec label lisible (Alsace-Moselle au lieu de AM)
  const zoneTags = (ev.zones || []).filter(z => z && z !== 'all').length
    ? (ev.zones || []).filter(z => z && z !== 'all').map(z =>
        `<span class="ev-tag ev-tag--zone">${escHtml(zoneLabel(z))}</span>`
      ).join('')
    : '';

  const approxBadge = ev.approximate
    ? `<span class="ev-tag ev-tag--approx"><i class="fa-solid fa-circle-question"></i> Non confirmée</span>`
    : '';

  const ongoingBadge = isOngoing
    ? `<span class="ev-tag ev-tag--ongoing" style="background:${def.d};color:${def.c};border-color:${def.b}"><i class="fa-solid fa-circle-dot ev-ongoing-dot"></i>En cours</span>`
    : '';

  row.innerHTML = `
    ${buildDateBadge(ev, def, isPast && !isToday)}
    <div class="ev-b">
      <div class="ev-title">${escHtml(ev.summary)}</div>
      <div class="ev-tags">${catTags}${ongoingBadge}${zoneTags}${approxBadge}</div>
    </div>
    <span class="ev-arr">›</span>`;
  row.addEventListener('click', () => openModal(ev, [...STATE.allEvts, ...getFilteredUpcoming()]));
  return row;
}

function buildMoBlock(k, evts, today, isPast) {
  const block       = document.createElement('div'); block.className = 'mo-block anim';
  const regularEvts = evts.filter(e => !e.approximate);
  const approxEvts  = evts.filter(e => e.approximate);
  const totalCount  = regularEvts.length + approxEvts.length;
  const h = document.createElement('div'); h.className = 'mo-h' + (isPast ? ' past' : '');
  h.innerHTML = `${escHtml(MONTHS[k])} ${STATE.curYear} <span class="mo-cnt">${totalCount}</span>`;
  block.appendChild(h);
  const list        = document.createElement('div'); list.className = 'ev-list';
  const isCurBlock  = (STATE.curYear === today.getFullYear() && k === today.getMonth());
  const splitIdx    = regularEvts.findIndex(ev => (ev.endDate || ev.date) >= today);
  const hasPast     = regularEvts.some(ev => (ev.endDate || ev.date) < today);
  const hasFuture   = splitIdx !== -1;
  let markerPlaced  = false;

  function placeTodayMarker() {
    if (markerPlaced) return; markerPlaced = true;
    document.getElementById('today-marker')?.remove();
    const m = document.createElement('div'); m.id = 'today-marker';
    const label = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }).format(today);
    m.innerHTML = `<div class="today-line">Aujourd'hui · ${escHtml(label)}</div>`;
    list.appendChild(m);
  }

  if (isCurBlock && hasPast && hasFuture) {
    regularEvts.forEach((ev, i) => { if (i === splitIdx) placeTodayMarker(); list.appendChild(buildEvRow(ev, false, today)); });
  } else {
    if (isCurBlock && !hasPast && hasFuture) placeTodayMarker();
    regularEvts.forEach(ev => list.appendChild(buildEvRow(ev, isPast, today)));
    if (isCurBlock && hasPast && !hasFuture) placeTodayMarker();
  }
  if (approxEvts.length) approxEvts.forEach(ev => list.appendChild(buildEvRow(ev, false, today)));
  block.appendChild(list); return block;
}

/* ── Modal ──────────────────────────────────────────── */
let _modalPrev = null, _modalNext = null, _modalEvts = null;

function _slugify(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function openModal(ev, evts) {
  const same = evts.filter(e => e.summary === ev.summary).sort((a, b) => a.date - b.date);
  const ts   = ev.date.getTime();
  _modalPrev = [...same].reverse().find(e => e.date.getTime() < ts) || null;
  _modalNext = same.find(e => e.date.getTime() > ts) || null;
  _modalEvts = evts;

  const end     = ev.endDate || ev.date;
  const isRange = end && end.getTime() > ev.date.getTime();
  const durDays = Math.max(1, Math.round((end - ev.date) / 86400000) + 1);
  const isExam  = (ev.categories || []).some(c => norm(String(c)) === 'examens');
  const durLabel = isExam ? `${Math.max(1, countWeekdays(ev.date, end))} jours ouvrés` : `${durDays} jour${durDays > 1 ? 's' : ''}`;

  // Couleur catégorie principale
  const mainCat = (ev.categories || [])[0] || 'Divers';
  const def     = cd(mainCat);

  // Barre couleur en haut de la modal
  const mCatBar = document.getElementById('m-cat-bar');
  if (mCatBar) {
    mCatBar.style.background = `linear-gradient(90deg, ${def.c}, ${def.b})`;
    mCatBar.title = mainCat;
  }

  // Occurrences : compteur et navigation
  const occCount = same.length;
  const occIdx   = same.findIndex(e => e.date.getTime() === ts) + 1;

  const occEl = document.getElementById('m-occ-count');
  if (occEl) {
    if (occCount > 1) {
      occEl.textContent = `${occIdx} / ${occCount}`;
      occEl.style.display = 'inline-flex';
    } else {
      occEl.style.display = 'none';
    }
  }

  // Label "Cette occurrence" (fix du bug "Aujourd'hui")
  const dateBoxLabel = document.querySelector('#ev-modal .mbox.acc .ml');
  if (dateBoxLabel) dateBoxLabel.textContent = 'Cette occurrence';

  // Prev / Next avec état visuel amélioré
  const prevBtn = document.getElementById('m-prev');
  const nextBtn = document.getElementById('m-next');

  if (prevBtn) {
    prevBtn.textContent = _modalPrev ? fmt(_modalPrev.date) : '–';
    prevBtn.style.cursor  = _modalPrev ? 'pointer' : 'default';
    prevBtn.style.opacity = _modalPrev ? '1' : '.35';
    const prevBox = prevBtn.closest('.mbox');
    if (prevBox) prevBox.style.opacity = _modalPrev ? '1' : '.5';
  }
  if (nextBtn) {
    nextBtn.textContent = _modalNext ? fmt(_modalNext.date) : '–';
    nextBtn.style.cursor  = _modalNext ? 'pointer' : 'default';
    nextBtn.style.opacity = _modalNext ? '1' : '.35';
    const nextBox = nextBtn.closest('.mbox');
    if (nextBox) nextBox.style.opacity = _modalNext ? '1' : '.5';
  }

  document.getElementById('m-ttl').textContent = ev.summary;
  document.getElementById('m-date').textContent = isRange ? `${fmt(ev.date)} → ${fmt(end)}` : fmt(ev.date);
  document.getElementById('m-duration').textContent = durLabel;

  // Catégories avec couleur
  const mCats = document.getElementById('m-cats');
  if (mCats) {
    if ((ev.categories || []).length) {
      mCats.innerHTML = (ev.categories || []).map(v => {
        const catDef = cd(v);
        return `<span class="m-chip" style="background:${catDef.d};color:${catDef.c};border-color:${catDef.b}">${escHtml(v)}</span>`;
      }).join('');
    } else {
      mCats.innerHTML = `<span style="color:var(--t3)">Aucune</span>`;
    }
  }

  // Zones avec label lisible
  const mZones = document.getElementById('m-zones');
  if (mZones) {
    const zones = (ev.zones || []).filter(z => z && z !== 'all');
    if (zones.length) {
      mZones.innerHTML = zones.map(z =>
        `<span class="m-chip z">${escHtml(zoneLabel(z))}</span>`
      ).join('');
    } else {
      mZones.innerHTML = `<span style="color:var(--t3)">Toutes les zones</span>`;
    }
  }

  document.getElementById('m-desc').innerHTML = formatEventDescriptionHtml(ev.description);

  // Lien vers page dédiée /event/[slug]
  const ferieLink = document.getElementById('m-event-link');
  if (ferieLink) {
    const slug = `${_slugify(ev.summary)}-${ev.date.toISOString().slice(0, 10)}`;
    ferieLink.href = `/event/${slug}`;
    ferieLink.style.display = 'inline-flex';
  }

  document.getElementById('ev-modal').classList.add('on');
}

document.getElementById('m-cl').addEventListener('click', () => document.getElementById('ev-modal').classList.remove('on'));
document.getElementById('ev-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('ev-modal')) document.getElementById('ev-modal').classList.remove('on');
});
document.getElementById('m-prev')?.addEventListener('click', () => { if (_modalPrev) openModal(_modalPrev, _modalEvts); });
document.getElementById('m-next')?.addEventListener('click', () => { if (_modalNext) openModal(_modalNext, _modalEvts); });
document.addEventListener('keydown', e => {
  if (!document.getElementById('ev-modal').classList.contains('on')) return;
  if (e.key === 'Escape') { document.getElementById('ev-modal').classList.remove('on'); return; }
  if (e.key === 'ArrowLeft'  && _modalPrev) { e.preventDefault(); openModal(_modalPrev, _modalEvts); }
  if (e.key === 'ArrowRight' && _modalNext) { e.preventDefault(); openModal(_modalNext, _modalEvts); }
});

/* ── Refresh global ─────────────────────────────────── */
function refreshAll(opts = {}) {
  const savedY = window.scrollY;
  STATE.allEvts = getFiltered();
  const key = [STATE.curYear, STATE.curMonth, STATE.expZone, getSelCats().sort().join(','), document.getElementById('srch').value.trim()].join('|');
  renderRadar(STATE.allEvts);
  if (!opts.forceRender && !opts.autoScrollToday && key === STATE.lastRefreshKey) {
    requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: 'instant' }));
    return;
  }
  STATE.lastRefreshKey = key;
  renderTL(opts);
  if (!opts.autoScrollToday) requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: 'instant' }));
}

let currentView = 'list';

document.getElementById('btn-view-list')?.addEventListener('click', () => {
  currentView = 'list';
  document.getElementById('btn-view-list').classList.add('active');
  document.getElementById('btn-view-grid').classList.remove('active');
  document.getElementById('ev-root').style.display = 'block';
  document.getElementById('grid-root').style.display = 'none';
});

document.getElementById('btn-view-grid')?.addEventListener('click', () => {
  currentView = 'grid';
  document.getElementById('btn-view-grid').classList.add('active');
  document.getElementById('btn-view-list').classList.remove('active');
  document.getElementById('ev-root').style.display = 'none';
  document.getElementById('grid-root').style.display = 'flex';
  if (window.renderCalendarGrid) window.renderCalendarGrid();
});

const originalRefreshAll = refreshAll;
window.refreshAll = function(opts) {
  originalRefreshAll(opts);
  if (currentView === 'grid' && window.renderCalendarGrid) {
    window.renderCalendarGrid();
  }
};