/**
 * sync.js — Panneau de synchronisation (Simple + Avancé)
 * Dépend de : utils.js, state.js
 */

const CHUNK_SIZE = 3;
const PE_URL_WARN_CHARS = 2000;

let _advWizardStep = 1;
let _advZones = new Set(['all']);

/* ── Tabs Simple / Avancé ───────────────────────────── */
document.querySelectorAll('.tbtn2').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tbtn2').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-selected', 'false'); });
    document.querySelectorAll('.tpanel').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); b.setAttribute('aria-selected', 'true');
    document.getElementById('tp-' + b.dataset.t).classList.add('on');
    if (b.dataset.t === 'advanced') {
      console.log('Advanced tab clicked, setting up listeners');
      setupAdvWizardListeners();
      renderAdvWizard();
    }
  });
});

/* ── App picker (Simple) ────────────────────────────── */
let _selApp = 'apple';

function updateAppPicker() {
  const info = APP_INFO[_selApp];
  document.getElementById('simple-url').textContent = info.url();
  document.getElementById('sub-btn').href = info.sub();
  document.getElementById('app-steps').innerHTML = info.steps;
}

document.getElementById('sub-btn')?.addEventListener('click', () => {
  setTimeout(() => showToast("Votre appli calendrier devrait s'ouvrir — confirmez l'ajout pour terminer."), 800);
});

document.querySelectorAll('.abtn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.abtn').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); _selApp = b.dataset.app; updateAppPicker();
  });
});
updateAppPicker();

(function () {
  const details = document.querySelector('.url-details');
  if (!details) return;
  const summary = details.querySelector('summary');
  if (summary) {
    summary.addEventListener('click', (e) => {
      e.preventDefault();
    });
  }
})();

/* Copie URL simple */
(function () {
  const btn = document.getElementById('cp-simple');
  if (!btn) return;
  btn.addEventListener('click', function () {
    navigator.clipboard.writeText(document.getElementById('simple-url').textContent).then(() => {
      const orig = this.innerHTML;
      this.innerHTML = 'Copié <i class="fa-solid fa-check"></i>';
      this.classList.add('ok');
      setTimeout(() => { this.innerHTML = orig; this.classList.remove('ok'); }, 2000);
    });
  });
})();

/* ── Profils (Avancé) ───────────────────────────────── */
document.querySelectorAll('.pc').forEach(c => {
  c.addEventListener('click', () => {
    document.querySelectorAll('.pc').forEach(x => x.classList.remove('on'));
    c.classList.add('on');
    const profileKey = c.dataset.p;
    const allowed = profileKey === 'none' ? [] : PROFILES[profileKey];
    document.querySelectorAll('#adv-cats .ctog').forEach(t => {
      const active = allowed === null || (allowed && allowed.includes(t.dataset.name));
      t.querySelector('input').checked = active;
      t.classList.toggle('active', active);
      const def = cd(t.dataset.name);
      applyToggleStyle(t, active, def);
    });
    renderAdvWizard();
    markAdvDirty();
  });
});

/* ── Zone multi (Avancé) ────────────────────────────── */
document.querySelectorAll('.zmb').forEach(b => {
  b.addEventListener('click', () => {
    const z = b.dataset.z;
    // "Toutes" et "Aucune" sont des options exclusives
    if (z === 'all' || z === 'none') {
      _advZones = new Set([z]);
    } else {
      // Enlever les options exclusives quand on choisit une zone spécifique
      _advZones.delete('all');
      _advZones.delete('none');
      // Ajouter/enlever la zone spécifique
      _advZones.has(z) ? _advZones.delete(z) : _advZones.add(z);
      // Si aucune zone n'est sélectionnée, revenir à "Toutes" par défaut
      if (_advZones.size === 0) _advZones.add('all');
    }
    // Mettre à jour les styles des boutons
    document.querySelectorAll('.zmb').forEach(x => {
      x.className = 'zmb';
      if (_advZones.has(x.dataset.z)) {
        const btnZ = x.dataset.z;
        if (btnZ === 'all') x.classList.add('sall');
        else if (btnZ === 'none') x.classList.add('snone');
        else x.classList.add('s' + btnZ.toLowerCase());
      }
    });
    markAdvDirty();
    renderAdvWizard();
  });
});

/* ── Catégories avancées ────────────────────────────── */
function applyToggleStyle(el, on, def) {
  el.style.borderColor = on ? def.b : 'var(--b)';
  el.style.background  = on ? def.d : 'transparent';
  el.style.color       = on ? def.c : 'var(--t3)';
}

