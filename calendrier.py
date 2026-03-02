from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import hashlib
import json
import re

import holidays
import requests
from dateutil.parser import isoparse
from zoneinfo import ZoneInfo

CURRENT_YEAR = date.today().year
YEARS = range(CURRENT_YEAR, CURRENT_YEAR + 3)
ZONES = ["A", "B", "C"]
DOMAIN = "calendrier-fr.tibotsr.dev"

MAIN_ICS_FILE = Path("calendrier.ics")
ZONE_FILES = {
    "A": Path("zone-a.ics"),
    "B": Path("zone-b.ics"),
    "C": Path("zone-c.ics"),
}
EVENTS_META_FILE = Path("events-meta.json")


def nth_weekday(year, month, weekday, n):
    d = date(year, month, 1)
    while d.weekday() != weekday:
        d += timedelta(days=1)
    return d + timedelta(weeks=n - 1)


def last_sunday(year, month):
    if month == 12:
        d = date(year, 12, 31)
    else:
        d = date(year, month + 1, 1) - timedelta(days=1)
    while d.weekday() != 6:
        d -= timedelta(days=1)
    return d


def last_weekday(year, month, weekday):
    if month == 12:
        d = date(year, 12, 31)
    else:
        d = date(year, month + 1, 1) - timedelta(days=1)
    while d.weekday() != weekday:
        d -= timedelta(days=1)
    return d


def easter_date(year):
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def normalize_zones(zones_field):
    if isinstance(zones_field, str):
        values = [zones_field]
    elif isinstance(zones_field, list):
        values = zones_field
    else:
        values = []
    normalized = set()
    for value in values:
        if not isinstance(value, str):
            continue
        for match in re.findall(r"\b([ABC])\b", value.upper()):
            normalized.add(match)
    return normalized


def canonical_vacation_description(desc):
    text = (desc or "Vacances").lower()
    if "hiver" in text or "carnaval" in text:
        return "Vacances d'Hiver"
    if "printemps" in text:
        return "Vacances de Printemps"
    if "été" in text or "ete" in text:
        return "Vacances d'Été"
    if "toussaint" in text:
        return "Vacances de la Toussaint"
    if "noël" in text or "noel" in text:
        return "Vacances de Noël"
    if "ascension" in text:
        return "Pont de l'Ascension"
    return desc or "Vacances"


def parse_api_date_to_fr_date(value):
    if not value:
        return None
    dt = isoparse(value)
    if dt.tzinfo is not None:
        dt = dt.astimezone(ZoneInfo("Europe/Paris"))
    return dt.date()


def localize_holiday_name(name):
    translations = {
        "New Year's Day": "Jour de l'An",
        "Easter Monday": "Lundi de Pâques",
        "Whit Monday": "Lundi de Pentecôte",
        "Labor Day": "Fête du Travail",
        "Labour Day": "Fête du Travail",
        "Victory Day": "Victoire 1945",
        "Ascension Day": "Ascension",
        "National Day": "Fête nationale",
        "Assumption Day": "Assomption",
        "All Saints' Day": "Toussaint",
        "Armistice": "Armistice 1918",
        "Christmas Day": "Noël",
    }
    return translations.get(name, name)


def season_start_dates(year):
    fallback = {
        "printemps": date(year, 3, 20),
        "ete": date(year, 6, 21),
        "automne": date(year, 9, 22),
        "hiver": date(year, 12, 21),
    }
    try:
        response = requests.get(
            "https://aa.usno.navy.mil/api/seasons",
            params={"year": year},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        seasons = {}
        for item in payload.get("data", []):
            phenom = str(item.get("phenom", "")).lower()
            month = int(item.get("month"))
            day = int(item.get("day"))
            item_year = int(item.get("year", year))
            season_date = date(item_year, month, day)
            if phenom == "equinox" and month == 3:
                seasons["printemps"] = season_date
            elif phenom == "solstice" and month == 6:
                seasons["ete"] = season_date
            elif phenom == "equinox" and month == 9:
                seasons["automne"] = season_date
            elif phenom == "solstice" and month == 12:
                seasons["hiver"] = season_date
        if len(seasons) == 4:
            return seasons
    except (requests.RequestException, ValueError, TypeError):
        pass
    return fallback


def escape_ics_text(value):
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace("\n", "\\n")
        .replace(";", "\\;")
        .replace(",", "\\,")
    )


