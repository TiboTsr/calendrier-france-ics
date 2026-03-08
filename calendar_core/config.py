from datetime import date
from pathlib import Path

CURRENT_YEAR = date.today().year
SITE_START_YEAR = 2000
FUTURE_YEARS = 5
YEARS = range(SITE_START_YEAR, CURRENT_YEAR + FUTURE_YEARS + 1)
STRICT_FUTURE_ONLY = False
ZONES = ["A", "B", "C"]
DOMAIN = "calendrier-fr.tibotsr.dev"

MAIN_ICS_FILE = Path("calendrier.ics")
CALENDAR_JSON_FILE = Path("calendrier.json")
EVENTS_META_FILE = Path("events-meta.json")
CALENDAR_CSV_FILE = Path("calendrier.csv")
CALENDAR_RSS_FILE = Path("calendrier.xml")

ZONE_FILES = {
    "A": Path("zone-a.ics"),
    "B": Path("zone-b.ics"),
    "C": Path("zone-c.ics"),
}

NOISE_PROFILES = {
    "essentiel": {
        "Jours fériés",
        "Vacances scolaires",
        "Ponts / Congés",
        "Changement d'heure",
    },
    "culturel": {
        "Jours fériés",
        "Vacances scolaires",
        "Christianisme",
        "Culture",
        "Cinéma",
        "Théâtre",
        "Saisons",
        "Société",
        "Astronomie",
        "Mémoire",
        "Fêtes",
        "Éducation",
    },
    "commercial": {
        "Événements spéciaux",
        "Jours fériés",
        "Ponts / Congés",
        "Commercial",
        "Gastronomie",
        "Fêtes",
        "Sport",
    },
    "complet": None,
}