function buildAdvCats(cats) {
  const g = document.getElementById('adv-cats');
  g.innerHTML = '';
  CATS.filter(def => !cats.length || cats.includes(def.n)).forEach(def => {
    const l = document.createElement('label');
    l.className = 'ctog active'; l.dataset.name = def.n;
    l.innerHTML = `<input type="checkbox" value="${def.n}" checked><span class="cdot" style="background:${def.c}"></span>${escHtml(def.n)}`;
    applyToggleStyle(l, true, def);
    l.addEventListener('click', () => {
      const inp = l.querySelector('input'); inp.checked = !inp.checked;
      l.classList.toggle('active', inp.checked);
      applyToggleStyle(l, inp.checked, def);
      markAdvDirty();
    });
    g.appendChild(l);
  });
  if (window._hashCats) {
    g.querySelectorAll('.ctog').forEach(l => {
      const inp = l.querySelector('input');
      const active = window._hashCats.has(l.dataset.name);
      inp.checked = active; l.classList.toggle('active', active);
      applyToggleStyle(l, active, cd(l.dataset.name));
    });
    window._hashCats = null;
  }
}

function getSelAdvCats() {
  return [...document.querySelectorAll('#adv-cats input:checked')].map(i => i.value);
}

/* ── Événements personnels ──────────────────────────── */
const REC_LABELS = { none: 'Une seule fois', yearly: 'Chaque année', monthly: 'Chaque mois', weekly: 'Chaque semaine' };
let _personalEvts = [];

function loadPE() {
  try { const r = localStorage.getItem(KEYS.pe); _personalEvts = r ? JSON.parse(r) : []; }
  catch { _personalEvts = []; }
}
function savePE() { try { localStorage.setItem(KEYS.pe, JSON.stringify(_personalEvts)); } catch {} }

function renderPEList() {
  const el = document.getElementById('pe-list'); if (!el) return;
  if (!_personalEvts.length) { el.innerHTML = '<div class="pe-empty">Aucun événement personnel ajouté.</div>'; return; }
  el.innerHTML = _personalEvts.map((e, i) => `
    <div class="pe-item">
      <div class="pe-item-info">
        <div class="pe-item-title">${escHtml(e.title)}</div>
        <div class="pe-item-meta">${escHtml(e.date)} · ${escHtml(REC_LABELS[e.rec || 'none'])}</div>
      </div>
      <button class="pe-del" data-i="${i}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </div>`).join('');
  el.querySelectorAll('.pe-del').forEach(b => b.addEventListener('click', () => {
    _personalEvts.splice(Number(b.dataset.i), 1); savePE(); renderPEList(); markAdvDirty();
  }));
}

function getPEForUrl() {
  try {
    return _personalEvts
      .filter(e => e?.title && e?.date)
      .map(e => ({ title: String(e.title).trim(), date: String(e.date).trim(), rec: e.rec || 'none' }));
  } catch { return []; }
}

loadPE();
document.getElementById('pe-date')?.addEventListener('click', function () {
  if (typeof this.showPicker === 'function') {
    this.showPicker();
  }
});
document.getElementById('pe-add-btn')?.addEventListener('click', () => {
  const title = document.getElementById('pe-title').value.trim();
  const date  = document.getElementById('pe-date').value;
  const rec   = document.getElementById('pe-rec').value;
  if (!title || !date) return;
  _personalEvts.push({ title, date, rec });
  _personalEvts.sort((a, b) => a.date.localeCompare(b.date));
  savePE(); renderPEList(); markAdvDirty();
  document.getElementById('pe-title').value = '';
});
renderPEList();

/* ── URL builder (Avancé) ───────────────────────────── */
let _urlAnimTimer  = null;
let _advBuildTimer = null;
let _lastAnimUrl   = '';

let _shortenAbortController = null;

function _parseUrlSegments(urlStr) {
  try {
    const isWebcal = urlStr.startsWith('webcal://');
    const u = new URL(urlStr.replace('webcal://', 'https://'));
    const segs = [];
    segs.push({ text: isWebcal ? 'webcal://' : 'https://', type: 'proto' });
    segs.push({ text: u.hostname, type: 'host' });
    segs.push({ text: u.pathname, type: 'path' });
    if (u.search) {
      segs.push({ text: '?', type: 'sep' });
      [...u.searchParams.entries()].forEach(([k, v], i) => {
        if (i > 0) segs.push({ text: '&', type: 'sep' });
        segs.push({ text: k, type: 'key' });
        segs.push({ text: '=', type: 'eq' });
        segs.push({ text: decodeURIComponent(v) || 'toutes', type: `val${i % 3}` });
      });
    }
    return segs;
  } catch { return [{ text: urlStr, type: 'plain' }]; }
}

