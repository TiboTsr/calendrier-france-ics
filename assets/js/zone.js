/**
 * zone.js — Recherche de zone scolaire par ville + hint panneau simple
 * Dépend de : utils.js (norm, escHtml, DYNAMIC_API_BASE)
 */

const SAMPLE_CITIES = [
  'Paris','Lyon','Marseille','Toulouse','Nice','Bordeaux','Strasbourg',
  'Nantes','Montpellier','Lille','Rennes','Grenoble','Le Mans','Caen',
  'Nancy','Dijon','Besançon','Le Havre','Rouen','Toulon','Perpignan',
  'Aix','Cergy','Créteil','Bayonne','Angers',
];

let ZONE_DEPT = { A: new Set(), B: new Set(), C: new Set() };
let _zoneDeptPromise = null;
const _zoneCache = new Map();

/* ── Chargement table départements → zones ──────────── */
async function loadZoneDepartments() {
  if (_zoneDeptPromise) return _zoneDeptPromise;
  _zoneDeptPromise = (async () => {
    const resp = await fetch('/zone-departments.json', { cache: 'force-cache' });
    if (!resp.ok) throw new Error('Impossible de charger la table des zones');
    const data = await resp.json();
    ZONE_DEPT = {
      A: new Set((data?.A || []).map(v => String(v).toUpperCase())),
      B: new Set((data?.B || []).map(v => String(v).toUpperCase())),
      C: new Set((data?.C || []).map(v => String(v).toUpperCase())),
    };
    return ZONE_DEPT;
  })();
  return _zoneDeptPromise;
}

function zoneFromDept(code, deptMap) {
  const k = String(code).toUpperCase();
  if (deptMap.A.has(k)) return 'A';
  if (deptMap.B.has(k)) return 'B';
  if (deptMap.C.has(k)) return 'C';
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
async function findZoneEntries(rawValue) {
  const q = rawValue.trim();
  if (!q) return [];
  const key = norm(q);
  if (_zoneCache.has(key)) return _zoneCache.get(key);

  const deptMap = await loadZoneDepartments();
  const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,departement,code,population&boost=population&limit=10`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Service de géolocalisation indisponible');

  const rows = await resp.json();
  const mapped = (Array.isArray(rows) ? rows : [])
    .map(c => mapCommuneToEntry(c, deptMap))
    .filter(Boolean);

  const rawNorm = norm(q);
  const exact  = mapped.filter(e => norm(e.cityName) === rawNorm);
  const starts = mapped.filter(e => norm(e.cityName).startsWith(rawNorm));
  const selected = (exact.length ? exact : starts.length ? starts : mapped)
    .sort((a, b) => b.population - a.population);

  // Dédupe
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
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span>
        <strong style="font-size:16px">${escHtml(entry.cityName)}</strong>
        <span style="color:var(--t3)">(${escHtml(entry.departmentName)} · ${escHtml(entry.departmentCode)})</span>
        → <span class="zt ${zc}">Zone ${entry.zone}</span>
      </span>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a href="${webcalUrl}" class="bp" style="font-size:13px;padding:7px 14px">
          <i class="fa-solid fa-bolt ui-ico" aria-hidden="true"></i>S'abonner Zone ${entry.zone}
        </a>
        <a href="${googleUrl}" target="_blank" class="bs" style="font-size:13px;padding:7px 14px">
          <i class="fa-brands fa-google ui-ico" aria-hidden="true"></i>Google Cal.
        </a>
      </div>
    </div>`;
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
        b.innerHTML = `<span><span class="zpick-main">${escHtml(entry.cityName)}</span><br><span class="zpick-sub">${escHtml(entry.departmentName)} · ${escHtml(entry.departmentCode)}</span></span><span class="zt ${zc}">Zone ${entry.zone}</span>`;
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
    b.className = 'zchip'; b.textContent = city;
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
    A: 'Lyon, Bordeaux, Grenoble, Clermont-Ferrand, Limoges, Nantes, Rennes, Caen, Angers, Poitiers, Le Mans, Tours, Orléans',
    B: 'Paris, Versailles, Lille, Amiens, Nancy, Metz, Reims, Strasbourg, Besançon, Dijon, Rouen, Le Havre',
    C: 'Aix-Marseille, Nice, Montpellier, Toulouse, Toulon, Nîmes, Perpignan, Avignon, Bayonne, Pau',
  };
  const webcalUrl = `webcal://calendrier-fr.tibotsr.dev/zone-${zone.toLowerCase()}.ics`;
  hint.innerHTML = `
    <strong>Zone ${zone}</strong> — <span style="color:var(--t3);font-size:12px">${cities[zone]}</span><br>
    <div style="margin-top:10px;font-size:13px;color:var(--t2)">
      Ce fichier contient les <strong>jours fériés nationaux</strong> + les vacances de la <strong>Zone ${zone}</strong> uniquement.<br>
      <span class="sn">1</span> Téléchargez &nbsp; <span class="sn">2</span> Ouvrez le fichier — votre appli calendrier proposera l'import
    </div>
    <div class="zhint-btns">
      <a href="/zone-${zone.toLowerCase()}.ics" class="bp"><i class="fa-solid fa-download ui-ico" aria-hidden="true"></i>Télécharger Zone ${zone}</a>
      <a href="${webcalUrl}" class="bs"><i class="fa-solid fa-bolt ui-ico" aria-hidden="true"></i>S'abonner Zone ${zone}</a>
    </div>`;
  hint.classList.add('on');
}
