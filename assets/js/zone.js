/**
 * zone.js — Recherche de zone scolaire par ville + hint panneau simple
 * Dépend de : utils.js (norm, escHtml, DYNAMIC_API_BASE)
 */

const SAMPLE_CITIES = [
  'Paris','Lyon','Marseille','Toulouse','Nice','Bordeaux','Strasbourg',
  'Nantes','Montpellier','Lille','Rennes','Le Mans','Caen',
  'Dijon','Le Havre','Rouen','Perpignan',
  'Aix','Créteil','Bayonne','Angers',
];

let ZONE_DEPT = { A: new Set(), B: new Set(), C: new Set(), AM: new Set() };
let _zoneDeptPromise = null;
const _zoneCache = new Map();

/* ── Chargement table départements → zones ──────────── */
async function loadZoneDepartments() {
  if (_zoneDeptPromise) return _zoneDeptPromise;
  _zoneDeptPromise = (async () => {
    const CACHE_KEY = 'zone_dept_cache_v1';
    let data;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) data = JSON.parse(cached);
    } catch(e) {}
    if (!data) {
      const resp = await fetch('/zone-departments.json', { cache: 'force-cache' });
      if (!resp.ok) throw new Error('Impossible de charger la table');
      data = await resp.json();
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch(e) {}
    }
    ZONE_DEPT = {
      A:  new Set((data?.A  || []).map(v => String(v).toUpperCase())),
      B:  new Set((data?.B  || []).map(v => String(v).toUpperCase())),
      C:  new Set((data?.C  || []).map(v => String(v).toUpperCase())),
      AM: new Set((data?.AM || []).map(v => String(v).toUpperCase())),
    };
    return ZONE_DEPT;
  })();
  return _zoneDeptPromise;
}

function zoneFromDept(code, deptMap) {
  const k = String(code).toUpperCase();
  if (deptMap.A.has(k))  return 'A';
  if (deptMap.B.has(k))  return 'B';
  if (deptMap.C.has(k))  return 'C';
  if (deptMap.AM && deptMap.AM.has(k)) return 'B';
  return null;
}

function mapCommuneToEntry(city, deptMap) {
  if (!city?.departement?.code) return null;
  const zone = zoneFromDept(city.departement.code, deptMap);
  if (!zone) return null;
  return {
    cityName:       city.nom,
    departmentName: city.departement.nom,
    departmentCode: city.departement.code,
    zone,
    population: Number(city.population) || 0,
  };
}