function animateUrl(webcalUrl) {
  const container = document.getElementById('adv-url-animated');
  const badge     = document.getElementById('adv-url-badge');
  const copyBtn   = document.getElementById('adv-url-copy');
  if (!container || webcalUrl === _lastAnimUrl) return;
  _lastAnimUrl = webcalUrl;

  clearTimeout(_urlAnimTimer);
  container.classList.remove('built', 'building');
  container.innerHTML = '';
  if (badge)   badge.style.display = 'none';
  if (copyBtn) { copyBtn.style.opacity = '0'; copyBtn.style.pointerEvents = 'none'; }

  const genOut = container.closest('.gen-out');
  if (genOut) { genOut.classList.add('refreshing'); setTimeout(() => genOut.classList.remove('refreshing'), 200); }

  container.classList.add('building');
  const segs    = _parseUrlSegments(webcalUrl);
  const segHtml = segs.map((s, i) => `<span class="url-seg url-seg-${escHtml(s.type)}" style="animation-delay:${i * 55}ms">${escHtml(s.text)}</span>`).join('');
  container.innerHTML = '<span class="url-cursor"></span>' + segHtml;

  _urlAnimTimer = setTimeout(() => {
    container.classList.remove('building');
    container.classList.add('built');
    if (badge)   badge.style.display = 'flex';
    if (copyBtn) { copyBtn.style.opacity = '1'; copyBtn.style.pointerEvents = 'auto'; }
  }, segs.length * 55 + 350);
}

function _alarmLabel(v) {
  const map = { '1h': 'rappel 1h avant', '1d': 'rappel la veille', '1w': 'rappel 1 semaine avant', '9am': 'rappel le jour même à 9h' };
  return map[v] || 'sans rappel';
}

function _currentAdvSelection() {
  const zonesArr      = _advZones.has('all') ? ['all'] : [..._advZones];
  const alarmFeries   = document.getElementById('adv-alarm-feries')?.value   || 'none';
  const alarmVacances = document.getElementById('adv-alarm-vacances')?.value || 'none';
  const alarmGlobal   = document.getElementById('adv-alarm-global')?.value   || '9am';
  const emojis        = document.getElementById('adv-emojis')?.checked ? '1' : '0';
  const cats          = getSelAdvCats();
  return { zonesArr, alarm: alarmGlobal, alarmGlobal, alarmFeries, alarmVacances, emojis, cats };
}

function _buildRecapHtml(icon, title, zonesArr, cats, alarm, personal) {
  const zoneLabel = zonesArr.includes('all') ? 'toutes les zones' : `zone${zonesArr.length > 1 ? 's' : ''} ${zonesArr.join(', ')}`;
  return `
    <div class="recap-line"><i class="${escHtml(icon)} ui-ico" aria-hidden="true"></i>${escHtml(title)}</div>
    <div class="recap-chips">
      <span class="recap-chip">${escHtml(zoneLabel)}</span>
      <span class="recap-chip">${cats.length} catégorie${cats.length > 1 ? 's' : ''}</span>
      <span class="recap-chip">${escHtml(_alarmLabel(alarm))}</span>
      <span class="recap-chip">${personal.length} événement${personal.length > 1 ? 's' : ''} perso</span>
    </div>`;
}

function setAdvActionsEnabled(enabled) {
  ['adv-sub', 'adv-ggl', 'adv-out', 'adv-url-copy'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.style.pointerEvents = enabled ? '' : 'none';
    el.style.opacity       = enabled ? '' : '.6';
  });
}

function setQrState(enabled) {
  document.getElementById('adv-qr-panel')?.classList.toggle('ready', !!enabled);
}

