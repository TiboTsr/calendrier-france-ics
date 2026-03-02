from datetime import date, timedelta
import re
import holidays
import requests
from dateutil.parser import isoparse

# ---------------------
# CONFIGURATION
# ---------------------
CURRENT_YEAR = date.today().year
YEARS = range(CURRENT_YEAR, CURRENT_YEAR + 3)
ZONES = ["A", "B", "C"]
ICS_FILE = "calendrier.ics"

# ---------------------
# UTILITAIRES
# ---------------------
def nth_weekday(year, month, weekday, n):
    d = date(year, month, 1)
    while d.weekday() != weekday:
        d += timedelta(days=1)
    return d + timedelta(weeks=n-1)

def last_sunday(year, month):
    if month == 12:
        d = date(year, 12, 31)
    else:
        d = date(year, month+1, 1) - timedelta(days=1)
    while d.weekday() != 6:
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
    h = (19*a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2*e + 2*i - h - k) % 7
    m = (a + 11*h + 22*l) // 451
    month = (h + l - 7*m + 114) // 31
    day = ((h + l - 7*m + 114) % 31) + 1
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

def to_ics_event(summary, dt_start):
    return f"BEGIN:VEVENT\nSUMMARY:{summary}\nDTSTART;VALUE=DATE:{dt_start.strftime('%Y%m%d')}\nEND:VEVENT\n"

# ---------------------
# GÉNÉRATION DU .ICS
# ---------------------
ics_content = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Calendrier Complet//FR//FR\n"

for year in YEARS:
    # Jours fériés
    fr_holidays = holidays.FR(years=year)
    for d, name in fr_holidays.items():
        ics_content += to_ics_event(name, d)
    
    # Fêtes chrétiennes
    easter = easter_date(year)
    ascension = easter + timedelta(days=39)
    pentecote = easter + timedelta(days=49)
    ics_content += to_ics_event("Pâques", easter)
    ics_content += to_ics_event("Ascension", ascension)
    ics_content += to_ics_event("Pentecôte", pentecote)
    ics_content += to_ics_event("Début du Carême", easter - timedelta(days=46))
    ics_content += to_ics_event("Chandeleur", date(year, 2, 2))
    ics_content += to_ics_event("Immaculée Conception", date(year, 12, 8))
    ics_content += to_ics_event("Noël", date(year, 12, 25))
    ics_content += to_ics_event("Toussaint", date(year, 11, 1))

    # Fêtes familiales
    ics_content += to_ics_event("Fête des grands-mères", nth_weekday(year, 3, 6, 1))
    ics_content += to_ics_event("Fête des pères", nth_weekday(year, 6, 6, 3))
    ics_content += to_ics_event("Fête des grands-pères", nth_weekday(year, 10, 6, 1))
    dernier_dimanche_mai = last_sunday(year, 5)
    fete_meres = dernier_dimanche_mai if dernier_dimanche_mai != pentecote else nth_weekday(year, 6, 6, 1)
    ics_content += to_ics_event("Fête des mères", fete_meres)

    # Changement d'heure
    ics_content += to_ics_event("Passage à l'heure d'été", last_sunday(year, 3))
    ics_content += to_ics_event("Passage à l'heure d'hiver", last_sunday(year, 10))

    # Événements spéciaux
    ics_content += to_ics_event("Journée internationale des femmes", date(year, 3, 8))
    ics_content += to_ics_event("Journée mondiale de l’enfance", date(year, 11, 20))
    ics_content += to_ics_event("Black Friday", nth_weekday(year, 11, 4, 4))
    ics_content += to_ics_event("Début soldes d’hiver", date(year, 1, 11))
    ics_content += to_ics_event("Début soldes d’été", date(year, 6, 28))

# Vacances scolaires
url = "https://data.education.gouv.fr/api/records/1.0/search/"
params = {"dataset": "fr-en-calendrier-scolaire", "rows": 3000}
response = requests.get(url, params=params, timeout=30)
response.raise_for_status()
data = response.json()

for record in data.get("records", []):
    fields = record.get("fields", {})
    start_str = fields.get("start_date")
    desc = canonical_vacation_description(fields.get("description", "Vacances"))
    normalized_zones = normalize_zones(fields.get("zones", []))
    population = (fields.get("population") or "").strip().lower()
    if start_str and "élèves" in population:
        start = isoparse(start_str).date()
        if start.year in YEARS:
            for zone in ZONES:
                if zone in normalized_zones:
                    ics_content += to_ics_event(f"{desc} - Zone {zone}", start)

ics_content += "END:VCALENDAR\n"

with open(ICS_FILE, "w", encoding="utf-8") as f:
    f.write(ics_content)

print(f"{ICS_FILE} généré avec succès !")