from datetime import date, datetime, timedelta, timezone
import re

import requests
from dateutil.parser import isoparse
from zoneinfo import ZoneInfo

from .models import CalendarEvent


def nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    current = date(year, month, 1)
    while current.weekday() != weekday:
        current += timedelta(days=1)
    return current + timedelta(weeks=n - 1)


def last_sunday(year: int, month: int) -> date:
    if month == 12:
        current = date(year, 12, 31)
    else:
        current = date(year, month + 1, 1) - timedelta(days=1)
    while current.weekday() != 6:
        current -= timedelta(days=1)
    return current


def last_weekday(year: int, month: int, weekday: int) -> date:
    if month == 12:
        current = date(year, 12, 31)
    else:
        current = date(year, month + 1, 1) - timedelta(days=1)
    while current.weekday() != weekday:
        current -= timedelta(days=1)
    return current


def easter_date(year: int) -> date:
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


def normalize_zones(zones_field) -> set[str]:
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


def canonical_vacation_description(desc: str | None) -> str:
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


def parse_api_date_to_fr_date(value: str | None) -> date | None:
    if not value:
        return None
    parsed = isoparse(value)
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(ZoneInfo("Europe/Paris"))
    return parsed.date()


def localize_holiday_name(name: str) -> str:
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


def season_start_dates(year: int) -> dict[str, date]:
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


def moon_phase_name(phase: float) -> str:
    if phase < 0.06 or phase > 0.94:
        return "Nouvelle Lune"
    if 0.22 < phase < 0.28:
        return "Premier Quartier"
    if 0.47 < phase < 0.53:
        return "Pleine Lune"
    if 0.72 < phase < 0.78:
        return "Dernier Quartier"
    return ""


def simple_moon_phases(year: int) -> list[tuple[date, str]]:
    phase_map = {
        "New Moon": "Nouvelle Lune",
        "First Quarter": "Premier Quartier",
        "Full Moon": "Pleine Lune",
        "Last Quarter": "Dernier Quartier",
    }

    try:
        response = requests.get(
            "https://aa.usno.navy.mil/api/moon/phases/year",
            params={"year": year},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        phases: list[tuple[date, str]] = []

        for item in payload.get("phasedata", []):
            phase_label = phase_map.get(str(item.get("phase", "")).strip())
            if not phase_label:
                continue

            item_year = int(item.get("year", year))
            month = int(item.get("month"))
            day = int(item.get("day"))
            raw_time = str(item.get("time", "00:00"))

            try:
                hour, minute = [int(part) for part in raw_time.split(":", 1)]
            except (ValueError, TypeError):
                hour, minute = 0, 0

            dt_utc = datetime(item_year, month, day, hour, minute, tzinfo=timezone.utc)
            try:
                dt_paris = dt_utc.astimezone(ZoneInfo("Europe/Paris"))
            except Exception:
                from calendar import monthrange
                def is_summer_time(dt):
                    last_march_sunday = max(
                        [d for d in range(31, 24, -1)
                         if datetime(dt.year, 3, d).weekday() == 6])
                    last_oct_sunday = max(
                        [d for d in range(31, 24, -1)
                         if datetime(dt.year, 10, d).weekday() == 6])
                    dt_march = datetime(dt.year, 3, last_march_sunday)
                    dt_oct = datetime(dt.year, 10, last_oct_sunday)
                    return dt >= dt_march and dt < dt_oct
                if is_summer_time(dt_utc):
                    dt_paris = dt_utc + timedelta(hours=2)
                else:
                    dt_paris = dt_utc + timedelta(hours=1)
            phases.append((dt_paris.date(), phase_label))

        if phases:
            deduped: list[tuple[date, str]] = []
            seen = set()
            for moon_date, moon_name in sorted(phases, key=lambda value: (value[0], value[1])):
                key = (moon_date, moon_name)
                if key in seen:
                    continue
                seen.add(key)
                deduped.append((moon_date, moon_name))
            if deduped:
                return deduped
    except (requests.RequestException, ValueError, TypeError):
        pass

    epoch = date(2000, 1, 6)
    phases: list[tuple[date, str]] = []
    day = date(year, 1, 1)
    while day.year == year:
        delta = (day - epoch).days
        phase = (delta % 29.530588) / 29.530588
        name = moon_phase_name(phase)
        if name:
            if not phases or phases[-1][1] != name or (day - phases[-1][0]).days > 5:
                phases.append((day, name))
        day += timedelta(days=1)
    return phases


def deduplicate_events(events: list[CalendarEvent]) -> list[CalendarEvent]:
    merged: dict[tuple[str, date, date | None, tuple[str, ...]], CalendarEvent] = {}

    for event in events:
        zones_key = tuple(sorted(event.zones)) if event.zones else tuple()
        key = (event.summary, event.start, event.end, zones_key)
        if key not in merged:
            merged[key] = CalendarEvent(
                summary=event.summary,
                start=event.start,
                end=event.end,
                categories=list(dict.fromkeys(event.categories)),
                description=event.description,
                zones=set(event.zones) if event.zones else None,
            )
            continue

        current = merged[key]
        current.categories = list(dict.fromkeys([*current.categories, *event.categories]))
        if not current.description and event.description:
            current.description = event.description

    return sorted(merged.values(), key=lambda item: (item.start, item.summary, item.end or item.start))