def build_uid(event):
    payload = "|".join(
        [
            event["summary"],
            event["start"].isoformat(),
            event["end"].isoformat() if event["end"] else "",
            ",".join(event["categories"]),
            "" if event["zones"] is None else ",".join(sorted(event["zones"])),
        ]
    )
    digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:24]
    return f"{digest}@{DOMAIN}"


def add_event(events, event_keys, summary, start, categories, description, end=None, zones=None):
    zone_key = "" if zones is None else ",".join(sorted(zones))
    key = (summary, start, end, tuple(categories), zone_key)
    if key in event_keys:
        return
    event_keys.add(key)
    events.append(
        {
            "summary": summary,
            "start": start,
            "end": end,
            "categories": categories,
            "description": description,
            "zones": set(zones) if zones else None,
        }
    )


def parse_uids_from_ics(path):
    if not path.exists():
        return set()
    content = path.read_text(encoding="utf-8", errors="ignore")
    return {line[4:].strip() for line in content.splitlines() if line.startswith("UID:")}


def event_in_zone(event, zone):
    return event["zones"] is None or zone in event["zones"]


def serialize_calendar(events, cal_name):
    dtstamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Calendrier Complet//FR//FR",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_ics_text(cal_name)}",
        "X-WR-TIMEZONE:Europe/Paris",
    ]

    sorted_events = sorted(events, key=lambda ev: (ev["start"], ev["summary"]))
    uids = []
    for event in sorted_events:
        uid = build_uid(event)
        uids.append(uid)
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{uid}",
                f"DTSTAMP:{dtstamp}",
                f"SUMMARY:{escape_ics_text(event['summary'])}",
                f"DESCRIPTION:{escape_ics_text(event['description'])}",
                f"CATEGORIES:{','.join(escape_ics_text(category) for category in event['categories'])}",
                f"DTSTART;VALUE=DATE:{event['start'].strftime('%Y%m%d')}",
            ]
        )
        if event["end"]:
            lines.append(f"DTEND;VALUE=DATE:{event['end'].strftime('%Y%m%d')}")
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\n".join(lines) + "\n", set(uids)


previous_uids = parse_uids_from_ics(MAIN_ICS_FILE)
events = []
event_keys = set()

