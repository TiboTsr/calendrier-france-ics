from datetime import date, timedelta

import holidays
import requests

from .config import YEARS, ZONES
from .models import CalendarEvent
from .utils import (
    canonical_vacation_description,
    easter_date,
    last_sunday,
    last_weekday,
    localize_holiday_name,
    normalize_zones,
    nth_weekday,
    parse_api_date_to_fr_date,
    season_start_dates,
    simple_moon_phases,
)


def build_base_events() -> list[CalendarEvent]:
    events: list[CalendarEvent] = []

    for year in YEARS:
        fr_holidays = holidays.country_holidays("FR", years=year, language="fr")
        for holiday_date, holiday_name in fr_holidays.items():
            localized = localize_holiday_name(holiday_name)
            events.append(
                CalendarEvent(
                    summary=localized,
                    start=holiday_date,
                    categories=["Jours fériés"],
                    description=f"Jour férié en France : {localized}.",
                )
            )

        easter = easter_date(year)
        ascension = easter + timedelta(days=39)
        pentecote = easter + timedelta(days=49)
        events.extend(
            [
                CalendarEvent("Pâques", easter, categories=["Fêtes chrétiennes"], description="Fête chrétienne : Pâques."),
                CalendarEvent("Ascension", ascension, categories=["Fêtes chrétiennes"], description="Fête chrétienne : Ascension."),
                CalendarEvent("Pentecôte", pentecote, categories=["Fêtes chrétiennes"], description="Fête chrétienne : Pentecôte."),
                CalendarEvent(
                    "Début du Carême",
                    easter - timedelta(days=46),
                    categories=["Fêtes chrétiennes"],
                    description="Repère liturgique : début du Carême.",
                ),
            ]
        )

        events.extend(
            [
                CalendarEvent("Chandeleur", date(year, 2, 2), categories=["Culture"], description="Tradition populaire : Chandeleur."),
                CalendarEvent("Poisson d’avril", date(year, 4, 1), categories=["Culture"], description="Tradition populaire française."),
                CalendarEvent("Fête de la Musique", date(year, 6, 21), categories=["Culture"], description="Événement culturel national."),
                CalendarEvent("Halloween", date(year, 10, 31), categories=["Culture"], description="Événement culturel populaire."),
            ]
        )

        events.extend(
            [
                CalendarEvent("Journée mondiale contre le cancer", date(year, 2, 4), categories=["Santé"], description="Journée de sensibilisation santé."),
                CalendarEvent("Jour de la Terre", date(year, 4, 22), categories=["Environnement"], description="Journée de sensibilisation environnementale."),
                CalendarEvent("Journée mondiale sans tabac", date(year, 5, 31), categories=["Santé"], description="Journée de sensibilisation santé."),
                CalendarEvent("Journée mondiale de l’océan", date(year, 6, 8), categories=["Environnement"], description="Journée de sensibilisation environnementale."),
                CalendarEvent("Lancement d’Octobre Rose", date(year, 10, 1), categories=["Santé"], description="Campagne de sensibilisation santé."),
                CalendarEvent("Lancement du Mois sans Tabac", date(year, 11, 1), categories=["Santé"], description="Campagne nationale de prévention."),
            ]
        )

        events.extend(
            [
                CalendarEvent("Journée internationale des femmes", date(year, 3, 8), categories=["Société"], description="Journée internationale des droits des femmes."),
                CalendarEvent("Journée internationale des droits de l'enfant", date(year, 11, 20), categories=["Société"], description="Journée internationale des droits de l'enfant."),
                CalendarEvent("Fête des Voisins", last_weekday(year, 5, 4), categories=["Société"], description="Événement convivial national."),
            ]
        )

        events.extend(
            [
                CalendarEvent("Black Friday", nth_weekday(year, 11, 4, 4), categories=["Événements spéciaux", "Commercial"], description="Événement commercial."),
            ]
        )

        seasons = season_start_dates(year)
        events.extend(
            [
                CalendarEvent("Début du Printemps", seasons["printemps"], categories=["Saisons", "Astronomie"], description="Date de l'équinoxe de printemps."),
                CalendarEvent("Début de l’Été", seasons["ete"], categories=["Saisons", "Astronomie"], description="Date du solstice d'été."),
                CalendarEvent("Début de l’Automne", seasons["automne"], categories=["Saisons", "Astronomie"], description="Date de l'équinoxe d'automne."),
                CalendarEvent("Début de l’Hiver", seasons["hiver"], categories=["Saisons", "Astronomie"], description="Date du solstice d'hiver."),
                CalendarEvent("Jour le plus long de l’année", seasons["ete"], categories=["Saisons", "Astronomie"], description="Correspond au solstice d'été."),
                CalendarEvent("Jour le plus court de l’année", seasons["hiver"], categories=["Saisons", "Astronomie"], description="Correspond au solstice d'hiver."),
            ]
        )

        for moon_date, moon_name in simple_moon_phases(year):
            events.append(
                CalendarEvent(
                    summary=moon_name,
                    start=moon_date,
                    categories=["Astronomie", "Lunaire"],
                    description=f"Phase lunaire : {moon_name}.",
                )
            )

    return events


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
        end = parse_api_date_to_fr_date(fields.get("end_date"))
        if not start or not end:
            continue

        population = (fields.get("population") or "").strip().lower()
        if "enseignant" in population:
            continue

        description = canonical_vacation_description(fields.get("description", "Vacances"))
        normalized_zones = normalize_zones(fields.get("zones", []))
        record_zones = sorted(zone for zone in ZONES if zone in normalized_zones)
        if not record_zones:
            continue

        if start.year in YEARS or (end - timedelta(days=1)).year in YEARS:
            key = (description, start, end)
            vacation_periods.setdefault(key, set()).update(record_zones)

    events: list[CalendarEvent] = []
    for (description, start, end), zones in sorted(vacation_periods.items(), key=lambda item: (item[0][1], item[0][0])):
        if set(zones) == set(ZONES):
            summary = f"{description} - Zones A, B et C"
            event_zones = set(ZONES)
        else:
            # One event per zone when dates differ.
            for zone in sorted(zones):
                events.append(
                    CalendarEvent(
                        summary=f"{description} - Zone {zone}",
                        start=start,
                        end=end,
                        categories=["Vacances scolaires"],
                        description=f"{description} pour la zone {zone}.",
                        zones={zone},
                    )
                )
            continue

        events.append(
            CalendarEvent(
                summary=summary,
                start=start,
                end=end,
                categories=["Vacances scolaires"],
                description=f"{description} pour les zones A, B et C.",
                zones=event_zones,
            )
        )

    return events
