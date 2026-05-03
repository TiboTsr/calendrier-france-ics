/**
 * api/event-page.js — Pages dédiées par événement
 * Fixes :
 *  - getDaysUntil : comparaison en heure locale Paris (Europe/Paris) via Intl
 *  - Slug with date : /event/premier-quartier-2026-01-26 pour éviter l'ambiguïté entre occurrences du même nom
 *  - Occurrences groupées par année + navigation claire
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

/**
 * Slug enrichi avec la date exacte pour les événements récurrents fréquemment.
 * Format : {name}-{YYYY}-{MM}-{DD}  ex: premier-quartier-2026-01-26
 */
function slugifyWithDate(summary, dateStr) {
  return `${slugify(summary)}-${dateStr}`;
}

function parseSlug(slug) {
  const dateMatch = slug.match(/-(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    const exactDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    const namePart = slug.slice(0, -dateMatch[0].length);
    return { namePart, year: parseInt(dateMatch[1], 10), exactDate };
  }
  const yearMatch = slug.match(/-(\d{4})$/);
  if (!yearMatch) return null;
  return {
    namePart: slug.slice(0, -yearMatch[0].length),
    year: parseInt(yearMatch[1], 10),
    exactDate: null,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJson(value) {
  return JSON.stringify(value, null, 2).replace(/<\//g, "<\\/");
}

function formatDateFR(dateStr, opts = {}) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: opts.short ? undefined : "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...opts,
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function formatDateShort(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function getDurationDays(start, end) {
  if (!end || end === start) return 1;
  return Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
}

function addDaysISO(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function toIcsDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${y}${m}${d}`;
}

function escapeIcsText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function buildSingleEventIcs(event, domain) {
  const uid = `${slugifyWithDate(event.summary, event.start)}@${domain}`;
  const dtstamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  const start = event.start;
  const endInclusive =
    event.end && event.end !== event.start ? event.end : event.start;
  const dtendExclusive = addDaysISO(endInclusive, 1);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calendrier France//Event Page//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `SUMMARY:${escapeIcsText(event.summary || "")}`,
    `DTSTART;VALUE=DATE:${toIcsDate(start)}`,
    `DTEND;VALUE=DATE:${toIcsDate(dtendExclusive)}`,
  ];

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }
  if (Array.isArray(event.categories) && event.categories.length) {
    const cats = event.categories
      .map((c) => escapeIcsText(c).replace(/,/g, "\\,"))
      .join(",");
    lines.push(`CATEGORIES:${cats}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR", "");
  return lines.join("\r\n");
}

function getDayOfYear(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(Date.UTC(y, 0, 0));
  return Math.floor((date - start) / 86400000);
}

function getISOWeek(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

function getDaysUntil(dateStr) {
  const [ty, tm, td] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(ty, tm - 1, td));

  const nowParis = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }),
  );
  const today = new Date(
    Date.UTC(nowParis.getFullYear(), nowParis.getMonth(), nowParis.getDate()),
  );

  return Math.round((target - today) / 86400000);
}

function getEventTiming(event) {
  const daysUntilStart = getDaysUntil(event.start);
  const endDate =
    event.end && event.end !== event.start ? event.end : event.start;
  const daysUntilEnd = getDaysUntil(endDate);
  const isOngoing = daysUntilStart < 0 && daysUntilEnd >= 0;
  return { daysUntilStart, daysUntilEnd, isOngoing };
}

const CAT_COLORS = {
  "Jours fériés": {
    c: "#ff5a5a",
    d: "rgba(255,90,90,.12)",
    b: "rgba(255,90,90,.3)",
  },
  "Vacances scolaires": {
    c: "#f5a020",
    d: "rgba(245,160,32,.12)",
    b: "rgba(245,160,32,.3)",
  },
  Saisons: {
    c: "#22d3ee",
    d: "rgba(34,211,238,.12)",
    b: "rgba(34,211,238,.3)",
  },
  Astronomie: {
    c: "#60a5fa",
    d: "rgba(96,165,250,.12)",
    b: "rgba(96,165,250,.3)",
  },
  "Changement d'heure": {
    c: "#3ecf8e",
    d: "rgba(62,207,142,.12)",
    b: "rgba(62,207,142,.3)",
  },
  Christianisme: {
    c: "#e2c074",
    d: "rgba(226,192,116,.12)",
    b: "rgba(226,192,116,.3)",
  },
  Fêtes: { c: "#8b5cf6", d: "rgba(139,92,246,.12)", b: "rgba(139,92,246,.3)" },
  Culture: {
    c: "#6b8cff",
    d: "rgba(107,140,255,.12)",
    b: "rgba(107,140,255,.3)",
  },
  Société: {
    c: "#94a3b8",
    d: "rgba(148,163,184,.12)",
    b: "rgba(148,163,184,.3)",
  },
  Mémoire: {
    c: "#64748b",
    d: "rgba(100,116,139,.12)",
    b: "rgba(100,116,139,.3)",
  },
  Sport: { c: "#06b6d4", d: "rgba(6,182,212,.12)", b: "rgba(6,182,212,.3)" },
  Santé: { c: "#ef4444", d: "rgba(239,68,68,.12)", b: "rgba(239,68,68,.3)" },
  Éducation: {
    c: "#0ea5e9",
    d: "rgba(14,165,233,.12)",
    b: "rgba(14,165,233,.3)",
  },
  Examens: {
    c: "#14b8a6",
    d: "rgba(20,184,166,.12)",
    b: "rgba(20,184,166,.3)",
  },
  Élections: {
    c: "#f43f5e",
    d: "rgba(244,63,94,.12)",
    b: "rgba(244,63,94,.3)",
  },
  "Ponts / Congés": {
    c: "#fb923c",
    d: "rgba(251,146,60,.12)",
    b: "rgba(251,146,60,.3)",
  },
  Commerce: {
    c: "#4f7cff",
    d: "rgba(79,124,255,.12)",
    b: "rgba(79,124,255,.3)",
  },
  Gastronomie: {
    c: "#f59e0b",
    d: "rgba(245,158,11,.12)",
    b: "rgba(245,158,11,.3)",
  },
  Environnement: {
    c: "#10b981",
    d: "rgba(16,185,129,.12)",
    b: "rgba(16,185,129,.3)",
  },
  Lunaire: { c: "#4f46e5", d: "rgba(79,70,229,.12)", b: "rgba(79,70,229,.3)" },
  "Dates spéciales": {
    c: "#a78bfa",
    d: "rgba(167,139,250,.12)",
    b: "rgba(167,139,250,.3)",
  },
};

function getCatColor(cat) {
  return (
    CAT_COLORS[cat] || {
      c: "#6b8cff",
      d: "rgba(107,140,255,.12)",
      b: "rgba(107,140,255,.3)",
    }
  );
}

function getCatEmoji(cats, summary) {
  const title = (summary || "").toLowerCase();
  const c = (cats || [])[0] || "";
  if (c === "Jours fériés") {
    if (title.includes("noël")) return "🎄";
    if (title.includes("travail")) return "🛠️";
    if (title.includes("victoire") || title.includes("armistice")) return "🎖️";
    if (title.includes("nationale")) return "🎆";
    if (title.includes("toussaint")) return "🕯️";
    return "🔴";
  }
  if (c === "Vacances scolaires") {
    if (title.includes("été")) return "🏖️";
    if (title.includes("noël")) return "⛄";
    if (title.includes("hiver")) return "⛷️";
    if (title.includes("printemps")) return "🌱";
    if (title.includes("toussaint")) return "🍂";
    return "🎒";
  }
  if (c === "Saisons") {
    if (title.includes("printemps")) return "🌸";
    if (title.includes("été")) return "☀️";
    if (title.includes("automne")) return "🍁";
    if (title.includes("hiver")) return "❄️";
  }
  if (c === "Changement d'heure") return "⏰";
  if (c === "Astronomie" || c === "Lunaire") {
    if (title.includes("nouvelle lune") || title.includes("new moon"))
      return "🌑";
    if (title.includes("premier quartier") || title.includes("first quarter"))
      return "🌓";
    if (title.includes("pleine lune") || title.includes("full moon"))
      return "🌕";
    if (title.includes("dernier quartier") || title.includes("last quarter"))
      return "🌗";
    return "🌙";
  }
  if (c === "Christianisme") return "⛪";
  if (c === "Sport") return "🏆";
  if (c === "Santé") return "❤️";
  if (c === "Fêtes") return "🥂";
  if (c === "Mémoire") return "🕊️";
  if (c === "Élections") return "🗳️";
  if (c === "Examens") return "📝";
  if (c === "Culture") return "🎭";
  if (c === "Environnement") return "🌿";
  return "📅";
}

function countdownLabel(days, options = {}) {
  if (options.isOngoing) {
    if (days === 0) return { text: "Se termine aujourd'hui", past: false };
    if (days === 1) return { text: "Se termine demain", past: false };
    if (days < 7)
      return {
        text: `Encore ${days} jour${days > 1 ? "s" : ""}`,
        past: false,
      };
    if (days < 30)
      return {
        text: `Encore ${Math.round(days / 7)} semaine${Math.round(days / 7) > 1 ? "s" : ""}`,
        past: false,
      };
    return {
      text: `Encore ${Math.round(days / 30)} mois`,
      past: false,
    };
  }
  if (days < 0)
    return {
      text: `Il y a ${Math.abs(days)} jour${Math.abs(days) > 1 ? "s" : ""}`,
      past: true,
    };
  if (days === 0) return { text: "Aujourd'hui !", past: false };
  if (days === 1) return { text: "Demain", past: false };
  if (days < 7) return { text: `Dans ${days} jours`, past: false };
  if (days < 30)
    return {
      text: `Dans ${Math.round(days / 7)} semaine${Math.round(days / 7) > 1 ? "s" : ""}`,
      past: false,
    };
  if (days < 365)
    return { text: `Dans ${Math.round(days / 30)} mois`, past: false };
  return {
    text: `Dans ${Math.round(days / 365)} an${Math.round(days / 365) > 1 ? "s" : ""}`,
    past: false,
  };
}

function zoneLabel(z) {
  if (z === "AM") return "Alsace-Moselle";
  return `Zone ${z}`;
}

function buildEventSchema(event, siteUrl) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.summary,
    description: event.description || "",
    startDate: event.start,
    url: `${siteUrl}/event/${slugifyWithDate(event.summary, event.start)}`,
    organizer: {
      "@type": "Organization",
      name: "Calendrier France",
      url: siteUrl,
    },
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Country", name: "France" },
  };
  if (event.end && event.end !== event.start) schema.endDate = event.end;
  if (event.categories?.length) schema.keywords = event.categories.join(", ");
  return safeJson(schema);
}