for year in YEARS:
    fr_holidays = holidays.country_holidays("FR", years=year, language="fr")
    for holiday_date, holiday_name in fr_holidays.items():
        localized_name = localize_holiday_name(holiday_name)
        add_event(
            events,
            event_keys,
            localized_name,
            holiday_date,
            ["Jours fériés"],
            f"Jour férié en France : {localized_name}.",
        )

    easter = easter_date(year)
    ascension = easter + timedelta(days=39)
    pentecote = easter + timedelta(days=49)
    add_event(events, event_keys, "Pâques", easter, ["Fêtes chrétiennes"], "Fête chrétienne : Pâques.")
    add_event(events, event_keys, "Ascension", ascension, ["Fêtes chrétiennes"], "Fête chrétienne : Ascension.")
    add_event(events, event_keys, "Pentecôte", pentecote, ["Fêtes chrétiennes"], "Fête chrétienne : Pentecôte.")
    add_event(
        events,
        event_keys,
        "Début du Carême",
        easter - timedelta(days=46),
        ["Fêtes chrétiennes"],
        "Repère liturgique : début du Carême.",
    )
    add_event(events, event_keys, "Chandeleur", date(year, 2, 2), ["Fêtes chrétiennes"], "Fête de la Chandeleur.")
    add_event(
        events,
        event_keys,
        "Immaculée Conception",
        date(year, 12, 8),
        ["Fêtes chrétiennes"],
        "Fête chrétienne : Immaculée Conception.",
    )

    add_event(
        events,
        event_keys,
        "Fête des grands-mères",
        nth_weekday(year, 3, 6, 1),
        ["Fêtes familiales"],
        "Fête familiale annuelle.",
    )
    add_event(
        events,
        event_keys,
        "Fête des pères",
        nth_weekday(year, 6, 6, 3),
        ["Fêtes familiales"],
        "Fête familiale annuelle.",
    )
    add_event(
        events,
        event_keys,
        "Fête des grands-pères",
        nth_weekday(year, 10, 6, 1),
        ["Fêtes familiales"],
        "Fête familiale annuelle.",
    )

    dernier_dimanche_mai = last_sunday(year, 5)
    fete_meres = dernier_dimanche_mai if dernier_dimanche_mai != pentecote else nth_weekday(year, 6, 6, 1)
    add_event(events, event_keys, "Fête des mères", fete_meres, ["Fêtes familiales"], "Fête familiale annuelle.")

    add_event(
        events,
        event_keys,
        "Passage à l'heure d'été",
        last_sunday(year, 3),
        ["Changement d'heure"],
        "Passage officiel à l'heure d'été en France.",
    )
    add_event(
        events,
        event_keys,
        "Passage à l'heure d'hiver",
        last_sunday(year, 10),
        ["Changement d'heure"],
        "Passage officiel à l'heure d'hiver en France.",
    )

    add_event(
        events,
        event_keys,
        "Journée internationale des femmes",
        date(year, 3, 8),
        ["Société"],
        "Journée internationale des droits des femmes.",
    )
    add_event(
        events,
        event_keys,
        "Journée internationale des droits de l'enfant",
        date(year, 11, 20),
        ["Société"],
        "Journée internationale des droits de l'enfant.",
    )
    add_event(events, event_keys, "Black Friday", nth_weekday(year, 11, 4, 4), ["Événements spéciaux"], "Événement commercial.")
    add_event(events, event_keys, "Début soldes d’hiver", date(year, 1, 11), ["Événements spéciaux"], "Repère commercial national.")
    add_event(events, event_keys, "Début soldes d’été", date(year, 6, 28), ["Événements spéciaux"], "Repère commercial national.")

    add_event(events, event_keys, "Fête des Voisins", last_weekday(year, 5, 4), ["Vie citoyenne"], "Événement convivial national.")
    patrimoine_samedi = nth_weekday(year, 9, 5, 3)
    patrimoine_dimanche = patrimoine_samedi + timedelta(days=1)
    add_event(
        events,
        event_keys,
        "Journées Européennes du Patrimoine (samedi)",
        patrimoine_samedi,
        ["Vie citoyenne"],
        "Ouverture de lieux patrimoniaux au public.",
    )
    add_event(
        events,
        event_keys,
        "Journées Européennes du Patrimoine (dimanche)",
        patrimoine_dimanche,
        ["Vie citoyenne"],
        "Ouverture de lieux patrimoniaux au public.",
    )

    add_event(events, event_keys, "Journée mondiale contre le cancer", date(year, 2, 4), ["Santé"], "Journée de sensibilisation santé.")
    add_event(events, event_keys, "Jour de la Terre", date(year, 4, 22), ["Environnement"], "Journée de sensibilisation environnementale.")
    add_event(events, event_keys, "Journée mondiale sans tabac", date(year, 5, 31), ["Santé"], "Journée de sensibilisation santé.")
    add_event(events, event_keys, "Journée mondiale de l’océan", date(year, 6, 8), ["Environnement"], "Journée de sensibilisation environnementale.")
    add_event(events, event_keys, "Lancement d’Octobre Rose", date(year, 10, 1), ["Santé"], "Campagne de sensibilisation santé.")
    add_event(events, event_keys, "Lancement du Mois sans Tabac", date(year, 11, 1), ["Santé"], "Campagne nationale de prévention.")

    seasons = season_start_dates(year)
    add_event(events, event_keys, "Poisson d’avril", date(year, 4, 1), ["Culture"], "Tradition populaire française.")
    add_event(events, event_keys, "Fête de la Musique", date(year, 6, 21), ["Culture"], "Événement culturel national.")
    add_event(events, event_keys, "Halloween", date(year, 10, 31), ["Culture"], "Événement culturel populaire.")
    add_event(events, event_keys, "Début du Printemps", seasons["printemps"], ["Saisons"], "Date de l'équinoxe de printemps.")
    add_event(events, event_keys, "Début de l’Été", seasons["ete"], ["Saisons"], "Date du solstice d'été.")
    add_event(events, event_keys, "Début de l’Automne", seasons["automne"], ["Saisons"], "Date de l'équinoxe d'automne.")
    add_event(events, event_keys, "Début de l’Hiver", seasons["hiver"], ["Saisons"], "Date du solstice d'hiver.")
    add_event(events, event_keys, "Jour le plus long de l’année", seasons["ete"], ["Saisons"], "Correspond au solstice d'été.")
    add_event(events, event_keys, "Jour le plus court de l’année", seasons["hiver"], ["Saisons"], "Correspond au solstice d'hiver.")