/* ── Recherche API communes ─────────────────────────── */
async function findZoneEntries(rawValue, retries = 2) {
  const q = rawValue.trim();
  if (!q) return [];
  const key = norm(q);
  if (_zoneCache.has(key)) return _zoneCache.get(key);

  const deptMap = await loadZoneDepartments();
  const apiUrl = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,departement,code,population&boost=population&limit=10`;

  let resp;
  for (let i = 0; i <= retries; i++) {
    try {
      resp = await fetch(apiUrl);
      if (resp.ok) break;
    } catch (err) {
      if (i === retries) throw err;
    }
    if (i < retries) await new Promise(r => setTimeout(r, 300));
  }

  if (!resp || !resp.ok) throw new Error('Service de géolocalisation indisponible');

  const rows = await resp.json();
  const mapped = (Array.isArray(rows) ? rows : [])
    .map(c => mapCommuneToEntry(c, deptMap))
    .filter(Boolean);

  const rawNorm = norm(q);
  const exact  = mapped.filter(e => norm(e.cityName) === rawNorm);
  const starts = mapped.filter(e => norm(e.cityName).startsWith(rawNorm));

  const selected = (exact.length ? exact : starts.length ? starts : mapped)
    .sort((a, b) => b.population - a.population);

  const seen = new Set();
  const result = selected.filter(e => {
    const k = `${norm(e.cityName)}|${String(e.departmentCode).toUpperCase()}`;
    return seen.has(k) ? false : !!seen.add(k);
  });

  _zoneCache.set(key, result);
  return result;
}

/* ── Rendu résultat unique ──────────────────────────── */
function renderZoneSingle(res, entry) {
  const zc = entry.zone === 'A' ? 'zt-a' : entry.zone === 'B' ? 'zt-b' : 'zt-c';
  res.classList.remove('multi');
  const webcalUrl = `webcal://${DYNAMIC_API_BASE}/api/calendrier.ics?zone=${entry.zone}`;
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
  res.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <strong style="font-size:16px">${escHtml(entry.cityName)}</strong>
        <span style="color:var(--t3);font-size:13px">(${escHtml(entry.departmentName)} · ${escHtml(entry.departmentCode)})</span>
        <span class="zt ${zc}">Zone ${escHtml(entry.zone)}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <a href="${escHtml(webcalUrl)}" class="bp" style="font-size:13px;padding:9px 16px">
          <i class="fa-solid fa-bolt ui-ico" aria-hidden="true"></i>S'abonner à la Zone ${escHtml(entry.zone)}
        </a>
        <a href="${escHtml(googleUrl)}" target="_blank" rel="noopener" class="bs" style="font-size:13px;padding:9px 14px">
          <i class="fa-brands fa-google ui-ico" aria-hidden="true"></i>Ajouter dans Google Calendar
        </a>
      </div>
      <p style="font-size:12px;color:var(--t3);margin:0">
        <i class="fa-solid fa-circle-info" style="color:var(--acc);margin-right:4px" aria-hidden="true"></i>
        Ce lien inclut les jours fériés nationaux + les vacances scolaires de la Zone ${escHtml(entry.zone)}.
      </p>
    </div>`;
}

/* ── Popup d'erreur géolocalisation (sécurisée) ─────── */
function showGeoError(msg) {
  let popup = document.getElementById('geo-error-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'geo-error-popup';
    popup.setAttribute('role', 'alertdialog');
    popup.setAttribute('aria-modal', 'true');
    popup.setAttribute('aria-labelledby', 'geo-error-msg');

    popup.style.cssText = [
      'position:fixed', 'left:50%', 'top:20%',
      'transform:translate(-50%,0)',
      'background:var(--bg2,#232330)', 'color:var(--t1,#fff)',
      'padding:24px 32px', 'border-radius:16px',
      'box-shadow:0 4px 24px #0005', 'font-size:18px',
      'z-index:9999', 'text-align:center', 'max-width:90vw',
    ].join(';');

    const icon = document.createElement('div');
    icon.style.cssText = 'font-size:2em;margin-bottom:12px';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '📍';

    const msgEl = document.createElement('div');
    msgEl.id = 'geo-error-msg';

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = [
      'margin-top:18px', 'padding:8px 18px',
      'border-radius:8px', 'background:var(--bg1,#444)',
      'color:var(--t1,#fff)', 'border:none',
      'font-size:16px', 'cursor:pointer',
    ].join(';');
    closeBtn.textContent = 'Fermer';
    closeBtn.addEventListener('click', () => popup.remove());

    popup.appendChild(icon);
    popup.appendChild(msgEl);
    popup.appendChild(closeBtn);
    document.body.appendChild(popup);
  }

  document.getElementById('geo-error-msg').textContent = msg;
  popup.style.display = 'block';
  popup.querySelector('button').focus();
}

/* ── Lancer la recherche ────────────────────────────── */
async function runZoneSearch() {
  const raw = document.getElementById('zf-in').value.trim();
  const res = document.getElementById('zf-res');
  const btn = document.getElementById('zf-btn');
  if (!raw) { res.classList.remove('on'); return; }

  btn.disabled = true; btn.style.opacity = '.7'; btn.textContent = 'Recherche…';
  try {
    const entries = await findZoneEntries(raw);
    if (entries.length === 1) {
      renderZoneSingle(res, entries[0]);
    } else if (entries.length > 1) {
      res.classList.add('multi');
      res.innerHTML = `<div class="zpick-head">Plusieurs communes trouvées pour <strong>${escHtml(raw)}</strong>. Choisissez la bonne :</div><div class="zpick-list"></div>`;
      const list = res.querySelector('.zpick-list');
      entries.slice(0, 8).forEach(entry => {
        const zc = entry.zone === 'A' ? 'zt-a' : entry.zone === 'B' ? 'zt-b' : 'zt-c';
        const b = document.createElement('button');
        b.className = 'zpick'; b.type = 'button';
        b.innerHTML = `<span><span class="zpick-main">${escHtml(entry.cityName)}</span><br><span class="zpick-sub">${escHtml(entry.departmentName)} · ${escHtml(entry.departmentCode)}</span></span><span class="zt ${zc}">Zone ${escHtml(entry.zone)}</span>`;
        b.addEventListener('click', () => renderZoneSingle(res, entry));
        list.appendChild(b);
      });
    } else {
      res.classList.remove('multi');
      res.innerHTML = `<span style="color:var(--t3)">Ville non trouvée ou zone scolaire indisponible.</span>`;
    }
  } catch {
    res.classList.remove('multi');
    res.innerHTML = `<span style="color:var(--t3)">Impossible de contacter l'API. Vérifiez votre connexion.</span>`;
  } finally {
    res.classList.add('on');
    btn.disabled = false; btn.style.opacity = ''; btn.textContent = 'Trouver ma zone';
  }
}