function buildOccurrencesByYear(allOccurrences, currentEvent, siteUrl) {
  if (allOccurrences.length <= 1) return "";

  const byYear = {};
  allOccurrences.forEach((e) => {
    const y = e.start.slice(0, 4);
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(e);
  });

  const years = Object.keys(byYear).sort();
  const currentYear = currentEvent.start.slice(0, 4);

  const currentYearIdx = years.indexOf(currentYear);
  const showFrom = Math.max(0, currentYearIdx - 2);
  const showTo = Math.min(years.length - 1, currentYearIdx + 2);
  const visibleYears = years.slice(showFrom, showTo + 1);

  let html = "";

  visibleYears.forEach((year) => {
    const occurrences = byYear[year];
    const isCurYear = year === currentYear;

    html += `<div class="occ-year-group">
      <div class="occ-year-label${isCurYear ? " occ-year-label--current" : ""}">${year}</div>
      <div class="occ-pills-row">`;

    occurrences.forEach((e) => {
      const isCurrent = e.start === currentEvent.start;
      const slug = slugifyWithDate(e.summary, e.start);
      const dateLabel = formatDateShort(e.start);

      if (isCurrent) {
        html += `<span class="occ-pill current" aria-current="true">
          <span class="occ-date">${escapeHtml(dateLabel)}</span>
          <i class="fa-solid fa-circle-dot" style="font-size:7px"></i>
        </span>`;
      } else {
        html += `<a href="/event/${escapeHtml(slug)}" class="occ-pill">
          <span class="occ-date">${escapeHtml(dateLabel)}</span>
        </a>`;
      }
    });

    html += `</div></div>`;
  });

  const hiddenBefore = showFrom > 0 ? showFrom : 0;
  const hiddenAfter =
    years.length - 1 - showTo > 0 ? years.length - 1 - showTo : 0;

  if (hiddenBefore > 0 || hiddenAfter > 0) {
    html += `<p class="occ-overflow-note">`;
    if (hiddenBefore > 0)
      html += `${hiddenBefore} année${hiddenBefore > 1 ? "s" : ""} plus ancienne${hiddenBefore > 1 ? "s" : ""} non affichée${hiddenBefore > 1 ? "s" : ""} · `;
    if (hiddenAfter > 0)
      html += `${hiddenAfter} année${hiddenAfter > 1 ? "s" : ""} ultérieure${hiddenAfter > 1 ? "s" : ""} non affichée${hiddenAfter > 1 ? "s" : ""}`;
    html += `</p>`;
  }

return html;
}

