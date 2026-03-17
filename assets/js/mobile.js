/**
 * mobile.js v9
 * - Catégories colorées dans le bottom sheet (actif = couleur, inactif = grisé opaque)
 * - Bouton reset visible/caché selon filtres actifs
 * - Fix insertBefore (parentNode check)
 * - MutationObserver sur body pour .ex-tb async
 */

/* ── Helper couleur catégorie (miroir de explorer.js) ── */
function _applyCatStyleSheet(el, cat, active) {
  const def = cd(cat);
  if (active) {
    el.style.borderColor = def.b;
    el.style.background  = def.d;
    el.style.color       = def.c;
    el.style.opacity     = '1';
  } else {
    el.style.borderColor = 'transparent';
    el.style.background  = 'var(--bg3)';
    el.style.color       = 'var(--t3)';
    el.style.opacity     = '0.4';
  }
  const dot = el.querySelector('.sc-dot');
  if (dot) dot.style.background = def.c;
  const name = el.querySelector('.sc-name');
  if (name) name.style.color = active ? def.c : 'var(--t3)';
}

/* ══════════════════════════════════════════════
   BOUTON FILTRES + RESET — injection robuste
══════════════════════════════════════════════ */

function _ensureFiltersBtn() {
  if (window.innerWidth > 760) return;
  const exTb = document.querySelector('.ex-tb');
  if (!exTb) return;

  if (!exTb.querySelector('#filters-open-btn')) {
    const btn = document.createElement('button');
    btn.className = 'filters-open-btn';
    btn.id = 'filters-open-btn';
    btn.setAttribute('aria-label', 'Filtres');
    btn.innerHTML = `<i class="fa-solid fa-sliders"></i>Filtres<span class="filters-btn-badge hidden" id="filters-btn-badge"></span>`;
    btn.addEventListener('click', () => {
      if (!document.getElementById('filters-sheet')) initFiltersSheet();
      openFiltersSheet();
    });
    const yrNav = exTb.querySelector('.yr-nav');
    const after = yrNav ? yrNav.nextSibling : null;
    if (after && after.parentNode === exTb) exTb.insertBefore(btn, after);
    else exTb.appendChild(btn);
  }

  if (!exTb.querySelector('#filters-reset-btn')) {
    const rst = document.createElement('button');
    rst.className = 'filters-reset-btn';
    rst.id = 'filters-reset-btn';
    rst.setAttribute('aria-label', 'Effacer les filtres');
    rst.innerHTML = `<i class="fa-solid fa-xmark"></i>Effacer`;
    rst.addEventListener('click', _resetAllFilters);
    const filtersBtn = exTb.querySelector('#filters-open-btn');
    const afterFilters = filtersBtn ? filtersBtn.nextSibling : null;
    if (afterFilters && afterFilters.parentNode === exTb) exTb.insertBefore(rst, afterFilters);
    else exTb.appendChild(rst);
  }

  updateFiltersBtn();
}

function _resetAllFilters() {
  const srch = document.getElementById('srch');
  if (srch) { srch.value = ''; srch.dispatchEvent(new Event('input', { bubbles: true })); }
  document.querySelector('.szp[data-z="all"]')?.click();
  document.getElementById('sb-rst')?.click();
  updateFiltersBtn();
}

function _watchExTb() {
  const exTb = document.querySelector('.ex-tb'); if (!exTb) return;
  _ensureFiltersBtn();
  _ensureMoSelect();
  new MutationObserver(() => {
    if (window.innerWidth > 760) return;
    _ensureFiltersBtn();
    _ensureMoSelect();
  }).observe(exTb, { childList: true });
}

function updateFiltersBtn() {
  const btn   = document.querySelector('#filters-open-btn');
  const badge = document.querySelector('#filters-btn-badge');
  const rst   = document.querySelector('#filters-reset-btn');
  if (!btn) return;
  const inactive  = document.querySelectorAll('#sb-cats .scat:not(.active)').length;
  const hasSearch = (document.getElementById('srch')?.value.trim().length || 0) > 0;
  const hasZone   = !!document.querySelector('.szp.sa, .szp.sb, .szp.sc');
  const total     = inactive + (hasSearch ? 1 : 0) + (hasZone ? 1 : 0);
  if (badge) { badge.textContent = String(total); badge.classList.toggle('hidden', total === 0); }
  btn.classList.toggle('has-active', total > 0);
  if (rst) rst.classList.toggle('visible', total > 0);
}

