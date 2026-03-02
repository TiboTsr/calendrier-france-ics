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

def add_unique_event(summary, dt_start, events_seen):
    event_key = (summary, dt_start)
    if event_key not in events_seen:
        events_seen.add(event_key)
        return to_ics_event(summary, dt_start)
    return ""

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

# ---------------------
# GÉNÉRATION DU .ICS
# ---------------------
ics_content = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Calendrier Complet//FR//FR\n"
events_seen = set()

for year in YEARS:
    # Jours fériés
    fr_holidays = holidays.country_holidays("FR", years=year, language="fr")
    for d, name in fr_holidays.items():
        ics_content += add_unique_event(localize_holiday_name(name), d, events_seen)
    
    # Fêtes chrétiennes
    easter = easter_date(year)
    ascension = easter + timedelta(days=39)
    pentecote = easter + timedelta(days=49)
    ics_content += add_unique_event("Pâques", easter, events_seen)
    ics_content += add_unique_event("Ascension", ascension, events_seen)
    ics_content += add_unique_event("Pentecôte", pentecote, events_seen)
    ics_content += add_unique_event("Début du Carême", easter - timedelta(days=46), events_seen)
    ics_content += add_unique_event("Chandeleur", date(year, 2, 2), events_seen)
    ics_content += add_unique_event("Immaculée Conception", date(year, 12, 8), events_seen)
    ics_content += add_unique_event("Noël", date(year, 12, 25), events_seen)
    ics_content += add_unique_event("Toussaint", date(year, 11, 1), events_seen)

    # Fêtes familiales
    ics_content += add_unique_event("Fête des grands-mères", nth_weekday(year, 3, 6, 1), events_seen)
    ics_content += add_unique_event("Fête des pères", nth_weekday(year, 6, 6, 3), events_seen)
    ics_content += add_unique_event("Fête des grands-pères", nth_weekday(year, 10, 6, 1), events_seen)
    dernier_dimanche_mai = last_sunday(year, 5)
    fete_meres = dernier_dimanche_mai if dernier_dimanche_mai != pentecote else nth_weekday(year, 6, 6, 1)
    ics_content += add_unique_event("Fête des mères", fete_meres, events_seen)

    # Changement d'heure
    ics_content += add_unique_event("Passage à l'heure d'été", last_sunday(year, 3), events_seen)
    ics_content += add_unique_event("Passage à l'heure d'hiver", last_sunday(year, 10), events_seen)

    # Événements spéciaux
    ics_content += add_unique_event("Journée internationale des femmes", date(year, 3, 8), events_seen)
    ics_content += add_unique_event("Journée internationale des droits de l'enfant", date(year, 11, 20), events_seen)
    ics_content += add_unique_event("Black Friday", nth_weekday(year, 11, 4, 4), events_seen)
    ics_content += add_unique_event("Début soldes d’hiver", date(year, 1, 11), events_seen)
    ics_content += add_unique_event("Début soldes d’été", date(year, 6, 28), events_seen)

    # Vie citoyenne et administrative
    ics_content += add_unique_event("Fête des Voisins", last_weekday(year, 5, 4), events_seen)
    patrimoine_samedi = nth_weekday(year, 9, 5, 3)
    patrimoine_dimanche = patrimoine_samedi + timedelta(days=1)
    ics_content += add_unique_event("Journées Européennes du Patrimoine (samedi)", patrimoine_samedi, events_seen)
    ics_content += add_unique_event("Journées Européennes du Patrimoine (dimanche)", patrimoine_dimanche, events_seen)

    # Sensibilisation / santé / environnement
    ics_content += add_unique_event("Journée mondiale contre le cancer", date(year, 2, 4), events_seen)
    ics_content += add_unique_event("Jour de la Terre", date(year, 4, 22), events_seen)
    ics_content += add_unique_event("Journée mondiale sans tabac", date(year, 5, 31), events_seen)
    ics_content += add_unique_event("Journée mondiale de l’océan", date(year, 6, 8), events_seen)
    ics_content += add_unique_event("Lancement d’Octobre Rose", date(year, 10, 1), events_seen)
    ics_content += add_unique_event("Lancement du Mois sans Tabac", date(year, 11, 1), events_seen)

    # Repères culturels et saisonniers
    seasons = season_start_dates(year)
    ics_content += add_unique_event("Poisson d’avril", date(year, 4, 1), events_seen)
    ics_content += add_unique_event("Fête de la Musique", date(year, 6, 21), events_seen)
    ics_content += add_unique_event("Halloween", date(year, 10, 31), events_seen)
    ics_content += add_unique_event("Début du Printemps", seasons["printemps"], events_seen)
    ics_content += add_unique_event("Début de l’Été", seasons["ete"], events_seen)
    ics_content += add_unique_event("Début de l’Automne", seasons["automne"], events_seen)
    ics_content += add_unique_event("Début de l’Hiver", seasons["hiver"], events_seen)
    ics_content += add_unique_event("Jour le plus long de l’année", seasons["ete"], events_seen)
    ics_content += add_unique_event("Jour le plus court de l’année", seasons["hiver"], events_seen)

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
                    summary = f"{desc} - Zone {zone}"
                    ics_content += add_unique_event(summary, start, events_seen)

ics_content += "END:VCALENDAR\n"

with open(ICS_FILE, "w", encoding="utf-8") as f:
    f.write(ics_content)

print(f"{ICS_FILE} généré avec succès !")