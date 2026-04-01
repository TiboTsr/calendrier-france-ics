/**
 * app.js - Point d'entree principal
 * Charge le JSON, initialise les modules, lance le premier rendu.
 * Depend de tous les autres modules.
 */

const CALENDAR_VERSION_POLL_MS = 2 * 60 * 1000;
let _loadedCalendarVersion = null;
let _calendarVersionPollTimer = null;
let _calendarUpdatePromptOpen = false;
let _dismissedCalendarVersion = null;
let _pendingCalendarVersion = null;
let _pendingCalendarVersionLabel = null;
let _swUpdatePending = false;

function getCalendarVersion(payload) {
  return payload?.contentVersion || payload?.eventsHash || payload?.generatedAt || payload?.generated || payload?.lastUpdated || payload?.updatedAt || payload?.generated_at || null;
}

function getCalendarGeneratedAt(payload) {
  return payload?.generatedAt || payload?.generated || payload?.lastUpdated || payload?.updatedAt || payload?.generated_at || null;
}

function formatCalendarVersionLabel(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function updateHeroStats(data) {
  const eventsEl = document.getElementById('hero-stat-events');
  const catsEl = document.getElementById('hero-stat-cats');
  const updatedEl = document.getElementById('hero-stat-updated');
  if (!eventsEl || !catsEl || !updatedEl) return;

  const totalEvents = Number(data?.totalEvents || (data?.events || []).length || 0);
  const categoriesCount = [...new Set((data?.events || []).flatMap((event) => event.categories || []))].length;
  const generatedAt = getCalendarGeneratedAt(data);
  const generatedDate = generatedAt ? new Date(generatedAt) : null;
  const updatedLabel = generatedDate && !Number.isNaN(generatedDate.getTime())
    ? formatRelativeSyncAge(generatedDate)
    : '--';

  eventsEl.textContent = new Intl.NumberFormat('fr-FR').format(totalEvents);
  catsEl.textContent = new Intl.NumberFormat('fr-FR').format(categoriesCount);
  updatedEl.textContent = updatedLabel;
}

function formatRelativeSyncAge(date) {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) return "à l'instant";
  if (diffMinutes < 60) return `il y a ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `il y a ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `il y a ${diffDays} j`;
}

function updateCalendarPromptText(version) {
  const el = document.getElementById('calendar-update-text');
  if (!el) return;
  const label = formatCalendarVersionLabel(version);
  el.textContent = label
    ? `Une nouvelle version du calendrier a été publiée le ${label}. Rechargez pour voir les dernières dates et mises à jour.`
    : "Une nouvelle version du calendrier est disponible pendant que vous consultez la page. Rechargez pour voir les dernières dates et mises à jour.";
}

function openCalendarUpdatePrompt() {
  const modal = document.getElementById('calendar-update-modal');
  if (!modal || _calendarUpdatePromptOpen) {
    console.debug('[CalendrierFR] Cannot open modal: modal=', !!modal, 'alreadyOpen=', _calendarUpdatePromptOpen);
    return;
  }
  console.log('[CalendrierFR] Opening update prompt for version:', _pendingCalendarVersion);
  updateCalendarPromptText(_pendingCalendarVersionLabel || _pendingCalendarVersion);
  _calendarUpdatePromptOpen = true;
  modal.classList.add('on');
}

function closeCalendarUpdatePrompt() {
  const modal = document.getElementById('calendar-update-modal');
  if (!modal) return;
  _calendarUpdatePromptOpen = false;
  modal.classList.remove('on');
}

async function fetchCalendarData() {
  const bust = Date.now();
  const res = await fetch(`/calendrier.json?v=${bust}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

let _lastGeneratedDate = null;

function applyCalendarData(data, { preserveYear = true } = {}) {
  _loadedCalendarVersion = getCalendarVersion(data);
  console.log('[CalendrierFR] Loaded calendar version:', _loadedCalendarVersion);
  _pendingCalendarVersion = null;
  _pendingCalendarVersionLabel = null;
  _dismissedCalendarVersion = null;

  STATE.srcEvts = (data.events || []).map((e) => ({
    ...e,
    _date: e.start ? new Date(+e.start.slice(0, 4), +e.start.slice(5, 7) - 1, +e.start.slice(8, 10)) : null,
    _endDate: e.end ? new Date(+e.end.slice(0, 4), +e.end.slice(5, 7) - 1, +e.end.slice(8, 10)) : null,
  }));

  STATE.upcomingEvts = (data.upcoming || []).map((e) => ({
    ...e,
    _date: e.start ? new Date(+e.start.slice(0, 4), +e.start.slice(5, 7) - 1, +e.start.slice(8, 10)) : null,
    _endDate: e.end ? new Date(+e.end.slice(0, 4), +e.end.slice(5, 7) - 1, +e.end.slice(8, 10)) : null,
    approximate: true,
  }));

  const genAt = getCalendarGeneratedAt(data);
  _lastGeneratedDate = genAt ? new Date(genAt) : null;
  setSyncAge(genAt);
  updateHeroStats(data);


  const years = [...new Set(STATE.srcEvts.map((e) => e._date?.getFullYear()).filter(Boolean))];
  const thisYr = new Date().getFullYear();
  const currentYear = STATE.curYear;
  try {
    const saved = Number(localStorage.getItem(KEYS.year));
    STATE.curYear = preserveYear && currentYear && years.includes(currentYear) ? currentYear
      : (saved && years.includes(saved)) ? saved
      : (years.includes(thisYr) ? thisYr : ([...years].sort().reverse()[0] || thisYr));
  } catch {
    STATE.curYear = preserveYear && currentYear && years.includes(currentYear) ? currentYear : thisYr;
  }

  buildYrNav(years);
  document.getElementById('yr-s').value = String(STATE.curYear);

  const cats = [...new Set(STATE.srcEvts.flatMap((e) => e.categories || []))].sort();
  buildSbCats(cats);
  buildAdvCats(cats);
  markAdvDirty();
}

async function refreshCalendarDataInPlace() {
  const previousScroll = window.scrollY;
  const data = await fetchCalendarData();
  applyCalendarData(data);
  refreshAll({ forceRender: true });
  requestAnimationFrame(() => window.scrollTo({ top: previousScroll, behavior: 'instant' }));
  showToast('Calendrier mis à jour.');
}

async function checkForCalendarUpdate() {
  if (!_loadedCalendarVersion || document.hidden) return;
  try {
    const bust = Date.now();
    const res = await fetch(`/calendrier.json?v=${bust}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const nextVersion = getCalendarVersion(data);
    console.debug('[CalendrierFR] Version check:', { loaded: _loadedCalendarVersion, next: nextVersion, dismissed: _dismissedCalendarVersion });
    if (nextVersion && nextVersion !== _loadedCalendarVersion && nextVersion !== _dismissedCalendarVersion) {
      console.log('[CalendrierFR] New version detected:', nextVersion);
      _pendingCalendarVersion = nextVersion;
      _pendingCalendarVersionLabel = getCalendarGeneratedAt(data);
      openCalendarUpdatePrompt();
    }
  } catch (e) {
    console.debug('[CalendrierFR] Version check error:', e);
  }
}