function updateQrCodes(url) {
  const qrUrl = String(url || '')
    .replace(/^webcal:\/\//i, 'https://')
    .replace(/^https:\/\/api\.calendrier-fr\.tibotsr\.dev\//i, 'https://calendrier-fr.tibotsr.dev/');
  const src  = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(qrUrl)}`;
  const link = document.getElementById('qr-link-main');
  const img  = document.getElementById('qr-img-main');
  if (link) link.href = qrUrl;
  if (img)  img.src  = src;
}

function markAdvDirty() {
  const { zonesArr, alarm, cats } = _currentAdvSelection();
  const personal = getPEForUrl();
  const container = document.getElementById('adv-url-animated');
  const badge     = document.getElementById('adv-url-badge');
  const copyBtn   = document.getElementById('adv-url-copy');

  clearTimeout(_advBuildTimer);

  // Annuler tout fetch /api/shorten en cours
  if (_shortenAbortController) {
    _shortenAbortController.abort();
    _shortenAbortController = null;
  }

  window._advWcUrl = '';
  _lastAnimUrl = '';
  setAdvActionsEnabled(false);
  setQrState(false);

  const recap = document.getElementById('adv-url-recap');
  if (recap) {
    recap.innerHTML = cats.length === 0
      ? `<i class="fa-solid fa-triangle-exclamation ui-ico"></i>Sélectionne au moins <strong>1 catégorie</strong> puis clique sur <strong>Générer mon calendrier</strong>.`
      : _buildRecapHtml('fa-regular fa-rectangle-list', 'Récap prêt', zonesArr, cats, alarm, personal)
        + `<div style="margin-top:7px"><i class="fa-solid fa-arrow-right ui-ico"></i>Clique sur <strong>Générer mon calendrier</strong>.</div>`;
  }
  if (container) {
    container.classList.remove('building', 'built');
    container.innerHTML = '<span class="url-seg url-seg-plain" style="opacity:1;transform:none;animation:none"><i class="fa-regular fa-clock ui-ico"></i>En attente de génération…</span>';
  }
  if (badge)   badge.style.display = 'none';
  if (copyBtn) { copyBtn.style.opacity = '0'; copyBtn.style.pointerEvents = 'none'; }
  renderAdvWizard();
}

async function buildAdvUrl() {
  const { zonesArr, alarmGlobal, alarmFeries, alarmVacances, emojis, cats } = _currentAdvSelection();
  const personal = getPEForUrl();

  clearTimeout(_advBuildTimer);

  // Annuler le fetch précédent s'il est encore en cours
  if (_shortenAbortController) {
    _shortenAbortController.abort();
    _shortenAbortController = null;
  }

  if (cats.length === 0) { markAdvDirty(); return; }

  setAdvActionsEnabled(false);
  setQrState(false);

  _advBuildTimer = setTimeout(async () => {
    const container = document.getElementById('adv-url-animated');
    if (container) {
      container.classList.remove('built');
      container.classList.add('building');
      container.innerHTML = '<span class="url-seg url-seg-plain" style="opacity:1;transform:none;animation:none"><i class="fa-solid fa-spinner fa-spin ui-ico"></i> Génération du lien…</span>';
    }

    const p = new URLSearchParams({
      zone:           zonesArr.join(','),
      cats:           cats.join(','),
      alarm_global:   alarmGlobal,
      alarm_feries:   alarmFeries,
      alarm_vacances: alarmVacances,
      emojis,
    });
    if (personal.length) p.set('pe', JSON.stringify(personal));

    const API_HOST  = typeof window.CALENDAR_API_BASE !== 'undefined'
      ? window.CALENDAR_API_BASE
      : (['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.endsWith('.local')
        ? 'calendrier-fr.tibotsr.dev'
        : window.location.host);
    const longUrl   = `https://${API_HOST}/api/calendrier.ics?${p}`;

    let shortId = null;

    // Créer un nouveau AbortController pour ce fetch
    _shortenAbortController = new AbortController();
    const { signal } = _shortenAbortController;

    try {
      const resp = await fetch('/api/shorten', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fullUrl: longUrl }),
        signal,
      });
      // Si la requête a été annulée, on sort silencieusement
      if (signal.aborted) return;
      const data = await resp.json();
      if (data.shortId) shortId = data.shortId;
    } catch (e) {
      // AbortError = l'utilisateur a relancé une génération — ne rien faire
      if (e.name === 'AbortError') return;
      shortId = null;
    } finally {
      _shortenAbortController = null;
    }

    let wc, wcGoogle;
    if (shortId) {
      wc       = `webcal://${API_HOST}/api/calendrier.ics?id=${shortId}`;
      wcGoogle = `https://${API_HOST}/api/calendrier.ics?id=${shortId}`;
    } else {
      wc       = `webcal://${API_HOST}/api/calendrier.ics?${p}`;
      wcGoogle = longUrl;
    }

    window._advWcUrl = wc;

    const sub = document.getElementById('adv-sub'); if (sub) sub.href = wc;
    const ggl = document.getElementById('adv-ggl'); if (ggl) ggl.href = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(wcGoogle)}`;
    const out = document.getElementById('adv-out'); if (out) out.href = `https://outlook.live.com/calendar/0/deeplink/compose?rru=addsubscription&url=${encodeURIComponent(wc)}`;

    updateQrCodes(wc);
    animateUrl(wc);
    setAdvActionsEnabled(true);
    setQrState(true);

    const warn = document.getElementById('adv-pe-url-warn');
    if (warn) warn.style.display = wc.length > 2000 ? 'flex' : 'none';

    const recap = document.getElementById('adv-url-recap');
    if (recap) recap.innerHTML = _buildRecapHtml('fa-solid fa-circle-check', 'Lien prêt', zonesArr, cats, alarmFeries, personal);
    renderAdvWizard();
  }, 220);
}

