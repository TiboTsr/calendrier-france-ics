const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const UPSTREAM_CACHE_TTL_MS = 5 * 60 * 1000;
const PE_MAX_EVENTS = 50;
const PE_MAX_TITLE_LEN = 200;
const PE_MAX_PAYLOAD_KB = 10;

let upstreamCalendarCache = {
  expiresAt: 0,
  payload: null,
  etag: null,
  lastModified: null,
};

function getEmojiForEvent(event) {
  const title = (event.summary || "").toLowerCase();
  const cats = Array.isArray(event.categories) ? event.categories : [];
  if (cats.includes("Jours fériés") || cats.includes("Ponts / Congés")) {
    if (title.includes("noël")) return "🎄";
    if (title.includes("nouvel an") || title.includes("premier de l'an"))
      return "🎉";
    if (title.includes("pâques")) return "🥚";
    if (title.includes("travail")) return "🛠️";
    if (title.includes("victoire") || title.includes("armistice")) return "🎖️";
    if (
      title.includes("ascension") ||
      title.includes("pentecôte") ||
      title.includes("assomption") ||
      title.includes("toussaint")
    )
      return "⛪";
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
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldIcsLine(line) {
  const max = 75;
  if (line.length <= max) return line;
  const out = [];
  let i = 0;
  while (i < line.length) {
    out.push((i === 0 ? "" : " ") + line.slice(i, i + max));
    i += max;
  }
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
  const key = [
    event.summary || "",
    event.start || "",
    event.end || "",
    (event.categories || []).join("|"),
    (event.zones || []).join("|"),
  ].join("::");
  try {
    const hashHex = crypto.createHash("sha256").update(key).digest("hex");
    return `${hashHex.slice(0, 16)}@calendrier-fr.tibotsr.dev`;
  } catch {
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${(hash >>> 0).toString(16)}@calendrier-fr.tibotsr.dev`;
  }
}

function normalizeList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCategoryLabel(label) {
  return String(label || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[â€™']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function expandSelectedCategoryAliases(selectedCats) {
  const expanded = new Set(
    selectedCats.map((cat) => normalizeCategoryLabel(cat)),
  );
  if (expanded.has("ponts conges")) expanded.add("dates speciales");
  return expanded;
}

function alarmBlock(alarm, startDate) {
  if (!alarm || alarm === "none") return [];
  if (alarm === "1h")
    return [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Rappel",
      "TRIGGER:-PT1H",
      "END:VALARM",
    ];
  if (alarm === "1d")
    return [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Rappel",
      "TRIGGER:-P1D",
      "END:VALARM",
    ];
  if (alarm === "1w")
    return [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Rappel",
      "TRIGGER:-P7D",
      "END:VALARM",
    ];
  if (alarm === "9am")
    return startDate
      ? [
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          "DESCRIPTION:Rappel",
          `TRIGGER;VALUE=DATE-TIME:${startDate}T090000`,
          "END:VALARM",
        ]
      : [
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          "DESCRIPTION:Rappel",
          "TRIGGER;VALUE=DURATION:-PT9H",
          "END:VALARM",
        ];
  return [];
}

function filterEvents(events, selectedZones, selectedCats) {
  const zoneFilter = selectedZones.length > 0 && !selectedZones.includes("all");
  const catFilter = selectedCats.length > 0;
  const selectedCatsNorm = catFilter
    ? expandSelectedCategoryAliases(selectedCats)
    : null;
  return events.filter((event) => {
    const eventZones = Array.isArray(event.zones) ? event.zones : [];
    const eventCats = Array.isArray(event.categories) ? event.categories : [];
    const zoneOk =
      !zoneFilter ||
      eventZones.length === 0 ||
      eventZones.some((zone) => selectedZones.includes(zone));
    const catOk =
      !catFilter ||
      eventCats.some((cat) =>
        selectedCatsNorm.has(normalizeCategoryLabel(cat)),
      );
    return zoneOk && catOk;
  });
}

function parsePersonalEvents(raw) {
  if (!raw) return [];

  if (Buffer.byteLength(raw, "utf8") > PE_MAX_PAYLOAD_KB * 1024) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .slice(0, PE_MAX_EVENTS)
    .map((event) => {
      if (!event || typeof event !== "object") return null;

      const rawTitle = String(event?.title ?? "").trim();
      if (!rawTitle) return null;
      const title = rawTitle.slice(0, PE_MAX_TITLE_LEN);

      const date = String(event?.date ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

      const rec = ["none", "yearly", "monthly", "weekly"].includes(event?.rec)
        ? event.rec
        : "none";

      return { title, date, rec };
    })
    .filter(Boolean);
}

async function loadCalendarPayload(sourceUrl) {
  const now = Date.now();
  if (upstreamCalendarCache.payload && upstreamCalendarCache.expiresAt > now)
    return upstreamCalendarCache.payload;

  const ALLOWED_UPSTREAM_HOSTNAME = "calendrier-fr.tibotsr.dev";
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.hostname !== ALLOWED_UPSTREAM_HOSTNAME) {
      throw new Error(
        `SSRF bloqué : hostname non autorisé (${parsed.hostname})`,
      );
    }
  } catch (e) {
    if (e.message.startsWith("SSRF")) throw e;
    throw new Error(`URL upstream invalide : ${sourceUrl}`);
  }

  const headers = {};
  if (upstreamCalendarCache.etag)
    headers["If-None-Match"] = upstreamCalendarCache.etag;
  if (upstreamCalendarCache.lastModified)
    headers["If-Modified-Since"] = upstreamCalendarCache.lastModified;

  try {
    const upstream = await fetch(sourceUrl, { cache: "no-store", headers });
    if (upstream.status === 304 && upstreamCalendarCache.payload) {
      upstreamCalendarCache.expiresAt = now + UPSTREAM_CACHE_TTL_MS;
      return upstreamCalendarCache.payload;
    }
    if (!upstream.ok)
      throw new Error("Impossible de charger calendrier.json en amont.");
    const payload = await upstream.json();
    upstreamCalendarCache = {
      payload,
      expiresAt: now + UPSTREAM_CACHE_TTL_MS,
      etag: upstream.headers.get("etag"),
      lastModified: upstream.headers.get("last-modified"),
    };
    return payload;
  } catch (error) {
    if (upstreamCalendarCache.payload) {
      upstreamCalendarCache.expiresAt =
        now + Math.min(60 * 1000, UPSTREAM_CACHE_TTL_MS);
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
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const shortId = url.searchParams.get("id");
  let finalParams = url.searchParams;

  if (shortId) {
    const longUrlStr = await redis.get(`link:${shortId}`);
    if (longUrlStr) {
      const tempUrl = new URL(longUrlStr.replace(/^webcal:\/\//i, "https://"));
      finalParams = tempUrl.searchParams;
    }
  }

  try {
    const selectedZones = normalizeList(finalParams.get("zone"));
    const selectedCats = normalizeList(finalParams.get("cats"));
    const personalEvents = parsePersonalEvents(finalParams.get("pe"));
    const alarmGlobal = (finalParams.get("alarm_global") || "9am").trim();
    const alarmFeries = (finalParams.get("alarm_feries") || "none").trim();
    const alarmVacances = (finalParams.get("alarm_vacances") || "none").trim();
    const useEmojis = finalParams.get("emojis") === "1";

    const sourceUrl =
      process.env.CALENDAR_JSON_URL ||
      "https://calendrier-fr.tibotsr.dev/calendrier.json";

    let payload;
    try {
      payload = await loadCalendarPayload(sourceUrl);
    } catch (error) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Service temporairement indisponible");
      return;
    }

    const events = Array.isArray(payload.events) ? payload.events : [];
    const filtered = filterEvents(events, selectedZones, selectedCats).sort(
      (a, b) => {
        const da = String(a.start || "");
        const db = String(b.start || "");
        if (da !== db) return da.localeCompare(db);
        return String(a.summary || "").localeCompare(
          String(b.summary || ""),
          "fr",
        );
      },
    );

    const dtstamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Calendrier France//API ICS//FR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeIcsText("Calendrier France personnalisé")}`,
      "X-WR-TIMEZONE:Europe/Paris",
    ];

    for (const event of filtered) {
      const start = toIcsDate(event.start);
      if (!start) continue;
      const endExclusive = addOneDay(
        event.end && event.end !== event.start ? event.end : event.start,
      );
      if (!endExclusive) continue;

      const cats = Array.isArray(event.categories) ? event.categories : [];
      const zones = Array.isArray(event.zones) ? event.zones : [];
      const categoryLine = cats.length
        ? `CATEGORIES:${cats.map(escapeIcsText).join(",")}`
        : null;
      const descParts = [
        event.description || "",
        zones.length ? `Zones: ${zones.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\\n\\n");

      let currentAlarm = "none";
      if (cats.includes("Jours fériés") || cats.includes("Ponts / Congés"))
        currentAlarm = alarmFeries;
      else if (cats.includes("Vacances scolaires"))
        currentAlarm = alarmVacances;
      else
        currentAlarm = alarmGlobal;

      const title = useEmojis
        ? `${getEmojiForEvent(event)} ${event.summary}`
        : event.summary;

      const eventLines = [
        "BEGIN:VEVENT",
        `UID:${await makeUid(event)}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${toIcsDate(endExclusive)}`,
        `SUMMARY:${escapeIcsText(title || "Événement")}`,
        `DESCRIPTION:${escapeIcsText(descParts)}`,
      ];
      if (categoryLine) eventLines.push(categoryLine);
      eventLines.push(...alarmBlock(currentAlarm, start));
      eventLines.push("END:VEVENT");
      lines.push(...eventLines);
    }

    for (const event of personalEvents) {
      const start = toIcsDate(event.date);
      const endExclusive = toIcsDate(addOneDay(event.date));
      if (!start || !endExclusive) continue;

      const title = useEmojis ? `📌 ${event.title}` : event.title;

      const eventLines = [
        "BEGIN:VEVENT",
        `UID:${await makeUid({ summary: event.title, start: event.date, end: event.date, categories: ["Personnel"], zones: [] })}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${endExclusive}`,
        `SUMMARY:${escapeIcsText(title)}`,
        `DESCRIPTION:${escapeIcsText("Événement personnel ajouté depuis le mode avancé.")}`,
        "CATEGORIES:Personnel",
      ];
      if (event.rec === "yearly") eventLines.push("RRULE:FREQ=YEARLY");
      if (event.rec === "monthly") eventLines.push("RRULE:FREQ=MONTHLY");
      if (event.rec === "weekly") eventLines.push("RRULE:FREQ=WEEKLY");
      eventLines.push(...alarmBlock(alarmGlobal, start));
      eventLines.push("END:VEVENT");
      lines.push(...eventLines);
    }

    lines.push("END:VCALENDAR");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="calendrier.ics"');
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=900, stale-while-revalidate=86400",
    );
    res.end(lines.map(foldIcsLine).join("\r\n") + "\r\n");
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Erreur interne du serveur");
  }
};