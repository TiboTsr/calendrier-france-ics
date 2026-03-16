/**
 * explorer.js — Sidebar, radar, timeline et modal événement
 * Dépend de : utils.js, state.js
 */

const CHUNK = 3;

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
    const el  = document.createElement('div'); el.className = 'scat active'; el.dataset.cat = cat;
    el.innerHTML = `<input type="checkbox" checked style="display:none"><span class="sc-dot" style="background:${def.c}"></span><span class="sc-name">${cat}</span><span class="sc-cnt">${counts.get(cat) || 0}</span>`;
    el.addEventListener('click', () => {
      el.classList.toggle('active');
      try { localStorage.setItem(KEYS.favs, JSON.stringify(getSelCats())); } catch {}
      STATE.renderedMonths = 0; refreshAll();
    });
    g.appendChild(el);
  });
  // Restaurer sélection sauvegardée
  try {
    const saved = JSON.parse(localStorage.getItem(KEYS.favs));
    if (Array.isArray(saved)) {
      const set = new Set(saved);
      g.querySelectorAll('.scat').forEach(el => el.classList.toggle('active', set.has(el.dataset.cat)));
    }
  } catch {}
}

document.getElementById('sb-rst').addEventListener('click', () => {
  document.querySelectorAll('#sb-cats .scat').forEach(el => el.classList.add('active'));
  localStorage.removeItem(KEYS.favs);
  STATE.renderedMonths = 0; refreshAll();
});