function formatShortId(value) {
  if (!value) return "—";
  return value.slice(0, 8);
}

function badgeList(daysUntil, duration, zones, hasMultipleOccurrences, isOngoing) {
  const badges = [];
  if (isOngoing) badges.push({ label: "En cours", tone: "warn" });
  else if (daysUntil < 0) badges.push({ label: "Passé", tone: "term" });
  else if (daysUntil <= 3) badges.push({ label: "Imminent", tone: "warn" });
  else badges.push({ label: "À venir", tone: "info" });
  if (hasMultipleOccurrences) badges.push({ label: "Récurrent", tone: "info" });
  if (duration > 1) badges.push({ label: `${duration} jours`, tone: "calc" });
  if (zones.length)
    badges.push({
      label: zones.length === 1 ? zoneLabel(zones[0]) : "Zones multiples",
      tone: "zone",
    });
  return badges;
}

function getSeason(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const md = m * 100 + d;
  if (md >= 320 && md < 621) return { name: "Printemps", emoji: "🌸" };
  if (md >= 621 && md < 922) return { name: "Été", emoji: "☀️" };
  if (md >= 922 && md < 1221) return { name: "Automne", emoji: "🍁" };

  return { name: "Hiver", emoji: "❄️" };
}

function getWeekendStatus(dateStr, categories = []) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.getUTCDay();

  const isFerie =
    categories.includes("Jours fériés") ||
    categories.includes("Ponts / Congés");

  if (isFerie) {
    if (wd === 0 || wd === 6) return "Tombe un week-end 😕"; // Dommage pour un férié !
    if (wd === 1 || wd === 5) return "Week-end prolongé ! 🥳";
    if (wd === 2 || wd === 4) return "Pont possible ! 🌉";
    if (wd === 3) return "Coupure en pleine semaine 🌴";
  }

  if (wd === 0 || wd === 6) return "Tombe un week-end 😴";
  if (wd === 5) return "Veille de week-end 🍻";
  if (wd === 1) return "Début de semaine ☕";

  return "En pleine semaine 💼";
}

function getDayName(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const str = new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(dt);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const ACADEMIES = {
  A: "Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers.",
  B: "Aix-Marseille, Amiens, Lille, Nancy-Metz, Nantes, Nice, Normandie, Orléans-Tours, Reims, Rennes, Strasbourg.",
  C: "Créteil, Montpellier, Paris, Toulouse, Versailles.",
  AM: "Alsace-Moselle (Haut-Rhin, Bas-Rhin, Moselle).",
};

function buildHtml(event, siblings, allOccurrences, siteUrl, icsUrl, meta) {
  const mainCat = (event.categories || [])[0] || "Dates spéciales";
  const def = getCatColor(mainCat);
  const emoji = getCatEmoji(event.categories, event.summary);
  const duration = getDurationDays(event.start, event.end);
  const isRange = event.end && event.end !== event.start;
  const timing = getEventTiming(event);
  const daysUntil = timing.daysUntilStart;
  const cd = countdownLabel(
    timing.isOngoing ? timing.daysUntilEnd : timing.daysUntilStart,
    { isOngoing: timing.isOngoing },
  );
  const isoWeek = getISOWeek(event.start);
  const dayOfYear = getDayOfYear(event.start);
  const year = Number(event.start.slice(0, 4));
  const totalDaysInYear = isLeapYear(year) ? 366 : 365;
  const yearProgress = Math.round((dayOfYear / totalDaysInYear) * 100);
  const isVacances = (event.categories || []).includes("Vacances scolaires");
  const zones = (event.zones || []).filter((z) => z && z !== "all");

  const season = getSeason(event.start);
  const weekendStatus = getWeekendStatus(event.start, event.categories || []);
  const dayName = getDayName(event.start);
  const wikiLink = `https://fr.wikipedia.org/wiki/Spécial:Recherche?search=${encodeURIComponent(event.summary)}`;

  const prevEvent = siblings.prev;
  const nextEvent = siblings.next;

  const canonicalUrl = `${siteUrl}/event/${slugifyWithDate(event.summary, event.start)}`;
  const desc = event.description
    ? event.description.slice(0, 160) +
    (event.description.length > 160 ? "…" : "")
    : `${event.summary} — ${formatDateFR(event.start)}`;

  const occurrencesByYearHtml = buildOccurrencesByYear(
    allOccurrences,
    event,
    siteUrl,
  );
  const hasMultipleOccurrences = allOccurrences.length > 1;
  const occIndex = allOccurrences.findIndex(
    (o) => o.start === event.start && o.summary === event.summary,
  );
  const prevOcc = occIndex > 0 ? allOccurrences[occIndex - 1] : null;
  const nextOcc =
    occIndex >= 0 && occIndex < allOccurrences.length - 1
      ? allOccurrences[occIndex + 1]
      : null;
  const eventIcsHref = `${canonicalUrl}?format=ics`;
  const badges = badgeList(
    daysUntil,
    duration,
    zones,
    hasMultipleOccurrences,
    timing.isOngoing,
  );
  const generatedAt = meta?.generatedAt
    ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(
        new Date(meta.generatedAt)
      )
    : "—";
  const totalEvents = meta?.totalEvents ? new Intl.NumberFormat("fr-FR").format(meta.totalEvents) : "—";
  const versionHash = formatShortId(meta?.contentVersion);

  const googleDates = (() => {
    const start = event.start;
    const endInclusive =
      event.end && event.end !== event.start ? event.end : event.start;
    const endExclusive = addDaysISO(endInclusive, 1);
    return `${toIcsDate(start)}/${toIcsDate(endExclusive)}`;
  })();
  const googleHref =
    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.summary || "")}` +
    `&dates=${encodeURIComponent(googleDates)}` +
    `&details=${encodeURIComponent((event.description || "").slice(0, 1500))}` +
    `&sprop=${encodeURIComponent(siteUrl)}` +
    `&sprop=name:${encodeURIComponent("Calendrier France")}`;
  const outlookHref =
    `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent` +
    `&subject=${encodeURIComponent(event.summary || "")}` +
    `&body=${encodeURIComponent((event.description || "").slice(0, 1500))}` +
    `&startdt=${encodeURIComponent(event.start + "T00:00:00")}` +
    `&enddt=${encodeURIComponent((event.end && event.end !== event.start ? event.end : event.start) + "T23:59:00")}` +
    `&allday=true`;

  return `<!doctype html>
