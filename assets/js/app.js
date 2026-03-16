/**
 * app.js — Point d'entrée principal
 * Charge le JSON, initialise les modules, lance le premier rendu.
 * Dépend de tous les autres modules.
 */

async function init() {
  try {
    const evRoot = document.getElementById('ev-root');
    if (evRoot) evRoot.innerHTML = `
      <div class="ev-loader">
        <div class="app-loader-spin" style="margin:20px auto"></div>
        <div style="text-align:center;color:var(--t3);font-size:13px;margin-top:8px">Chargement des événements…</div>
      </div>`;

    const res = await fetch('/calendrier.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    // Pré-parser les dates une seule fois
    STATE.srcEvts = (data.events || []).map(e => ({
      ...e,
      _date:    e.start ? new Date(+e.start.slice(0,4), +e.start.slice(5,7) - 1, +e.start.slice(8,10)) : null,
      _endDate: e.end   ? new Date(+e.end.slice(0,4),   +e.end.slice(5,7) - 1,   +e.end.slice(8,10))   : null,
    }));

    // Événements approximatifs (upcoming) — affichés uniquement sur le site
    STATE.upcomingEvts = (data.upcoming || []).map(e => ({
      ...e,
      _date:    e.start ? new Date(+e.start.slice(0,4), +e.start.slice(5,7) - 1, +e.start.slice(8,10)) : null,
      _endDate: e.end   ? new Date(+e.end.slice(0,4),   +e.end.slice(5,7) - 1,   +e.end.slice(8,10))   : null,
      approximate: true,
    }));

    // Sync date topbar
    setSyncAge(data.generatedAt || data.generated || data.lastUpdated || data.updatedAt || data.generated_at || null);

    // Années disponibles
    const years   = [...new Set(STATE.srcEvts.map(e => e._date?.getFullYear()).filter(Boolean))];
    const thisYr  = new Date().getFullYear();
    try {
      const saved = Number(localStorage.getItem(KEYS.year));
      STATE.curYear = (saved && years.includes(saved)) ? saved
        : (years.includes(thisYr) ? thisYr : ([...years].sort().reverse()[0] || thisYr));
    } catch { STATE.curYear = thisYr; }

    buildYrNav(years);
    document.getElementById('yr-s').value = String(STATE.curYear);

    // Catégories
    const cats = [...new Set(STATE.srcEvts.flatMap(e => e.categories || []))].sort();
    buildSbCats(cats);
    buildAdvCats(cats);
    markAdvDirty();

    refreshAll();
  } catch (err) {
    const evRoot = document.getElementById('ev-root');
    if (evRoot) evRoot.innerHTML = `
      <div class="empty">
        <div class="empty-ico"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <p>Impossible de charger les données.<br><small style="color:var(--t3)">${escHtml(err.message)}</small></p>
      </div>`;
  } finally {
    hideAppLoader();
  }
}

init();