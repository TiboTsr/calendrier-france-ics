/**
 * utils.js — Constantes, helpers purs, catalogue de catégories
 * Aucune dépendance DOM. Chargé en premier.
 */

/* ── Constantes API ─────────────────────────────────── */
const DYNAMIC_API_BASE = (window.CALENDAR_API_BASE || 'api.calendrier-fr.tibotsr.dev')
  .replace(/^https?:\/\//, '').replace(/\/$/, '');

const GOOGLE_FEED_BASE = (window.CALENDAR_GOOGLE_FEED_BASE || DYNAMIC_API_BASE)
  .replace(/^https?:\/\//, '').replace(/\/$/, '');

const DYNAMIC_ICS_WEBCAL = `webcal://${DYNAMIC_API_BASE}/api/calendrier.ics`;
const DYNAMIC_ICS_HTTPS  = `https://${DYNAMIC_API_BASE}/api/calendrier.ics`;
const GOOGLE_ICS_WEBCAL  = `webcal://${GOOGLE_FEED_BASE}/api/calendrier.ics`;

/* ── Localisation ───────────────────────────────────── */
const MONTHS = [
  'janvier','février','mars','avril','mai','juin',
  'juillet','août','septembre','octobre','novembre','décembre',
];

/* ── Clés localStorage ──────────────────────────────── */
const KEYS = {
  theme:  'cal_th',
  favs:   'cal_fav',
  year:   'cal_yr',
  pe:     'cal_pe',
  a11y:   'cal_a11y',
  tuto:   'cal_tuto_v5',
};

/* ── Catalogue de catégories ────────────────────────── */
const CATS = [
  { n: 'Jours fériés',        c: '#ff5a5a', d: 'rgba(255,90,90,.12)',   b: 'rgba(255,90,90,.3)'   },
  { n: 'Vacances scolaires',  c: '#f5a020', d: 'rgba(245,160,32,.12)',  b: 'rgba(245,160,32,.3)'  },
  { n: "Changement d'heure",  c: '#3ecf8e', d: 'rgba(62,207,142,.12)',  b: 'rgba(62,207,142,.3)'  },
  { n: 'Saisons',             c: '#22d3ee', d: 'rgba(34,211,238,.12)',  b: 'rgba(34,211,238,.3)'  },
  { n: 'Ponts / Congés',      c: '#fb923c', d: 'rgba(251,146,60,.12)',  b: 'rgba(251,146,60,.3)'  },
  { n: 'Événements spéciaux', c: '#a78bfa', d: 'rgba(167,139,250,.12)', b: 'rgba(167,139,250,.3)' },
  { n: 'Commercial',          c: '#f472b6', d: 'rgba(244,114,182,.12)', b: 'rgba(244,114,182,.3)' },
  { n: 'Christianisme',       c: '#e2c074', d: 'rgba(226,192,116,.12)', b: 'rgba(226,192,116,.3)' },
  { n: 'Culture',             c: '#6b8cff', d: 'rgba(107,140,255,.12)', b: 'rgba(107,140,255,.3)' },
  { n: 'Astronomie',          c: '#60a5fa', d: 'rgba(96,165,250,.12)',  b: 'rgba(96,165,250,.3)'  },
  { n: 'Société',             c: '#94a3b8', d: 'rgba(148,163,184,.12)', b: 'rgba(148,163,184,.3)' },
  { n: 'Élections',          c: '#f43f5e', d: 'rgba(244,63,94,.12)',   b: 'rgba(244,63,94,.3)'   },
];

/** Retourne la définition couleur d'une catégorie (fallback bleu). */
function cd(name) {
  return CATS.find(c => c.n === name) || { c: '#6b8cff', d: 'rgba(107,140,255,.12)', b: 'rgba(107,140,255,.3)' };
}
window.cd = cd; // exposé pour calendar-grid.js

/* ── Profils avancés ────────────────────────────────── */
const PROFILES = {
  complet:  null, // null = tout
  essentiel: ['Jours fériés', 'Vacances scolaires', 'Ponts / Congés'],
  familial:  ['Jours fériés', 'Vacances scolaires', 'Saisons', 'Événements spéciaux', 'Christianisme', 'Culture'],
  pro:       ['Jours fériés', 'Ponts / Congés', 'Commercial', 'Événements spéciaux'],
};

/* ── Infos app picker ───────────────────────────────── */
const APP_INFO = {
  apple: {
    url:   () => DYNAMIC_ICS_WEBCAL,
    sub:   () => DYNAMIC_ICS_WEBCAL,
    steps: `<span class="sn">1</span> Copiez l'URL ci-dessus &nbsp;·&nbsp;
            <span class="sn">2</span> Sur <strong>iPhone</strong> : Réglages → Calendrier → Comptes → Ajouter un compte → Autre → Abonnement calendrier → collez &nbsp;·&nbsp;
            <span class="sn">3</span> Sur <strong>Mac</strong> : Calendar → Fichier → Nouvel abonnement calendrier`,
  },
  google: {
    url:   () => GOOGLE_ICS_WEBCAL,
    sub:   () => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(GOOGLE_ICS_WEBCAL)}`,
    steps: `<span class="sn">1</span> Copiez l'URL ci-dessus &nbsp;·&nbsp;
            <span class="sn">2</span> Google Calendar → <strong>+ Autres agendas → À partir d'une URL</strong> → collez et validez &nbsp;·&nbsp;
            <em style="opacity:.65">Note : Google peut prendre 12-24h pour la première sync.</em>`,
  },
  outlook: {
    url:   () => DYNAMIC_ICS_WEBCAL,
    sub:   () => `https://outlook.live.com/calendar/0/deeplink/compose?rru=addsubscription&url=${encodeURIComponent(DYNAMIC_ICS_WEBCAL)}`,
    steps: `<span class="sn">1</span> Cliquez <strong>S'abonner maintenant</strong> ci-dessous — Outlook s'ouvre automatiquement &nbsp;·&nbsp;
            <em style="opacity:.65">ou</em> : Calendrier → Ajouter un calendrier → S'abonner par Internet → collez`,
  },
};

/* ── Helpers date ───────────────────────────────────── */
/** Parse "YYYY-MM-DD" → Date locale (sans timezone) */
function pd(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Formate une date en français long */
function fmt(d) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
}

/** Formate une date en français court */
function fmts(d) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(d);
}

/** Jour de la semaine abrégé */
function fmtwd(d) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(d).replace('.', '');
}

/** Normalise une chaîne pour la recherche (minuscules, sans accents) */
function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Échappe le HTML pour éviter les injections */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Compte les jours ouvrés entre deux dates incluses */
function countWeekdays(start, end) {
  if (!start || !end) return 0;
  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const to   = new Date(end.getFullYear(),   end.getMonth(),   end.getDate());
  if (to < from) return 0;
  let count = 0;
  const cur = new Date(from);
  while (cur <= to) {
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/* ── Toast ──────────────────────────────────────────── */
function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ── App loader ─────────────────────────────────────── */
const APP_LOADER_STARTED_AT = Date.now();

function hideAppLoader() {
  const loader = document.getElementById('app-loader');
  if (!loader) return;
  const wait = Math.max(0, 300 - (Date.now() - APP_LOADER_STARTED_AT));
  setTimeout(() => {
    loader.classList.add('done');
    document.body.classList.remove('app-loading');
    setTimeout(() => loader.remove(), 260);
  }, wait);
}
window.addEventListener('load', () => setTimeout(hideAppLoader, 1200), { once: true });