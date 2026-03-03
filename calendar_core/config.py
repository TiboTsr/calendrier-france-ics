from datetime import date
from pathlib import Path

CURRENT_YEAR = date.today().year
YEARS = range(CURRENT_YEAR, CURRENT_YEAR + 3)
ZONES = ["A", "B", "C"]
DOMAIN = "calendrier-fr.tibotsr.dev"

MAIN_ICS_FILE = Path("calendrier.ics")
CALENDAR_JSON_FILE = Path("calendrier.json")
EVENTS_META_FILE = Path("events-meta.json")

ZONE_FILES = {
    "A": Path("zone-a.ics"),
    "B": Path("zone-b.ics"),
    "C": Path("zone-c.ics"),
}

NOISE_PROFILES = {
    "essentiel": {"Jours fériés", "Vacances scolaires", "Ponts / Congés"},
    "culturel": {
        "Jours fériés",
        "Vacances scolaires",
        "Fêtes chrétiennes",
        "Culture",
        "Saisons",
        "Société",
        "Astronomie",
    },
    "commercial": {"Événements spéciaux", "Jours fériés", "Ponts / Congés"},
    "complet": None,
}
