/**
 * api/event-page.js — Pages dédiées par événement
 * Refonte complète : page éditoriale riche avec
 *  - Header avec couleur catégorie + compte à rebours
 *  - Grille d'occurrences sur toutes les années
 *  - Événements voisins (avant / après)
 *  - CTA zone-aware pour les vacances scolaires
 *  - Schema.org Event complet
 *  - Design cohérent avec le site principal
 */

function slugify(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parseSlug(slug) {
  const yearMatch = slug.match(/-(\d{4})$/);
  if (!yearMatch) return null;
  return { namePart: slug.slice(0, -(yearMatch[0].length)), year: parseInt(yearMatch[1], 10) };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeJson(value) {
  return JSON.stringify(value, null, 2).replace(/<\//g, '<\\/');
}

function formatDateFR(dateStr, opts = {}) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: opts.short ? undefined : 'long',
    day: 'numeric', month: 'long', year: 'numeric', ...opts
  }).format(new Date(y, m - 1, d));
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(y, m - 1, d));
}

function getDurationDays(start, end) {
  if (!end || end === start) return 1;
  return Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
}

function getDayOfYear(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const start = new Date(y, 0, 0);
  return Math.floor((date - start) / 86400000);
}

function getISOWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function getDaysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  target.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

// Couleurs catégorie — miroir de utils.js
const CAT_COLORS = {
  'Jours fériés':        { c: '#ff5a5a', d: 'rgba(255,90,90,.12)',   b: 'rgba(255,90,90,.3)'   },
  'Vacances scolaires':  { c: '#f5a020', d: 'rgba(245,160,32,.12)',  b: 'rgba(245,160,32,.3)'  },
  'Saisons':             { c: '#22d3ee', d: 'rgba(34,211,238,.12)',  b: 'rgba(34,211,238,.3)'  },
  'Astronomie':          { c: '#60a5fa', d: 'rgba(96,165,250,.12)',  b: 'rgba(96,165,250,.3)'  },
  "Changement d'heure":  { c: '#3ecf8e', d: 'rgba(62,207,142,.12)',  b: 'rgba(62,207,142,.3)'  },
  'Christianisme':       { c: '#e2c074', d: 'rgba(226,192,116,.12)', b: 'rgba(226,192,116,.3)' },
  'Fêtes':               { c: '#8b5cf6', d: 'rgba(139,92,246,.12)',  b: 'rgba(139,92,246,.3)'  },
  'Culture':             { c: '#6b8cff', d: 'rgba(107,140,255,.12)', b: 'rgba(107,140,255,.3)' },
  'Société':             { c: '#94a3b8', d: 'rgba(148,163,184,.12)', b: 'rgba(148,163,184,.3)' },
  'Mémoire':             { c: '#64748b', d: 'rgba(100,116,139,.12)', b: 'rgba(100,116,139,.3)' },
  'Sport':               { c: '#06b6d4', d: 'rgba(6,182,212,.12)',   b: 'rgba(6,182,212,.3)'   },
  'Santé':               { c: '#ef4444', d: 'rgba(239,68,68,.12)',   b: 'rgba(239,68,68,.3)'   },
  'Éducation':           { c: '#0ea5e9', d: 'rgba(14,165,233,.12)',  b: 'rgba(14,165,233,.3)'  },
  'Examens':             { c: '#14b8a6', d: 'rgba(20,184,166,.12)',  b: 'rgba(20,184,166,.3)'  },
  'Élections':           { c: '#f43f5e', d: 'rgba(244,63,94,.12)',   b: 'rgba(244,63,94,.3)'   },
  'Ponts / Congés':      { c: '#fb923c', d: 'rgba(251,146,60,.12)',  b: 'rgba(251,146,60,.3)'  },
  'Commerce':            { c: '#4f7cff', d: 'rgba(79,124,255,.12)',  b: 'rgba(79,124,255,.3)'  },
  'Gastronomie':         { c: '#f59e0b', d: 'rgba(245,158,11,.12)',  b: 'rgba(245,158,11,.3)'  },
  'Environnement':       { c: '#10b981', d: 'rgba(16,185,129,.12)',  b: 'rgba(16,185,129,.3)'  },
  'Lunaire':             { c: '#4f46e5', d: 'rgba(79,70,229,.12)',   b: 'rgba(79,70,229,.3)'   },
  'Dates spéciales':     { c: '#a78bfa', d: 'rgba(167,139,250,.12)', b: 'rgba(167,139,250,.3)' },
  'JO':                  { c: '#0369a1', d: 'rgba(3,105,161,.12)',   b: 'rgba(3,105,161,.3)'   },
};