/* ══════════════════════════════════════════════
   SELECT MOIS NATIF
══════════════════════════════════════════════ */
function _ensureMoSelect() {
  if (window.innerWidth > 760) return;
  const exTb = document.querySelector('.ex-tb'); if (!exTb) return;
  if (exTb.querySelector('#mo-select-mobile')) { _syncMoSelect(); return; }

  const buttons = Array.from(document.querySelectorAll('.mo-scroll .mb'));
  if (!buttons.length) return;

  const moNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const abbrevs = ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  const getMoIdx = btn => abbrevs.findIndex(a => btn.textContent.trim().toLowerCase().startsWith(a));

  const sel = document.createElement('select');
  sel.className = 'mo-select-mobile'; sel.id = 'mo-select-mobile';

  const allOpt = document.createElement('option');
  allOpt.value = 'all'; allOpt.textContent = 'Tout';
  if (buttons[0]?.classList.contains('on') && buttons[0]?.textContent.trim() === 'Tout') allOpt.selected = true;
  sel.appendChild(allOpt);

  buttons.forEach(btn => {
    if (btn.textContent.trim() === 'Tout') return;
    const idx = getMoIdx(btn); if (idx === -1) return;
    const opt = document.createElement('option');
    opt.value = String(idx); opt.textContent = moNames[idx];
    if (btn.classList.contains('on')) opt.selected = true;
    sel.appendChild(opt);
  });

  sel.addEventListener('change', () => {
    const t = sel.value === 'all'
      ? buttons.find(b => b.textContent.trim() === 'Tout')
      : buttons.find(b => String(getMoIdx(b)) === sel.value);
    if (t) t.click();
  });

  const obs = new MutationObserver(() => {
    const a = buttons.find(b => b.classList.contains('on')); if (!a) return;
    const t = a.textContent.trim();
    sel.value = t === 'Tout' ? 'all' : String(getMoIdx(a));
  });
  buttons.forEach(b => obs.observe(b, { attributes: true, attributeFilter: ['class'] }));

  exTb.appendChild(sel);
}

function _syncMoSelect() {
  const sel = document.getElementById('mo-select-mobile'); if (!sel) return;
  const n = Array.from(document.querySelectorAll('.mo-scroll .mb')).length;
  if (Math.abs(sel.options.length - n) > 1) { sel.remove(); _ensureMoSelect(); }
}

function initMoSelect() {
  if (window.innerWidth > 760) return;
  _ensureMoSelect();
  _ensureFiltersBtn();
}

