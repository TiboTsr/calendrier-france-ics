import json
from pathlib import Path
from datetime import datetime

from concurrent.futures import ThreadPoolExecutor, as_completed
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

def fetch_static_sports():
    """Lit les événements sportifs depuis le fichier JSON local."""
    events = []
    data_path = Path(__file__).parent / "data" / "sports.json"
    if not data_path.exists():
        return []
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        for item in data.get("events", []):
            try:
                start_dt = datetime.strptime(item["start"], "%Y-%m-%d").date()
                end_dt = item.get("end")
                if end_dt:
                    end_dt = datetime.strptime(end_dt, "%Y-%m-%d").date()
                events.append(CalendarEvent(
                    summary=item["summary"],
                    start=start_dt,
                    end=end_dt,
                    categories=item["categories"],
                    description=item.get("description", ""),
                    zones={"all"}
                ))
            except Exception as e:
                print(f"Erreur format date dans sports.json: {e}")
    return events

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


import json
import hashlib
import tempfile
from pathlib import Path

_WIKI_CACHE_TTL_SECONDS = 7 * 24 * 3600
_WIKI_CACHE_DIR = Path(tempfile.gettempdir()) / "calendrier_fr_wiki_cache"

def _wiki_cache_path(title: str, lang: str, intro: bool) -> Path:
    key = hashlib.md5(f"{lang}:{title}:{intro}".encode()).hexdigest()
    return _WIKI_CACHE_DIR / f"{key}.json"

def _wiki_cache_get(title: str, lang: str, intro: bool) -> str | None:
    try:
        p = _wiki_cache_path(title, lang, intro)
        if not p.exists():
            return None
        import time
        if time.time() - p.stat().st_mtime > _WIKI_CACHE_TTL_SECONDS:
            p.unlink(missing_ok=True)
            return None
        data = json.loads(p.read_text(encoding="utf-8"))
        # Validation minimale du schéma du cache
        if not isinstance(data, dict) or "extract" not in data or not isinstance(data["extract"], str):
            p.unlink(missing_ok=True)
            return None
        return data["extract"]
    except Exception:
        return None

def _wiki_cache_set(title: str, lang: str, intro: bool, extract: str) -> None:
    try:
        _WIKI_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        p = _wiki_cache_path(title, lang, intro)
        p.write_text(json.dumps({"extract": extract}), encoding="utf-8")
    except Exception:
        pass

def _wiki_extract(title: str, lang: str = "en", intro: bool = True) -> str:
    cached = _wiki_cache_get(title, lang, intro)
    if cached is not None:
        return cached

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
    extract = str(page.get("extract") or "")
    _wiki_cache_set(title, lang, intro, extract)
    return extract


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
    """Récupère les périodes football/compétitions en parallèle."""
    periods: dict[str, tuple[date, date]] = {}
    season_next = str((year + 1) % 100).zfill(2)
    fetchers = []

    if year % 4 == 2:
        def fetch_worldcup():
            try:
                txt = _wiki_extract(f"{year}_FIFA_World_Cup", lang="en", intro=True)
                rng = _parse_en_from_to_month_day_range(txt) or _parse_en_date_range(txt)
                if rng:
                    return "worldcup", rng
            except (requests.RequestException, ValueError, TypeError):
                pass
            return None
        fetchers.append(fetch_worldcup)

    if year % 4 == 0:
        def fetch_euro():
            try:
                txt = _wiki_extract(f"UEFA_Euro_{year}", lang="en", intro=True)
                rng = _parse_en_from_to_month_day_range(txt) or _parse_en_date_range(txt)
                if rng:
                    return "euro", rng
            except (requests.RequestException, ValueError, TypeError):
                pass
            return None
        fetchers.append(fetch_euro)

    if year % 2 == 1 and year >= 2013:
        def fetch_afcon():
            try:
                txt = _wiki_extract(f"{year}_Africa_Cup_of_Nations", lang="en", intro=True)
                rng = _parse_en_from_to_month_day_range(txt) or _parse_en_date_range(txt)
                if rng:
                    return "afcon", rng
            except (requests.RequestException, ValueError, TypeError):
                pass
            return None
        fetchers.append(fetch_afcon)

    def fetch_ligue1():
        try:
            txt = _wiki_extract(f"{year}–{season_next}_Ligue_1", lang="en", intro=True)
            rng = _parse_en_begin_end_range(txt)
            if rng:
                return "ligue1", rng
        except (requests.RequestException, ValueError, TypeError):
            pass
        return None

    def fetch_ucl():
        try:
            txt = _wiki_extract(f"{year}–{season_next}_UEFA_Champions_League", lang="en", intro=True)
            rng = _parse_en_begin_end_range(txt)
            if rng:
                return "ucl", rng
        except (requests.RequestException, ValueError, TypeError):
            pass
        return None

    fetchers.extend([fetch_ligue1, fetch_ucl])

    if not fetchers:
        return periods

    # Timeout global de 30s sur le pool pour éviter de bloquer le runner CI
    with ThreadPoolExecutor(max_workers=len(fetchers)) as executor:
        futures = {executor.submit(fn): fn.__name__ for fn in fetchers}
        for future in as_completed(futures, timeout=30):
            try:
                result = future.result(timeout=30)
                if result:
                    key, value = result
                    periods[key] = value
            except Exception:
                pass

    return periods