/* Copie URL avancée */
document.getElementById('adv-url-copy')?.addEventListener('click', function () {
  navigator.clipboard.writeText(window._advWcUrl || '').then(() => {
    const orig = this.innerHTML;
    this.innerHTML = '<i class="fa-solid fa-check"></i> Copié';
    this.classList.add('ok');
    setTimeout(() => { this.innerHTML = orig; this.classList.remove('ok'); }, 2000);
  });
});

document.getElementById('adv-alarm')?.addEventListener('change', markAdvDirty);
document.getElementById('adv-generate')?.addEventListener('click', buildAdvUrl);
markAdvDirty();

/* ── Partage config via hash URL ────────────────────── */
function copyShareUrl() {
  const { zonesArr, alarm, cats } = _currentAdvSelection();
  const hash = new URLSearchParams({ zone: zonesArr.join(','), cats: cats.join(','), alarm, tab: 'advanced' });
  const url  = `${location.origin}${location.pathname}#${hash.toString()}`;
  navigator.clipboard.writeText(url)
    .then(() => showToast('Lien de config copié !'))
    .catch(() => prompt('Copiez ce lien :', url));
}

(function restoreFromHash() {
  try {
    if (!location.hash || location.hash.length < 2) return;
    const p    = new URLSearchParams(location.hash.slice(1));
    const zone = p.get('zone'); const cats = p.get('cats');
    const alarm = p.get('alarm'); const tab = p.get('tab');
    if (!zone && !cats) return;
    if (tab === 'advanced') document.querySelector('[data-t="advanced"]')?.click();
    if (zone) {
      _advZones = new Set(zone.split(','));
      document.querySelectorAll('.zmb').forEach(x => {
        x.className = 'zmb';
        if (_advZones.has(x.dataset.z)) {
          const btnZ = x.dataset.z;
          if (btnZ === 'all') x.classList.add('sall');
          else if (btnZ === 'none') x.classList.add('snone');
          else x.classList.add('s' + btnZ.toLowerCase());
        }
      });
    }
    if (alarm) {
      const sel = document.getElementById('adv-alarm-global') || document.getElementById('adv-alarm');
      if (sel) sel.value = alarm;
    }
    if (cats)  window._hashCats = new Set(cats.split(','));
    renderAdvWizard();
  } catch {}
})();

document.getElementById('adv-alarm-feries')?.addEventListener('change', markAdvDirty);
document.getElementById('adv-alarm-vacances')?.addEventListener('change', markAdvDirty);
document.getElementById('adv-alarm-global')?.addEventListener('change', markAdvDirty);
document.getElementById('adv-emojis')?.addEventListener('change', markAdvDirty);

/* ── Wizard avancé (1 étape visible + progression) ─── */
function getAdvWizardSteps() {
  return [...document.querySelectorAll('#tp-advanced .adv-step')];
}

function isAdvStepComplete(stepNumber) {
  if (stepNumber === 1) return !!document.querySelector('#pcards .pc.on');
  if (stepNumber === 2) return _advZones.size > 0;
  if (stepNumber === 3) return document.querySelectorAll('#adv-cats .ctog.active').length > 0;
  if (stepNumber === 4) return true;
  if (stepNumber === 5) return true;
  return false;
}