function getCatColor(cat) {
  return CAT_COLORS[cat] || { c: '#6b8cff', d: 'rgba(107,140,255,.12)', b: 'rgba(107,140,255,.3)' };
}

function getCatEmoji(cats, summary) {
  const title = (summary || '').toLowerCase();
  const c = (cats || [])[0] || '';
  if (c === 'Jours fériés') {
    if (title.includes('noël')) return '🎄';
    if (title.includes('travail')) return '🛠️';
    if (title.includes('victoire') || title.includes('armistice')) return '🎖️';
    if (title.includes('nationale')) return '🎆';
    if (title.includes('toussaint')) return '🕯️';
    return '🔴';
  }
  if (c === 'Vacances scolaires') {
    if (title.includes('été')) return '🏖️';
    if (title.includes('noël')) return '⛄';
    if (title.includes('hiver')) return '⛷️';
    if (title.includes('printemps')) return '🌱';
    if (title.includes('toussaint')) return '🍂';
    return '🎒';
  }
  if (c === 'Saisons') {
    if (title.includes('printemps')) return '🌸';
    if (title.includes('été')) return '☀️';
    if (title.includes('automne')) return '🍁';
    if (title.includes('hiver')) return '❄️';
  }
  if (c === "Changement d'heure") return '⏰';
  if (c === 'Astronomie') return '🌙';
  if (c === 'Christianisme') return '⛪';
  if (c === 'Sport') return '🏆';
  if (c === 'Santé') return '❤️';
  if (c === 'Fêtes') return '🥂';
  if (c === 'Mémoire') return '🕊️';
  if (c === 'Élections') return '🗳️';
  if (c === 'Examens') return '📝';
  if (c === 'Culture') return '🎭';
  if (c === 'Environnement') return '🌿';
  return '📅';
}

function countdownLabel(days) {
  if (days < 0) return { text: `Il y a ${Math.abs(days)} jour${Math.abs(days) > 1 ? 's' : ''}`, past: true };
  if (days === 0) return { text: "Aujourd'hui !", past: false };
  if (days === 1) return { text: 'Demain', past: false };
  if (days < 7)  return { text: `Dans ${days} jours`, past: false };
  if (days < 30) return { text: `Dans ${Math.round(days/7)} semaine${Math.round(days/7) > 1 ? 's' : ''}`, past: false };
  if (days < 365) return { text: `Dans ${Math.round(days/30)} mois`, past: false };
  return { text: `Dans ${Math.round(days/365)} an${Math.round(days/365) > 1 ? 's' : ''}`, past: false };
}

function zoneLabel(z) {
  if (z === 'AM') return 'Alsace-Moselle';
  return `Zone ${z}`;
}

function buildEventSchema(event, siteUrl) {
  const schema = {
    '@context': 'https://schema.org', '@type': 'Event',
    name: event.summary, description: event.description || '',
    startDate: event.start,
    url: `${siteUrl}/event/${slugify(event.summary)}-${event.start.slice(0, 4)}`,
    organizer: { '@type': 'Organization', name: 'Calendrier France', url: siteUrl },
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Country', name: 'France' },
  };
  if (event.end && event.end !== event.start) schema.endDate = event.end;
  if (event.categories?.length) schema.keywords = event.categories.join(', ');
  return safeJson(schema);
}