/* ══════════════════════════════════════════════
   BOTTOM SHEET FILTRES
══════════════════════════════════════════════ */
function initFiltersSheet() {
  if (document.getElementById('filters-sheet')) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'filters-backdrop'; backdrop.id = 'filters-backdrop';
  backdrop.addEventListener('click', closeFiltersSheet);
  document.body.appendChild(backdrop);

  const sheet = document.createElement('div');
  sheet.className = 'filters-sheet'; sheet.id = 'filters-sheet';
  sheet.innerHTML = `
    <div class="filters-sheet-handle"></div>
    <div class="filters-sheet-head">
      <span class="filters-sheet-title">
        <i class="fa-solid fa-sliders" style="color:var(--acc);margin-right:8px;font-size:14px"></i>Filtres
      </span>
      <button class="filters-sheet-close" id="fsh-close" aria-label="Fermer">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="filters-sheet-body">
      <div class="fsh-section">
        <span class="fsh-label">Rechercher</span>
        <div class="fsh-search-wrap">
          <span class="fsh-search-ico"><i class="fa-solid fa-magnifying-glass"></i></span>
          <input class="fsh-search" id="fsh-search-input" type="search"
            placeholder="Nom d'événement…" autocomplete="off" />
        </div>
      </div>
      <div class="fsh-section">
        <span class="fsh-label">Zone scolaire</span>
        <div class="fsh-zone-pills" id="fsh-zone-pills"></div>
      </div>
      <div class="fsh-section">
        <div class="fsh-cats-header" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span class="fsh-label" style="margin:0; flex:1 1 auto;">Catégories</span>
          <div style="display: flex; gap: 4px;">
            <button class="fsh-cats-reset" id="fsh-cats-delete">Tout désactiver</button>
            <button class="fsh-cats-reset" id="fsh-cats-reset">Tout activer</button>
          </div>
        </div>
        <div class="fsh-cats-grid" id="fsh-cats-grid"></div>
      </div>
    </div>
    <div class="filters-sheet-footer">
      <button class="filters-sheet-reset-all" id="fsh-reset-all">
        <i class="fa-solid fa-rotate-left"></i>Réinitialiser tout
      </button>
      <button class="filters-apply-btn" id="fsh-apply">Voir les résultats</button>
    </div>`;
  document.body.appendChild(sheet);

  let sy = 0, cy = 0, drag = false, maxDelta = 0;
  sheet.addEventListener('touchstart', e => {
    if (!e.target.closest('.filters-sheet-handle, .filters-sheet-head')) return;
    sy = e.touches[0].clientY; drag = true; maxDelta = 0;
    // Empêche le scroll de fond pendant le drag
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
  }, { passive: false });
  sheet.addEventListener('touchmove', e => {
    if (!drag) return;
    cy = e.touches[0].clientY;
    const delta = Math.max(0, cy - sy);
    maxDelta = Math.max(maxDelta, delta);
    sheet.style.transform = `translateY(${delta}px)`;
    // Empêche le scroll de la page pendant le drag
    e.preventDefault();
  }, { passive: false });
  sheet.addEventListener('touchend', () => {
    if (!drag) return; drag = false;
    sheet.style.transform = '';
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    if (maxDelta > 100) closeFiltersSheet();
  });

  document.getElementById('fsh-close').addEventListener('click', closeFiltersSheet);
  document.getElementById('fsh-apply').addEventListener('click', closeFiltersSheet);
  document.getElementById('fsh-reset-all').addEventListener('click', () => {
    _resetAllFilters();
    _syncZonePillsToSheet();
    _syncCatsToSheet();
    const fs = document.getElementById('fsh-search-input');
    if (fs) fs.value = '';
  });
  document.getElementById('fsh-search-input').addEventListener('input', e => {
    const real = document.getElementById('srch');
    if (real) { real.value = e.target.value; real.dispatchEvent(new Event('input', { bubbles: true })); }
    updateFiltersBtn();
  });
  document.getElementById('fsh-cats-reset').addEventListener('click', () => {
    // Optimisé : active toutes les catégories instantanément
    document.querySelectorAll('#sb-cats .scat').forEach(el => {
      if (!el.classList.contains('active')) el.classList.add('active');
    });
    _syncCatsToSheet(); updateFiltersBtn();
  });
  document.getElementById('fsh-cats-delete').addEventListener('click', () => {
    // Optimisé : désactive toutes les catégories instantanément
    document.querySelectorAll('#sb-cats .scat').forEach(el => {
      if (el.classList.contains('active')) el.classList.remove('active');
    });
    _syncCatsToSheet(); updateFiltersBtn();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('filters-sheet')?.classList.contains('open')) closeFiltersSheet();
  });

  _populateSheetZones();
}

function _populateSheetZones() {
  const c = document.getElementById('fsh-zone-pills'); if (!c) return;
  c.innerHTML = '';
  document.querySelectorAll('.szp').forEach(real => {
    const btn = document.createElement('button');
    btn.className = real.className; btn.textContent = real.textContent;
    btn.dataset.z = real.dataset.z; if (real.title) btn.title = real.title;
    btn.addEventListener('click', () => { real.click(); setTimeout(_syncZonePillsToSheet, 0); updateFiltersBtn(); });
    c.appendChild(btn);
  });
}

function _syncZonePillsToSheet() {
  Array.from(document.querySelectorAll('.szp')).forEach((r, i) => {
    const s = document.querySelectorAll('#fsh-zone-pills .szp')[i];
    if (s) s.className = r.className;
  });
}

