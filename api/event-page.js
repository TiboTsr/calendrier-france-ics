/**
 * api/event-page.js - Pages dediees par evenement pour le SEO
 *
 * Routes : /ferie/[slug]
 * Exemples :
 *   /ferie/paques-2026
 *   /ferie/vacances-printemps-zone-a-2026
 *   /ferie/fete-nationale-2026
 *
 * Genere un HTML statique avec :
 *   - Titre/description SEO optimises
 *   - Schema.org Event (JSON-LD)
 *   - Lien d'abonnement ICS direct
 *   - Lien retour vers la page principale
 *   - CSS minimal qui reprend les variables du site
 */

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseSlug(slug) {
  const yearMatch = slug.match(/-(\d{4})$/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);
  const namePart = slug.slice(0, -(yearMatch[0].length));
  return { namePart, year };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function formatTextWithBreaks(value) {
  return escapeHtml(value).replace(/\n/g, "<br/>");
}

function safeJsonForScript(value) {
  return JSON.stringify(value, null, 2).replace(/<\//g, "<\\/");
}

function formatDateFR(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dt);
}

function getDurationDays(start, end) {
  if (!end || end === start) return 1;
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e - s) / 86400000) + 1;
}

function buildEventSchema(event, siteUrl) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.summary,
    description: event.description || "",
    startDate: event.start,
    url: `${siteUrl}/ferie/${slugify(event.summary)}-${event.start.slice(0, 4)}`,
    organizer: {
      "@type": "Organization",
      name: "Calendrier France",
      url: siteUrl,
    },
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Country",
      name: "France",
    },
  };
  if (event.end && event.end !== event.start) {
    schema.endDate = event.end;
  }
  if (event.categories?.length) {
    schema.keywords = event.categories.join(", ");
  }
  return safeJsonForScript(schema);
}