function startCalendarVersionPolling() {
  if (_calendarVersionPollTimer) clearInterval(_calendarVersionPollTimer);
  checkForCalendarUpdate();
  _calendarVersionPollTimer = window.setInterval(checkForCalendarUpdate, CALENDAR_VERSION_POLL_MS);
  
  setTimeout(() => {
    let count = 0;
    const timer = setInterval(() => {
      count++;
      checkForCalendarUpdate();
      if (count >= 10) clearInterval(timer);
    }, 30000);
  }, 10000);
}

async function init() {
  try {
    const evRoot = document.getElementById('ev-root');
    if (evRoot) evRoot.innerHTML = `
      <div class="ev-loader">
        <div class="app-loader-spin" style="margin:20px auto"></div>
        <div style="text-align:center;color:var(--t3);font-size:13px;margin-top:8px">Chargement des événements…</div>
      </div>`;

    const data = await fetchCalendarData();
    applyCalendarData(data, { preserveYear: false });
    refreshAll();
    startCalendarVersionPolling();
    setInterval(updateAllSyncAges, 60000); // Mise à jour toutes les minutes

  } catch (err) {
    const evRoot = document.getElementById('ev-root');
    if (evRoot) evRoot.innerHTML = `
      <div class="empty">
        <div class="empty-ico"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <p>Impossible de charger les données.<br><small style="color:var(--t3)">${escHtml(err.message)}</small></p>
      </div>`;
  } finally {
    hideAppLoader();

    setTimeout(() => {
      let tutoDejaVu = false;
      
      try {
        tutoDejaVu = localStorage.getItem('tuto_seen') === '1';
      } catch (err) {}

      if (!tutoDejaVu) {
        const welcome = document.getElementById('tuto-welcome');
        if (welcome) {
          welcome.classList.add('visible');
        }
        try {
          localStorage.setItem('tuto_seen', '1');
        } catch (err) {}
      }
    }, 200);
  }
}

document.getElementById('calendar-update-refresh')?.addEventListener('click', async () => {
  const btn = document.getElementById('calendar-update-refresh');
  const originalText = btn.innerHTML;
  
  try {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mise à jour...';

    const bust = Date.now();
    const res = await fetch(`/calendrier.json?v=${bust}`, {
      cache: 'no-store',
      headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
    if (!res.ok) throw new Error();
    const data = await res.json();

    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }

    applyCalendarData(data);
    refreshAll({ forceRender: true });

    closeCalendarUpdatePrompt();
    showToast('Le calendrier a été mis à jour avec succès !');

  } catch (err) {
    window.location.reload();
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
});

document.getElementById('calendar-update-dismiss')?.addEventListener('click', () => {
  _dismissedCalendarVersion = _pendingCalendarVersion;
  closeCalendarUpdatePrompt();
});

document.getElementById('calendar-update-close')?.addEventListener('click', () => {
  _dismissedCalendarVersion = _pendingCalendarVersion;
  closeCalendarUpdatePrompt();
});

document.getElementById('calendar-update-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('calendar-update-modal')) {
    _dismissedCalendarVersion = _pendingCalendarVersion;
    closeCalendarUpdatePrompt();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkForCalendarUpdate();
});

window.addEventListener('focus', () => {
  checkForCalendarUpdate();
});

window.addEventListener('calendar-sw-update', async () => {
  _swUpdatePending = true;
  
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  try {
    const bust = Date.now();
    const res = await fetch(`/calendrier.json?v=${bust}`, { 
      cache: 'no-store',
      headers: { 'Pragma': 'no-cache' }
    });
    if (res.ok) {
      const data = await res.json();
      const nextVersion = getCalendarVersion(data);
      if (nextVersion && nextVersion !== _loadedCalendarVersion && nextVersion !== _dismissedCalendarVersion) {
        _pendingCalendarVersion = nextVersion;
        _pendingCalendarVersionLabel = getCalendarGeneratedAt(data);
        openCalendarUpdatePrompt();
      }
    }
  } catch (e) {
    console.debug('SW update check failed:', e);
  }
});

init();