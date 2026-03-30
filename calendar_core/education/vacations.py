import requests
from datetime import date, timedelta

from ..config import YEARS, ZONES
from ..models import CalendarEvent
from ..utils import (
    canonical_vacation_description,
    normalize_zones,
    parse_api_date_to_fr_date,
)

def build_vacation_events() -> list[CalendarEvent]:
    url = "https://data.education.gouv.fr/api/records/1.0/search/"
    params = {"dataset": "fr-en-calendrier-scolaire", "rows": 10000}
    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()

    vacation_periods: dict[tuple[str, date, date], set[str]] = {}

    for record in data.get("records", []):
        fields = record.get("fields", {})
        start = parse_api_date_to_fr_date(fields.get("start_date"))
        end   = parse_api_date_to_fr_date(fields.get("end_date"))
        if not start or not end:
            continue

        population = (fields.get("population") or "").strip().lower()
        if "enseignant" in population:
            continue

        end = end - timedelta(days=1)
        description = canonical_vacation_description(fields.get("description", "Vacances"))
        normalized_zones = normalize_zones(fields.get("zones", []))
        record_zones = sorted(zone for zone in ZONES if zone in normalized_zones)
        if not record_zones:
            continue

        if start.year in YEARS or end.year in YEARS:
            key = (description, start, end)
            vacation_periods.setdefault(key, set()).update(record_zones)

    events: list[CalendarEvent] = []
    for (description, start, end), zones in sorted(vacation_periods.items(), key=lambda item: (item[0][1], item[0][0])):
        duration = (end - start).days + 1

        if set(zones) == set(ZONES):
            events.append(CalendarEvent(
                summary=f"{description} - Zones A, B et C",
                start=start, end=end,
                categories=["Vacances scolaires"],
                description=(
                    f"{description} pour toutes les zones (A, B et C). "
                    f"Durée : {duration} jours, du {start.strftime('%d/%m/%Y')} au {end.strftime('%d/%m/%Y')}."
                ),
                zones=set(ZONES),
            ))
        else:
            for zone in sorted(zones):
                events.append(CalendarEvent(
                    summary=f"{description} - Zone {zone}",
                    start=start, end=end,
                    categories=["Vacances scolaires"],
                    description=(
                        f"{description} pour la zone scolaire {zone}. "
                        f"Durée : {duration} jours, du {start.strftime('%d/%m/%Y')} au {end.strftime('%d/%m/%Y')}. "
                        "Le découpage en zones A, B et C a été instauré en 1972."
                    ),
                    zones={zone},
                ))

    return events