def _fetch_exam_dates(year: int) -> list[dict]:
    KNOWN_DATES: dict[int, list[dict]] = {
        2026: [
            {
                "summary": "Baccalauréat général et technologique — Épreuves de spécialité",
                "start": date(2026, 6, 16), "end": date(2026, 6, 18),
                "description": "Épreuves terminales écrites de spécialité du baccalauréat général et technologique. Créé par Napoléon en 1808, le baccalauréat est l'un des plus anciens examens nationaux. Environ 500 000 candidats passent ces épreuves chaque année.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat général et technologique — Philosophie",
                "start": date(2026, 6, 15), "end": date(2026, 6, 15),
                "description": "L'épreuve de philosophie est l'épreuve d'ouverture du bac, traditionnellement le premier jour. Unique en Europe, cette épreuve de 4 heures fait de la France le seul pays où la philo est une matière obligatoire pour tous les lycéens jusqu'au baccalauréat.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat général et technologique — Grand Oral",
                "start": date(2026, 6, 22), "end": date(2026, 7, 1),
                "description": "Le Grand Oral évalue la capacité des candidats à présenter et défendre un projet à l'oral. Introduit par la réforme du bac de 2019, il remplace l'ancien oral de TPE.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat — Épreuve anticipée de français (1re)",
                "start": date(2026, 6, 11), "end": date(2026, 6, 11),
                "description": "L'épreuve écrite anticipée de français se passe en classe de Première, un an avant le bac. Elle compte dans la note finale du baccalauréat général et technologique.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Brevet des collèges (DNB) — Épreuves écrites",
                "start": date(2026, 6, 26), "end": date(2026, 6, 30),
                "description": "Le diplôme national du brevet sanctionne la fin du collège. Il se déroule sur trois jours fin juin. Près de 800 000 élèves le passent chaque année en France.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "BTS — Épreuves écrites",
                "start": date(2026, 5, 18), "end": date(2026, 5, 21),
                "description": "Le Brevet de Technicien Supérieur (BTS) est un diplôme bac+2 de l'enseignement supérieur court. Les épreuves écrites communes se déroulent en mai sur quatre jours.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat professionnel — Épreuves écrites",
                "start": date(2026, 5, 20), "end": date(2026, 6, 5),
                "description": "Le baccalauréat professionnel valide une formation en lycée professionnel ou en alternance. Ses épreuves écrites se déroulent de fin mai à début juin.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "CAP — Épreuves écrites d'enseignement général",
                "start": date(2026, 6, 8), "end": date(2026, 6, 9),
                "description": "Le Certificat d'Aptitude Professionnelle (CAP) certifie des compétences dans un métier précis. Les épreuves écrites d'enseignement général se déroulent sur deux jours en juin.",
                "categories": ["Éducation", "Examens"],
            },
        ],
        2025: [
            {
                "summary": "Baccalauréat général et technologique — Épreuves de spécialité",
                "start": date(2025, 3, 18), "end": date(2025, 3, 20),
                "description": "Épreuves terminales écrites de spécialité du baccalauréat général et technologique.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat général et technologique — Philosophie et Grand Oral",
                "start": date(2025, 6, 16), "end": date(2025, 6, 27),
                "description": "L'épreuve de philosophie ouvre le bac terminal, suivie du Grand Oral introduit par la réforme 2019.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Brevet des collèges (DNB) — Épreuves écrites",
                "start": date(2025, 6, 26), "end": date(2025, 6, 27),
                "description": "Le diplôme national du brevet sanctionne la fin du collège.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "BTS — Épreuves écrites",
                "start": date(2025, 5, 13), "end": date(2025, 5, 16),
                "description": "Le Brevet de Technicien Supérieur (BTS) est un diplôme bac+2 de l'enseignement supérieur court.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "CAP — Épreuves écrites d'enseignement général",
                "start": date(2025, 6, 4), "end": date(2025, 6, 5),
                "description": "Le Certificat d'Aptitude Professionnelle (CAP) certifie des compétences dans un métier précis.",
                "categories": ["Éducation", "Examens"],
            },
        ],
    }

    if year in KNOWN_DATES:
        return KNOWN_DATES[year]

    results: list[dict] = []
    try:
        bo_url = f"https://www.education.gouv.fr/bo/{year - 1}/Hebdo36/"
        headers = {"User-Agent": "Mozilla/5.0 (compatible; CalendrierFR/1.0; +https://calendrier-fr.tibotsr.dev)"}
        index_resp = requests.get(bo_url, headers=headers, timeout=15)
        index_resp.raise_for_status()

        nor_match = re.search(
            r'href="(/bo/[^"]*MENE[^"]*N)"[^>]*>[^<]*[Cc]alendrier[^<]*examen',
            index_resp.text,
        )
        if not nor_match:
            nor_match = re.search(r'href="(/bo/[^"]*MENE\d{7,}N)"', index_resp.text)
        if not nor_match:
            return results

        note_url = "https://www.education.gouv.fr" + nor_match.group(1)
        note_resp = requests.get(note_url, headers=headers, timeout=15)
        note_resp.raise_for_status()
        text = note_resp.text

        MONTHS_FR_LOCAL = {
            "janvier": 1, "février": 2, "mars": 3, "avril": 4,
            "mai": 5, "juin": 6, "juillet": 7, "août": 8,
            "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
        }

        def parse_bo_date(s: str) -> date | None:
            s = s.strip().lower()
            for m_name, m_num in MONTHS_FR_LOCAL.items():
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
                        "start": d, "end": None,
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

        # Descriptions détaillées pour chaque férié officiel.
        # Clé = date exacte (gère correctement les fériés mobiles liés à Pâques).
        _easter = easter_date(year)
        SPECIFIC_DESCRIPTIONS: dict[date, str] = {
            # ── Dates fixes ──────────────────────────────────────────────────
            date(year, 1, 1): (
                "Premier jour de l'année civile grégorienne. La tradition des vœux existe "
                "depuis l'Antiquité romaine. Le gui porte-bonheur vient d'une coutume druidique "
                "bien antérieure au christianisme."
            ),
            date(year, 5, 1): (
                "Commémore la grève de Chicago du 1er mai 1886 pour les 8 heures de travail, "
                "réprimée dans le sang. Férié et chômé en France depuis 1947. La tradition "
                "d'offrir du muguet vient d'une coutume de Charles IX datant de 1561."
            ),
            date(year, 5, 8): (
                "Le 8 mai 1945, l'Allemagne nazie signe sa capitulation sans condition, "
                "mettant fin à la guerre en Europe. Férié depuis 1953, supprimé par Giscard "
                "en 1975, puis rétabli par Mitterrand en 1981."
            ),
            date(year, 7, 14): (
                "Commémore la prise de la Bastille le 14 juillet 1789, symbole de la Révolution "
                "française. Jour férié depuis 1880. Défilé militaire sur les Champs-Élysées, "
                "bals des pompiers et feux d'artifice dans toute la France."
            ),
            date(year, 8, 15): (
                "Célèbre l'élévation de la Vierge Marie au ciel. Fête chrétienne ancienne, "
                "jour férié en France depuis le Concordat de 1802. Elle tombe en plein cœur "
                "de l'été, au milieu des grandes vacances."
            ),
            date(year, 11, 1): (
                "Fête de tous les saints, instituée par le pape Grégoire IV en 835. "
                "En France, la tradition de fleurir les tombes avec des chrysanthèmes s'est "
                "greffée dessus — ces fleurs sont désormais intimement liées à ce jour."
            ),
            date(year, 11, 11): (
                "Le 11 novembre 1918 à 11h, l'armistice met fin à la Première Guerre mondiale "
                "après quatre ans de combats. Jour férié depuis 1922. Chaque commune française "
                "a son monument aux morts — 36 000 érigés entre 1920 et 1925."
            ),
            date(year, 12, 25): (
                "Célèbre la naissance du Christ. La date du 25 décembre a été fixée au IVe siècle "
                "sur une fête solaire romaine préexistante. Le sapin, la bûche et les cadeaux "
                "sont des traditions popularisées bien plus tard, au XIXe siècle."
            ),
            # ── Fériés mobiles (calculés depuis Pâques) ──────────────────────
            _easter + timedelta(days=1): (
                "Jour férié qui prolonge le dimanche de Pâques. La tradition des œufs vient "
                "du Carême : l'Église interdisait d'en manger pendant 40 jours, on offrait "
                "donc à Pâques ceux accumulés."
            ),
            _easter + timedelta(days=39): (
                "Fête chrétienne commémorant la montée du Christ au ciel, 40 jours après Pâques. "
                "Toujours un jeudi, ce qui en fait naturellement un pont avec le vendredi."
            ),
            _easter + timedelta(days=50): (
                "Jour férié désigné depuis 2004 Journée de solidarité envers les personnes âgées. "
                "Les salariés travaillent ce jour sans rémunération supplémentaire, finançant "
                "ainsi la prise en charge de la dépendance — instauré après la canicule de 2003 "
                "qui fit 15 000 morts en France."
            ),
        }

        # Renommages supplémentaires après localisation
        SUMMARY_OVERRIDES: dict[str, str] = {
            "Fête de la Victoire": "Fête de la Victoire 1945",
        }

        for holiday_date, holiday_name in fr_holidays.items():
            localized = localize_holiday_name(holiday_name)
            localized = SUMMARY_OVERRIDES.get(localized, localized)
            description = SPECIFIC_DESCRIPTIONS.get(
                holiday_date,
                "Jour férié légal en France — chômé et payé depuis la loi du 13 juillet 1906.",
            )
            events.append(CalendarEvent(
                summary=localized,
                start=holiday_date,
                categories=["Jours fériés"],
                description=description,
            ))

        # ── PONTS AUTOMATIQUES ─────────────────────────────────────────────
        ferie_dates: set[date] = set(fr_holidays.keys())
        for ferie_date, ferie_name in fr_holidays.items():
            weekday = ferie_date.weekday()
            bridge_date: date | None = None
            if weekday == 1:
                bridge_date = ferie_date - timedelta(days=1)
            elif weekday == 3:
                bridge_date = ferie_date + timedelta(days=1)

            if bridge_date and bridge_date not in ferie_dates:
                localized_name = localize_holiday_name(ferie_name)
                events.append(CalendarEvent(
                    summary=f"Pont possible — {localized_name}",
                    start=bridge_date,
                    categories=["Ponts / Congés"],
                    description=(
                        f"{localized_name} tombe un {'mardi' if weekday == 1 else 'jeudi'} le "
                        f"{ferie_date.strftime('%d/%m/%Y')}. "
                        f"Le {'lundi' if weekday == 1 else 'vendredi'} {bridge_date.strftime('%d/%m/%Y')} "
                        f"est un pont potentiel — vérifiez auprès de votre employeur."
                    ),
                ))

        # ── JOURS FÉRIÉS ALSACE-MOSELLE ─────────────────────────────────────
        am_holidays = [
            CalendarEvent(
                "Vendredi Saint",
                easter_date(year) - timedelta(days=2),
                categories=["Jours fériés", "Christianisme"],
                description="Commémore la crucifixion du Christ. Jour férié uniquement en Alsace-Moselle (départements 57, 67, 68) en vertu du régime concordataire.",
                zones={"AM"},
            ),
            CalendarEvent(
                "Saint-Étienne",
                date(year, 12, 26),
                categories=["Jours fériés", "Christianisme"],
                description="Le 26 décembre est férié uniquement en Alsace-Moselle (depts 57, 67, 68). Fête de saint Étienne, premier martyr chrétien.",
                zones={"AM"},
            ),
        ]
        events.extend(am_holidays)

        # ── CHRISTIANISME ───────────────────────────────────────────────────
        easter = easter_date(year)
        ascension = easter + timedelta(days=39)
        pentecote = easter + timedelta(days=49)

        events.extend([
            CalendarEvent("Pâques", easter, categories=["Christianisme"],
                description="Fête chrétienne célébrant la résurrection du Christ. Sa date varie chaque année car elle suit le calendrier lunaire."),
            CalendarEvent("Lundi de Pâques", easter + timedelta(days=1), categories=["Christianisme", "Jours fériés"],
                description="Jour férié qui prolonge le dimanche de Pâques."),
            CalendarEvent("Ascension", ascension, categories=["Christianisme", "Jours fériés"],
                description="Fête chrétienne commémorant la montée du Christ au ciel, 40 jours après Pâques."),
            CalendarEvent("Pentecôte", pentecote, categories=["Christianisme"],
                description="Célèbre la descente de l'Esprit Saint sur les apôtres, 50 jours après Pâques."),
            CalendarEvent("Lundi de Pentecôte", pentecote + timedelta(days=1), categories=["Christianisme", "Jours fériés"],
                description="Jour férié désigné depuis 2004 Journée de solidarité envers les personnes âgées."),
            CalendarEvent("Début du Carême", easter - timedelta(days=46), categories=["Christianisme"],
                description="Le Carême commence le Mercredi des Cendres, 46 jours avant Pâques."),
            CalendarEvent("Mardi Gras", easter - timedelta(days=47), categories=["Christianisme", "Culture", "Fêtes"],
                description="Dernier jour avant le Carême, où la tradition voulait qu'on fasse bombance avant l'abstinence."),
            CalendarEvent("Dimanche des Rameaux", easter - timedelta(days=7), categories=["Christianisme"],
                description="Ouvre la Semaine Sainte en rappelant l'entrée triomphale de Jésus à Jérusalem."),
            CalendarEvent("Vendredi Saint", easter - timedelta(days=2), categories=["Christianisme"],
                description="Commémore la crucifixion du Christ. Non férié en France depuis la loi de 1905 — sauf en Alsace-Moselle."),
            CalendarEvent("Toussaint", date(year, 11, 1), categories=["Christianisme", "Jours fériés"],
                description="Fête de tous les saints, instituée par le pape Grégoire IV en 835."),
            CalendarEvent("Noël", date(year, 12, 25), categories=["Christianisme", "Jours fériés", "Fêtes"],
                description="Célèbre la naissance du Christ."),
            CalendarEvent("Épiphanie", date(year, 1, 6), categories=["Christianisme", "Culture", "Gastronomie"],
                description="Célèbre la visite des Rois Mages à Jésus, 12 jours après Noël."),
            CalendarEvent("Saint-Nicolas", date(year, 12, 6), categories=["Christianisme", "Culture", "Fêtes"],
                description="Fête de Nicolas de Myre, évêque du IVe siècle devenu patron des enfants."),
            CalendarEvent("Assomption de Marie", date(year, 8, 15), categories=["Christianisme", "Jours fériés"],
                description="Célèbre l'élévation de la Vierge Marie au ciel."),
        ])

        # ── FÊTES POPULAIRES & TRADITIONS ──────────────────────────────────
        events.extend([
            CalendarEvent("Saint-Sylvestre / Réveillon du Nouvel An", date(year, 12, 31), categories=["Fêtes", "Culture"],
                description="Dernier jour de l'année, nommé d'après le pape Sylvestre Ier mort ce jour en 335."),

            CalendarEvent("Saint-Valentin", date(year, 2, 14), categories=["Fêtes", "Culture"],
                description="Fête des amoureux le 14 février."),
            CalendarEvent("Chandeleur", date(year, 2, 2), categories=["Culture", "Christianisme", "Gastronomie"],
                description="Fête de la Présentation de Jésus au Temple, 40 jours après Noël."),
            CalendarEvent("Poisson d'avril", date(year, 4, 1), categories=["Culture"],
                description="Journée des farces et des canulars."),
            CalendarEvent("Fête du Travail", date(year, 5, 1), categories=["Jours fériés", "Société"],
                description="Commémore la grève de Chicago du 1er mai 1886 pour les 8 heures de travail."),
            CalendarEvent(
                "Fête des Mères",
                last_weekday(year, 5, 6) if last_weekday(year, 5, 6) != pentecote else nth_weekday(year, 6, 6, 1),
                categories=["Fêtes", "Culture"],
                description="Célébrée le dernier dimanche de mai, sauf si c'est la Pentecôte.",
            ),
            CalendarEvent("Fête des Pères", nth_weekday(year, 6, 6, 3), categories=["Fêtes", "Culture"],
                description="Née aux États-Unis en 1910, introduite en France dans les années 1950."),
            CalendarEvent("Fête des Grands-Mères", nth_weekday(year, 3, 6, 1), categories=["Fêtes", "Culture"],
                description="Créée en 1987 par la marque de café Grand'Mère."),
            CalendarEvent("Fête des Grands-Pères", nth_weekday(year, 10, 6, 1), categories=["Fêtes", "Culture"],
                description="Créée en 2008, elle a lieu chaque premier dimanche d'octobre."),
            CalendarEvent("Halloween", date(year, 10, 31), categories=["Culture", "Fêtes"],
                description="Fête d'origine celtique (la nuit de Samain) christianisée puis popularisée par la diaspora irlandaise."),
            CalendarEvent("Saint-Patrick", date(year, 3, 17), categories=["Culture", "Fêtes"],
                description="Fête nationale irlandaise le 17 mars, commémorant la mort de saint Patrick (461)."),
            CalendarEvent("Fête Nationale", date(year, 7, 14), categories=["Jours fériés", "Société", "Dates spéciales"],
                description="Commémore la prise de la Bastille le 14 juillet 1789."),
            CalendarEvent("Fête de la Musique", date(year, 6, 21), categories=["Culture", "Fêtes"],
                description="Créée en 1982 par le ministre Jack Lang."),
            CalendarEvent("Journées du Patrimoine", nth_weekday(year, 9, 5, 3), categories=["Culture", "Société"],
                description="Créées en France en 1984 par Jack Lang, étendues à toute l'Europe en 1991."),
            CalendarEvent("Nuit Blanche", nth_weekday(year, 10, 5, 1), categories=["Culture"],
                description="Initiée à Paris en 2002 par le maire Bertrand Delanoë."),
            CalendarEvent("Beaujolais Nouveau", nth_weekday(year, 11, 3, 3), categories=["Gastronomie", "Culture", "Commercial"],
                description="Chaque troisième jeudi de novembre, le Beaujolais Nouveau est mis en vente."),
            CalendarEvent("Braderie de Lille", nth_weekday(year, 9, 5, 1), categories=["Culture", "Commerce"],
                description="Plus grande braderie d'Europe, organisée le premier week-end de septembre à Lille."),
            CalendarEvent("Fête de la Bretagne", date(year, 11, 30), categories=["Culture", "Société"],
                description="Célébrée le 30 novembre (Saint-André) depuis les années 1990."),
        ])

        # ── DATES CIVIQUES & MÉMOIRE ────────────────────────────────────────
        events.extend([
            CalendarEvent("Journée nationale de la Mémoire de la Shoah", date(year, 1, 27), categories=["Mémoire", "Société"],
                description="Commémore la libération du camp d'Auschwitz le 27 janvier 1945."),
            CalendarEvent("Commémoration de la Rafle du Vél d'Hiv", nth_weekday(year, 7, 6, 2), categories=["Mémoire", "Société"],
                description="Les 16-17 juillet 1942, la police française arrêta 13 152 Juifs à Paris."),
            # FIX : "Victoire 1945 — Capitulation de l'Allemagne nazie" supprimé.
            # La lib `holidays` génère déjà "Victoire 1945" (ou "Fête de la Victoire") pour le 8 mai.
            # Conserver cette entrée dupliquait l'événement dans la timeline et dans l'ICS.
            CalendarEvent("Appel du 18 juin 1940 — Anniversaire", date(year, 6, 18), categories=["Mémoire", "Dates spéciales"],
                description="Le 18 juin 1940, de Gaulle lance depuis Londres un appel à la Résistance sur la BBC."),
            CalendarEvent("Débarquement en Normandie — Commémoration du Jour J", date(year, 6, 6), categories=["Mémoire", "Dates spéciales"],
                description="Le 6 juin 1944, 156 000 soldats alliés débarquent sur les plages de Normandie."),
            CalendarEvent("Abolition de l'esclavage en France — Commémoration", date(year, 5, 10), categories=["Mémoire", "Société"],
                description="Journée nationale instaurée par la loi Taubira de 2001."),
            CalendarEvent("Journée de la Laïcité", date(year, 12, 9), categories=["Société", "Dates spéciales"],
                description="Commémore la loi du 9 décembre 1905 séparant les Églises de l'État."),
            CalendarEvent("Journée nationale de la Résistance", date(year, 5, 27), categories=["Mémoire", "Société"],
                description="Le 27 mai 1943, Jean Moulin préside la première réunion secrète du CNR."),
            CalendarEvent("Armistice de 1918 — Journée du Souvenir", date(year, 11, 11), categories=["Jours fériés", "Mémoire", "Dates spéciales"],
                description="Le 11 novembre 1918 à 11h, l'armistice met fin à la Première Guerre mondiale."),
        ])

        # ── SANTÉ ───────────────────────────────────────────────────────────
        events.extend([
            CalendarEvent("Journée mondiale contre le cancer", date(year, 2, 4), categories=["Santé"],
                description="Initiée par l'Union Internationale Contre le Cancer depuis 2000."),
            CalendarEvent("Journée mondiale de la Santé", date(year, 4, 7), categories=["Santé"],
                description="Commémore la fondation de l'OMS le 7 avril 1948."),
            CalendarEvent("Journée mondiale sans tabac", date(year, 5, 31), categories=["Santé"],
                description="Lancée par l'OMS en 1987."),
            CalendarEvent("Journée mondiale de la santé mentale", date(year, 10, 10), categories=["Santé", "Société"],
                description="Créée par la Fédération Mondiale pour la Santé Mentale en 1992."),
            CalendarEvent("Lancement d'Octobre Rose", date(year, 10, 1), categories=["Santé"],
                description="Tout octobre est dédié à la sensibilisation au cancer du sein."),
            CalendarEvent("Lancement du Mois sans Tabac", date(year, 11, 1), categories=["Santé"],
                description="Lancé en France en 2016 par Santé Publique France."),
        ])

        # ── SOCIÉTÉ ─────────────────────────────────────────────────────────
        events.extend([
            CalendarEvent("Journée internationale des femmes", date(year, 3, 8), categories=["Société"],
                description="Issue des luttes ouvrières du début du XXe siècle en Europe et aux États-Unis."),
            CalendarEvent("Journée internationale des droits de l'enfant", date(year, 11, 20), categories=["Société"],
                description="Commémore l'adoption de la Convention des Nations Unies relative aux droits de l'enfant."),
            CalendarEvent("Journée mondiale des personnes handicapées", date(year, 12, 3), categories=["Société"],
                description="Instaurée par l'ONU en 1992."),
            CalendarEvent("Journée mondiale du Bénévolat", date(year, 12, 5), categories=["Société"],
                description="Créée par l'ONU en 1985."),
            CalendarEvent("Fête des Voisins", last_weekday(year, 5, 4), categories=["Société"],
                description="Créée en 2000 pour lutter contre l'isolement urbain."),
            CalendarEvent("Journée nationale de lutte contre les discriminations", date(year, 3, 21), categories=["Société"],
                description="Créée par l'ONU en 1966 en mémoire du massacre de Sharpeville."),
        ])

        # ── ENVIRONNEMENT ───────────────────────────────────────────────────
        events.extend([
            CalendarEvent("Jour de la Terre", date(year, 4, 22), categories=["Environnement", "Société"],
                description="Né le 22 avril 1970 après une marée noire en Californie."),
            CalendarEvent("Journée mondiale de l'océan", date(year, 6, 8), categories=["Environnement"],
                description="Proposée lors du Sommet de la Terre de Rio en 1992."),
            CalendarEvent("Journée mondiale de la biodiversité", date(year, 5, 22), categories=["Environnement"],
                description="Commémore l'adoption de la Convention sur la Diversité Biologique à Rio."),
            CalendarEvent("Journée mondiale sans voiture", date(year, 9, 22), categories=["Environnement", "Société"],
                description="Lancée en France en 1998 par La Rochelle."),
            CalendarEvent("Journée mondiale de l'eau", date(year, 3, 22), categories=["Environnement", "Société"],
                description="Proclamée par l'ONU en 1993."),
            CalendarEvent("Journée mondiale des zones humides", date(year, 2, 2), categories=["Environnement"],
                description="Commémore la Convention de Ramsar signée le 2 février 1971."),
            CalendarEvent("Journée nationale de l'arbre", nth_weekday(year, 11, 3, 1), categories=["Environnement"],
                description="Célébrée chaque premier jeudi de novembre."),
            CalendarEvent("Journée mondiale de l'alimentation", date(year, 10, 16), categories=["Gastronomie", "Société", "Santé"],
                description="Commémore la fondation de la FAO le 16 octobre 1945."),
        ])

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
            CalendarEvent("Semaine du Goût", nth_weekday(year, 10, 0, 2), categories=["Gastronomie", "Culture"],
                description="Créée en 1990 par le chef Joël Robuchon."),
            CalendarEvent("Journée mondiale du cacao et du chocolat", date(year, 10, 1), categories=["Gastronomie", "Culture"],
                description="Célébrée le 1er octobre et associée à l'Organisation internationale du cacao (ICCO)."),
            CalendarEvent("Nuit des Musées", nth_weekday(year, 5, 5, 3), categories=["Culture"],
                description="Créée en France en 2005 et étendue à toute l'Europe."),
            CalendarEvent("Festival de Cannes — Ouverture", date(year, 5, 14), categories=["Culture", "Cinéma"],
                description="Le Festival International du Film de Cannes, créé en 1946."),
            CalendarEvent("Fête du Cinéma", nth_weekday(year, 6, 6, 4), categories=["Culture", "Cinéma"],
                description="Créée en 1985, elle propose chaque fin juin des places à tarif réduit."),
            CalendarEvent("Festival d'Avignon — Ouverture", date(year, 7, 5), categories=["Culture", "Théâtre"],
                description="Créé par Jean Vilar en 1947 dans la cour du Palais des Papes."),
            CalendarEvent("Salon de l'Agriculture — Ouverture", nth_weekday(year, 2, 5, 4), categories=["Gastronomie", "Agriculture", "Culture"],
                description="Le Salon International de l'Agriculture se tient chaque fin février à Paris."),
        ])

        # ── ÉDUCATION ───────────────────────────────────────────────────────
        events.extend([
            CalendarEvent("Rentrée des classes", date(year, 9, 2), categories=["Éducation", "Société"],
                description="La rentrée de septembre mobilise 12 millions d'élèves et 870 000 enseignants en France."),
            CalendarEvent("Journée internationale de l'Éducation", date(year, 1, 24), categories=["Éducation", "Société"],
                description="Proclamée par l'ONU en 2019."),
            CalendarEvent("Nuit des Étoiles", nth_weekday(year, 8, 5, 1), categories=["Astronomie", "Éducation", "Culture"],
                description="Organisée chaque premier week-end d'août par l'Association Française d'Astronomie depuis 1991."),
        ])

        # ── DATES SPÉCIALES ─────────────────────────────────────────────────
        if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0):
            events.append(CalendarEvent(
                "Jour supplémentaire (année bissextile)", date(year, 2, 29),
                categories=["Dates spéciales"],
                description=f"Une année solaire dure 365,2422 jours. {year} est l'une des années rares à 366 jours.",
            ))

        is_leap_year = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
        mid_year_date = date(year, 7, 1) if is_leap_year else date(year, 7, 2)
        events.extend([
            CalendarEvent("Milieu de l'année", mid_year_date, categories=["Dates spéciales"],
                description=f"Ce jour marque le point médian exact de l'année {year}."),
            CalendarEvent("Dernier jour de l'année", date(year, 12, 31), categories=["Dates spéciales"],
                description=f"Clôture de l'année civile {year}."),
        ])

        if year % 10 == 0:
            events.append(CalendarEvent("Début d'une nouvelle décennie", date(year, 1, 1), categories=["Dates spéciales"],
                description=f"Le 1er janvier {year} ouvre la décennie {year}–{year + 9}."))
        if year % 10 == 9:
            events.append(CalendarEvent("Fin d'une décennie", date(year, 12, 31), categories=["Dates spéciales"],
                description=f"Le 31 décembre {year} clôture la décennie {year - 9}–{year}."))
        if year % 100 == 1:
            century_number = (year - 1) // 100 + 1
            events.append(CalendarEvent("Début d'un nouveau siècle", date(year, 1, 1), categories=["Dates spéciales"],
                description=f"Le 1er janvier {year} ouvre le {to_roman(century_number)}e siècle."))
        if year % 100 == 0:
            century_number = year // 100
            events.append(CalendarEvent("Fin d'un siècle", date(year, 12, 31), categories=["Dates spéciales"],
                description=f"Le 31 décembre {year} clôture le {to_roman(century_number)}e siècle."))
        if date(year, 12, 28).isocalendar().week == 53:
            events.append(CalendarEvent("Année avec 53e semaine ISO", date(year, 12, 28), categories=["Dates spéciales"],
                description=f"L'année {year} comporte une semaine 53 dans le calendrier ISO."))

        def _find_palindromes_for_year(y: int) -> list[tuple[int, int]]:
            results = []
            for m in range(1, 13):
                import calendar as _cal
                max_day = _cal.monthrange(y, m)[1]
                for d in range(1, max_day + 1):
                    stamp = f"{d:02d}{m:02d}{y:04d}"
                    if stamp == stamp[::-1]:
                        results.append((d, m))
            return results

        for d, m in _find_palindromes_for_year(year):
            day_cursor = date(year, m, d)
            stamp = day_cursor.strftime("%d%m%Y")
            events.append(CalendarEvent("Date palindrome", day_cursor, categories=["Dates spéciales"],
                description=f"La date du {day_cursor.strftime('%d/%m/%Y')} se lit de la même façon dans les deux sens ({stamp})."))

        # ── CHANGEMENTS D'HEURE ─────────────────────────────────────────────
        events.extend([
            CalendarEvent("Passage à l'heure d'été", last_sunday(year, 3), categories=["Changement d'heure"],
                description="Dans la nuit du samedi au dimanche, les montres avancent d'une heure (2h → 3h)."),
            CalendarEvent("Passage à l'heure d'hiver", last_sunday(year, 10), categories=["Changement d'heure"],
                description="Dans la nuit du samedi au dimanche, les montres reculent d'une heure (3h → 2h)."),
        ])

        # ── SAISONS & ASTRONOMIE ────────────────────────────────────────────
        seasons = season_start_dates(year)
        events.extend([
            CalendarEvent("Début du Printemps — Équinoxe de printemps", seasons["printemps"], categories=["Saisons", "Astronomie"],
                description="L'équinoxe de printemps marque le début astronomique du printemps."),
            CalendarEvent("Début de l'Été — Solstice d'été", seasons["ete"], categories=["Saisons", "Astronomie"],
                description="Le solstice d'été est le jour le plus long de l'année."),
            CalendarEvent("Début de l'Automne — Équinoxe d'automne", seasons["automne"], categories=["Saisons", "Astronomie"],
                description="L'équinoxe d'automne marque le début de l'automne."),
            CalendarEvent("Début de l'Hiver — Solstice d'hiver", seasons["hiver"], categories=["Saisons", "Astronomie"],
                description="Le solstice d'hiver est le jour le plus court de l'année."),
            CalendarEvent("Jour le plus long de l'année", seasons["ete"], categories=["Saisons", "Astronomie"],
                description=f"Le {seasons['ete'].day} {seasons['ete'].strftime('%B')} est le jour le plus long de l'année {year}."),
            CalendarEvent("Jour le plus court de l'année", seasons["hiver"], categories=["Saisons", "Astronomie"],
                description=f"Le {seasons['hiver'].day} {seasons['hiver'].strftime('%B')} est le jour le plus court de l'année {year}."),
        ])

        # ── PHASES LUNAIRES ─────────────────────────────────────────────────
        phase_descriptions = {
            "Nouvelle Lune": "La face de la Lune tournée vers la Terre n'est pas éclairée — elle est invisible dans le ciel.",
            "Premier Quartier": "La moitié droite de la Lune est éclairée. Mi-chemin entre la Nouvelle Lune et la Pleine Lune.",
            "Pleine Lune": "La face de la Lune est entièrement éclairée par le Soleil.",
            "Dernier Quartier de Lune": "La moitié gauche de la Lune est éclairée. C'est la fin du cycle lunaire.",
        }
        for moon_date, moon_name in simple_moon_phases(year):
            events.append(CalendarEvent(
                summary=moon_name, start=moon_date,
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


def build_soldes_events() -> list[CalendarEvent]:
    events: list[CalendarEvent] = []
    SOLDES_DURATION = timedelta(weeks=4)

    for year in YEARS:
        hiver_start = nth_weekday(year, 1, 2, 2)
        hiver_end   = hiver_start + SOLDES_DURATION
        events.append(CalendarEvent(
            summary="Soldes d'hiver", start=hiver_start, end=hiver_end,
            categories=["Commerce", "Société"],
            description="Les soldes d'hiver débutent le deuxième mercredi de janvier et durent 4 semaines.",
        ))

        ete_candidate = last_weekday(year, 6, 2)
        ete_start = nth_weekday(year, 7, 2, 1) if ete_candidate.day > 28 else ete_candidate
        ete_end   = ete_start + SOLDES_DURATION
        events.append(CalendarEvent(
            summary="Soldes d'été", start=ete_start, end=ete_end,
            categories=["Commerce", "Société"],
            description="Les soldes d'été débutent le dernier mercredi de juin et durent 4 semaines.",
        ))

    return events