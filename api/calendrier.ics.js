const crypto = require("crypto");

const UPSTREAM_CACHE_TTL_MS = 5 * 60 * 1000;

let upstreamCalendarCache = { expiresAt: 0, payload: null, etag: null, lastModified: null };

/* ── Dictionnaire des Emojis ── */
function getEmojiForEvent(event) {
  const title = (event.summary || "").toLowerCase();
  const cats = Array.isArray(event.categories) ? event.categories : [];
  
  if (cats.includes("Jours fériés") || cats.includes("Ponts / Congés")) {
    if (title.includes("noël")) return "🎄";
    if (title.includes("nouvel an") || title.includes("premier de l'an")) return "🎉";
    if (title.includes("pâques")) return "🥚";
    if (title.includes("travail")) return "🛠️";
    if (title.includes("victoire") || title.includes("armistice")) return "🎖️";
    if (title.includes("ascension") || title.includes("pentecôte") || title.includes("assomption") || title.includes("toussaint")) return "⛪";
    if (title.includes("nationale")) return "🎆";
    return "🔴";
  }
  if (cats.includes("Vacances scolaires")) {
    if (title.includes("été")) return "🏖️";
    if (title.includes("noël")) return "⛄";
    if (title.includes("hiver")) return "⛷️";
    if (title.includes("printemps")) return "🌱";
    if (title.includes("toussaint")) return "🍂";
    return "🎒";
  }
  if (cats.includes("Saisons")) {
    if (title.includes("printemps")) return "🌸";
    if (title.includes("été")) return "☀️";
    if (title.includes("automne")) return "🍁";
    if (title.includes("hiver")) return "❄️";
    return "🌍";
  }
  if (cats.includes("Changement d'heure")) return "⏰";
  if (cats.includes("Fêtes") || cats.includes("Dates spéciales")) {
    if (title.includes("mère")) return "👩‍👧";
    if (title.includes("père")) return "👨‍👦";
    if (title.includes("musique")) return "🎵";
    if (title.includes("saint-valentin")) return "💖";
    return "🥂";
  }
  if (cats.includes("Personnel")) return "📌";
  
  return "📅";
}