document.querySelectorAll('.szp').forEach(b => {
  b.addEventListener('click', () => {
    STATE.expZone = b.dataset.z;
    document.querySelectorAll('.szp').forEach(x => {
      x.className = 'szp';
      if (x.dataset.z === STATE.expZone) x.classList.add(STATE.expZone === 'all' ? 'sall' : 's' + STATE.expZone.toLowerCase());
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
function renderRadar(evts) {
  const root      = document.getElementById('r-root');
  const cnt       = document.getElementById('r-cnt');
  const activeRoot = document.getElementById('r-active');
  const activeCnt  = document.getElementById('r-active-cnt');
  root.innerHTML = ''; activeRoot.innerHTML = '';

  const today = new Date(); today.setHours(0,0,0,0);
  const end30 = new Date(today); end30.setDate(end30.getDate() + 30);

  const upcoming = evts.filter(e => e.date >= today && e.date <= end30).slice(0, 10);
  const ongoing  = evts.filter(e => e.endDate && e.date < today && e.endDate >= today)
    .sort((a, b) => a.endDate - b.endDate).slice(0, 8);

  // Countdown — prochain jour férié national uniquement
  const countdownEl = document.getElementById('r-countdown');
  const heroEl      = document.getElementById('r-countdown-hero');
  const next = evts.find(e => (e.categories || []).includes('Jours fériés') && e.date >= today);
  if (next && countdownEl) {
    const diff  = Math.round((next.date - today) / 86400000);
    const label = diff === 0 ? "Aujourd'hui !" : diff === 1 ? 'Demain !' : `Dans ${diff} jour${diff > 1 ? 's' : ''}`;
    const def   = cd('Jours fériés');
    const html  = `<span class="r-countdown-pill" style="background:${def.d};border-color:${def.b};color:${def.c}"><i class="fa-solid fa-gift"></i><strong>${label}</strong><span style="opacity:.8">— ${escHtml(next.summary)}</span></span>`;
    countdownEl.innerHTML = html; countdownEl.style.display = 'block';
    if (heroEl) { heroEl.innerHTML = html; heroEl.style.display = 'block'; }
  } else {
    if (countdownEl) countdownEl.style.display = 'none';
    if (heroEl) heroEl.style.display = 'none';
  }

  if (!upcoming.length) {
    root.innerHTML = '<span class="radar-empty">Aucun événement dans les 30 prochains jours.</span>';
    cnt.textContent = '';
  } else {
    cnt.textContent = `${upcoming.length} en approche`;
    upcoming.forEach(e => {
      const c = document.createElement('div'); c.className = 'rc';
      c.innerHTML = `<div class="rc-date">${fmts(e.date)}</div><div class="rc-name">${escHtml(e.summary)}</div>`;
      c.addEventListener('click', () => openModal(e, STATE.allEvts));
      root.appendChild(c);
    });
  }

  // Upcoming — élections et événements approximatifs
  const upcomingEvts = getFilteredUpcoming();
  const upcomingRoot = document.getElementById('r-upcoming');
  const upcomingCnt  = document.getElementById('r-upcoming-cnt');
  if (upcomingRoot) {
    upcomingRoot.innerHTML = '';
    if (!upcomingEvts.length) {
      upcomingRoot.innerHTML = '<span class="radar-empty">Aucune échéance à venir.</span>';
      if (upcomingCnt) upcomingCnt.textContent = '';
    } else {
      if (upcomingCnt) upcomingCnt.textContent = `${upcomingEvts.length} échéance${upcomingEvts.length > 1 ? 's' : ''}`;
      upcomingEvts.forEach(e => {
        const def = cd((e.categories || [])[0] || 'Élections');
        const c = document.createElement('div');
        c.className = 'rc rc--approximate';
        c.innerHTML = `
          <div class="rc-date" style="color:${def.c}">${fmts(e.date)}</div>
          <div class="rc-name">${escHtml(e.summary)}</div>
          <div class="rc-approx-badge">Date non confirmée</div>`;
        c.addEventListener('click', () => openModal(e, [...STATE.allEvts, ...upcomingEvts]));
        upcomingRoot.appendChild(c);
      });
    }
  }

  if (!ongoing.length) {
    activeRoot.innerHTML = '<span class="radar-empty">Aucun événement long en cours.</span>';
    activeCnt.textContent = '';
  } else {
    activeCnt.textContent = `${ongoing.length} en cours`;
    ongoing.forEach(e => {
      const c = document.createElement('div'); c.className = 'rc';
      c.innerHTML = `<div class="rc-date">Se termine le ${fmts(e.endDate)}</div><div class="rc-name">${escHtml(e.summary)}</div>`;
      c.addEventListener('click', () => openModal(e, STATE.allEvts));
      activeRoot.appendChild(c);
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
  try { localStorage.setItem(KEYS.year, String(STATE.curYear)); } catch {}
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
    try { localStorage.setItem(KEYS.year, String(STATE.curYear)); } catch {}
    renderTL();
  }
}

document.getElementById('btn-today').addEventListener('click', () => {
  STATE.curYear = new Date().getFullYear(); STATE.curMonth = 'all';
  STATE.showPast = false; STATE.renderedMonths = 0;
  document.getElementById('yr-s').value = String(STATE.curYear);
  try { localStorage.setItem(KEYS.year, String(STATE.curYear)); } catch {}
  refreshAll({ autoScrollToday: true });
});

/* ── Timeline ───────────────────────────────────────── */
function renderTL(opts = {}) {
  const root  = document.getElementById('ev-root');
  const moNav = document.getElementById('mo-nav');
  root.innerHTML = ''; moNav.innerHTML = '';

  const today  = new Date(); today.setHours(0,0,0,0);
  const thisYr = new Date().getFullYear();
  const yEvts  = STATE.allEvts.filter(e => e.date.getFullYear() === STATE.curYear);

  // Merge upcoming dans le bon mois — placés en fin de liste du mois
  const yUpcoming = getFilteredUpcoming().filter(e => e.date.getFullYear() === STATE.curYear);

  const grp = new Map();
  yEvts.forEach(e => { const k = e.date.getMonth(); if (!grp.has(k)) grp.set(k, []); grp.get(k).push(e); });
  // Injecter les upcoming dans leur mois (sans les mélanger avec les events triés par date)
  yUpcoming.forEach(e => { const k = e.date.getMonth(); if (!grp.has(k)) grp.set(k, []); grp.get(k).push(e); });

  const allEntries = [...grp.entries()].sort((a, b) => a[0] - b[0]);
  const isCurYr    = STATE.curYear === thisYr;

  // Nav mois
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

  // Infinite scroll
  if (window._tlObserver) window._tlObserver.disconnect();
  if (toRender < totalFuture) {
    const sentinel = document.getElementById('tl-sentinel');
    window._tlObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) { STATE.renderedMonths = toRender + CHUNK; renderTL(); }
    }, { root: null, rootMargin: '200px' });
    window._tlObserver.observe(sentinel);
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

  // Événement approximatif — affiche ?? à la place du jour
  if (ev.approximate) {
    return `<div class="ev-d ev-d--approx" style="border-color:${def.b};background:${def.d};border-style:dashed">
      <span class="ev-day ev-day--approx" style="color:${def.c}">??</span>
      <span class="ev-wd">—</span>
    </div>`;
  }

  if (!isRange) {
    return `<div class="ev-d" style="border-color:${bc};background:${bg}"><span class="ev-day" style="color:${fc}">${ev.date.getDate()}</span><span class="ev-wd">${fmtwd(ev.date)}</span></div>`;
  }
  return `<div class="ev-d ev-d-range" style="border-color:${bc};background:${bg}">
    <div class="ev-range-line"><span class="ev-range-day" style="color:${fc}">${ev.date.getDate()}</span><span class="ev-range-wd">${fmtwd(ev.date)}</span></div>
    <div class="ev-range-sep">-</div>
    <div class="ev-range-line"><span class="ev-range-day" style="color:${fc}">${end.getDate()}</span><span class="ev-range-wd">${fmtwd(end)}</span></div>
  </div>`;
}

function buildEvRow(ev, isPast, today) {
  const row     = document.createElement('div');
  row.className = 'ev-row' + (ev.approximate ? ' ev-row--approx' : '');
  const isToday = ev.date.getTime() === today.getTime();
  const pastEv  = (ev.endDate || ev.date) < today;
  if (isToday) row.classList.add('today-ev');
  if (pastEv && !isToday && !ev.approximate) row.classList.add('past-ev');
  const cat  = (ev.categories || [])[0] || 'Divers';
  const def  = cd(cat);
  const zones = ev.zones?.length ? `<span class="ev-tag" style="background:var(--bg3);color:var(--t3)">${escHtml(ev.zones.join(', '))}</span>` : '';
  const approxBadge = ev.approximate
    ? `<span class="ev-tag ev-tag--approx"><i class="fa-solid fa-circle-question"></i> Date non confirmée</span>`
    : '';
  row.innerHTML = `
    ${buildDateBadge(ev, def, isPast && !isToday)}
    <div class="ev-b">
      <div class="ev-title">${escHtml(ev.summary)}</div>
      <div class="ev-tags">
        <span class="ev-tag" style="background:${def.d};color:${def.c};border:1px solid ${def.b}">${escHtml(cat)}</span>
        ${zones}${approxBadge}
      </div>
    </div>
    <span class="ev-arr">›</span>`;
  row.addEventListener('click', () => openModal(ev, [...STATE.allEvts, ...getFilteredUpcoming()]));
  return row;
}

function buildMoBlock(k, evts, today, isPast) {
  const block = document.createElement('div'); block.className = 'mo-block anim';

  // Séparer events normaux et approximatifs
  const regularEvts   = evts.filter(e => !e.approximate);
  const approxEvts    = evts.filter(e => e.approximate);

  const totalCount = regularEvts.length + approxEvts.length;
  const h = document.createElement('div'); h.className = 'mo-h' + (isPast ? ' past' : '');
  h.innerHTML = `${MONTHS[k]} ${STATE.curYear} <span class="mo-cnt">${totalCount}</span>`;
  block.appendChild(h);

  const list       = document.createElement('div'); list.className = 'ev-list';
  const isCurBlock = (STATE.curYear === today.getFullYear() && k === today.getMonth());
  const splitIdx   = regularEvts.findIndex(ev => (ev.endDate || ev.date) >= today);
  const hasPast    = regularEvts.some(ev => (ev.endDate || ev.date) < today);
  const hasFuture  = splitIdx !== -1;
  let markerPlaced = false;

  function placeTodayMarker() {
    if (markerPlaced) return; markerPlaced = true;
    document.getElementById('today-marker')?.remove();
    const m = document.createElement('div'); m.id = 'today-marker';
    const label = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }).format(today);
    m.innerHTML = `<div class="today-line">Aujourd'hui · ${label}</div>`;
    list.appendChild(m);
  }

  // Rendu des événements normaux
  if (isCurBlock && hasPast && hasFuture) {
    regularEvts.forEach((ev, i) => { if (i === splitIdx) placeTodayMarker(); list.appendChild(buildEvRow(ev, false, today)); });
  } else {
    if (isCurBlock && !hasPast && hasFuture) placeTodayMarker();
    regularEvts.forEach(ev => list.appendChild(buildEvRow(ev, isPast, today)));
    if (isCurBlock && hasPast && !hasFuture) placeTodayMarker();
  }

  // Événements approximatifs — toujours en fin de mois, avec séparateur si le mois a des events normaux
  if (approxEvts.length) {
    if (regularEvts.length) {
      const sep = document.createElement('div');
      sep.className = 'approx-sep';
      sep.innerHTML = '<i class="fa-solid fa-circle-question"></i> Dates à confirmer';
      list.appendChild(sep);
    }
    approxEvts.forEach(ev => list.appendChild(buildEvRow(ev, false, today)));
  }

  block.appendChild(list); return block;
}

/* ── Modal ──────────────────────────────────────────── */
let _modalPrev = null, _modalNext = null, _modalEvts = null;

function openModal(ev, evts) {
  const same    = evts.filter(e => e.summary === ev.summary).sort((a, b) => a.date - b.date);
  const ts      = ev.date.getTime();
  _modalPrev    = [...same].reverse().find(e => e.date.getTime() < ts) || null;
  _modalNext    = same.find(e => e.date.getTime() > ts) || null;
  _modalEvts    = evts;

  const end       = ev.endDate || ev.date;
  const isRange   = end && end.getTime() > ev.date.getTime();
  const durDays   = Math.max(1, Math.round((end - ev.date) / 86400000) + 1);
  const isExam    = (ev.categories || []).some(c => norm(String(c)) === 'examens');
  const durLabel  = isExam
    ? `${Math.max(1, countWeekdays(ev.date, end))} jours ouvrés`
    : `${durDays} jour${durDays > 1 ? 's' : ''}`;

  function chips(values, zone = false) {
    if (!values?.length) return `<span style="color:var(--t3)">Aucune</span>`;
    return values.map(v => `<span class="m-chip${zone ? ' z' : ''}">${escHtml(v)}</span>`).join('');
  }

  document.getElementById('m-ttl').textContent      = ev.summary;
  document.getElementById('m-prev').textContent     = _modalPrev ? fmt(_modalPrev.date) : 'Aucune donnée';
  document.getElementById('m-next').textContent     = _modalNext ? fmt(_modalNext.date) : 'Aucune prévision';
  document.getElementById('m-date').textContent     = isRange ? `${fmt(ev.date)} → ${fmt(end)}` : fmt(ev.date);
  document.getElementById('m-duration').textContent = durLabel;
  document.getElementById('m-cats').innerHTML       = chips(ev.categories || []);
  document.getElementById('m-zones').innerHTML      = chips(ev.zones || [], true);
  document.getElementById('m-desc').innerHTML       = ev.description
    ? ev.description.replace(/\n/g, '<br>')
    : "<i style='color:var(--t3)'>Aucune description.</i>";

  const prev = document.getElementById('m-prev');
  const next = document.getElementById('m-next');
  prev.style.cursor = _modalPrev ? 'pointer' : 'default';
  next.style.cursor = _modalNext ? 'pointer' : 'default';

  document.getElementById('ev-modal').classList.add('on');
}

document.getElementById('m-cl').addEventListener('click', () => document.getElementById('ev-modal').classList.remove('on'));
document.getElementById('ev-modal').addEventListener('click', e => { if (e.target === document.getElementById('ev-modal')) document.getElementById('ev-modal').classList.remove('on'); });
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
  renderRadar(STATE.allEvts);  // upcoming est lu directement depuis STATE dans renderRadar

  if (!opts.forceRender && !opts.autoScrollToday && key === STATE.lastRefreshKey) {
    requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: 'instant' }));
    return;
  }
  STATE.lastRefreshKey = key;
  renderTL(opts);
  if (!opts.autoScrollToday) requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: 'instant' }));
}