function getAdvStepHint(stepNumber) {
  if (stepNumber === 1) return 'Cette étape est facultative : choisissez un profil si vous voulez un pré-réglage, sinon passez directement à la suite.';
  if (stepNumber === 2) return 'Sélectionnez une zone (ou “Toutes” / “Aucune”), puis continuez.';
  if (stepNumber === 3) return 'Activez au moins une catégorie pour continuer.';
  if (stepNumber === 4) return 'Réglez vos options puis passez à la génération du lien.';
  return window._advWcUrl
    ? 'Lien généré. Vous pouvez copier, ouvrir ou partager la configuration.'
    : 'Cliquez sur “Générer mon lien d’abonnement” pour finaliser.';
}
function getAdvStepErrorMsg(stepNumber) {
  if (stepNumber === 1) return '⚠️ Vous devez choisir au moins un profil.';
  if (stepNumber === 2) return '⚠️ Vous devez sélectionner au moins une zone.';
  if (stepNumber === 3) return '⚠️ Vous devez activer au moins une catégorie.';
  return '';
}
function renderAdvWizard() {
  const panel = document.getElementById('tp-advanced');
  if (!panel) return;

  const steps = getAdvWizardSteps();
  if (!steps.length) return;

  const total = steps.length;
  _advWizardStep = Math.max(1, Math.min(_advWizardStep, total));

  steps.forEach((step, idx) => {
    const current = idx + 1 === _advWizardStep;
    step.classList.toggle('adv-step-active', current);
    step.classList.toggle('adv-step-hidden', !current);
    step.style.display = current ? 'block' : 'none';
  });

  const pct = Math.round((_advWizardStep / total) * 100);
  const pctEl = document.getElementById('adv-progress-pct');
  const fillEl = document.getElementById('adv-progress-fill');
  const hintEl = document.getElementById('adv-step-hint');
  const prevEl = document.getElementById('adv-prev');
  const nextEl = document.getElementById('adv-next');
  const canGoNext = _advWizardStep < total;

  if (pctEl) pctEl.textContent = `Étape ${_advWizardStep}/${total} · ${pct}%`;
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (hintEl) hintEl.textContent = getAdvStepHint(_advWizardStep);

  if (prevEl) prevEl.disabled = _advWizardStep <= 1;
  if (nextEl) {
    nextEl.disabled = !canGoNext;
    nextEl.innerHTML = _advWizardStep >= total
      ? 'Terminé <i class="fa-solid fa-check ui-ico" aria-hidden="true"></i>'
      : 'Passer à l’étape suivante <i class="fa-solid fa-arrow-right ui-ico" aria-hidden="true"></i>';
  }  
  console.log('renderAdvWizard complete - prev:', !!prevEl, 'next:', !!nextEl, 'steps:', steps.length);}

function advWizardPrev() {
  _advWizardStep = Math.max(1, _advWizardStep - 1);
  renderAdvWizard();
}

function advWizardNext() {
  const total = getAdvWizardSteps().length;
  
  if (!isAdvStepComplete(_advWizardStep)) {
    const hintEl = document.getElementById('adv-step-hint');
    if (hintEl) {
      hintEl.classList.add('error');
      setTimeout(() => hintEl.classList.remove('error'), 2000);
    }
    showToast('❌ Veuillez compléter cette étape avant de continuer.');
    return;
  }
  
  if (_advWizardStep < total) {
    _advWizardStep += 1;
    renderAdvWizard();
  }
}

function setupAdvWizardListeners() {
  console.log('setupAdvWizardListeners called - listeners are set up at document level');

}

document.addEventListener('click', (e) => {
  const nextBtn = e.target.closest('#adv-next');
  if (nextBtn) {
    e.preventDefault();
    e.stopPropagation();
    advWizardNext();
    return;
  }
  const prevBtn = e.target.closest('#adv-prev');
  if (prevBtn) {
    e.preventDefault();
    e.stopPropagation();
    advWizardPrev();
  }
});

window.advWizardNext = advWizardNext;
window.advWizardPrev = advWizardPrev;
window.renderAdvWizard = renderAdvWizard;
window.setupAdvWizardListeners = setupAdvWizardListeners;

// Initial setup
setupAdvWizardListeners();
document.addEventListener('DOMContentLoaded', () => {
  setupAdvWizardListeners();
  renderAdvWizard();
});

// Render une 2e fois peu après pour s'assurer que le DOM est prêt
setTimeout(() => {
  if (document.getElementById('tp-advanced')) {
    renderAdvWizard();
  }
}, 100);

console.log('sync.js loaded - wizard functions available');