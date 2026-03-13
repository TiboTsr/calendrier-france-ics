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
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

async function makeUid(event) {
  const key = [
    event.summary || "",
    event.start || "",
    event.end || "",
    (event.categories || []).join("|"),
    (event.zones || []).join("|"),
  ].join("::");
  // SHA-256 via Web Crypto API — évite les collisions du FNV-1a 32 bits
  // sur de larges catalogues d'événements.
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
    return `${hashHex}@calendrier-fr.tibotsr.dev`;
  } catch {
    // Fallback FNV-1a 32 bits si crypto.subtle indisponible (env non-HTTPS)
    let hash = 2166136261;
    for (let i = 0; i < key.length; i += 1) {
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
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function expandSelectedCategoryAliases(selectedCats) {
  const expanded = new Set(selectedCats.map((cat) => normalizeCategoryLabel(cat)));

  if (expanded.has("ponts conges")) {
    expanded.add("dates speciales");
  }

  return expanded;
}

function alarmBlock(alarm) {
  if (!alarm || alarm === "none") return [];
  if (alarm === "1h") {
    return [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Rappel",
      "TRIGGER:-PT1H",
      "END:VALARM",
    ];
  }
  if (alarm === "1d") {
    return [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Rappel",
      "TRIGGER:-P1D",
      "END:VALARM",
    ];
  }
  if (alarm === "9am") {
    return [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Rappel",
      "TRIGGER;VALUE=DURATION:-PT9H",
      "END:VALARM",
    ];
  }
  return [];
}

function filterEvents(events, selectedZones, selectedCats) {
  const zoneFilter = selectedZones.length > 0 && !selectedZones.includes("all");
  const catFilter = selectedCats.length > 0;
  const selectedCatsNorm = catFilter ? expandSelectedCategoryAliases(selectedCats) : null;

  return events.filter((event) => {
    const eventZones = Array.isArray(event.zones) ? event.zones : [];
    const eventCats = Array.isArray(event.categories) ? event.categories : [];

    const zoneOk =
      !zoneFilter ||
      eventZones.length === 0 ||
      eventZones.some((zone) => selectedZones.includes(zone));

    const catOk =
      !catFilter ||
      eventCats.some((cat) => selectedCatsNorm.has(normalizeCategoryLabel(cat)));

    return zoneOk && catOk;
  });
}

function parsePersonalEvents(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((event) => ({
        title: String(event?.title || "").trim(),
        date: String(event?.date || "").trim(),
        rec: ["none", "yearly", "monthly", "weekly"].includes(event?.rec) ? event.rec : "none",
      }))
      .filter((event) => event.title && /^\d{4}-\d{2}-\d{2}$/.test(event.date));
  } catch {
    return [];
  }
}

function normalizeFirstName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z' -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDisplayFirstName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(" ")
    .map((part) =>
      part
        .split("-")
        .map((chunk) => (chunk ? chunk[0].toUpperCase() + chunk.slice(1) : ""))
        .join("-")
    )
    .join(" ")
    .trim();
}