function escapeIcsText(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

function foldIcsLine(line) {
  const max = 75;
  if (line.length <= max) return line;
  const out = [];
  let i = 0;
  while (i < line.length) { out.push((i === 0 ? "" : " ") + line.slice(i, i + max)); i += max; }
  return out.join("\r\n");
}

function toIcsDate(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return null;
  return `${y.toString().padStart(4, "0")}${m.toString().padStart(2, "0")}${d.toString().padStart(2, "0")}`;
}

function addOneDay(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

async function makeUid(event) {
  const key = [event.summary || "", event.start || "", event.end || "", (event.categories || []).join("|"), (event.zones || []).join("|")].join("::");
  try {
    const hashHex = crypto.createHash("sha256").update(key).digest("hex");
    return `${hashHex.slice(0, 16)}@calendrier-fr.tibotsr.dev`;
  } catch {
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) { hash ^= key.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `${(hash >>> 0).toString(16)}@calendrier-fr.tibotsr.dev`;
  }
}

function normalizeList(raw) {
  if (!raw) return [];
  return String(raw).split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeCategoryLabel(label) {
  return String(label || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[â€™']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function expandSelectedCategoryAliases(selectedCats) {
  const expanded = new Set(selectedCats.map((cat) => normalizeCategoryLabel(cat)));
  if (expanded.has("ponts conges")) expanded.add("dates speciales");
  return expanded;
}

function alarmBlock(alarm) {
  if (!alarm || alarm === "none") return [];
  if (alarm === "1h") return ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Rappel", "TRIGGER:-PT1H", "END:VALARM"];
  if (alarm === "1d") return ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Rappel", "TRIGGER:-P1D", "END:VALARM"];
  if (alarm === "1w") return ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Rappel", "TRIGGER:-P7D", "END:VALARM"];
  if (alarm === "9am") return ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Rappel", "TRIGGER;VALUE=DURATION:-PT9H", "END:VALARM"];
  return [];
}

function filterEvents(events, selectedZones, selectedCats) {
  const zoneFilter = selectedZones.length > 0 && !selectedZones.includes("all");
  const catFilter = selectedCats.length > 0;
  const selectedCatsNorm = catFilter ? expandSelectedCategoryAliases(selectedCats) : null;

  return events.filter((event) => {
    const eventZones = Array.isArray(event.zones) ? event.zones : [];
    const eventCats = Array.isArray(event.categories) ? event.categories : [];
    const zoneOk = !zoneFilter || eventZones.length === 0 || eventZones.some((zone) => selectedZones.includes(zone));
    const catOk = !catFilter || eventCats.some((cat) => selectedCatsNorm.has(normalizeCategoryLabel(cat)));
    return zoneOk && catOk;
  });
}

function parsePersonalEvents(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((event) => ({
      title: String(event?.title || "").trim(), date: String(event?.date || "").trim(),
      rec: ["none", "yearly", "monthly", "weekly"].includes(event?.rec) ? event.rec : "none",
    })).filter((event) => event.title && /^\d{4}-\d{2}-\d{2}$/.test(event.date));
  } catch { return []; }
}

async function loadCalendarPayload(sourceUrl) {
  const now = Date.now();
  if (upstreamCalendarCache.payload && upstreamCalendarCache.expiresAt > now) return upstreamCalendarCache.payload;
  const headers = {};
  if (upstreamCalendarCache.etag) headers["If-None-Match"] = upstreamCalendarCache.etag;
  if (upstreamCalendarCache.lastModified) headers["If-Modified-Since"] = upstreamCalendarCache.lastModified;

  try {
    const upstream = await fetch(sourceUrl, { cache: "no-store", headers });
    if (upstream.status === 304 && upstreamCalendarCache.payload) {
      upstreamCalendarCache.expiresAt = now + UPSTREAM_CACHE_TTL_MS;
      return upstreamCalendarCache.payload;
    }
    if (!upstream.ok) throw new Error("Impossible de charger calendrier.json en amont.");
    const payload = await upstream.json();
    upstreamCalendarCache = { payload, expiresAt: now + UPSTREAM_CACHE_TTL_MS, etag: upstream.headers.get("etag"), lastModified: upstream.headers.get("last-modified") };
    return payload;
  } catch (error) {
    if (upstreamCalendarCache.payload) {
      upstreamCalendarCache.expiresAt = now + Math.min(60 * 1000, UPSTREAM_CACHE_TTL_MS);
      return upstreamCalendarCache.payload;
    }
    throw error;
  }
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const hasParams = url.searchParams.has("zone") || url.searchParams.has("cats") || url.searchParams.has("pe") || url.searchParams.has("alarm_feries") || url.searchParams.has("alarm_vacances") || url.searchParams.has("emojis");
  if (!hasParams) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>API ICS – Calendrier France</title><style>body{font-family:sans-serif;background:#f8f8fa;color:#222;margin:0;padding:2em;}main{max-width:600px;margin:auto;}h1{color:#c00;}code{background:#eee;padding:2px 6px;border-radius:4px;}</style></head><body><main><h1>Erreur d’utilisation de l’API</h1><p>Cette adresse (<code>/api/calendrier.ics</code>) est réservée à la distribution de fichiers <b>ICS</b> pour les applications de calendrier.</p><p>Pour obtenir un calendrier, veuillez utiliser le site principal ou l’interface prévue à cet effet.</p><p><a href="/">Retour au site principal</a></p></main></body></html>`);
    return;
  }

  try {
    const selectedZones = normalizeList(url.searchParams.get("zone"));
    const selectedCats = normalizeList(url.searchParams.get("cats"));
    const personalEvents = parsePersonalEvents(url.searchParams.get("pe"));
    const alarmFeries = (url.searchParams.get("alarm_feries") || "none").trim();
    const alarmVacances = (url.searchParams.get("alarm_vacances") || "none").trim();
    const useEmojis = url.searchParams.get("emojis") === "1";

    const sourceUrl = process.env.CALENDAR_JSON_URL || "https://calendrier-fr.tibotsr.dev/calendrier.json";

    let payload;
    try { payload = await loadCalendarPayload(sourceUrl); } 
    catch (error) { res.statusCode = 502; res.setHeader("Content-Type", "text/plain; charset=utf-8"); res.end(error.message); return; }

    const events = Array.isArray(payload.events) ? payload.events : [];
    const filtered = filterEvents(events, selectedZones, selectedCats).sort((a, b) => {
      const da = String(a.start || ""); const db = String(b.start || "");
      if (da !== db) return da.localeCompare(db);
      return String(a.summary || "").localeCompare(String(b.summary || ""), "fr");
    });

    const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Calendrier France//API ICS//FR",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeIcsText("Calendrier France personnalisé")}`,
      "X-WR-TIMEZONE:Europe/Paris",
    ];

    for (const event of filtered) {
      const start = toIcsDate(event.start);
      if (!start) continue;
      const endExclusive = addOneDay(event.end && event.end !== event.start ? event.end : event.start);
      if (!endExclusive) continue;

      const cats = Array.isArray(event.categories) ? event.categories : [];
      const zones = Array.isArray(event.zones) ? event.zones : [];
      const categoryLine = cats.length ? `CATEGORIES:${cats.map(escapeIcsText).join(",")}` : null;
      const descParts = [event.description || "", zones.length ? `Zones: ${zones.join(", ")}` : ""].filter(Boolean).join("\\n\\n");

      // Logique Alarme & Emoji
      let currentAlarm = "none";
      if (cats.includes("Jours fériés") || cats.includes("Ponts / Congés")) currentAlarm = alarmFeries;
      else if (cats.includes("Vacances scolaires")) currentAlarm = alarmVacances;

      const title = useEmojis ? `${getEmojiForEvent(event)} ${event.summary}` : event.summary;

      const eventLines = [
        "BEGIN:VEVENT", `UID:${await makeUid(event)}`, `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${toIcsDate(endExclusive)}`,
        `SUMMARY:${escapeIcsText(title || "Événement")}`, `DESCRIPTION:${escapeIcsText(descParts)}`,
      ];

      if (categoryLine) eventLines.push(categoryLine);
      eventLines.push(...alarmBlock(currentAlarm));
      eventLines.push("END:VEVENT");
      lines.push(...eventLines);
    }

    for (const event of personalEvents) {
      const start = toIcsDate(event.date);
      const endExclusive = toIcsDate(addOneDay(event.date));
      if (!start || !endExclusive) continue;

      const title = useEmojis ? `📌 ${event.title}` : event.title;

      const eventLines = [
        "BEGIN:VEVENT", `UID:${await makeUid({ summary: event.title, start: event.date, end: event.date, categories: ["Personnel"], zones: [] })}`,
        `DTSTAMP:${dtstamp}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${endExclusive}`,
        `SUMMARY:${escapeIcsText(title)}`, "DESCRIPTION:Événement personnel ajouté depuis le mode avancé.", "CATEGORIES:Personnel",
      ];

      if (event.rec === "yearly") eventLines.push("RRULE:FREQ=YEARLY");
      if (event.rec === "monthly") eventLines.push("RRULE:FREQ=MONTHLY");
      if (event.rec === "weekly") eventLines.push("RRULE:FREQ=WEEKLY");
      eventLines.push(...alarmBlock("1d")); // Par défaut 1j avant pour les persos
      eventLines.push("END:VEVENT");
      lines.push(...eventLines);
    }

    lines.push("END:VCALENDAR");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="calendrier.ics"');
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
    res.end(lines.map(foldIcsLine).join("\r\n") + "\r\n");
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`Erreur API ICS: ${error?.message || "inconnue"}`);
  }
};