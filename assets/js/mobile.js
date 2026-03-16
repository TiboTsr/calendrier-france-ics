/**
 * mobile.js — UX mobile : FAB aujourd'hui, select mois, indicateur scroll radar
 * Appelé après le rendu initial. initMoSelect() est aussi appelé par renderTL().
 */

/* ── Select mois natif (remplace les boutons .mb sur mobile) ── */
function initMoSelect() {
  if (window.innerWidth > 760) return;
  const exTb = document.querySelector('.ex-tb'); if (!exTb) return;

  // Éviter la double injection
  if (exTb.querySelector('.mo-select-mobile')) return;

  const buttons = Array.from(document.querySelectorAll('.mo-scroll .mb'));
  if (!buttons.length) return;

  const moNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const abbrevs = ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];

  function getMoIndex(btn) {
    const txt = btn.textContent.trim().toLowerCase();
    return abbrevs.findIndex(a => txt.startsWith(a));
  }

  const sel = document.createElement('select');
  sel.className = 'mo-select-mobile';

  // Option "Tout"
  const allOpt = document.createElement('option');
  allOpt.value = 'all'; allOpt.textContent = 'Tout';
  if (buttons[0]?.classList.contains('on') && buttons[0]?.textContent.trim() === 'Tout') allOpt.selected = true;
  sel.appendChild(allOpt);

  buttons.forEach(btn => {
    if (btn.textContent.trim() === 'Tout') return;
    const idx = getMoIndex(btn);
    if (idx === -1) return;
    const opt = document.createElement('option');
    opt.value = String(idx); opt.textContent = moNames[idx];
    if (btn.classList.contains('on')) opt.selected = true;
    sel.appendChild(opt);
  });

  sel.addEventListener('change', () => {
    const val = sel.value;
    const target = val === 'all' ? buttons.find(b => b.textContent.trim() === 'Tout') : buttons.find(b => String(getMoIndex(b)) === val);
    if (target) target.click();
  });

  // Sync quand les boutons changent d'état
  const obs = new MutationObserver(() => {
    const active = buttons.find(b => b.classList.contains('on'));
    if (!active) return;
    const txt = active.textContent.trim();
    if (txt === 'Tout') { sel.value = 'all'; return; }
    const idx = getMoIndex(active);
    if (idx !== -1) sel.value = String(idx);
  });
  buttons.forEach(b => obs.observe(b, { attributes: true, attributeFilter: ['class'] }));

  exTb.appendChild(sel);
}

/* ── FAB "Aujourd'hui" ──────────────────────────────── */
function initTodayFab() {
  if (window.innerWidth > 760) return;
  if (document.querySelector('.today-fab')) return;

  const fab = document.createElement('button');
  fab.className = 'today-fab'; fab.setAttribute('aria-label', "Aller à aujourd'hui");
  fab.textContent = "Aujourd'hui";
  fab.addEventListener('click', () => {
    const btn = document.getElementById('btn-today');
    if (btn) btn.click();
    else {
      const el = document.querySelector('.ev-today, [data-today], .mo-today');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
  document.body.appendChild(fab);
  fab.style.display = 'flex';
}

/* ── Scroll indicator radar ─────────────────────────── */
function initRadarIndicators() {
  document.querySelectorAll('.radar').forEach(radar => {
    const sc = radar.querySelector('.radar-sc'); if (!sc) return;
    const update = () => radar.classList.toggle('scroll-end', sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 8);
    sc.addEventListener('scroll', update, { passive: true });
    update();
  });
}

/* ── Init & resize ──────────────────────────────────── */
function initMobile() {
  initTodayFab();
  initRadarIndicators();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobile);
} else {
  initMobile();
}

window.addEventListener('resize', () => {
  const isMobile = window.innerWidth <= 760;
  const sel = document.querySelector('.mo-select-mobile');
  const fab = document.querySelector('.today-fab');
  const moScroll = document.querySelector('.mo-scroll');
  if (!isMobile) {
    if (sel) sel.remove();
    if (fab) fab.style.display = 'none';
    if (moScroll) moScroll.style.display = '';
  } else {
    if (fab) fab.style.display = 'flex';
  }
});