function parseFirstNames(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const names = parsed
      .map((name) => String(name || "").trim())
      .filter(Boolean)
      .slice(0, 30);

    const seen = new Set();
    return names.filter((name) => {
      const key = normalizeFirstName(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    const names = String(raw)
      .split(",")
      .map((name) => String(name || "").trim())
      .filter(Boolean)
      .slice(0, 30);
    const seen = new Set();
    return names.filter((name) => {
      const key = normalizeFirstName(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

function buildFirstNameLookupCandidates(name) {
  const key = normalizeFirstName(name);
  const aliasMap = {
    thibaut: "tibo",
    thibaud: "tibo",
    mat: "mathieu",
    max: "maxime",
    alex: "alexandre",
  };

  const candidates = [];
  const push = (value) => {
    const cleaned = String(value || "").trim();
    if (!cleaned) return;
    if (!candidates.some((existing) => existing.toLowerCase() === cleaned.toLowerCase())) {
      candidates.push(cleaned);
    }
  };

  push(name);
  push(key);
  if (aliasMap[key]) push(aliasMap[key]);

  return candidates;
}

function fallbackFirstNameMonthDay(name) {
  const key = normalizeFirstName(name);
  const fallback = {
    aurelie: { month: 7, day: 15 },
    aurelien: { month: 6, day: 16 },
    tibo: { month: 7, day: 8 },
    thibaut: { month: 7, day: 8 },
    thibaud: { month: 7, day: 8 },
  };
  return fallback[key] || null;
}

function extractMonthDayFromNamedayPayload(payload) {
  if (payload?.success && Array.isArray(payload?.data)) {
    for (const entry of payload.data) {
      if (!entry || typeof entry !== "object") continue;
      const country = String(entry.country || "").toLowerCase();
      if (country !== "fr") continue;

      const numericKeys = Object.keys(entry)
        .filter((key) => /^\d+$/.test(key))
        .sort((a, b) => Number(a) - Number(b));

      for (const key of numericKeys) {
        const item = entry[key];
        const month = Number(item?.month);
        const day = Number(item?.day);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return { month, day };
        }
      }
    }
    return null;
  }

  const candidates = [payload?.data, payload?.nameday, payload];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const month = Number(candidate.month);
    const day = Number(candidate.day);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { month, day };
    }

    const dateRaw = candidate.date || candidate.full_date || candidate.nameday_date;
    if (typeof dateRaw === "string") {
      const match = dateRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const parsedMonth = Number(match[2]);
        const parsedDay = Number(match[3]);
        if (parsedMonth >= 1 && parsedMonth <= 12 && parsedDay >= 1 && parsedDay <= 31) {
          return { month: parsedMonth, day: parsedDay };
        }
      }
    }
  }

  return null;
}

async function fetchNamedayDate(name, year) {
  return null;
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  // Preflight OPTIONS
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const selectedZones = normalizeList(url.searchParams.get("zone"));
    const selectedCats = normalizeList(url.searchParams.get("cats"));
    const alarm = (url.searchParams.get("alarm") || "none").trim();
    const personalEvents = parsePersonalEvents(url.searchParams.get("pe"));
    const firstNames = [];

    const sourceUrl =
      process.env.CALENDAR_JSON_URL ||
      "https://calendrier-fr.tibotsr.dev/calendrier.json";

    const upstream = await fetch(sourceUrl, { cache: "no-store" });
    if (!upstream.ok) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Impossible de charger calendrier.json en amont.");
      return;
    }

    const payload = await upstream.json();
    const events = Array.isArray(payload.events) ? payload.events : [];
    const filtered = filterEvents(events, selectedZones, selectedCats).sort((a, b) => {
      const da = String(a.start || "");
      const db = String(b.start || "");
      if (da !== db) return da.localeCompare(db);
      return String(a.summary || "").localeCompare(String(b.summary || ""), "fr");
    });

    const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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
      const endRaw = event.end && event.end !== event.start ? event.end : event.start;
      const endExclusive = addOneDay(endRaw);
      if (!endExclusive) continue;

      const cats = Array.isArray(event.categories) ? event.categories : [];
      const zones = Array.isArray(event.zones) ? event.zones : [];
      const categoryLine = cats.length ? `CATEGORIES:${cats.map(escapeIcsText).join(",")}` : null;
      const zoneInfo = zones.length ? `Zones: ${zones.join(", ")}` : "";
      const descParts = [event.description || "", zoneInfo].filter(Boolean).join("\\n\\n");

      const eventLines = [
        "BEGIN:VEVENT",
        `UID:${await makeUid(event)}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${toIcsDate(endExclusive)}`,
        `SUMMARY:${escapeIcsText(event.summary || "Événement")}`,
        `DESCRIPTION:${escapeIcsText(descParts)}`,
      ];

      if (categoryLine) eventLines.push(categoryLine);
      eventLines.push(...alarmBlock(alarm));
      eventLines.push("END:VEVENT");

      lines.push(...eventLines);
    }

    for (const event of personalEvents) {
      const start = toIcsDate(event.date);
      const endExclusive = toIcsDate(addOneDay(event.date));
      if (!start || !endExclusive) continue;

      const eventLines = [
        "BEGIN:VEVENT",
        `UID:${await makeUid({ summary: event.title, start: event.date, end: event.date, categories: ["Personnel"], zones: [] })}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${endExclusive}`,
        `SUMMARY:${escapeIcsText(event.title)}`,
        "DESCRIPTION:Événement personnel ajouté depuis le mode avancé.",
        "CATEGORIES:Personnel",
      ];

      if (event.rec === "yearly") eventLines.push("RRULE:FREQ=YEARLY");
      if (event.rec === "monthly") eventLines.push("RRULE:FREQ=MONTHLY");
      if (event.rec === "weekly") eventLines.push("RRULE:FREQ=WEEKLY");

      eventLines.push(...alarmBlock(alarm));
      eventLines.push("END:VEVENT");
      lines.push(...eventLines);
    }

    const currentYear = new Date().getUTCFullYear();
    const feastResults = await Promise.all(
      firstNames.map(async (rawName) => {
        try {
          const monthDay = await fetchNamedayDate(rawName, currentYear);
          if (!monthDay) return null;
          return { rawName, ...monthDay };
        } catch {
          return null;
        }
      })
    );

    for (const feast of feastResults.filter(Boolean)) {
      const mm = String(feast.month).padStart(2, "0");
      const dd = String(feast.day).padStart(2, "0");
      const baseDate = `${currentYear}-${mm}-${dd}`;
      const start = toIcsDate(baseDate);
      const endExclusive = toIcsDate(addOneDay(baseDate));
      if (!start || !endExclusive) continue;

      const displayName = formatDisplayFirstName(feast.rawName);
      const eventLines = [
        "BEGIN:VEVENT",
        `UID:${await makeUid({ summary: `Fête de ${displayName}`, start: baseDate, end: baseDate, categories: ["Fêtes prénom"], zones: [] })}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${endExclusive}`,
        `SUMMARY:${escapeIcsText(`Fête de ${displayName}`)}`,
        `DESCRIPTION:${escapeIcsText(`Rappel annuel de la fête du prénom ${displayName} (date issue d'une API externe).`)}`,
        "CATEGORIES:Fêtes prénom",
        "RRULE:FREQ=YEARLY",
      ];

      eventLines.push(...alarmBlock(alarm));
      eventLines.push("END:VEVENT");
      lines.push(...eventLines);
    }

    lines.push("END:VCALENDAR");
    const ics = lines.map(foldIcsLine).join("\r\n") + "\r\n";

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="calendrier.ics"');
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
    res.end(ics);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`Erreur API ICS: ${error?.message || "inconnue"}`);
  }
};