from datetime import date, timedelta
import re

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


def to_roman(value: int) -> str:
    mapping = [
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
        (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    ]
    remaining = value
    result = []
    for number, symbol in mapping:
        while remaining >= number:
            result.append(symbol)
            remaining -= number
    return "".join(result)


EN_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

FR_MONTHS = {
    "janvier": 1, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12,
}


def _norm_token(value: str) -> str:
    return (
        str(value or "")
        .lower()
        .replace("é", "e").replace("è", "e").replace("ê", "e").replace("ë", "e")
        .replace("à", "a").replace("â", "a").replace("ä", "a")
        .replace("î", "i").replace("ï", "i")
        .replace("ô", "o").replace("ö", "o")
        .replace("ù", "u").replace("û", "u").replace("ü", "u")
        .replace("ç", "c")
        .strip()
    )


def _wiki_extract(title: str, lang: str = "en", intro: bool = True) -> str:
    params = {
        "action": "query", "format": "json",
        "prop": "extracts", "explaintext": 1, "titles": title,
    }
    if intro:
        params["exintro"] = 1
    response = requests.get(
        f"https://{lang}.wikipedia.org/w/api.php",
        params=params,
        headers={"User-Agent": "CalendrierFR/1.0 (https://calendrier-fr.tibotsr.dev)"},
        timeout=15,
    )
    response.raise_for_status()
    payload = response.json()
    pages = payload.get("query", {}).get("pages", {})
    if not pages:
        return ""
    page = next(iter(pages.values()))
    return str(page.get("extract") or "")


def _parse_en_date_range(text: str) -> tuple[date, date] | None:
    if not text:
        return None
    txt = text.replace("\n", " ")
    patterns = [
        r"from\s+(\d{1,2})\s+([A-Za-z]+)\s+to\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})",
        r"from\s+(\d{1,2})\s+to\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})",
        r"on\s+(\d{1,2})[–-](\d{1,2})\s+([A-Za-z]+)\s+(\d{4})",
    ]
    for idx, pattern in enumerate(patterns):
        match = re.search(pattern, txt, flags=re.IGNORECASE)
        if not match:
            continue
        try:
            if idx == 0:
                d1, m1, d2, m2, y = match.groups()
                month1 = EN_MONTHS.get(_norm_token(m1))
                month2 = EN_MONTHS.get(_norm_token(m2))
            elif idx == 1:
                d1, d2, m1, y = match.groups()
                month1 = EN_MONTHS.get(_norm_token(m1))
                month2 = month1
            else:
                d1, d2, m1, y = match.groups()
                month1 = EN_MONTHS.get(_norm_token(m1))
                month2 = month1
            if not month1 or not month2:
                continue
            return date(int(y), int(month1), int(d1)), date(int(y), int(month2), int(d2))
        except ValueError:
            continue
    return None


def _parse_fr_du_au_range(text: str) -> tuple[date, date] | None:
    if not text:
        return None
    txt = text.replace("\n", " ")
    match = re.search(
        r"du\s+(\d{1,2})\s+([A-Za-zéèêëàâäîïôöùûüç]+)\s+au\s+(\d{1,2})\s+([A-Za-zéèêëàâäîïôöùûüç]+)\s+(\d{4})",
        txt, flags=re.IGNORECASE,
    )
    if not match:
        return None
    d1, m1, d2, m2, y = match.groups()
    month1 = FR_MONTHS.get(_norm_token(m1))
    month2 = FR_MONTHS.get(_norm_token(m2))
    if not month1 or not month2:
        return None
    try:
        return date(int(y), month1, int(d1)), date(int(y), month2, int(d2))
    except ValueError:
        return None


def _parse_fr_single_date(text: str) -> date | None:
    if not text:
        return None
    match = re.search(r"(\d{1,2})\s+([A-Za-zéèêëàâäîïôöùûüç]+)\s+(\d{4})", text, flags=re.IGNORECASE)
    if not match:
        return None
    day, month_txt, year_txt = match.groups()
    month = FR_MONTHS.get(_norm_token(month_txt))
    if not month:
        return None
    try:
        return date(int(year_txt), month, int(day))
    except ValueError:
        return None


def _parse_en_single_date(text: str) -> date | None:
    if not text:
        return None
    txt = text.replace("\n", " ")
    match = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", txt, flags=re.IGNORECASE)
    if match:
        day, month_txt, year_txt = match.groups()
        month = EN_MONTHS.get(_norm_token(month_txt))
        if month:
            try:
                return date(int(year_txt), month, int(day))
            except ValueError:
                pass
    match = re.search(r"([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})", txt, flags=re.IGNORECASE)
    if match:
        month_txt, day, year_txt = match.groups()
        month = EN_MONTHS.get(_norm_token(month_txt))
        if month:
            try:
                return date(int(year_txt), month, int(day))
            except ValueError:
                pass
    return None


def _parse_en_from_to_month_day_range(text: str) -> tuple[date, date] | None:
    if not text:
        return None
    txt = text.replace("\n", " ")
    match = re.search(
        r"from\s+([A-Za-z]+)\s+(\d{1,2})\s+to\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})",
        txt, flags=re.IGNORECASE,
    )
    if not match:
        return None
    m1, d1, m2, d2, y = match.groups()
    month1 = EN_MONTHS.get(_norm_token(m1))
    month2 = EN_MONTHS.get(_norm_token(m2))
    if not month1 or not month2:
        return None
    try:
        return date(int(y), month1, int(d1)), date(int(y), month2, int(d2))
    except ValueError:
        return None


def _parse_en_begin_end_range(text: str) -> tuple[date, date] | None:
    if not text:
        return None
    txt = text.replace("\n", " ")
    patterns = [
        r"(?:began|starts?|started|will begin|will start)\s+on\s+([^\.,;]+?)\s+and\s+(?:is set to\s+)?(?:conclude|concludes|concluded|end|ends|finish|finishes|will end)\s+on\s+([^\.,;]+)",
        r"from\s+([^\.,;]+?)\s+to\s+([^\.,;]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, txt, flags=re.IGNORECASE)
        if not match:
            continue
        left = _parse_en_single_date(match.group(1))
        right = _parse_en_single_date(match.group(2))
        if left and right:
            return left, right
    return None


def _fetch_football_periods(year: int) -> dict[str, tuple[date, date]]:
    periods: dict[str, tuple[date, date]] = {}

    if year % 4 == 2:
        try:
            txt = _wiki_extract(f"{year}_FIFA_World_Cup", lang="en", intro=True)
            rng = _parse_en_from_to_month_day_range(txt) or _parse_en_date_range(txt)
            if rng:
                periods["worldcup"] = rng
        except (requests.RequestException, ValueError, TypeError):
            pass

    if year % 4 == 0:
        try:
            txt = _wiki_extract(f"UEFA_Euro_{year}", lang="en", intro=True)
            rng = _parse_en_from_to_month_day_range(txt) or _parse_en_date_range(txt)
            if rng:
                periods["euro"] = rng
        except (requests.RequestException, ValueError, TypeError):
            pass

    if year % 2 == 1 and year >= 2013:
        try:
            txt = _wiki_extract(f"{year}_Africa_Cup_of_Nations", lang="en", intro=True)
            rng = _parse_en_from_to_month_day_range(txt) or _parse_en_date_range(txt)
            if rng:
                periods["afcon"] = rng
        except (requests.RequestException, ValueError, TypeError):
            pass

    season_next = str((year + 1) % 100).zfill(2)

    try:
        txt = _wiki_extract(f"{year}–{season_next}_Ligue_1", lang="en", intro=True)
        rng = _parse_en_begin_end_range(txt)
        if rng:
            periods["ligue1"] = rng
    except (requests.RequestException, ValueError, TypeError):
        pass

    try:
        txt = _wiki_extract(f"{year}–{season_next}_UEFA_Champions_League", lang="en", intro=True)
        rng = _parse_en_begin_end_range(txt)
        if rng:
            periods["ucl"] = rng
    except (requests.RequestException, ValueError, TypeError):
        pass

    return periods


def _fetch_sports_dates(year: int) -> dict[str, tuple[date, date | None]]:
    sourced: dict[str, tuple[date, date | None]] = {}

    try:
        response = requests.get(f"https://api.jolpi.ca/ergast/f1/{year}.json", timeout=15)
        response.raise_for_status()
        races = response.json().get("MRData", {}).get("RaceTable", {}).get("Races", [])
        for race in races:
            race_name = str(race.get("raceName", "")).lower()
            locality = str(race.get("Circuit", {}).get("Location", {}).get("locality", "")).lower()
            country = str(race.get("Circuit", {}).get("Location", {}).get("country", "")).lower()
            if "monaco" in race_name or "monaco" in locality or "monaco" in country:
                race_date = parse_api_date_to_fr_date(race.get("date"))
                if race_date:
                    sourced["monaco"] = (race_date, None)
                break
    except (requests.RequestException, ValueError, TypeError):
        pass

    try:
        txt = _wiki_extract(f"{year}_French_Open", lang="en", intro=True)
        rng = _parse_en_date_range(txt)
        if rng:
            sourced["roland"] = rng
    except (requests.RequestException, ValueError, TypeError):
        pass

    try:
        txt = _wiki_extract(f"{year}_24_Hours_of_Le_Mans", lang="en", intro=True)
        rng = _parse_en_date_range(txt)
        if rng:
            sourced["lemans"] = rng
    except (requests.RequestException, ValueError, TypeError):
        pass

    try:
        txt = _wiki_extract(f"{year}_Tour_de_France", lang="en", intro=True)
        rng = _parse_en_date_range(txt)
        if rng:
            sourced["tour"] = rng
    except (requests.RequestException, ValueError, TypeError):
        pass

    try:
        txt = _wiki_extract(f"Tournoi_des_Six_Nations_{year}", lang="fr", intro=True)
        rng = _parse_fr_du_au_range(txt)
        if rng:
            sourced["six"] = rng
    except (requests.RequestException, ValueError, TypeError):
        pass

    try:
        txt = _wiki_extract(f"Championnat_de_France_de_rugby_à_XV_{year-1}-{year}", lang="fr", intro=True)
        match = re.search(r"se termine le\s+([^\.,]+)\s+lors de la finale", txt, flags=re.IGNORECASE)
        if match:
            top14_date = _parse_fr_single_date(match.group(1))
            if top14_date:
                sourced["top14"] = (top14_date, None)
    except (requests.RequestException, ValueError, TypeError):
        pass

    try:
        txt = _wiki_extract(f"Coupe_de_France_de_football_{year-1}-{year}", lang="fr", intro=False)
        match = re.search(
            r"finale[^\n]{0,120}?(?:a lieu|se joue|se déroule|est programmée)\s+le\s+([^\.,\n]+)",
            txt, flags=re.IGNORECASE,
        )
        if match:
            final_date = _parse_fr_single_date(match.group(1))
            if final_date:
                sourced["coupe"] = (final_date, None)
    except (requests.RequestException, ValueError, TypeError):
        pass

    return sourced


def _fetch_exam_dates(year: int) -> list[dict]:
    """
    Récupère les dates d'examens depuis le Bulletin Officiel de l'Éducation nationale.
    Source : note de service publiée chaque année en septembre au BO n°36
    URL pattern : https://www.education.gouv.fr/bo/{year-1}/Hebdo36/
    Fallback sur des dates connues si le BO n'est pas accessible.
    """

    # Dates connues — extraites du BO n°36 du 25 septembre 2025 (session 2026)
    # et du BO n°36 de 2024 (session 2025)
    KNOWN_DATES: dict[int, list[dict]] = {
        2026: [
            {
                "summary": "Baccalauréat général et technologique — Épreuves de spécialité",
                "start": date(2026, 6, 16),
                "end": date(2026, 6, 18),
                "description": (
                    "Épreuves terminales écrites de spécialité du baccalauréat général et technologique. "
                    "Créé par Napoléon en 1808, le baccalauréat est l'un des plus anciens examens nationaux. "
                    "Environ 500 000 candidats passent ces épreuves chaque année."
                ),
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat général et technologique — Philosophie",
                "start": date(2026, 6, 15),
                "end": date(2026, 6, 15),
                "description": (
                    "L'épreuve de philosophie est l'épreuve d'ouverture du bac, traditionnellement le premier jour. "
                    "Unique en Europe, cette épreuve de 4 heures fait de la France le seul pays où la philo "
                    "est une matière obligatoire pour tous les lycéens jusqu'au baccalauréat."
                ),
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat général et technologique — Grand Oral",
                "start": date(2026, 6, 22),
                "end": date(2026, 7, 1),
                "description": (
                    "Le Grand Oral évalue la capacité des candidats à présenter et défendre un projet à l'oral. "
                    "Introduit par la réforme du bac de 2019, il remplace l'ancien oral de TPE."
                ),
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat — Épreuve anticipée de français (1re)",
                "start": date(2026, 6, 11),
                "end": date(2026, 6, 11),
                "description": (
                    "L'épreuve écrite anticipée de français se passe en classe de Première, un an avant le bac. "
                    "Elle compte dans la note finale du baccalauréat général et technologique."
                ),
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Brevet des collèges (DNB) — Épreuves écrites",
                "start": date(2026, 6, 26),
                "end": date(2026, 6, 30),
                "description": (
                    "Le diplôme national du brevet sanctionne la fin du collège. "
                    "Il se déroule sur trois jours fin juin. "
                    "Près de 800 000 élèves le passent chaque année en France."
                ),
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "BTS — Épreuves écrites",
                "start": date(2026, 5, 18),
                "end": date(2026, 5, 21),
                "description": (
                    "Le Brevet de Technicien Supérieur (BTS) est un diplôme bac+2 de l'enseignement supérieur court. "
                    "Les épreuves écrites communes se déroulent en mai sur quatre jours."
                ),
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat professionnel — Épreuves écrites",
                "start": date(2026, 5, 20),
                "end": date(2026, 6, 5),
                "description": (
                    "Le baccalauréat professionnel valide une formation en lycée professionnel ou en alternance. "
                    "Ses épreuves écrites se déroulent de fin mai à début juin."
                ),
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "CAP — Épreuves écrites d'enseignement général",
                "start": date(2026, 6, 8),
                "end": date(2026, 6, 9),
                "description": (
                    "Le Certificat d'Aptitude Professionnelle (CAP) certifie des compétences dans un métier précis. "
                    "Les épreuves écrites d'enseignement général se déroulent sur deux jours en juin."
                ),
                "categories": ["Éducation", "Examens"],
            },
        ],
        2025: [
            {
                "summary": "Baccalauréat général et technologique — Épreuves de spécialité",
                "start": date(2025, 3, 18),
                "end": date(2025, 3, 20),
                "description": (
                    "Épreuves terminales écrites de spécialité du baccalauréat général et technologique. "
                    "Créé par Napoléon en 1808, le baccalauréat est l'un des plus anciens examens nationaux. "
                    "Environ 500 000 candidats passent ces épreuves chaque année."
                ),
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat général et technologique — Philosophie et Grand Oral",
                "start": date(2025, 6, 16),
                "end": date(2025, 6, 27),
                "description": (
                    "L'épreuve de philosophie ouvre le bac terminal, suivie du Grand Oral introduit par la réforme 2019. "
                    "Unique en Europe, la philo est une matière obligatoire pour tous les lycéens français."
                ),
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Brevet des collèges (DNB) — Épreuves écrites",
                "start": date(2025, 6, 26),
                "end": date(2025, 6, 27),
                "description": (
                    "Le diplôme national du brevet sanctionne la fin du collège. "
                    "Près de 800 000 élèves le passent chaque année en France."
                ),
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "BTS — Épreuves écrites",
                "start": date(2025, 5, 13),
                "end": date(2025, 5, 16),
                "description": (
                    "Le Brevet de Technicien Supérieur (BTS) est un diplôme bac+2 de l'enseignement supérieur court. "
                    "Les épreuves écrites communes se déroulent en mai."
                ),
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "CAP — Épreuves écrites d'enseignement général",
                "start": date(2025, 6, 4),
                "end": date(2025, 6, 5),
                "description": (
                    "Le Certificat d'Aptitude Professionnelle (CAP) certifie des compétences dans un métier précis."
                ),
                "categories": ["Éducation", "Examens"],
            },
        ],
    }

    # Retourne les dates connues si disponibles
    if year in KNOWN_DATES:
        return KNOWN_DATES[year]

    # Sinon, tentative de scraping du BO n°36 de l'année précédente
    results: list[dict] = []
    try:
        bo_url = f"https://www.education.gouv.fr/bo/{year - 1}/Hebdo36/"
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (compatible; CalendrierFR/1.0; "
                "+https://calendrier-fr.tibotsr.dev)"
            )
        }
        index_resp = requests.get(bo_url, headers=headers, timeout=15)
        index_resp.raise_for_status()

        # Cherche le lien vers la note de service calendrier des examens
        nor_match = re.search(
            r'href="(/bo/[^"]*MENE[^"]*N)"[^>]*>[^<]*[Cc]alendrier[^<]*examen',
            index_resp.text,
        )
        if not nor_match:
            # Essai alternatif : cherche n'importe quel lien MENE dans le BO
            nor_match = re.search(
                r'href="(/bo/[^"]*MENE\d{7,}N)"',
                index_resp.text,
            )
        if not nor_match:
            return results

        note_url = "https://www.education.gouv.fr" + nor_match.group(1)
        note_resp = requests.get(note_url, headers=headers, timeout=15)
        note_resp.raise_for_status()
        text = note_resp.text

        # Patterns de dates dans le texte du BO
        MONTHS_FR = {
            "janvier": 1, "février": 2, "mars": 3, "avril": 4,
            "mai": 5, "juin": 6, "juillet": 7, "août": 8,
            "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
        }

        def parse_bo_date(s: str) -> date | None:
            s = s.strip().lower()
            for m_name, m_num in MONTHS_FR.items():
                if m_name in s:
                    d_match = re.search(r"(\d{1,2})", s)
                    if d_match:
                        try:
                            return date(year, m_num, int(d_match.group(1)))
                        except ValueError:
                            pass
            return None

        EXAM_SEARCHES = [
            {
                "pattern": r"[Éé]preuves.*?baccalauréat général.*?(?:lundi|mardi|mercredi|jeudi|vendredi)\s+(\d{1,2})\s+(\w+)\s+\d{4}",
                "summary": "Baccalauréat général et technologique — Épreuves terminales",
                "description": "Épreuves terminales du baccalauréat général et technologique.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "pattern": r"[Éé]preuves.*?brevet.*?(?:lundi|mardi|mercredi|jeudi|vendredi)\s+(\d{1,2})\s+(\w+)\s+\d{4}",
                "summary": "Brevet des collèges (DNB) — Épreuves écrites",
                "description": "Épreuves écrites du diplôme national du brevet.",
                "categories": ["Éducation", "Examens"],
            },
        ]

        for search in EXAM_SEARCHES:
            match = re.search(search["pattern"], text, flags=re.IGNORECASE | re.DOTALL)
            if match:
                d = parse_bo_date(f"{match.group(1)} {match.group(2)}")
                if d:
                    results.append({
                        "summary": search["summary"],
                        "start": d,
                        "end": None,
                        "description": search["description"],
                        "categories": search["categories"],
                    })

    except (requests.RequestException, ValueError, TypeError, AttributeError):
        pass

    return results


def build_base_events() -> list[CalendarEvent]:
    events: list[CalendarEvent] = []

    for year in YEARS:

        # ── JOURS FÉRIÉS OFFICIELS ──────────────────────────────────────────
        fr_holidays = holidays.country_holidays("FR", years=year, language="fr")
        for holiday_date, holiday_name in fr_holidays.items():
            localized = localize_holiday_name(holiday_name)
            events.append(CalendarEvent(
                summary=localized,
                start=holiday_date,
                categories=["Jours fériés"],
                description="Jour férié légal en France — chômé et payé depuis la loi du 13 juillet 1906.",
            ))

        # ── CHRISTIANISME ───────────────────────────────────────────────────
        easter = easter_date(year)
        ascension = easter + timedelta(days=39)
        pentecote = easter + timedelta(days=49)

        events.extend([
            CalendarEvent(
                "Pâques", easter,
                categories=["Christianisme"],
                description="Fête chrétienne célébrant la résurrection du Christ. Sa date varie chaque année car elle suit le calendrier lunaire : premier dimanche après la pleine lune suivant l'équinoxe de printemps.",
            ),
            CalendarEvent(
                "Lundi de Pâques", easter + timedelta(days=1),
                categories=["Christianisme", "Jours fériés"],
                description="Jour férié qui prolonge le dimanche de Pâques. La tradition des œufs vient du Carême : l'Église interdisait d'en manger pendant 40 jours, on offrait donc à Pâques ceux accumulés.",
            ),
            CalendarEvent(
                "Ascension", ascension,
                categories=["Christianisme", "Jours fériés"],
                description="Fête chrétienne commémorant la montée du Christ au ciel, 40 jours après Pâques. Toujours un jeudi, ce qui en fait naturellement un pont avec le vendredi.",
            ),
            CalendarEvent(
                "Pentecôte", pentecote,
                categories=["Christianisme"],
                description="Célèbre la descente de l'Esprit Saint sur les apôtres, 50 jours après Pâques. Depuis 2004, le lundi est aussi la Journée de solidarité, instaurée après la canicule de 2003 qui fit 15 000 morts en France.",
            ),
            CalendarEvent(
                "Lundi de Pentecôte", pentecote + timedelta(days=1),
                categories=["Christianisme", "Jours fériés"],
                description="Jour férié désigné depuis 2004 Journée de solidarité envers les personnes âgées. Les salariés travaillent ce jour sans rémunération supplémentaire, finançant ainsi la prise en charge de la dépendance.",
            ),
            CalendarEvent(
                "Début du Carême", easter - timedelta(days=46),
                categories=["Christianisme"],
                description="Le Carême commence le Mercredi des Cendres, 46 jours avant Pâques. Période de jeûne et de pénitence de 40 jours (hors dimanches) symbolisant les 40 jours de Jésus au désert.",
            ),
            CalendarEvent(
                "Mardi Gras", easter - timedelta(days=47),
                categories=["Christianisme", "Culture", "Fêtes"],
                description="Dernier jour avant le Carême, où la tradition voulait qu'on fasse bombance avant l'abstinence. Le nom vient de là : dernier mardi pour manger gras. Aujourd'hui synonyme de carnavals et de crêpes.",
            ),
            CalendarEvent(
                "Dimanche des Rameaux", easter - timedelta(days=7),
                categories=["Christianisme"],
                description="Ouvre la Semaine Sainte en rappelant l'entrée triomphale de Jésus à Jérusalem, accueilli par une foule brandissant des palmes. En France, les fidèles font bénir des rameaux d'olivier ou de buis.",
            ),
            CalendarEvent(
                "Vendredi Saint", easter - timedelta(days=2),
                categories=["Christianisme"],
                description="Commémore la crucifixion du Christ. Non férié en France depuis la loi de 1905 — sauf en Alsace-Moselle, qui conserve son régime concordataire hérité de l'époque où la région était allemande.",
            ),
            CalendarEvent(
                "Toussaint", date(year, 11, 1),
                categories=["Christianisme", "Jours fériés"],
                description="Fête de tous les saints, instituée par le pape Grégoire IV en 835. En France, la tradition de fleurir les tombes avec des chrysanthèmes s'est greffée dessus — ces fleurs sont désormais intimement liées à ce jour.",
            ),
            CalendarEvent(
                "Noël", date(year, 12, 25),
                categories=["Christianisme", "Jours fériés", "Fêtes"],
                description="Célèbre la naissance du Christ. La date du 25 décembre a été fixée au IVe siècle sur une fête solaire romaine préexistante. Le sapin, la bûche et les cadeaux sont des traditions popularisées bien plus tard, au XIXe siècle.",
            ),
            CalendarEvent(
                "Épiphanie", date(year, 1, 6),
                categories=["Christianisme", "Culture", "Gastronomie"],
                description="Célèbre la visite des Rois Mages à Jésus, 12 jours après Noël. En France c'est l'occasion de la galette des Rois — feuilletée à la frangipane au nord, briochée aux fruits confits au sud.",
            ),
            CalendarEvent(
                "Saint-Nicolas", date(year, 12, 6),
                categories=["Christianisme", "Culture", "Fêtes"],
                description="Fête de Nicolas de Myre, évêque du IVe siècle devenu patron des enfants. Très célébrée en Alsace, Lorraine et dans le Nord, où Saint-Nicolas défile en distribuant des friandises le 6 décembre.",
            ),
            CalendarEvent(
                "Assomption de Marie", date(year, 8, 15),
                categories=["Christianisme", "Jours fériés"],
                description="Célèbre l'élévation de la Vierge Marie au ciel. Fête chrétienne ancienne, jour férié en France depuis le Concordat de 1802. Elle tombe en plein cœur de l'été, au milieu des grandes vacances.",
            ),
        ])

        # ── FÊTES POPULAIRES & TRADITIONS ──────────────────────────────────
        events.extend([
            CalendarEvent(
                "Saint-Sylvestre / Réveillon du Nouvel An", date(year, 12, 31),
                categories=["Fêtes", "Culture"],
                description="Dernier jour de l'année, nommé d'après le pape Sylvestre Ier mort ce jour en 335. C'est le soir du grand réveillon — champagne, feux d'artifice et compte à rebours à minuit.",
            ),
            CalendarEvent(
                "Jour de l'An", date(year, 1, 1),
                categories=["Fêtes", "Jours fériés"],
                description="Premier jour de l'année civile grégorienne. La tradition des vœux existe depuis l'Antiquité romaine. Le gui porte-bonheur vient d'une coutume druidique bien antérieure au christianisme.",
            ),
            CalendarEvent(
                "Saint-Valentin", date(year, 2, 14),
                categories=["Fêtes", "Culture"],
                description="Fête des amoureux le 14 février. Le lien avec les amoureux viendrait d'une tradition médiévale anglaise selon laquelle les oiseaux choisissaient leur partenaire ce jour-là — documentée chez Chaucer dès 1382.",
            ),
            CalendarEvent(
                "Chandeleur", date(year, 2, 2),
                categories=["Culture", "Christianisme", "Gastronomie"],
                description="Fête de la Présentation de Jésus au Temple, 40 jours après Noël. La tradition des crêpes vient de leur forme ronde et dorée évoquant le soleil qui revient après l'hiver — une symbolique solaire bien antérieure au christianisme.",
            ),
            CalendarEvent(
                "Poisson d'avril", date(year, 4, 1),
                categories=["Culture"],
                description="Journée des farces et des canulars. L'origine probable : l'édit de 1564 déplaçant le Nouvel An du 1er avril au 1er janvier — ceux non informés recevaient de faux cadeaux, les fameux poissons d'avril.",
            ),
            CalendarEvent(
                "Fête du Travail", date(year, 5, 1),
                categories=["Jours fériés", "Société"],
                description="Commémore la grève de Chicago du 1er mai 1886 pour les 8 heures de travail, réprimée dans le sang. Férié et chômé en France depuis 1947. La tradition d'offrir du muguet vient d'une coutume de Charles IX datant de 1561.",
            ),
            CalendarEvent(
                "Fête des Mères",
                last_weekday(year, 5, 6) if last_weekday(year, 5, 6) != pentecote else nth_weekday(year, 6, 6, 1),
                categories=["Fêtes", "Culture"],
                description="Célébrée le dernier dimanche de mai, sauf si c'est la Pentecôte.",
            ),
            CalendarEvent(
                "Fête des Pères", nth_weekday(year, 6, 6, 3),
                categories=["Fêtes", "Culture"],
                description="Née aux États-Unis en 1910, introduite en France dans les années 1950 par le fabricant de briquets Flaminaire, qui cherchait à créer un événement commercial symétrique à la Fête des Mères.",
            ),
            CalendarEvent(
                "Fête des Grands-Mères", nth_weekday(year, 3, 6, 1),
                categories=["Fêtes", "Culture"],
                description="Créée en 1987 par la marque de café Grand'Mère pour valoriser les aïeules. Célébrée le premier dimanche de mars, elle est devenue une tradition familiale bien ancrée malgré ses origines purement commerciales.",
            ),
            CalendarEvent(
                "Fête des Grands-Pères", 
                nth_weekday(year, 10, 6, 1),
                categories=["Fêtes", "Culture"],
                description="Créée en 2008, elle a lieu chaque premier dimanche d'octobre.",
            ),
            CalendarEvent(
                "Halloween", date(year, 10, 31),
                categories=["Culture", "Fêtes"],
                description="Fête d'origine celtique (la nuit de Samain) christianisée puis popularisée par la diaspora irlandaise aux États-Unis au XIXe siècle. Arrivée en France dans les années 1990, d'abord mal accueillie, elle s'est depuis bien installée.",
            ),
            CalendarEvent(
                "Saint-Patrick", date(year, 3, 17),
                categories=["Culture", "Fêtes"],
                description="Fête nationale irlandaise le 17 mars, commémorant la mort de saint Patrick (461), évangélisateur de l'Irlande. Exportée dans le monde entier par la diaspora irlandaise, elle est aujourd'hui fêtée partout où il y a un pub.",
            ),
            CalendarEvent(
                "Fête Nationale", date(year, 7, 14),
                categories=["Jours fériés", "Société", "Dates spéciales"],
                description="Commémore la prise de la Bastille le 14 juillet 1789, symbole de la Révolution française. Jour férié depuis 1880. Défilé militaire sur les Champs-Élysées, bals des pompiers et feux d'artifice dans toute la France.",
            ),
            CalendarEvent(
                "Fête de la Musique", date(year, 6, 21),
                categories=["Culture", "Fêtes"],
                description="Créée en 1982 par le ministre Jack Lang. Elle ouvre les rues à tous les musiciens gratuitement, le jour du solstice d'été. Le nom est un jeu de mots intentionnel : Fête de la musique / Faites de la musique.",
            ),
            CalendarEvent(
                "Journées du Patrimoine", nth_weekday(year, 9, 5, 3),
                categories=["Culture", "Société"],
                description="Créées en France en 1984 par Jack Lang, étendues à toute l'Europe en 1991. Chaque troisième week-end de septembre, des milliers de monuments habituellement fermés ou payants ouvrent leurs portes gratuitement.",
            ),
            CalendarEvent(
                "Nuit Blanche", nth_weekday(year, 10, 5, 1),
                categories=["Culture"],
                description="Initiée à Paris en 2002 par le maire Bertrand Delanoë. Chaque premier samedi d'octobre, musées, galeries et espaces publics proposent des installations artistiques nocturnes accessibles gratuitement.",
            ),
            CalendarEvent(
                "Beaujolais Nouveau", nth_weekday(year, 11, 3, 3),
                categories=["Gastronomie", "Culture", "Commercial"],
                description="Chaque troisième jeudi de novembre, le Beaujolais Nouveau est mis en vente — vin primeur issu de la récolte de l'été. Une tradition née dans les années 1950 devenue événement mondial : le vin voyage parfois en avion pour arriver à l'heure au Japon.",
            ),
            CalendarEvent(
                "Braderie de Lille", nth_weekday(year, 9, 5, 1),
                categories=["Culture", "Commerce"],
                description="Plus grande braderie d'Europe, organisée le premier week-end de septembre à Lille. Son origine remonte au XIIe siècle, quand les domestiques lillois pouvaient vendre les objets de leurs maîtres une nuit par an.",
            ),
            CalendarEvent(
                "Fête de la Bretagne", date(year, 11, 30),
                categories=["Culture", "Société"],
                description="Célébrée le 30 novembre (Saint-André) depuis les années 1990 pour mettre à l'honneur la culture bretonne : langue, musique, fest-noz et gastronomie. Une initiative culturelle locale devenue rendez-vous identitaire fort.",
            ),
        ])

        # ── DATES CIVIQUES & MÉMOIRE ────────────────────────────────────────
        events.extend([
            CalendarEvent(
                "Journée nationale de la Mémoire de la Shoah", date(year, 1, 27),
                categories=["Mémoire", "Société"],
                description="Commémore la libération du camp d'Auschwitz le 27 janvier 1945. En 1995, Chirac fut le premier président à reconnaître officiellement la responsabilité de l'État français dans la déportation des Juifs de France.",
            ),
            CalendarEvent(
                "Commémoration de la Rafle du Vél d'Hiv", nth_weekday(year, 7, 6, 2),
                categories=["Mémoire", "Société"],
                description="Les 16-17 juillet 1942, la police française arrêta 13 152 Juifs à Paris dont 4 115 enfants, sur ordre de l'occupant nazi. Parqués dans le Vélodrome d'Hiver, ils furent ensuite déportés vers les camps d'extermination.",
            ),
            CalendarEvent(
                "Victoire 1945 — Capitulation de l'Allemagne nazie", date(year, 5, 8),
                categories=["Jours fériés", "Mémoire", "Dates spéciales"],
                description="Le 8 mai 1945, l'Allemagne nazie signe sa capitulation sans condition, mettant fin à la guerre en Europe. Férié depuis 1953, supprimé par Giscard en 1975, puis rétabli par Mitterrand en 1981.",
            ),
            CalendarEvent(
                "Appel du 18 juin 1940 — Anniversaire", date(year, 6, 18),
                categories=["Mémoire", "Dates spéciales"],
                description="Le 18 juin 1940, de Gaulle lance depuis Londres un appel à la Résistance sur la BBC, quatre jours avant la signature de l'armistice. Peu l'entendirent en direct, mais il est devenu le symbole fondateur de la France Libre.",
            ),
            CalendarEvent(
                "Débarquement en Normandie — Commémoration du Jour J", date(year, 6, 6),
                categories=["Mémoire", "Dates spéciales"],
                description="Le 6 juin 1944, 156 000 soldats alliés débarquent sur les plages de Normandie — la plus grande opération militaire amphibie de l'histoire. Ce Jour J amorça la libération de la France et la chute du régime nazi.",
            ),
            CalendarEvent(
                "Abolition de l'esclavage en France — Commémoration", date(year, 5, 10),
                categories=["Mémoire", "Société"],
                description="Journée nationale instaurée par la loi Taubira de 2001. La France a aboli l'esclavage définitivement le 27 avril 1848 — après une première abolition en 1794 annulée par Napoléon en 1802.",
            ),
            CalendarEvent(
                "Journée de la Laïcité", date(year, 12, 9),
                categories=["Société", "Dates spéciales"],
                description="Commémore la loi du 9 décembre 1905 séparant les Églises de l'État. Ce texte fonde la neutralité de l'État face aux religions et garantit la liberté de conscience — l'un des piliers de la République française.",
            ),
            CalendarEvent(
                "Journée nationale de la Résistance", date(year, 5, 27),
                categories=["Mémoire", "Société"],
                description="Le 27 mai 1943, Jean Moulin préside la première réunion secrète du Conseil National de la Résistance à Paris, unifiant tous les mouvements contre l'occupation nazie sous l'autorité du général de Gaulle.",
            ),
            CalendarEvent(
                "Armistice de 1918 — Journée du Souvenir", date(year, 11, 11),
                categories=["Jours fériés", "Mémoire", "Dates spéciales"],
                description="Le 11 novembre 1918 à 11h, l'armistice met fin à la Première Guerre mondiale après quatre ans de combats. Jour férié depuis 1922. Chaque commune française a son monument aux morts — 36 000 érigés entre 1920 et 1925.",
            ),
        ])

        # ── SANTÉ ───────────────────────────────────────────────────────────
        events.extend([
            CalendarEvent(
                "Journée mondiale contre le cancer", date(year, 2, 4),
                categories=["Santé"],
                description="Initiée par l'Union Internationale Contre le Cancer depuis 2000. En France, le cancer est la première cause de mortalité — environ 382 000 nouveaux cas sont diagnostiqués chaque année.",
            ),
            CalendarEvent(
                "Journée mondiale de la Santé", date(year, 4, 7),
                categories=["Santé"],
                description="Commémore la fondation de l'OMS le 7 avril 1948. Chaque année, un thème est choisi pour braquer les projecteurs sur un enjeu sanitaire mondial prioritaire.",
            ),
            CalendarEvent(
                "Journée mondiale sans tabac", date(year, 5, 31),
                categories=["Santé"],
                description="Lancée par l'OMS en 1987. En France, le tabac est la première cause de cancer évitable et tue environ 75 000 personnes par an — soit plus que les accidents de la route, l'alcool et les drogues réunis.",
            ),
            CalendarEvent(
                "Journée mondiale de la santé mentale", date(year, 10, 10),
                categories=["Santé", "Société"],
                description="Créée par la Fédération Mondiale pour la Santé Mentale en 1992. Elle vise à réduire la stigmatisation autour des troubles psychiques, encore trop souvent passés sous silence.",
            ),
            CalendarEvent(
                "Lancement d'Octobre Rose", date(year, 10, 1),
                categories=["Santé"],
                description="Tout octobre est dédié à la sensibilisation au cancer du sein, le plus fréquent chez la femme. La campagne au ruban rose est née aux États-Unis en 1985 et s'est répandue dans le monde entier.",
            ),
            CalendarEvent(
                "Lancement du Mois sans Tabac", date(year, 11, 1),
                categories=["Santé"],
                description="Lancé en France en 2016 par Santé Publique France, inspiré du mouvement britannique Stoptober. L'idée : tenir 30 jours sans fumer en groupe pour multiplier les chances d'arrêt définitif.",
            ),
        ])

        # ── SOCIÉTÉ ─────────────────────────────────────────────────────────
        events.extend([
            CalendarEvent(
                "Journée internationale des femmes", date(year, 3, 8),
                categories=["Société"],
                description="Issue des luttes ouvrières du début du XXe siècle en Europe et aux États-Unis. L'ONU l'a officialisée en 1977. Le 8 mars rappelle que l'égalité entre femmes et hommes reste un combat en cours dans le monde.",
            ),
            CalendarEvent(
                "Journée internationale des droits de l'enfant", date(year, 11, 20),
                categories=["Société"],
                description="Commémore l'adoption de la Convention des Nations Unies relative aux droits de l'enfant le 20 novembre 1989 — le traité international le plus ratifié de l'histoire, signé par 196 pays.",
            ),
            CalendarEvent(
                "Journée mondiale des personnes handicapées", date(year, 12, 3),
                categories=["Société"],
                description="Instaurée par l'ONU en 1992. En France, la loi du 11 février 2005 est la référence pour l'égalité des droits et des chances — qu'il s'agisse d'accessibilité, d'emploi ou d'éducation.",
            ),
            CalendarEvent(
                "Journée mondiale du Bénévolat", date(year, 12, 5),
                categories=["Société"],
                description="Créée par l'ONU en 1985. En France, 21 millions de bénévoles s'investissent dans 1,5 million d'associations — un pilier discret mais essentiel de la vie sociale.",
            ),
            CalendarEvent(
                "Fête des Voisins", last_weekday(year, 5, 4),
                categories=["Société"],
                description="Créée en 2000 pour lutter contre l'isolement urbain. Chaque dernier vendredi de mai, des millions de Français se retrouvent dans leurs immeubles ou leurs rues autour d'un repas partagé.",
            ),
            CalendarEvent(
                "Journée nationale de lutte contre les discriminations", date(year, 3, 21),
                categories=["Société"],
                description="Créée par l'ONU en 1966 en mémoire du massacre de Sharpeville en Afrique du Sud (21 mars 1960), où 69 manifestants pacifiques furent abattus par la police du régime d'apartheid.",
            ),
        ])

        # ── ENVIRONNEMENT ───────────────────────────────────────────────────
        events.extend([
            CalendarEvent(
                "Jour de la Terre", date(year, 4, 22),
                categories=["Environnement", "Société"],
                description="Né le 22 avril 1970 après une marée noire en Californie. La première édition mobilisa 20 millions d'Américains et aboutit directement à la création de l'agence de protection de l'environnement américaine.",
            ),
            CalendarEvent(
                "Journée mondiale de l'océan", date(year, 6, 8),
                categories=["Environnement"],
                description="Proposée lors du Sommet de la Terre de Rio en 1992. Les océans couvrent 71 % de la planète, produisent la moitié de l'oxygène que nous respirons et absorbent 30 % du CO₂ que nous émettons.",
            ),
            CalendarEvent(
                "Journée mondiale de la biodiversité", date(year, 5, 22),
                categories=["Environnement"],
                description="Commémore l'adoption de la Convention sur la Diversité Biologique à Rio le 22 mai 1992. Elle alerte sur l'effondrement du vivant : selon l'ONU, un million d'espèces sont aujourd'hui menacées d'extinction.",
            ),
            CalendarEvent(
                "Journée mondiale sans voiture", date(year, 9, 22),
                categories=["Environnement", "Société"],
                description="Lancée en France en 1998 par La Rochelle, avant d'être reprise par l'UE. Elle invite les villes à fermer leurs centres aux voitures pour expérimenter d'autres façons de se déplacer.",
            ),
            CalendarEvent(
                "Journée mondiale de l'eau", date(year, 3, 22),
                categories=["Environnement", "Société"],
                description="Proclamée par l'ONU en 1993. Elle rappelle que 2,2 milliards de personnes n'ont pas accès à une eau potable sûre, et que cette ressource est de plus en plus menacée par le changement climatique.",
            ),
            CalendarEvent(
                "Journée mondiale des zones humides", date(year, 2, 2),
                categories=["Environnement"],
                description="Commémore la Convention de Ramsar signée le 2 février 1971 — premier traité environnemental intergouvernemental. Elle protège marais, tourbières et estuaires, qui abritent une biodiversité exceptionnelle.",
            ),
            CalendarEvent(
                "Journée nationale de l'arbre", nth_weekday(year, 11, 3, 1),
                categories=["Environnement"],
                description="Célébrée chaque premier jeudi de novembre. La forêt française couvre 31 % du territoire national et a doublé de superficie depuis 1850 grâce aux reboisements.",
            ),
            CalendarEvent(
                "Journée mondiale de l'alimentation", date(year, 10, 16),
                categories=["Gastronomie", "Société", "Santé"],
                description="Commémore la fondation de la FAO le 16 octobre 1945. Elle rappelle que 733 millions de personnes souffrent de la faim dans le monde, alors qu'un tiers de la nourriture produite est gaspillée.",
            ),
        ])

        # ── SPORT ───────────────────────────────────────────────────────────
        roland_start = last_sunday(year, 5)
        roland_end = roland_start + timedelta(days=14)
        monaco_gp = last_sunday(year, 5)
        le_mans_start = nth_weekday(year, 6, 5, 2)
        le_mans_end = le_mans_start + timedelta(days=1)
        tour_start = nth_weekday(year, 7, 5, 1)
        tour_end = tour_start + timedelta(days=22)
        coupe_france_final = last_weekday(year, 5, 5)
        six_nations_start = nth_weekday(year, 2, 5, 1)
        six_nations_end = six_nations_start + timedelta(weeks=6)
        top14_final = last_weekday(year, 6, 5)

        sourced_sports = _fetch_sports_dates(year)

        if "roland" in sourced_sports:
            roland_start, roland_end = sourced_sports["roland"]
        if "monaco" in sourced_sports:
            monaco_gp, _ = sourced_sports["monaco"]
        if "lemans" in sourced_sports:
            le_mans_start, le_mans_end = sourced_sports["lemans"]
        if "tour" in sourced_sports:
            tour_start, tour_end = sourced_sports["tour"]
        if "coupe" in sourced_sports:
            coupe_france_final, _ = sourced_sports["coupe"]
        if "six" in sourced_sports:
            six_nations_start, six_nations_end = sourced_sports["six"]
        if "top14" in sourced_sports:
            top14_final, _ = sourced_sports["top14"]

        football_periods = _fetch_football_periods(year)

        ligue1_start = date(year, 8, 10)
        ligue1_end = date(year + 1, 5, 25)
        ucl_start = date(year, 9, 10)
        ucl_end = date(year + 1, 5, 31)

        if "ligue1" in football_periods:
            ligue1_start, ligue1_end = football_periods["ligue1"]
        if "ucl" in football_periods:
            ucl_start, ucl_end = football_periods["ucl"]

        events.extend([
            CalendarEvent(
                "Roland-Garros — Début du tournoi", roland_start,
                end=roland_end,
                categories=["Sport"],
                description="Seul Grand Chelem sur terre battue, disputé fin mai à Paris. Le tournoi dure environ deux semaines. Il porte le nom d'un aviateur de la Première Guerre mondiale, pas d'un joueur de tennis.",
            ),
            CalendarEvent(
                "Grand Prix de Monaco (Formule 1)", monaco_gp,
                categories=["Sport"],
                description="Disputé dans les rues de Monaco depuis 1929. Son circuit étroit et lent en fait paradoxalement la plus difficile des courses F1 à remporter — dépasser y est presque impossible.",
            ),
            CalendarEvent(
                "24 Heures du Mans — Départ", le_mans_start,
                end=le_mans_end,
                categories=["Sport"],
                description="Course d'endurance mythique créée en 1923 sur le circuit de la Sarthe. Voitures et pilotes se relaient pendant 24 heures consécutives, de jour comme de nuit.",
            ),
            CalendarEvent(
                "Tour de France — Grand Départ", tour_start,
                end=tour_end,
                categories=["Sport"],
                description="La course cycliste la plus célèbre au monde, créée en 1903. Trois semaines, 21 étapes, environ 3 500 km. Le maillot jaune tire son nom de la couleur du papier journal L'Auto, organisateur historique.",
            ),
            CalendarEvent(
                "Finale de la Coupe de France de Football", coupe_france_final,
                categories=["Sport"],
                description="Ouverte à tous les clubs, des amateurs de district jusqu'aux pros. Fondée en 1917, sa finale se joue au Stade de France — n'importe quel club peut théoriquement la remporter.",
            ),
            CalendarEvent(
                "Tournoi des Six Nations — Période", six_nations_start,
                end=six_nations_end,
                categories=["Sport"],
                description="Le plus vieux tournoi international de rugby à XV, né en 1883. Il réunit chaque année de février à mars l'Angleterre, la France, l'Irlande, l'Écosse, le Pays de Galles et l'Italie.",
            ),
            CalendarEvent(
                "Finale du Top 14 de Rugby", top14_final,
                categories=["Sport"],
                description="La finale du championnat professionnel de rugby français se joue au Stade de France en juin. Toulouse est le club le plus titré avec plus de 20 boucliers de Brennus.",
            ),
            CalendarEvent(
                f"Ligue 1 — Saison {year}-{year+1}", ligue1_start,
                end=ligue1_end,
                categories=["Sport"],
                description=f"La saison {year}-{year+1} de Ligue 1 regroupe 20 clubs pour 380 matchs d'août à mai.",
            ),
            CalendarEvent(
                f"Ligue des Champions UEFA — Saison {year}-{year+1}", ucl_start,
                end=ucl_end,
                categories=["Sport"],
                description=f"La saison {year}-{year+1} de la Ligue des Champions UEFA, de septembre à fin mai.",
            ),
        ])

        if "worldcup" in football_periods:
            world_start, world_end = football_periods["worldcup"]
            events.append(CalendarEvent(
                f"Coupe du monde de football {year}", world_start,
                end=world_end,
                categories=["Sport"],
                description="Compétition internationale masculine organisée par la FIFA tous les quatre ans.",
            ))

        if "euro" in football_periods:
            euro_start, euro_end = football_periods["euro"]
            events.append(CalendarEvent(
                f"UEFA Euro {year}", euro_start,
                end=euro_end,
                categories=["Sport"],
                description="Championnat d'Europe des nations de football, organisé tous les quatre ans par l'UEFA.",
            ))

        if "afcon" in football_periods:
            afcon_start, afcon_end = football_periods["afcon"]
            events.append(CalendarEvent(
                f"Coupe d'Afrique des Nations {year}", afcon_start,
                end=afcon_end,
                categories=["Sport"],
                description="Compétition continentale des sélections africaines, organisée tous les deux ans par la CAF.",
            ))

        # ── EXAMENS NATIONAUX ───────────────────────────────────────────────
        for exam in _fetch_exam_dates(year):
            events.append(CalendarEvent(
                summary=exam["summary"],
                start=exam["start"],
                end=exam.get("end"),
                categories=exam["categories"],
                description=exam["description"],
            ))

        # ── GASTRONOMIE & CULTURE ───────────────────────────────────────────
        events.extend([
            CalendarEvent(
                "Semaine du Goût", nth_weekday(year, 10, 0, 2),
                categories=["Gastronomie", "Culture"],
                description="Créée en 1990 par le chef Joël Robuchon. Chaque deuxième semaine d'octobre, des cuisiniers interviennent dans les écoles pour sensibiliser les enfants aux saveurs et au patrimoine culinaire français.",
            ),
            CalendarEvent(
                "Journée mondiale du cacao et du chocolat", date(year, 10, 1),
                categories=["Gastronomie", "Culture"],
                description="Célébrée le 1er octobre et associée à l'Organisation internationale du cacao (ICCO). Elle met en avant la filière cacao, l'histoire du chocolat et les enjeux de production durable.",
            ),
            CalendarEvent(
                "Nuit des Musées", nth_weekday(year, 5, 5, 3),
                categories=["Culture"],
                description="Créée en France en 2005 et étendue à toute l'Europe. Chaque troisième samedi de mai, plus de 3 000 musées ouvrent gratuitement jusqu'à minuit avec des événements et parcours spéciaux.",
            ),
            CalendarEvent(
                "Festival de Cannes — Ouverture", date(year, 5, 14),
                categories=["Culture", "Cinéma"],
                description="Le Festival International du Film de Cannes, créé en 1946, est le rendez-vous cinématographique le plus influent au monde. La Palme d'Or y est remise chaque mai au meilleur film en compétition.",
            ),
            CalendarEvent(
                "Fête du Cinéma", nth_weekday(year, 6, 6, 4),
                categories=["Culture", "Cinéma"],
                description="Créée en 1985, elle propose chaque fin juin des places à tarif réduit dans toutes les salles de France. Elle célèbre le fait que la France est l'un des pays avec la plus forte densité de cinémas au monde.",
            ),
            CalendarEvent(
                "Festival d'Avignon — Ouverture", date(year, 7, 5),
                categories=["Culture", "Théâtre"],
                description="Créé par Jean Vilar en 1947 dans la cour du Palais des Papes, c'est le plus grand festival de théâtre vivant au monde. Chaque juillet, toute la ville d'Avignon se transforme en scène.",
            ),
            CalendarEvent(
                "Salon de l'Agriculture — Ouverture", nth_weekday(year, 2, 5, 4),
                categories=["Gastronomie", "Agriculture", "Culture"],
                description="Le Salon International de l'Agriculture se tient chaque fin février à Paris. Créé en 1964, c'est le plus grand salon agricole d'Europe — et le rendez-vous traditionnel des candidats à l'élection présidentielle.",
            ),
        ])

        # ── ÉDUCATION ───────────────────────────────────────────────────────
        events.extend([
            CalendarEvent(
                "Rentrée des classes", date(year, 9, 2),
                categories=["Éducation", "Société"],
                description="La rentrée de septembre mobilise 12 millions d'élèves et 870 000 enseignants en France. Elle marque aussi la rentrée politique, culturelle et médiatique — tout repart en même temps après l'été.",
            ),
            CalendarEvent(
                "Journée internationale de l'Éducation", date(year, 1, 24),
                categories=["Éducation", "Société"],
                description="Proclamée par l'ONU en 2019. En France, l'instruction est obligatoire de 3 à 16 ans depuis la loi de 1959. Le baccalauréat, créé par Napoléon en 1808, est l'un des examens nationaux les plus anciens au monde.",
            ),
            CalendarEvent(
                "Nuit des Étoiles", nth_weekday(year, 8, 5, 1),
                categories=["Astronomie", "Éducation", "Culture"],
                description="Organisée chaque premier week-end d'août par l'Association Française d'Astronomie depuis 1991. Elle coïncide avec le pic des Perséides — la plus belle pluie d'étoiles filantes de l'été.",
            ),
        ])

        # ── DATES SPÉCIALES ─────────────────────────────────────────────────
        if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0):
            events.append(CalendarEvent(
                "Jour supplémentaire (année bissextile)", date(year, 2, 29),
                categories=["Dates spéciales"],
                description=f"Une année solaire dure 365,2422 jours. Le calendrier ajoute un jour tous les 4 ans pour rester aligné avec les saisons — sans ça, l'été se retrouverait en hiver en quelques siècles. {year} est l'une de ces années rares à 366 jours.",
            ))

        is_leap_year = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
        mid_year_date = date(year, 7, 1) if is_leap_year else date(year, 7, 2)
        events.extend([
            CalendarEvent(
                "Milieu de l'année", mid_year_date,
                categories=["Dates spéciales"],
                description=f"Ce jour marque le point médian exact de l'année {year} — la moitié des {366 if is_leap_year else 365} jours est écoulée.",
            ),
            CalendarEvent(
                "Dernier jour de l'année", date(year, 12, 31),
                categories=["Dates spéciales"],
                description=f"Clôture de l'année civile {year} et de l'exercice comptable et fiscal pour les entreprises.",
            ),
        ])

        if year % 10 == 0:
            events.append(CalendarEvent(
                "Début d'une nouvelle décennie", date(year, 1, 1),
                categories=["Dates spéciales"],
                description=f"Le 1er janvier {year} ouvre la décennie {year}–{year + 9}.",
            ))

        if year % 10 == 9:
            events.append(CalendarEvent(
                "Fin d'une décennie", date(year, 12, 31),
                categories=["Dates spéciales"],
                description=f"Le 31 décembre {year} clôture la décennie {year - 9}–{year}.",
            ))

        if year % 100 == 1:
            century_number = (year - 1) // 100 + 1
            events.append(CalendarEvent(
                "Début d'un nouveau siècle", date(year, 1, 1),
                categories=["Dates spéciales"],
                description=f"Le 1er janvier {year} ouvre le {to_roman(century_number)}e siècle selon le calendrier grégorien.",
            ))

        if year % 100 == 0:
            century_number = year // 100
            events.append(CalendarEvent(
                "Fin d'un siècle", date(year, 12, 31),
                categories=["Dates spéciales"],
                description=f"Le 31 décembre {year} clôture le {to_roman(century_number)}e siècle.",
            ))

        if date(year, 12, 28).isocalendar().week == 53:
            events.append(CalendarEvent(
                "Année avec 53e semaine ISO", date(year, 12, 28),
                categories=["Dates spéciales"],
                description=f"L'année {year} comporte une semaine 53 dans le calendrier ISO — phénomène qui arrive quand le 1er janvier tombe un jeudi.",
            ))

        day_cursor = date(year, 1, 1)
        while day_cursor.year == year:
            stamp = day_cursor.strftime("%d%m%Y")
            if stamp == stamp[::-1]:
                events.append(CalendarEvent(
                    "Date palindrome", day_cursor,
                    categories=["Dates spéciales"],
                    description=f"La date du {day_cursor.strftime('%d/%m/%Y')} se lit de la même façon dans les deux sens au format JJMMAAAA ({stamp}).",
                ))
            day_cursor += timedelta(days=1)

        # ── CHANGEMENTS D'HEURE ─────────────────────────────────────────────
        events.extend([
            CalendarEvent(
                "Passage à l'heure d'été", last_sunday(year, 3),
                categories=["Changement d'heure"],
                description="Dans la nuit du samedi au dimanche, les montres avancent d'une heure (2h → 3h). On perd une heure de sommeil mais on gagne une heure de lumière le soir. Cette pratique existe en France depuis 1976, instaurée après le choc pétrolier.",
            ),
            CalendarEvent(
                "Passage à l'heure d'hiver", last_sunday(year, 10),
                categories=["Changement d'heure"],
                description="Dans la nuit du samedi au dimanche, les montres reculent d'une heure (3h → 2h). On gagne une heure de sommeil mais il fait nuit plus tôt le soir. L'UE a voté la suppression de ce changement en 2019, sans suite pour l'instant.",
            ),
        ])

        # ── SAISONS & ASTRONOMIE ────────────────────────────────────────────
        seasons = season_start_dates(year)
        events.extend([
            CalendarEvent(
                "Début du Printemps — Équinoxe de printemps", seasons["printemps"],
                categories=["Saisons", "Astronomie"],
                description="L'équinoxe de printemps marque le début astronomique du printemps : jour et nuit ont la même durée. Le Soleil passe de l'hémisphère sud au nord — les jours vont désormais allonger.",
            ),
            CalendarEvent(
                "Début de l'Été — Solstice d'été", seasons["ete"],
                categories=["Saisons", "Astronomie"],
                description="Le solstice d'été est le jour le plus long de l'année. Le Soleil atteint sa hauteur maximale dans le ciel. La Fête de la Musique a été placée ce jour-là intentionnellement par ses créateurs.",
            ),
            CalendarEvent(
                "Début de l'Automne — Équinoxe d'automne", seasons["automne"],
                categories=["Saisons", "Astronomie"],
                description="L'équinoxe d'automne marque le début de l'automne : jour et nuit sont à nouveau égaux. Les nuits vont désormais s'allonger. C'est la saison des vendanges, des champignons et des grandes migrations d'oiseaux.",
            ),
            CalendarEvent(
                "Début de l'Hiver — Solstice d'hiver", seasons["hiver"],
                categories=["Saisons", "Astronomie"],
                description="Le solstice d'hiver est le jour le plus court de l'année. C'est aussi le tournant : dès le lendemain, les jours recommencent à s'allonger. De nombreuses civilisations ont célébré ce retour de la lumière bien avant Noël.",
            ),
            CalendarEvent(
                "Jour le plus long de l'année", seasons["ete"],
                categories=["Saisons", "Astronomie"],
                description=f"Le {seasons['ete'].day} {seasons['ete'].strftime('%B')} est le jour le plus long de l'année {year} en France — plus de 16 heures de soleil à Paris.",
            ),
            CalendarEvent(
                "Jour le plus court de l'année", seasons["hiver"],
                categories=["Saisons", "Astronomie"],
                description=f"Le {seasons['hiver'].day} {seasons['hiver'].strftime('%B')} est le jour le plus court de l'année {year} — environ 8 heures de lumière seulement à Paris.",
            ),
        ])

        # ── PHASES LUNAIRES ─────────────────────────────────────────────────
        phase_descriptions = {
            "Nouvelle Lune": "La face de la Lune tournée vers la Terre n'est pas éclairée — elle est invisible dans le ciel. C'est le début du cycle lunaire de 29,5 jours, et la meilleure nuit pour observer les étoiles.",
            "Premier Quartier": "La moitié droite de la Lune est éclairée. Elle se lève vers midi et se couche vers minuit. Mi-chemin entre la Nouvelle Lune et la Pleine Lune.",
            "Pleine Lune": "La face de la Lune est entièrement éclairée par le Soleil — elle brille de sa pleine lumière dans le ciel nocturne. Les marées sont à leur maximum ce jour-là.",
            "Dernier Quartier de Lune": "La moitié gauche de la Lune est éclairée. Elle se lève à minuit et se couche en milieu de journée. C'est la fin du cycle lunaire avant le retour de la Nouvelle Lune.",
        }
        for moon_date, moon_name in simple_moon_phases(year):
            events.append(CalendarEvent(
                summary=moon_name,
                start=moon_date,
                categories=["Astronomie", "Lunaire"],
                description=phase_descriptions.get(moon_name, f"Phase lunaire : {moon_name}."),
            ))

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
                start=start,
                end=end,
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
                    start=start,
                    end=end,
                    categories=["Vacances scolaires"],
                    description=(
                        f"{description} pour la zone scolaire {zone}. "
                        f"Durée : {duration} jours, du {start.strftime('%d/%m/%Y')} au {end.strftime('%d/%m/%Y')}. "
                        "Le découpage en zones A, B et C a été instauré en 1972 pour étaler les départs en vacances."
                    ),
                    zones={zone},
                ))

    return events