function buildHtml(event, siblings, allOccurrences, siteUrl, icsUrl) {
  const mainCat   = (event.categories || [])[0] || 'Dates spéciales';
  const def       = getCatColor(mainCat);
  const emoji     = getCatEmoji(event.categories, event.summary);
  const duration  = getDurationDays(event.start, event.end);
  const isRange   = event.end && event.end !== event.start;
  const daysUntil = getDaysUntil(event.start);
  const cd        = countdownLabel(daysUntil);
  const isoWeek   = getISOWeek(event.start);
  const dayOfYear = getDayOfYear(event.start);
  const year      = event.start.slice(0, 4);
  const isVacances = (event.categories || []).includes('Vacances scolaires');
  const zones      = (event.zones || []).filter(z => z && z !== 'all');

  // Autres occurrences du même événement triées
  const otherYears = allOccurrences
    .filter(e => e.start !== event.start)
    .sort((a, b) => a.start.localeCompare(b.start));
  const pastOccurrences   = otherYears.filter(e => e.start < event.start).slice(-3);
  const futureOccurrences = otherYears.filter(e => e.start > event.start).slice(0, 3);

  // Voisins dans le calendrier global
  const prevEvent = siblings.prev;
  const nextEvent = siblings.next;

  const canonicalUrl = `${siteUrl}/event/${slugify(event.summary)}-${year}`;
  const desc = event.description ? event.description.slice(0, 160) + (event.description.length > 160 ? '…' : '') : `${event.summary} — ${formatDateFR(event.start)}`;

  return `<!doctype html>
<html lang="fr" data-theme="dark">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escapeHtml(event.summary)} ${year} — Calendrier France</title>
  <meta name="description" content="${escapeHtml(desc)}"/>
  <meta name="robots" content="index,follow"/>
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:title" content="${escapeHtml(event.summary)} ${year} — Calendrier France"/>
  <meta property="og:description" content="${escapeHtml(desc)}"/>
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}"/>
  <meta property="og:site_name" content="Calendrier France"/>
  <link rel="icon" type="image/svg+xml" href="/img/icon.svg"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"/>
  <script type="application/ld+json">${buildEventSchema(event, siteUrl)}</script>
  <style>
    :root {
      --bg0:#07070d; --bg1:#0e0e16; --bg2:#15151e; --bg3:#1c1c27; --bg4:#232330;
      --b:rgba(255,255,255,.07); --bh:rgba(255,255,255,.14); --ba:rgba(255,255,255,.26);
      --t1:#ededf4; --t2:#8080a0; --t3:#484860;
      --acc:#6b8cff; --accd:rgba(107,140,255,.10); --accb:rgba(107,140,255,.28);
      --r:11px; --rl:17px; --rxl:23px;
      --ff:'DM Sans',sans-serif; --ffd:'Syne',sans-serif; --ffm:'DM Mono',monospace;
      --cat-c:${def.c}; --cat-d:${def.d}; --cat-b:${def.b};
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: var(--ff); background: var(--bg0); color: var(--t1); line-height: 1.6; font-size: 15px; -webkit-font-smoothing: antialiased; }
    a { color: inherit; text-decoration: none; }
    button { font-family: var(--ff); cursor: pointer; border: none; background: none; color: inherit; }

    /* ── Topbar ── */
    .topbar { position: sticky; top: 0; z-index: 50; border-bottom: 1px solid var(--b); background: color-mix(in srgb, var(--bg0) 88%, transparent); backdrop-filter: blur(20px); }
    .topbar-in { max-width: 860px; margin: 0 auto; padding: 0 20px; height: 54px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .brand { font-family: var(--ffd); font-weight: 800; font-size: 16px; display: flex; align-items: center; gap: 10px; }
    .flag { width: 26px; height: 18px; border-radius: 3px; overflow: hidden; display: flex; border: 1px solid rgba(0,0,0,.15); flex-shrink: 0; }
    .flag span { flex: 1; display: block; }
    .back { font-size: 13px; font-weight: 600; color: var(--t2); display: flex; align-items: center; gap: 7px; padding: 7px 14px; border-radius: 999px; border: 1px solid var(--b); background: var(--bg2); transition: .15s; }
    .back:hover { border-color: var(--cat-c); color: var(--cat-c); }
    .back i { font-size: 11px; }

    /* ── Hero ── */
    .hero {
      position: relative; overflow: hidden;
      padding: 56px 20px 48px;
      border-bottom: 1px solid var(--b);
    }
    .hero::before {
      content: '';
      position: absolute; inset: 0;
      background: radial-gradient(ellipse 60% 80% at 50% -10%, var(--cat-d), transparent 70%);
      pointer-events: none;
    }
    .hero-in { max-width: 860px; margin: 0 auto; position: relative; }

    .hero-eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
      color: var(--cat-c); margin-bottom: 20px;
      padding: 5px 14px; border-radius: 999px;
      background: var(--cat-d); border: 1px solid var(--cat-b);
    }
    .hero-emoji { font-size: 52px; display: block; margin-bottom: 16px; line-height: 1; }

    .hero h1 {
      font-family: var(--ffd); font-size: clamp(28px, 5vw, 52px);
      font-weight: 800; letter-spacing: -1px; line-height: 1.08;
      margin-bottom: 20px;
    }
    .hero h1 em { font-style: normal; color: var(--cat-c); }

    /* Countdown badge */
    .countdown {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 20px; border-radius: 999px;
      font-size: 15px; font-weight: 700; margin-bottom: 28px;
      border: 1.5px solid var(--cat-b); background: var(--cat-d); color: var(--cat-c);
    }
    .countdown.past { background: var(--bg2); color: var(--t3); border-color: var(--b); }
    .countdown i { font-size: 13px; }

    /* ── Grid infos ── */
    .page { max-width: 860px; margin: 0 auto; padding: 0 20px; }
    .section { padding: 40px 0; border-bottom: 1px solid var(--b); }
    .section:last-child { border-bottom: none; }
    .section-title {
      font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
      color: var(--t3); margin-bottom: 16px; display: flex; align-items: center; gap: 8px;
    }
    .section-title::after { content: ''; flex: 1; height: 1px; background: var(--b); }

    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
    .info-card {
      padding: 16px; border-radius: var(--r); border: 1px solid var(--b); background: var(--bg1);
      display: flex; flex-direction: column; gap: 5px;
    }
    .info-card.accent { border-color: var(--cat-b); background: var(--cat-d); }
    .info-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--t3); }
    .info-card.accent .info-label { color: var(--cat-c); opacity: .8; }
    .info-value { font-size: 15px; font-weight: 700; color: var(--t1); line-height: 1.3; }
    .info-card.accent .info-value { color: var(--cat-c); }
    .info-sub { font-size: 12px; color: var(--t3); margin-top: 2px; }

    /* ── Description ── */
    .desc-block {
      padding: 20px 22px; border-radius: var(--rl);
      border: 1px solid var(--b); background: var(--bg1);
      font-size: 15px; color: var(--t2); line-height: 1.8;
    }

    /* ── Catégories + zones ── */
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px; border-radius: 999px;
      font-size: 12px; font-weight: 600;
      border: 1px solid var(--b); background: var(--bg2); color: var(--t2);
    }
    .chip.cat { border-color: var(--cat-b); background: var(--cat-d); color: var(--cat-c); }
    .chip.zone { border-color: var(--accb); background: var(--accd); color: var(--acc); }
    .chip i { font-size: 10px; }

    /* ── Occurrences ── */
    .occ-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .occ-pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 14px; border-radius: var(--r);
      font-size: 13px; font-weight: 600;
      border: 1px solid var(--b); background: var(--bg1);
      color: var(--t2); transition: .15s; text-decoration: none;
    }
    .occ-pill:hover { border-color: var(--cat-b); color: var(--cat-c); }
    .occ-pill.current {
      border-color: var(--cat-b); background: var(--cat-d);
      color: var(--cat-c); font-weight: 800; cursor: default;
    }
    .occ-pill .occ-year { font-family: var(--ffm); font-size: 12px; }
    .occ-pill .occ-date { font-size: 11px; opacity: .7; }

    /* ── Voisins ── */
    .neighbors { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .neighbor {
      padding: 16px; border-radius: var(--rl); border: 1px solid var(--b);
      background: var(--bg1); text-decoration: none; transition: .18s;
      display: flex; flex-direction: column; gap: 6px;
    }
    .neighbor:hover { border-color: var(--bh); transform: translateY(-2px); }
    .neighbor-dir { font-size: 10px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--t3); display: flex; align-items: center; gap: 5px; }
    .neighbor-name { font-size: 14px; font-weight: 700; color: var(--t1); line-height: 1.3; }
    .neighbor-date { font-size: 12px; color: var(--t3); }
    .neighbor-cat {
      display: inline-flex; align-items: center; padding: 2px 8px;
      border-radius: 999px; font-size: 10px; font-weight: 700;
      border: 1px solid; margin-top: 2px; width: fit-content;
    }

    /* ── CTA ── */
    .cta-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn-p {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 13px 22px; border-radius: var(--r);
      background: var(--cat-c); color: #fff;
      font-size: 14px; font-weight: 700; transition: opacity .15s;
      text-decoration: none;
    }
    .btn-p:hover { opacity: .85; }
    .btn-s {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 13px 20px; border-radius: var(--r);
      background: var(--bg2); color: var(--t2);
      border: 1px solid var(--b); font-size: 14px; font-weight: 600; transition: .15s;
      text-decoration: none;
    }
    .btn-s:hover { border-color: var(--bh); color: var(--t1); }

    /* CTA zones vacances */
    .zone-cta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 8px; margin-top: 12px; }
    .zone-cta {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 16px; border-radius: var(--r);
      border: 1px solid var(--b); background: var(--bg1);
      text-decoration: none; font-size: 13px; font-weight: 600;
      color: var(--t2); transition: .15s;
    }
    .zone-cta:hover { border-color: var(--cat-b); color: var(--cat-c); background: var(--cat-d); }
    .zone-cta i { color: var(--cat-c); font-size: 12px; }

    /* ── Footer ── */
    footer { border-top: 1px solid var(--b); padding: 24px 20px; text-align: center; }
    .footer-links { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; margin-bottom: 10px; }
    .footer-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--t2); }
    .footer-link:hover { color: var(--t1); }
    .footer-link.acc { color: var(--cat-c); }
    .footer-meta { font-size: 12px; color: var(--t3); margin-top: 6px; }
    .footer-meta a { color: var(--t3); text-decoration: underline; text-underline-offset: 2px; }

    /* ── Responsive ── */
    @media (max-width: 600px) {
      .hero { padding: 40px 16px 36px; }
      .page { padding: 0 16px; }
      .neighbors { grid-template-columns: 1fr; }
      .info-grid { grid-template-columns: 1fr 1fr; }
      .hero-emoji { font-size: 40px; }
    }

    /* ── Animations ── */
    @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
    .hero-emoji, .hero-eyebrow, .hero h1, .countdown { animation: fadeUp .4s ease both; }
    .hero-eyebrow  { animation-delay: .05s; }
    .hero h1       { animation-delay: .1s; }
    .countdown     { animation-delay: .15s; }
  </style>
</head>
<body>
  <nav class="topbar">
    <div class="topbar-in">
      <div class="brand">
        <div class="flag">
          <span style="background:#002395"></span>
          <span style="background:#ECECEC"></span>
          <span style="background:#ED2939"></span>
        </div>
        Calendrier France
      </div>
      <a href="/#explorer" class="back">
        <i class="fa-solid fa-arrow-left"></i> Retour au calendrier
      </a>
    </div>
  </nav>

  <!-- ── HERO ── -->
  <section class="hero">
    <div class="hero-in">
      <div class="hero-eyebrow">
        <i class="fa-solid fa-tag"></i>
        ${escapeHtml((event.categories || []).join(' · ') || 'Événement')}
      </div>
      <span class="hero-emoji" role="img" aria-label="${escapeHtml(mainCat)}">${emoji}</span>
      <h1>${escapeHtml(event.summary)}<br/><em>${year}</em></h1>

      <div class="countdown${cd.past ? ' past' : ''}">
        <i class="fa-${cd.past ? 'regular fa-clock' : 'solid fa-calendar-days'}"></i>
        ${escapeHtml(cd.text)}
        ${!cd.past && daysUntil > 0 ? `<span style="opacity:.6;font-weight:400">— ${escapeHtml(formatDateFR(event.start))}</span>` : ''}
      </div>
    </div>
  </section>

  <div class="page">

    <!-- ── INFOS CLÉS ── -->
    <section class="section">
      <div class="section-title"><i class="fa-solid fa-circle-info"></i> Informations</div>
      <div class="info-grid">
        <div class="info-card accent">
          <div class="info-label">${isRange ? 'Du' : 'Date'}</div>
          <div class="info-value">${escapeHtml(formatDateFR(event.start))}</div>
          ${isRange ? `<div class="info-sub">au ${escapeHtml(formatDateFR(event.end))}</div>` : ''}
        </div>
        <div class="info-card">
          <div class="info-label">Durée</div>
          <div class="info-value">${duration} jour${duration > 1 ? 's' : ''}</div>
          ${duration > 1 ? `<div class="info-sub">${Math.ceil(duration / 7)} semaine${Math.ceil(duration / 7) > 1 ? 's' : ''}</div>` : ''}
        </div>
        <div class="info-card">
          <div class="info-label">Semaine ISO</div>
          <div class="info-value">S${isoWeek.toString().padStart(2, '0')}</div>
          <div class="info-sub">Jour ${dayOfYear} de l'année</div>
        </div>
        ${zones.length ? `
        <div class="info-card">
          <div class="info-label">Zone${zones.length > 1 ? 's' : ''} scolaire${zones.length > 1 ? 's' : ''}</div>
          <div class="info-value">${zones.map(z => escapeHtml(zoneLabel(z))).join(', ')}</div>
        </div>` : ''}
      </div>
    </section>

    <!-- ── DESCRIPTION ── -->
    ${event.description ? `
    <section class="section">
      <div class="section-title"><i class="fa-solid fa-book-open"></i> À propos</div>
      <div class="desc-block">${escapeHtml(event.description).replace(/\n/g, '<br/>')}</div>
    </section>` : ''}

    <!-- ── CATÉGORIES & ZONES ── -->
    <section class="section">
      <div class="section-title"><i class="fa-solid fa-tags"></i> Catégories</div>
      <div class="chips">
        ${(event.categories || []).map(c => {
          const cd2 = getCatColor(c);
          return `<span class="chip cat" style="border-color:${cd2.b};background:${cd2.d};color:${cd2.c}">
            <i class="fa-solid fa-circle" style="font-size:6px"></i>${escapeHtml(c)}
          </span>`;
        }).join('')}
        ${zones.map(z => `<span class="chip zone"><i class="fa-solid fa-location-dot"></i>${escapeHtml(zoneLabel(z))}</span>`).join('')}
      </div>
    </section>

    <!-- ── OCCURRENCES ── -->
    ${allOccurrences.length > 1 ? `
    <section class="section">
      <div class="section-title"><i class="fa-solid fa-rotate"></i> Autres années</div>
      <div class="occ-grid">
        ${pastOccurrences.map(e => {
          const y2 = e.start.slice(0, 4);
          return `<a href="/event/${escapeHtml(slugify(e.summary))}-${y2}" class="occ-pill">
            <span class="occ-year">${y2}</span>
            <span class="occ-date">${escapeHtml(formatDateShort(e.start))}</span>
          </a>`;
        }).join('')}
        <span class="occ-pill current">
          <span class="occ-year">${year}</span>
          <span class="occ-date">${escapeHtml(formatDateShort(event.start))}</span>
          <i class="fa-solid fa-circle-dot" style="font-size:8px;margin-left:2px"></i>
        </span>
        ${futureOccurrences.map(e => {
          const y2 = e.start.slice(0, 4);
          return `<a href="/event/${escapeHtml(slugify(e.summary))}-${y2}" class="occ-pill">
            <span class="occ-year">${y2}</span>
            <span class="occ-date">${escapeHtml(formatDateShort(e.start))}</span>
          </a>`;
        }).join('')}
      </div>
    </section>` : ''}

    <!-- ── ÉVÉNEMENTS VOISINS ── -->
    ${(prevEvent || nextEvent) ? `
    <section class="section">
      <div class="section-title"><i class="fa-solid fa-arrows-left-right"></i> Dans le calendrier</div>
      <div class="neighbors">
        ${prevEvent ? (() => {
          const pCat = (prevEvent.categories || [])[0] || 'Divers';
          const pDef = getCatColor(pCat);
          return `<a href="/event/${escapeHtml(slugify(prevEvent.summary))}-${prevEvent.start.slice(0,4)}" class="neighbor">
            <div class="neighbor-dir"><i class="fa-solid fa-arrow-left"></i> Précédent</div>
            <div class="neighbor-name">${escapeHtml(prevEvent.summary)}</div>
            <div class="neighbor-date">${escapeHtml(formatDateShort(prevEvent.start))}</div>
            <span class="neighbor-cat" style="color:${pDef.c};background:${pDef.d};border-color:${pDef.b}">${escapeHtml(pCat)}</span>
          </a>`;
        })() : `<div></div>`}
        ${nextEvent ? (() => {
          const nCat = (nextEvent.categories || [])[0] || 'Divers';
          const nDef = getCatColor(nCat);
          return `<a href="/event/${escapeHtml(slugify(nextEvent.summary))}-${nextEvent.start.slice(0,4)}" class="neighbor" style="text-align:right;align-items:flex-end">
            <div class="neighbor-dir" style="flex-direction:row-reverse">Suivant <i class="fa-solid fa-arrow-right"></i></div>
            <div class="neighbor-name">${escapeHtml(nextEvent.summary)}</div>
            <div class="neighbor-date">${escapeHtml(formatDateShort(nextEvent.start))}</div>
            <span class="neighbor-cat" style="color:${nDef.c};background:${nDef.d};border-color:${nDef.b}">${escapeHtml(nCat)}</span>
          </a>`;
        })() : `<div></div>`}
      </div>
    </section>` : ''}

    <!-- ── CTA ABONNEMENT ── -->
    <section class="section">
      <div class="section-title"><i class="fa-solid fa-bolt"></i> S'abonner au calendrier</div>
      <div class="cta-row">
        <a href="${escapeHtml(icsUrl)}" class="btn-p">
          <i class="fa-solid fa-bolt"></i>
          ${isVacances && zones.length ? `S'abonner — ${escapeHtml(zones.map(z => zoneLabel(z)).join(' + '))}` : 'S\'abonner au calendrier complet'}
        </a>
        <a href="/#explorer" class="btn-s">
          <i class="fa-regular fa-calendar"></i> Voir tous les événements
        </a>
      </div>
      ${isVacances && zones.length < 3 ? `
      <div style="margin-top:10px;font-size:13px;color:var(--t3)">Ou s'abonner par zone :</div>
      <div class="zone-cta-grid">
        ${['A', 'B', 'C'].map(z => {
          const wc = `webcal://calendrier-fr.tibotsr.dev/api/calendrier.ics?zone=${z}&cats=Vacances+scolaires,Jours+f%C3%A9ri%C3%A9s`;
          return `<a href="${wc}" class="zone-cta">
            <i class="fa-solid fa-bolt"></i>Zone ${z}
          </a>`;
        }).join('')}
      </div>` : ''}
    </section>

  </div>

  <footer>
    <div class="page">
      <div class="footer-links">
        <a href="/" class="footer-link acc"><i class="fa-solid fa-house"></i>Accueil</a>
        <a href="/#sync" class="footer-link"><i class="fa-solid fa-bolt"></i>S'abonner</a>
        <a href="/#zone" class="footer-link"><i class="fa-solid fa-location-dot"></i>Trouver ma zone</a>
        <a href="https://github.com/TiboTsr/calendrier-france-ics/issues" target="_blank" rel="noopener" class="footer-link">
          <i class="fa-solid fa-bug"></i>Signaler une erreur
        </a>
      </div>
      <p class="footer-meta">
        Données officielles : <a href="https://data.education.gouv.fr" target="_blank" rel="noopener">Ministère de l'Éducation Nationale</a>
        · <a href="https://github.com/TiboTsr/calendrier-france-ics" target="_blank" rel="noopener">Open source</a>
      </p>
    </div>
  </footer>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  try {
    const url     = new URL(req.url, `https://${req.headers.host}`);
    const slug    = url.searchParams.get('slug') || url.pathname.split('/event/')[1] || '';
    const siteUrl = `https://${req.headers.host}`;
    const icsUrl  = `webcal://${req.headers.host}/api/calendrier.ics`;

    if (!slug) { res.statusCode = 400; res.end('Slug manquant'); return; }

    const parsed = parseSlug(slug);
    if (!parsed) {
      res.statusCode = 404; res.setHeader('Content-Type', 'text/plain');
      res.end('Format attendu : /event/nom-evenement-2026'); return;
    }

    const sourceUrl = process.env.CALENDAR_JSON_URL || 'https://calendrier-fr.tibotsr.dev/calendrier.json';
    const upstream  = await fetch(sourceUrl, { cache: 'no-store' });
    if (!upstream.ok) { res.statusCode = 502; res.end('Impossible de charger les données'); return; }

    const data   = await upstream.json();
    const events = Array.isArray(data.events) ? data.events : [];

    const { namePart, year } = parsed;

    // Trouver l'événement correspondant au slug + année
    const match = events.find(e => {
      if (!e.start || !e.start.startsWith(String(year))) return false;
      return slugify(e.summary) === namePart || slugify(e.summary).startsWith(namePart);
    });

    if (!match) {
      res.statusCode = 404; res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="fr"><head><meta charset="UTF-8"/><title>Introuvable — Calendrier France</title>
<style>body{font-family:sans-serif;background:#07070d;color:#ededf4;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;text-align:center;padding:20px}a{color:#6b8cff}</style>
</head><body>
  <div style="font-size:48px">📅</div>
  <h1 style="font-size:22px">Événement introuvable</h1>
  <p style="color:#8080a0">« ${escapeHtml(slug)} » n'existe pas ou n'est plus disponible.</p>
  <a href="/">← Retour au calendrier</a>
</body></html>`);
      return;
    }

    // Toutes les occurrences du même événement (même nom, toutes années)
    const allOccurrences = events.filter(e => slugify(e.summary) === slugify(match.summary))
      .sort((a, b) => a.start.localeCompare(b.start));

    // Événements voisins dans le calendrier global (trié par date)
    const sorted  = [...events].sort((a, b) => a.start.localeCompare(b.start));
    const idx     = sorted.findIndex(e => e.start === match.start && e.summary === match.summary);
    const siblings = {
      prev: idx > 0 ? sorted[idx - 1] : null,
      next: idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };

    const html = buildHtml(match, siblings, allOccurrences, siteUrl, icsUrl);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.end(html);
  } catch (err) {
    res.statusCode = 500; res.setHeader('Content-Type', 'text/plain');
    res.end(`Erreur : ${err?.message || 'inconnue'}`);
  }
};