<html lang="fr" data-theme="dark">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escapeHtml(event.summary)} — ${escapeHtml(formatDateFR(event.start))} — Calendrier France</title>
  <meta name="description" content="${escapeHtml(desc)}"/>
  <meta name="robots" content="index,follow"/>
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:title" content="${escapeHtml(event.summary)} — ${escapeHtml(formatDateFR(event.start))}"/>
  <meta property="og:description" content="${escapeHtml(desc)}"/>
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}"/>
  <meta property="og:site_name" content="Calendrier France"/>
  <link rel="icon" type="image/svg+xml" href="/img/icon.svg"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"/>
  <script type="application/ld+json">${buildEventSchema(event, siteUrl)}</script>
  <style>
    :root {
      --bg0:#07070d; --bg1:#0e0e16; --bg2:#15151e; --bg3:#1c1c27; --bg4:#232330;
      --b:rgba(255,255,255,.07); --bh:rgba(255,255,255,.14); --ba:rgba(255,255,255,.26);
      --t1:#ededf4; --t2:#8080a0; --t3:#484860;
      --acc:#6b8cff; --accd:rgba(107,140,255,.10); --accb:rgba(107,140,255,.28);
      --r:11px; --rl:17px; --rxl:23px;
      --ff:'DM Sans',sans-serif; --ffd:'Unbounded',sans-serif; --ffm:'DM Mono',monospace;
      --cat-c:${def.c}; --cat-d:${def.d}; --cat-b:${def.b};
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: var(--ff); background: var(--bg0); color: var(--t1); line-height: 1.6; font-size: 15px; -webkit-font-smoothing: antialiased; }
    a { color: inherit; text-decoration: none; }
    button { font-family: var(--ff); cursor: pointer; border: none; background: none; color: inherit; }
    *:focus-visible { outline: 2px solid var(--cat-c); outline-offset: 4px; border-radius: 2px; }

    /* ── Topbar ── */
    .topbar { position: sticky; top: 0; z-index: 50; border-bottom: 1px solid var(--b); background: color-mix(in srgb, var(--bg0) 88%, transparent); backdrop-filter: blur(20px); }
    .topbar-in { max-width: 100%; margin: 0 auto; padding: 0 40px; height: 54px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .brand { font-family: var(--ffd); font-weight: 800; font-size: 16px; display: flex; align-items: center; gap: 10px; }
    .flag { width: 26px; height: 18px; border-radius: 3px; overflow: hidden; display: flex; border: 1px solid rgba(0,0,0,.15); flex-shrink: 0; }
    .flag span { flex: 1; display: block; }
    .back { font-size: 13px; font-weight: 600; color: var(--t2); display: flex; align-items: center; gap: 7px; padding: 8px 16px; border-radius: 999px; border: 1px solid var(--b); background: var(--bg2); transition: .2s cubic-bezier(.34,.1,.64,.35); }
    .back:hover { border-color: var(--cat-c); color: var(--cat-c); background: var(--bg3); transform: translateX(-3px); }
    .back i { font-size: 11px; }

    /* ── Hero Section ── */
    .hero { position: relative; overflow: hidden; padding: 72px 20px 60px; border-bottom: 1px solid var(--b); }
    .hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 80% 120% at 50% -20%, var(--cat-d), transparent 65%); pointer-events: none; z-index: 0; }
    .hero::after { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 75% 125%, rgba(107,140,255,.04), transparent 45%); pointer-events: none; z-index: 0; }
    .hero-in { max-width: 860px; margin: 0 auto; position: relative; z-index: 1; }
    .hero-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--cat-c); margin-bottom: 24px; padding: 8px 16px; border-radius: 999px; background: var(--cat-d); border: 1px solid var(--cat-b); animation: fadeUp .4s ease .05s backwards; }
    .hero-emoji { font-size: 68px; display: block; margin-bottom: 20px; line-height: 1; animation: fadeUp .5s ease .1s backwards; animation-timing-function: cubic-bezier(.34,.1,.64,.35); }
    .hero h1 { font-family: var(--ffd); font-size: clamp(32px, 6vw, 56px); font-weight: 800; letter-spacing: -1.2px; line-height: 1.06; margin-bottom: 24px; animation: fadeUp .5s ease .15s backwards; }
    .hero h1 em { font-style: normal; color: var(--cat-c); background: linear-gradient(135deg, var(--cat-c), rgba(107,140,255,.8)); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .countdown { display: inline-flex; align-items: center; gap: 10px; padding: 12px 24px; border-radius: 999px; font-size: 15px; font-weight: 700; margin-bottom: 28px; border: 1.5px solid var(--cat-b); background: var(--cat-d); color: var(--cat-c); animation: fadeUp .5s ease .2s backwards; box-shadow: 0 4px 12px rgba(0,0,0,.2); transition: .3s cubic-bezier(.34,.1,.64,.35); }
    .countdown:hover { box-shadow: 0 8px 24px rgba(0,0,0,.3); transform: translateY(-2px); }
    .countdown.past { background: var(--bg2); color: var(--t3); border-color: var(--b); box-shadow: none; }
    .countdown i { font-size: 14px; }
    .event-badges { display:flex;flex-wrap:wrap;gap:8px;margin-top:16px; }
    .event-badge {
      padding:6px 14px;border-radius:999px;border:1px solid;font-size:12px;font-weight:600;
      background:var(--bg2);color:var(--t2);border-color:var(--b);
      transition: .25s cubic-bezier(.34,.1,.64,.35);
      animation: fadeUp .4s ease forwards;
    }
    .event-badge:nth-child(1) { animation-delay: .25s; }
    .event-badge:nth-child(2) { animation-delay: .3s; }
    .event-badge:nth-child(3) { animation-delay: .35s; }
    .event-badge.term { border-color:#ff5a5a;color:#ff5a5a;background:rgba(255,90,90,.08); }
    .event-badge.warn { border-color:#f5a020;color:#f5a020;background:rgba(245,160,32,.08); }
    .event-badge.info { border-color:var(--cat-b);color:var(--cat-c);background:var(--cat-d); }
    .event-badge.calc { border-color:#3ecf8e;color:#3ecf8e;background:rgba(62,207,142,.08); }
    .event-badge.zone { border-color:var(--accb);color:var(--acc);background:var(--accd); }
    .event-badge:hover { transform: translateY(-2px); }
    
    .event-stats { display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:24px; }
    .event-stat { padding:16px 18px;border-radius:14px;border:1px solid var(--b);background:rgba(15,15,22,.5);font-size:12px;backdrop-filter:blur(10px);transition:.3s cubic-bezier(.34,.1,.64,.35); animation: fadeUp .4s ease forwards; }
    .event-stat:nth-child(1) { animation-delay: .4s; }
    .event-stat:nth-child(2) { animation-delay: .45s; }
    .event-stat:nth-child(3) { animation-delay: .5s; }
    .event-stat:hover { border-color:var(--cat-b); background:rgba(15,15,22,.8); transform:translateY(-3px); box-shadow:0 6px 16px rgba(0,0,0,.3); }
    .event-stat .stat-label { font-size:10px;font-weight:700;text-transform:uppercase;color:var(--t3);letter-spacing:1px;margin-bottom:6px; }
    .event-stat .stat-value { font-size:18px;font-weight:800;color:var(--cat-c); }
    .event-stat .stat-hint { font-size:11px;color:var(--t2);margin-top:4px; }
    
    .page { max-width: 860px; margin: 0 auto; padding: 0 20px; }
    .section { padding: 48px 0; border-bottom: 1px solid var(--b); }
    .section:last-child { border-bottom: none; }
    .section-title { font-size: 10px; font-weight: 700; letter-spacing: 1.3px; text-transform: uppercase; color: var(--t3); margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
    .section-title::before { content: ''; width: 3px; height: 3px; border-radius: 50%; background: var(--cat-c); }
    .section-title::after { content: ''; flex: 1; height: 1px; background: var(--b); }
    
    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(162px, 1fr)); gap: 12px; }
    .info-card { padding: 18px 20px; border-radius: 14px; border: 1px solid var(--b); background: rgba(15,15,22,.6); display: flex; flex-direction: column; gap: 7px; transition: .3s cubic-bezier(.34,.1,.64,.35); backdrop-filter: blur(8px); animation: fadeUp .4s ease forwards; }
    .info-card:nth-child(1) { animation-delay: .15s; }
    .info-card:nth-child(2) { animation-delay: .18s; }
    .info-card:nth-child(3) { animation-delay: .21s; }
    .info-card:nth-child(4) { animation-delay: .24s; }
    .info-card:nth-child(5) { animation-delay: .27s; }
    .info-card:nth-child(6) { animation-delay: .3s; }
    .info-card:hover { border-color: var(--cat-b); background: rgba(15,15,22,.85); transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,.35); }
    .info-card.accent { border-color: var(--cat-b); background: linear-gradient(135deg, var(--cat-d), rgba(107,140,255,.04)); }
    .info-card.accent:hover { background: linear-gradient(135deg, var(--cat-d), rgba(107,140,255,.08)); }
    .info-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; color: var(--t3); }
    .info-card.accent .info-label { color: var(--cat-c); opacity: .9; }
    .info-value { font-size: 16px; font-weight: 800; color: var(--t1); line-height: 1.2; }
    .info-card.accent .info-value { color: var(--cat-c); font-size: 17px; }
    .info-sub { font-size: 12px; color: var(--t3); margin-top: 3px; }
    
    .desc-block { padding: 24px; border-radius: 14px; border: 1px solid var(--b); background: rgba(15,15,22,.6); font-size: 15px; color: var(--t2); line-height: 1.8; backdrop-filter: blur(8px); }
    .desc-block a { color: var(--cat-c); text-decoration: underline; text-underline-offset: 4px; transition: .2s; }
    .desc-block a:hover { opacity: .8; }
    
    .actions-row { display: flex; flex-wrap: wrap; gap: 10px; }
    .action-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 16px; border-radius: 12px; border: 1px solid var(--b); background: var(--bg2); color: var(--t2); font-size: 13px; font-weight: 700; transition: .25s cubic-bezier(.34,.1,.64,.35); text-decoration: none; }
    .action-btn:hover { border-color: var(--bh); transform: translateY(-2px) scale(1.02); color: var(--t1); }
    .action-btn.primary { border-color: var(--cat-b); background: var(--cat-d); color: var(--cat-c); box-shadow: 0 4px 12px rgba(0,0,0,.2); }
    .action-btn.primary:hover { box-shadow: 0 8px 20px rgba(0,0,0,.3); }
    
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid var(--b); background: var(--bg2); color: var(--t2); transition: .25s cubic-bezier(.34,.1,.64,.35); }
    .chip:hover { transform: translateY(-2px); }
    .chip.cat { border-color: var(--cat-b); background: var(--cat-d); color: var(--cat-c); }
    .chip.zone { border-color: var(--accb); background: var(--accd); color: var(--acc); }
    
    .academy-list { margin-top: 12px; font-size: 12px; color: var(--t2); background: rgba(15,15,22,.4); padding: 14px 16px; border-radius: 10px; border: 1px solid var(--b); line-height: 1.7; }
    .academy-list strong { color: var(--acc); font-weight: 700; }
    .wiki-btn { margin-top: 14px; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--cat-c); text-decoration: none; transition: .2s; }
    .wiki-btn:hover { opacity: .8; }
    
    .occ-year-group { margin-bottom: 20px; }
    .occ-year-label { font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--t3); margin-bottom: 10px; opacity: .7; }
    .occ-year-label--current { color: var(--cat-c); opacity: 1; }
    .occ-pills-row { display: flex; flex-wrap: wrap; gap: 7px; }
    .occ-pill { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; border: 1px solid var(--b); background: rgba(15,15,22,.6); color: var(--t2); transition: .25s cubic-bezier(.34,.1,.64,.35); text-decoration: none; }
    .occ-pill:hover { border-color: var(--cat-b); color: var(--cat-c); background: var(--cat-d); transform: translateY(-2px); }
    .occ-pill.current { border-color: var(--cat-b); background: var(--cat-d); color: var(--cat-c); font-weight: 800; cursor: default; gap: 8px; }
    .occ-overflow-note { font-size: 11px; color: var(--t3); margin-top: 12px; font-style: italic; }
    
    .neighbors { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .neighbor { padding: 20px; border-radius: 14px; border: 1px solid var(--b); background: rgba(15,15,22,.6); text-decoration: none; transition: .3s cubic-bezier(.34,.1,.64,.35); display: flex; flex-direction: column; gap: 8px; backdrop-filter: blur(8px); }
    .neighbor:hover { border-color: var(--cat-b); background: rgba(15,15,22,.85); transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,.3); }
    .neighbor-dir { font-size: 10px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--t3); display: flex; align-items: center; gap: 5px; }
    .neighbor-name { font-size: 15px; font-weight: 800; color: var(--t1); line-height: 1.3; }
    .neighbor-date { font-size: 12px; color: var(--t3); }
    .neighbor-cat { display: inline-block; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; margin-top: 4px; }
    
    .cta-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .btn-p { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 28px; border-radius: 12px; background: linear-gradient(135deg, var(--cat-c), rgba(107,140,255,.8)); color: #fff; font-size: 14px; font-weight: 700; text-decoration: none; box-shadow: 0 6px 16px rgba(0,0,0,.25); transition: .3s cubic-bezier(.34,.1,.64,.35); }
    .btn-p:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0,0,0,.4); }
    .btn-s { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 26px; border-radius: 12px; background: rgba(15,15,22,.6); color: var(--t2); border: 1px solid var(--b); font-size: 14px; font-weight: 700; text-decoration: none; transition: .3s cubic-bezier(.34,.1,.64,.35); backdrop-filter: blur(8px); }
    .btn-s:hover { border-color: var(--cat-b); color: var(--cat-c); background: var(--cat-d); transform: translateY(-2px); }
    
    .zone-cta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap: 10px; margin-top: 14px; }
    .zone-cta { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--b); background: rgba(15,15,22,.6); text-decoration: none; font-size: 13px; font-weight: 700; color: var(--t2); transition: .25s cubic-bezier(.34,.1,.64,.35); }
    .zone-cta:hover { border-color: var(--cat-b); color: var(--cat-c); background: var(--cat-d); transform: translateY(-2px); }
    
    footer { border-top: 1px solid var(--b); padding: 32px 20px; text-align: center; background: rgba(15,15,22,.3); }
    .footer-links { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; margin-bottom: 12px; }
    .footer-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--t2); transition: .2s; }
    .footer-link:hover { color: var(--cat-c); transform: translateX(2px); }
    .footer-meta { font-size: 12px; color: var(--t3); margin-top: 8px; }
    .footer-meta a { color: var(--t2); transition: .2s; }
    .footer-meta a:hover { color: var(--cat-c); }
    
    .copy-note { font-size: 13px; color: var(--grn); margin-top: 8px; opacity: 0; transition: opacity .3s; }
    .copy-note:not(:empty) { opacity: 1; }
    
    @media (max-width: 768px) {
      .hero { padding: 60px 16px 48px; }
      .page { padding: 0 16px; }
      .neighbors { grid-template-columns: 1fr; }
      .info-grid { grid-template-columns: 1fr 1fr; }
      .hero-emoji { font-size: 52px; }
      .hero h1 { font-size: clamp(28px, 5vw, 40px); }
      .section { padding: 36px 0; }
      .cta-row { flex-direction: column; gap: 10px; }
      .btn-p, .btn-s { width: 100%; }
    }
    @media (max-width: 480px) {
      .info-grid { grid-template-columns: 1fr; }
      .event-stats { grid-template-columns: 1fr; }
      .hero-emoji { font-size: 44px; }
      .hero h1 { font-size: 24px; margin-bottom: 16px; }
      .hero-eyebrow { margin-bottom: 16px; }
    }
    
    @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
  </style>