/* ── Init chips ─────────────────────────────────────── */
(function initZoneFinder() {
  const chips = document.getElementById('zf-chips');
  SAMPLE_CITIES.forEach(city => {
    const b = document.createElement('button');
    b.className = 'zchip';
    b.textContent = city;
    b.addEventListener('click', () => {
      document.getElementById('zf-in').value = city;
      runZoneSearch();
    });
    chips.appendChild(b);
  });
  document.getElementById('zf-btn').addEventListener('click', runZoneSearch);
  document.getElementById('zf-in').addEventListener('keydown', e => { if (e.key === 'Enter') runZoneSearch(); });
})();

/* ── Zone hint (panneau simple) ─────────────────────── */
let _openZone = null;

function toggleZoneHint(zone, el) {
  const hint = document.getElementById('zhint');
  document.querySelectorAll('.zcard').forEach(c => c.classList.remove('open'));
  if (_openZone === zone && hint.classList.contains('on')) {
    hint.classList.remove('on'); _openZone = null; return;
  }
  _openZone = zone; el.classList.add('open');
  const cities = {
    A: 'Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitier',
    B: 'Aix-Marseille, Amiens, Lille, Nancy-Metz, Nantes, Nice, Normandie, Orléans-Tours, Reims, Rennes, Strasbourg',
    C: 'Créteil, Montpellier, Paris, Toulouse, Versailles',
  };
  const webcalUrl = `webcal://calendrier-fr.tibotsr.dev/zone-${zone.toLowerCase()}.ics`;
  hint.innerHTML = `
    <strong>Zone ${escHtml(zone)}</strong> — <span style="color:var(--t3);font-size:12px">${escHtml(cities[zone])}</span><br>
    <div style="margin-top:10px;font-size:13px;color:var(--t2)">
      Ce fichier contient les <strong>jours fériés nationaux</strong> + les vacances de la <strong>Zone ${escHtml(zone)}</strong> uniquement.<br>
      <span class="sn">1</span> Téléchargez &nbsp; <span class="sn">2</span> Ouvrez le fichier — votre appli calendrier proposera l'import
    </div>
    <div class="zhint-btns">
      <a href="/zone-${escHtml(zone.toLowerCase())}.ics" class="bp"><i class="fa-solid fa-download ui-ico" aria-hidden="true"></i>Télécharger Zone ${escHtml(zone)}</a>
      <a href="${escHtml(webcalUrl)}" class="bs"><i class="fa-solid fa-bolt ui-ico" aria-hidden="true"></i>S'abonner Zone ${escHtml(zone)}</a>
    </div>`;
  hint.classList.add('on');
}

/* ── Géolocalisation ────────────────────────────────── */
document.getElementById('zf-geo-btn')?.addEventListener('click', () => {
  const btn   = document.getElementById('zf-geo-btn');
  const input = document.getElementById('zf-in');
  const res   = document.getElementById('zf-res');

  if (!navigator.geolocation) {
    showGeoError('Géolocalisation non supportée par votre navigateur.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Me géolocaliser';

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const apiUrl = `https://geo.api.gouv.fr/communes?lat=${latitude}&lon=${longitude}&fields=nom,departement,code,population&limit=1`;
        const resp = await fetch(apiUrl);
        const rows = await resp.json();

        if (rows && rows.length > 0) {
          const deptMap = await loadZoneDepartments();
          const entry   = mapCommuneToEntry(rows[0], deptMap);
          if (entry) {
            input.value = entry.cityName;
            res.classList.add('on');
            renderZoneSingle(res, entry);
          } else {
            showGeoError('Zone scolaire introuvable pour votre position.');
          }
        } else {
          showGeoError('Aucune commune trouvée à cette position.');
        }
      } catch {
        showGeoError('Erreur réseau lors de la géolocalisation.');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Me géolocaliser';
      }
    },
    () => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Me géolocaliser';
      showGeoError("Veuillez autoriser l'accès à votre position.");
    }
  );
});