url = "https://data.education.gouv.fr/api/records/1.0/search/"
params = {"dataset": "fr-en-calendrier-scolaire", "rows": 10000}
response = requests.get(url, params=params, timeout=30)
response.raise_for_status()
data = response.json()

vacation_periods = {}
for record in data.get("records", []):
    fields = record.get("fields", {})
    start = parse_api_date_to_fr_date(fields.get("start_date"))
    end = parse_api_date_to_fr_date(fields.get("end_date"))
    if not start or not end:
        continue

    population = (fields.get("population") or "").strip().lower()
    if "enseignant" in population:
        continue

    desc = canonical_vacation_description(fields.get("description", "Vacances"))
    normalized_zones = normalize_zones(fields.get("zones", []))
    record_zones = sorted(zone for zone in ZONES if zone in normalized_zones)
    if not record_zones:
        continue

    if start.year in YEARS or (end - timedelta(days=1)).year in YEARS:
        key = (desc, start, end)
        vacation_periods.setdefault(key, set()).update(record_zones)

for (desc, start, end), zones in sorted(vacation_periods.items(), key=lambda item: (item[0][1], item[0][0])):
    if set(zones) == set(ZONES):
        add_event(
            events,
            event_keys,
            f"{desc} - Zones A, B et C",
            start,
            ["Vacances scolaires"],
            f"{desc} pour les zones A, B et C.",
            end=end,
            zones=set(ZONES),
        )
    else:
        for zone in sorted(zones):
            add_event(
                events,
                event_keys,
                f"{desc} - Zone {zone}",
                start,
                ["Vacances scolaires"],
                f"{desc} pour la zone {zone}.",
                end=end,
                zones={zone},
            )


global_content, global_uids = serialize_calendar(events, "Calendrier Complet France")
MAIN_ICS_FILE.write_text(global_content, encoding="utf-8")

for zone, output_path in ZONE_FILES.items():
    zone_events = [event for event in events if event_in_zone(event, zone)]
    zone_content, _ = serialize_calendar(zone_events, f"Calendrier France - Zone {zone}")
    output_path.write_text(zone_content, encoding="utf-8")

new_uids = sorted(global_uids - previous_uids)
meta = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "newEventsThisWeek": len(new_uids),
    "newEventUids": new_uids[:50],
    "totalEvents": len(global_uids),
}
EVENTS_META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"{MAIN_ICS_FILE} généré avec succès !")
for zone, output_path in ZONE_FILES.items():
    print(f"{output_path} généré avec succès ! ({zone})")
print(f"{EVENTS_META_FILE} généré avec succès !")