def build_soldes_events() -> list[CalendarEvent]:
    """
    Calcule les dates des soldes selon la réglementation française.
    Soldes d'hiver : 2e mercredi de janvier — 4 semaines.
    Soldes d'été : dernier mercredi de juin (ou 1er de juillet si après le 28) — 4 semaines.
    La durée a été réduite de 6 à 4 semaines par décret en 2020.
    """
    events: list[CalendarEvent] = []
    SOLDES_DURATION = timedelta(weeks=4)

    for year in YEARS:
        # Soldes d'hiver — 2e mercredi de janvier
        hiver_start = nth_weekday(year, 1, 2, 2)
        hiver_end = hiver_start + SOLDES_DURATION
        events.append(CalendarEvent(
            summary="Soldes d'hiver",
            start=hiver_start,
            end=hiver_end,
            categories=["Commerce", "Société"],
            description=(
                "Les soldes d'hiver débutent le deuxième mercredi de janvier et durent 4 semaines. "
                "Encadrés par la loi, les soldes sont les seules périodes où les commerçants peuvent vendre à perte. "
                "La durée a été réduite de 6 à 4 semaines en 2020."
            ),
        ))

        # Soldes d'été — dernier mercredi de juin (reporté si > 28)
        ete_candidate = last_weekday(year, 6, 2)
        ete_start = nth_weekday(year, 7, 2, 1) if ete_candidate.day > 28 else ete_candidate
        ete_end = ete_start + SOLDES_DURATION
        events.append(CalendarEvent(
            summary="Soldes d'été",
            start=ete_start,
            end=ete_end,
            categories=["Commerce", "Société"],
            description=(
                "Les soldes d'été débutent le dernier mercredi de juin et durent 4 semaines. "
                "Avec les soldes d'hiver, ce sont les deux seules périodes légales de vente à perte en France."
            ),
        ))

    return events