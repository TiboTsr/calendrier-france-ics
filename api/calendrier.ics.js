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

function makeUid(event) {
  const key = [
    event.summary || "",
    event.start || "",
    event.end || "",
    (event.categories || []).join("|"),
    (event.zones || []).join("|"),
  ].join("::");
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16)}@calendrier-fr.tibotsr.dev`;
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
        `UID:${makeUid(event)}`,
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
        `UID:${makeUid({ summary: event.title, start: event.date, end: event.date, categories: ["Personnel"], zones: [] })}`,
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