function _populateSheetCats() {
  const c = document.getElementById('fsh-cats-grid'); if (!c) return;
  c.innerHTML = '';
  document.querySelectorAll('#sb-cats .scat').forEach(real => {
    const cat    = real.dataset.cat;
    const active = real.classList.contains('active');
    const el     = document.createElement('div');
    el.className = 'scat' + (active ? ' active' : '');
    el.dataset.cat = cat;
    el.innerHTML = `<span class="sc-dot"></span><span class="sc-name">${cat}</span>`;
    _applyCatStyleSheet(el, cat, active);

    el.addEventListener('click', () => {
      real.click();
      const nowActive = real.classList.contains('active');
      el.classList.toggle('active', nowActive);
      _applyCatStyleSheet(el, cat, nowActive);
      updateFiltersBtn();
    });
    c.appendChild(el);
  });
}

function _syncCatsToSheet() {
  Array.from(document.querySelectorAll('#sb-cats .scat')).forEach((r, i) => {
    const s = document.querySelectorAll('#fsh-cats-grid .scat')[i];
    if (!s) return;
    const active = r.classList.contains('active');
    s.classList.toggle('active', active);
    _applyCatStyleSheet(s, r.dataset.cat, active);
  });
}

function openFiltersSheet() {
  if (!document.getElementById('filters-sheet')) initFiltersSheet();
  const sc = document.querySelectorAll('#fsh-cats-grid .scat').length;
  const rc = document.querySelectorAll('#sb-cats .scat').length;
  if (sc !== rc) _populateSheetCats();
  _syncZonePillsToSheet();
  _syncCatsToSheet();
  const rs = document.getElementById('srch');
  const fs = document.getElementById('fsh-search-input');
  if (rs && fs) fs.value = rs.value;
  document.getElementById('filters-sheet').classList.add('open');
  document.getElementById('filters-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
}

function closeFiltersSheet() {
  document.getElementById('filters-sheet')?.classList.remove('open');
  document.getElementById('filters-backdrop')?.classList.remove('open');
  document.body.style.overflow = '';
  document.body.style.touchAction = '';
}

/* ══════════════════════════════════════════════
   FAB "Aujourd'hui"
══════════════════════════════════════════════ */
function initTodayFab() {
  if (window.innerWidth > 760) return;
  if (document.body.dataset.todayFabInit === '1') return;
  document.body.dataset.todayFabInit = '1';
  const fab = document.createElement('button');
  fab.className = 'today-fab';
  fab.setAttribute('aria-label', "Aller à aujourd'hui");
  fab.textContent = "Aujourd'hui";
  fab.addEventListener('click', () => {
    document.getElementById('btn-today')?.click();
    document.querySelector('#today-marker, .today-ev')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.body.appendChild(fab);
  fab.style.display = 'flex';
}

/* ══════════════════════════════════════════════
   SCROLL INDICATOR RADAR
══════════════════════════════════════════════ */
function initRadarIndicators() {
  document.querySelectorAll('.radar').forEach(radar => {
    const sc = radar.querySelector('.radar-sc'); if (!sc) return;
    const upd = () => radar.classList.toggle('scroll-end', sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 8);
    sc.addEventListener('scroll', upd, { passive: true });
    upd();
  });
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
function initMobile() {
  if (window.innerWidth > 760) return;
  initTodayFab();
  initFiltersSheet();
  initRadarIndicators();
  if (document.querySelector('.ex-tb')) {
    _watchExTb();
  } else {
    const obs = new MutationObserver((_, o) => {
      if (document.querySelector('.ex-tb')) { o.disconnect(); _watchExTb(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobile);
} else {
  initMobile();
}

/* ══════════════════════════════════════════════
   RESIZE
══════════════════════════════════════════════ */
let _rt = null;
window.addEventListener('resize', () => {
  clearTimeout(_rt);
  _rt = setTimeout(() => {
    const m = window.innerWidth <= 760;
    const fab = document.querySelector('.today-fab');
    const moScroll = document.querySelector('.mo-scroll');
    if (!m) {
      document.getElementById('mo-select-mobile')?.remove();
      closeFiltersSheet();
      if (fab) fab.style.display = 'none';
      if (moScroll) moScroll.style.display = '';
    } else {
      if (fab) fab.style.display = 'flex';
      else { delete document.body.dataset.todayFabInit; initTodayFab(); }
      _ensureFiltersBtn();
      _ensureMoSelect();
    }
  }, 150);
});