function buildHtml(event, siteUrl, icsUrl) {
  const startFR = formatDateFR(event.start);
  const endFR = event.end && event.end !== event.start ? formatDateFR(event.end) : null;
  const duration = getDurationDays(event.start, event.end);
  const title = escapeHtml(event.summary);
  const cats = escapeHtml((event.categories || []).join(" · "));
  const zones = (event.zones || []).length
    ? escapeHtml(`Zone${event.zones.length > 1 ? "s" : ""} : ${event.zones.join(", ")}`)
    : "";
  const schema = buildEventSchema(event, siteUrl);
  const canonicalUrl = `${siteUrl}/ferie/${slugify(event.summary)}-${event.start.slice(0, 4)}`;
  const desc = event.description
    ? event.description.slice(0, 200) + (event.description.length > 200 ? "…" : "")
    : `${event.summary} — ${startFR}`;
  const safeDesc = escapeAttr(desc);
  const safeCanonicalUrl = escapeAttr(canonicalUrl);
  const safeSiteUrl = escapeAttr(siteUrl);
  const safeIcsUrl = escapeAttr(icsUrl);

  return `<!doctype html>
<html lang="fr" data-theme="dark">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} ${event.start.slice(0, 4)} — Calendrier France</title>
  <meta name="description" content="${safeDesc}"/>
  <meta name="robots" content="index,follow"/>
  <link rel="canonical" href="${safeCanonicalUrl}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:title" content="${title} ${event.start.slice(0, 4)}"/>
  <meta property="og:description" content="${safeDesc}"/>
  <meta property="og:url" content="${safeCanonicalUrl}"/>
  <meta property="og:site_name" content="Calendrier France"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
  <script type="application/ld+json">${schema}</script>
  <style>
    :root{--bg0:#07070d;--bg1:#0e0e16;--bg2:#15151e;--b:rgba(255,255,255,.07);--t1:#ededf4;--t2:#8080a0;--t3:#484860;--acc:#6b8cff;--r:11px;--rl:17px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'DM Sans',sans-serif;background:var(--bg0);color:var(--t1);min-height:100vh;-webkit-font-smoothing:antialiased}
    a{color:inherit;text-decoration:none}
    .topbar{border-bottom:1px solid var(--b);padding:0 20px;height:52px;display:flex;align-items:center;justify-content:space-between;max-width:800px;margin:0 auto}
    .brand{font-family:'Syne',sans-serif;font-weight:800;font-size:15px;display:flex;align-items:center;gap:9px}
    .flag{width:24px;height:16px;border-radius:3px;overflow:hidden;display:flex;border:1px solid rgba(0,0,0,.15)}
    .flag span{flex:1;display:block}
    .back{font-size:13px;color:var(--t2);display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid var(--b);background:var(--bg2);transition:.15s}
    .back:hover{border-color:var(--acc);color:var(--acc)}
    .page{max-width:800px;margin:0 auto;padding:40px 20px 80px}
    .eyebrow{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--acc);margin-bottom:14px}
    h1{font-family:'Syne',sans-serif;font-size:clamp(28px,5vw,44px);font-weight:800;letter-spacing:-.5px;line-height:1.1;margin-bottom:20px}
    .meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:32px}
    .mbox{padding:14px;border-radius:var(--r);border:1px solid var(--b);background:var(--bg1)}
    .ml{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--t3);margin-bottom:5px}
    .mv{font-size:14px;font-weight:600;text-transform:capitalize}
    .mbox.acc{border-color:rgba(107,140,255,.3);background:rgba(107,140,255,.08)}
    .mbox.acc .ml{color:var(--acc)}
    .mbox.acc .mv{color:var(--acc)}
    .desc-block{padding:20px;border-radius:var(--rl);border:1px solid var(--b);background:var(--bg1);font-size:15px;color:var(--t2);line-height:1.75;margin-bottom:28px}
    .cta-row{display:flex;gap:10px;flex-wrap:wrap}
    .bp{display:flex;align-items:center;justify-content:center;gap:7px;padding:12px 20px;border-radius:var(--r);background:var(--acc);color:white;font-size:14px;font-weight:700;transition:opacity .15s}
    .bp:hover{opacity:.87}
    .bs{display:flex;align-items:center;justify-content:center;gap:7px;padding:12px 20px;border-radius:var(--r);background:var(--bg2);color:var(--t2);border:1px solid var(--b);font-size:14px;font-weight:600;transition:.15s}
    .bs:hover{border-color:var(--acc);color:var(--t1)}
    footer{border-top:1px solid var(--b);padding:18px 20px;text-align:center;font-size:12px;color:var(--t3);max-width:800px;margin:0 auto}
    footer a{color:var(--acc);font-weight:600}
  </style>
</head>
<body>
  <nav class="topbar">
    <div class="brand">
      <div class="flag">
        <span style="background:#002395"></span>
        <span style="background:#ECECEC"></span>
        <span style="background:#ED2939"></span>
      </div>
      Calendrier France
    </div>
    <a href="${safeSiteUrl}/#explorer" class="back">← Retour au calendrier</a>
  </nav>

  <main class="page">
    <div class="eyebrow">${cats}</div>
    <h1>${title}</h1>

    <div class="meta-grid">
      <div class="mbox acc">
        <div class="ml">Date</div>
        <div class="mv">${escapeHtml(startFR)}</div>
      </div>
      ${endFR ? `<div class="mbox">
        <div class="ml">Fin</div>
        <div class="mv">${escapeHtml(endFR)}</div>
      </div>` : ""}
      <div class="mbox">
        <div class="ml">Durée</div>
        <div class="mv">${duration} jour${duration > 1 ? "s" : ""}</div>
      </div>
      ${zones ? `<div class="mbox">
        <div class="ml">Zones</div>
        <div class="mv">${zones}</div>
      </div>` : ""}
    </div>

    ${event.description ? `<div class="desc-block">${formatTextWithBreaks(event.description)}</div>` : ""}

    <div class="cta-row">
      <a href="${safeIcsUrl}" class="bp">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        S'abonner au calendrier complet
      </a>
      <a href="${safeSiteUrl}/#explorer" class="bs">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Voir tous les événements
      </a>
    </div>
  </main>

  <footer>
    <p>
      <a href="${safeSiteUrl}/">Calendrier France</a> ·
      Données officielles ·
      <a href="https://github.com/TiboTsr/calendrier-france-ics">Open source</a>
    </p>
  </footer>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const slug = url.searchParams.get("slug") || url.pathname.split("/ferie/")[1] || "";
    const siteUrl = `https://${req.headers.host.replace("api.", "")}`;
    const icsUrl = `webcal://${req.headers.host}/api/calendrier.ics`;

    if (!slug) {
      res.statusCode = 400;
      res.end("Slug manquant");
      return;
    }

    const parsed = parseSlug(slug);
    if (!parsed) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain");
      res.end("Page introuvable - format attendu : /ferie/nom-evenement-2026");
      return;
    }

    const sourceUrl = process.env.CALENDAR_JSON_URL || "https://calendrier-fr.tibotsr.dev/calendrier.json";
    const upstream = await fetch(sourceUrl, { cache: "no-store" });
    if (!upstream.ok) {
      res.statusCode = 502;
      res.end("Impossible de charger les donnees");
      return;
    }
    const data = await upstream.json();
    const events = Array.isArray(data.events) ? data.events : [];

    const { namePart, year } = parsed;
    const match = events.find((e) => {
      if (!e.start || !e.start.startsWith(String(year))) return false;
      return slugify(e.summary) === namePart || slugify(e.summary).startsWith(namePart);
    });

    if (!match) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html><html lang="fr"><head><meta charset="UTF-8"/><title>Événement introuvable — Calendrier France</title></head>
<body style="font-family:sans-serif;padding:40px;text-align:center;background:#07070d;color:#ededf4">
  <h1>Événement introuvable</h1>
  <p style="color:#8080a0;margin:16px 0">L'événement « ${escapeHtml(slug)} » n'existe pas ou n'est plus disponible.</p>
  <a href="${escapeAttr(siteUrl)}/" style="color:#6b8cff;font-weight:600">← Retour au calendrier</a>
</body></html>`);
      return;
    }

    const html = buildHtml(match, siteUrl, icsUrl);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.end(html);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end(`Erreur : ${err?.message || "inconnue"}`);
  }
};