</head>
<body>
  <nav class="topbar" role="navigation" aria-label="Navigation principale">
    <div class="topbar-in">
      <div class="brand">
        <div class="flag" role="img" aria-label="Drapeau français"><span style="background:#002395"></span><span style="background:#ECECEC"></span><span style="background:#ED2939"></span></div>
        Calendrier France
      </div>
      <a href="/#explorer" class="back" title="Retourner à la page d'accueil du calendrier"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> <span>Retour au calendrier</span></a>
    </div>
  </nav>

  <section class="hero" role="banner">
    <div class="hero-in">
      <div class="hero-eyebrow" aria-label="Catégories"><i class="fa-solid fa-tag" aria-hidden="true"></i> ${escapeHtml((event.categories || []).join(" · ") || "Événement")}</div>
      <span class="hero-emoji" role="img" aria-label="${emoji} ${escapeHtml(event.summary)}">${emoji}</span>
      <h1>${escapeHtml(event.summary)}<br/><em>${escapeHtml(formatDateFR(event.start))}</em></h1>
      <div class="countdown${cd.past ? " past" : ""}" role="status" aria-live="polite"><i class="fa-${cd.past ? "regular fa-clock" : "solid fa-calendar-days"}" aria-hidden="true"></i> <span>${escapeHtml(cd.text)}</span></div>
      <div class="event-badges" role="list">
        ${badges.map((s) => `<span class="event-badge ${s.tone}" role="listitem" title="${escapeHtml(s.label)}">${escapeHtml(s.label)}</span>`).join("")}
      </div>
    </div>
  </section>

  <div class="page">
    <section class="section">
      <div class="section-title"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> <span>Informations</span></div>
      <div class="info-grid" role="list">
        <div class="info-card accent" role="listitem">
          <div class="info-label">${isRange ? "Période" : "Date"}</div>
          <div class="info-value">${escapeHtml(formatDateFR(event.start))}</div>
          ${isRange ? `<div class="info-sub">au ${escapeHtml(formatDateFR(event.end))}</div>` : ""}
        </div>
        <div class="info-card" role="listitem">
          <div class="info-label">Jour</div>
          <div class="info-value">${escapeHtml(dayName)}</div>
          <div class="info-sub">${weekendStatus}</div>
        </div>
        <div class="info-card" role="listitem">
          <div class="info-label">Durée</div>
          <div class="info-value">${duration} jour${duration > 1 ? "s" : ""}</div>
          ${duration > 1 ? `<div class="info-sub">${Math.ceil(duration / 7)} semaine${Math.ceil(duration / 7) > 1 ? "s" : ""}</div>` : ""}
        </div>
        <div class="info-card" role="listitem">
          <div class="info-label">Saison</div>
          <div class="info-value">${season.emoji} ${season.name}</div>
          <div class="info-sub">Hémisphère nord</div>
        </div>
        <div class="info-card" role="listitem">
          <div class="info-label">Progression annuelle</div>
          <div class="info-value">${yearProgress} %</div>
          <div class="info-sub">Jour ${dayOfYear} sur ${totalDaysInYear}</div>
        </div>
        <div class="info-card" role="listitem">
          <div class="info-label">Semaine ISO</div>
          <div class="info-value">S${isoWeek.toString().padStart(2, "0")}</div>
          <div class="info-sub">Année ${year}</div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-title"><i class="fa-solid fa-calendar-plus" aria-hidden="true"></i> <span>Ajouter à votre agenda</span></div>
      <div class="actions-row">
        <a class="action-btn primary" href="${escapeHtml(eventIcsHref)}" download title="Télécharger le fichier .ICS pour importer dans votre calendrier">
          <i class="fa-solid fa-download" aria-hidden="true"></i><span>Télécharger .ICS</span>
        </a>
        <a class="action-btn" target="_blank" rel="noopener noreferrer" href="${escapeHtml(googleHref)}" title="Ajouter cet événement à Google Calendar">
          <i class="fa-brands fa-google" aria-hidden="true"></i><span>Google Calendar</span>
        </a>
        <a class="action-btn" target="_blank" rel="noopener noreferrer" href="${escapeHtml(outlookHref)}" title="Ajouter cet événement à Microsoft Outlook">
          <i class="fa-brands fa-microsoft" aria-hidden="true"></i><span>Outlook</span>
        </a>
        <button class="action-btn" id="copy-link" type="button" title="Copier le lien de cet événement dans le presse-papiers">
          <i class="fa-solid fa-link" aria-hidden="true"></i><span>Copier le lien</span>
        </button>
      </div>
      <div class="copy-note" id="copy-note" aria-live="polite" role="status"></div>
    </section>

    <section class="section">
      <div class="section-title"><i class="fa-solid fa-book-open" aria-hidden="true"></i> <span>À propos</span></div>
      <div class="desc-block">
        ${event.description ? escapeHtml(event.description).replace(/\n/g, "<br/>") : "Cet événement fait partie du calendrier national français."}
        <br>
        <a href="${escapeHtml(wikiLink)}" target="_blank" rel="noopener noreferrer" class="wiki-btn" title="Lire plus d'informations sur Wikipedia">
          <i class="fa-brands fa-wikipedia-w" aria-hidden="true"></i> <span>Lire sur Wikipédia</span>
        </a>
      </div>
    </section>

    <section class="section">
      <div class="section-title"><i class="fa-solid fa-tags" aria-hidden="true"></i> <span>Catégories & Zones</span></div>
      <div class="chips" role="list">
        ${(event.categories || [])
      .map((c) => {
        const cd2 = getCatColor(c);
        return `<span class="chip cat" role="listitem" style="border-color:${cd2.b};background:${cd2.d};color:${cd2.c}" title="Catégorie: ${escapeHtml(c)}">
            <i class="fa-solid fa-circle" style="font-size:6px" aria-hidden="true"></i>${escapeHtml(c)}
          </span>`;
      })
      .join("")}
        ${zones.map((z) => `<span class="chip zone" role="listitem" title="Zone scolaire: ${escapeHtml(zoneLabel(z))}"><i class="fa-solid fa-location-dot" aria-hidden="true"></i>${escapeHtml(zoneLabel(z))}</span>`).join("")}
      </div>
      
      ${zones.length
      ? `
      <div class="academy-list" role="region" aria-label="Académies concernées">
        ${zones.map((z) => (ACADEMIES[z] ? `<div><strong>Zone ${z} :</strong> ${ACADEMIES[z]}</div>` : "")).join("")}
      </div>
      `
      : ""
    }
    </section>

    ${hasMultipleOccurrences
      ? `
    <section class="section">
      <div class="section-title"><i class="fa-solid fa-rotate" aria-hidden="true"></i> <span>Autres occurrences (${allOccurrences.length} au total)</span></div>
      ${occurrencesByYearHtml}
    </section>`
      : ""
    }

    ${prevEvent || nextEvent
      ? `
    <section class="section">
      <div class="section-title"><i class="fa-solid fa-arrows-left-right" aria-hidden="true"></i> <span>Dans le calendrier</span></div>
      <div class="neighbors">
        ${prevEvent
        ? (() => {
          const pCat = (prevEvent.categories || [])[0] || "Divers";
          const pDef = getCatColor(pCat);
          const pSlug = slugifyWithDate(
            prevEvent.summary,
            prevEvent.start,
          );
          return `<a href="/event/${escapeHtml(pSlug)}" class="neighbor" title="Événement précédent: ${escapeHtml(prevEvent.summary)}">
            <div class="neighbor-dir"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> <span>Précédent</span></div>
            <div class="neighbor-name">${escapeHtml(prevEvent.summary)}</div>
            <div class="neighbor-date">${escapeHtml(formatDateShort(prevEvent.start))}</div>
            <span class="neighbor-cat" style="color:${pDef.c};background:${pDef.d};border-color:${pDef.b}">${escapeHtml(pCat)}</span>
          </a>`;
        })()
        : `<div></div>`
      }
        ${nextEvent
        ? (() => {
          const nCat = (nextEvent.categories || [])[0] || "Divers";
          const nDef = getCatColor(nCat);
          const nSlug = slugifyWithDate(
            nextEvent.summary,
            nextEvent.start,
          );
          return `<a href="/event/${escapeHtml(nSlug)}" class="neighbor" style="text-align:right;align-items:flex-end" title="Événement suivant: ${escapeHtml(nextEvent.summary)}">
            <div class="neighbor-dir" style="flex-direction:row-reverse"><span>Suivant</span> <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></div>
            <div class="neighbor-name">${escapeHtml(nextEvent.summary)}</div>
            <div class="neighbor-date">${escapeHtml(formatDateShort(nextEvent.start))}</div>
            <span class="neighbor-cat" style="color:${nDef.c};background:${nDef.d};border-color:${nDef.b}">${escapeHtml(nCat)}</span>
          </a>`;
        })()
        : `<div></div>`
      }
      </div>
    </section>`
      : ""
    }

    <section class="section">
      <div class="section-title"><i class="fa-solid fa-bolt" aria-hidden="true"></i> <span>S'abonner au calendrier</span></div>
      <div class="cta-row">
        <a href="${escapeHtml(icsUrl)}" class="btn-p" title="S'abonner via le flux de calendrier ${isVacances && zones.length ? `pour ${escapeHtml(zones.map((z) => zoneLabel(z)).join(" + "))}` : "complet"}">
          <i class="fa-solid fa-bolt" aria-hidden="true"></i>
          <span>${isVacances && zones.length ? `S'abonner — ${escapeHtml(zones.map((z) => zoneLabel(z)).join(" + "))}` : "S'abonner au calendrier complet"}</span>
        </a>
        <a href="/#explorer" class="btn-s" title="Retourner à la page d'exploration du calendrier"><i class="fa-regular fa-calendar" aria-hidden="true"></i> <span>Voir tous les événements</span></a>
      </div>
      ${isVacances && zones.length < 3
      ? `
      <div style="margin-top:14px;font-size:13px;color:var(--t3)"><strong>Ou s'abonner par zone :</strong></div>
      <div class="zone-cta-grid">
        ${["A", "B", "C"]
        .map((z) => {
          const wc = `webcal://calendrier-fr.tibotsr.dev/api/calendrier.ics?zone=${z}&cats=Vacances+scolaires,Jours+f%C3%A9ri%C3%A9s`;
          return `<a href="${wc}" class="zone-cta" title="S'abonner au calendrier sur la Zone ${z}"><i class="fa-solid fa-bolt" aria-hidden="true"></i><span>Zone ${z}</span></a>`;
        })
        .join("")}
      </div>`
      : ""
    }
    </section>
  </div>

  <footer role="contentinfo" aria-label="Pied de page">
    <div class="page">
      <div class="footer-links">
        <a href="/" class="footer-link" title="Retourner à l'accueil"><i class="fa-solid fa-house" aria-hidden="true"></i><span>Accueil</span></a>
        <a href="/#sync" class="footer-link" title="S'abonner au calendrier"><i class="fa-solid fa-bolt" aria-hidden="true"></i><span>S'abonner</span></a>
        <a href="/#zone" class="footer-link" title="Trouver votre zone scolaire"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>Trouver ma zone</span></a>
        <a href="https://github.com/TiboTsr/calendrier-france-ics/issues" target="_blank" rel="noopener noreferrer" class="footer-link" title="Signaler une erreur ou suggérer une amélioration">
          <i class="fa-solid fa-bug" aria-hidden="true"></i><span>Signaler une erreur</span>
        </a>
      </div>
      <p class="footer-meta">
        Données officielles : <a href="https://data.education.gouv.fr" target="_blank" rel="noopener noreferrer">Ministère de l'Éducation Nationale</a>
        · <a href="https://github.com/TiboTsr/calendrier-france-ics" target="_blank" rel="noopener noreferrer">Projet Open source</a>
      </p>
    </div>
  </footer>

  <script>
    (function () {
      var btn = document.getElementById('copy-link');
      var note = document.getElementById('copy-note');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var url = ${safeJson(canonicalUrl)};
        function done(ok) {
          if (!note) return;
          note.textContent = ok ? 'Lien copié.' : 'Impossible de copier automatiquement. Sélectionnez et copiez : ' + url;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function(){ done(true); }, function(){ done(false); });
          return;
        }
        try {
          var ta = document.createElement('textarea');
          ta.value = url;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          done(!!ok);
        } catch (e) {
          done(false);
        }
      });
    })();
  </script>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const slug =
      url.searchParams.get("slug") || url.pathname.split("/event/")[1] || "";
    const siteUrl = `https://${req.headers.host}`;
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
      res.end(
        "Format attendu : /event/nom-evenement-2026-01-26 ou /event/nom-evenement-2026",
      );
      return;
    }

    const sourceUrl =
      process.env.CALENDAR_JSON_URL ||
      "https://calendrier-fr.tibotsr.dev/calendrier.json";
    const upstream = await fetch(sourceUrl, { cache: "no-store" });
    if (!upstream.ok) {
      res.statusCode = 502;
      res.end("Impossible de charger les données");
      return;
    }

    const data = await upstream.json();
    const events = Array.isArray(data.events) ? data.events : [];

    const { namePart, year, exactDate } = parsed;

    let match;

    if (exactDate) {
      match = events.find((e) => {
        if (e.start !== exactDate) return false;
        return (
          slugify(e.summary) === namePart ||
          slugify(e.summary).startsWith(namePart)
        );
      });
    }

    if (!match) {
      match = events.find((e) => {
        if (!e.start || !e.start.startsWith(String(year))) return false;
        return (
          slugify(e.summary) === namePart ||
          slugify(e.summary).startsWith(namePart)
        );
      });
    }

    if (!match) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
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

    const allOccurrences = events
      .filter((e) => slugify(e.summary) === slugify(match.summary))
      .sort((a, b) => a.start.localeCompare(b.start));

    const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
    const idx = sorted.findIndex(
      (e) => e.start === match.start && e.summary === match.summary,
    );
    const siblings = {
      prev: idx > 0 ? sorted[idx - 1] : null,
      next: idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };

    const format = (url.searchParams.get("format") || "").toLowerCase();
    if (format === "ics") {
      const domain = req.headers.host || "calendrier-fr.tibotsr.dev";
      const ics = buildSingleEventIcs(match, domain);
      const filename = `${slugifyWithDate(match.summary, match.start)}.ics`;
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=300, stale-while-revalidate=0",
      );
      res.end(ics);
      return;
    }

    const html = buildHtml(match, siblings, allOccurrences, siteUrl, icsUrl, data);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );
    res.end(html);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end(`Erreur : ${err?.message || "inconnue"}`);
  }
};
