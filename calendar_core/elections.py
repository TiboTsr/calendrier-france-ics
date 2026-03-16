"""
elections.py — Récupère les dates des prochaines élections françaises
via l'API Wikipedia (MediaWiki), distingue confirmé / approximatif.

Résultat :
  {
    "confirmed": [ { uid, summary, start, end, description, categories, zones } ],
    "approximate": [ { uid, summary, year, month_hint, description, categories, zones, approximate: true } ]
  }
"""

import re
import json
import logging
from datetime import date, timedelta
from typing import Optional
import requests

logger = logging.getLogger(__name__)

WIKIPEDIA_API = "https://fr.wikipedia.org/w/api.php"
HEADERS = {"User-Agent": "CalendrierFrance/1.0 (https://github.com/TiboTsr/calendrier-france-ics)"}

ELECTION_PAGES = [
    {
        "title": "Élections municipales françaises de 2026",
        "type": "Élections municipales",
        "uid_prefix": "municipales-2026",
    },
    {
        "title": "Élection présidentielle française de 2027",
        "type": "Élection présidentielle",
        "uid_prefix": "presidentielle-2027",
    },
    {
        "title": "Prochaines élections législatives françaises",
        "type": "Élections législatives",
        "uid_prefix": "legislatives-2029",
    },
    {
        "title": "Élections régionales françaises de 2028",
        "type": "Élections régionales et départementales",
        "uid_prefix": "regionales-2028",
    },
]

# Pattern template MediaWiki : {{date|15|mars|2026}}
TEMPLATE_PATTERN = r"\{\{date\|(\d{1,2})\|(\w+)\|(\d{4})[^}]*\}\}"

# Pattern mois/année approximatif : "avril 2027", "premier semestre 2027"
MONTH_YEAR_PATTERN = r"(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})"
SEMESTER_PATTERN   = r"(premier|second|1er|2e|2ème)\s+semestre\s+(\d{4})"

MONTHS_FR = {
    "janvier": 1, "février": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
}

CONFIRMED_SIGNALS = [
    "décret", "fixé", "fixées", "auront lieu les", "se tiennent les",
    "convocation des électeurs", "sont prévues les",
]

APPROXIMATE_SIGNALS = [
    "devrait", "prévu", "prévues", "au plus tard", "entre le",
    "constitutionnellement", "normalement", "en principe", "prévue pour",
]


def fetch_wikipedia_content(title: str) -> Optional[str]:
    params = {
        "action": "query",
        "titles": title,
        "prop": "revisions",
        "rvprop": "content",
        "rvslots": "main",
        "format": "json",
        "formatversion": "2",
    }
    try:
        r = requests.get(WIKIPEDIA_API, params=params, headers=HEADERS, timeout=15)
        r.raise_for_status()
        data = r.json()
        pages = data.get("query", {}).get("pages", [])
        if not pages or pages[0].get("missing"):
            logger.warning(f"Page Wikipedia introuvable : {title}")
            return None
        return pages[0]["revisions"][0]["slots"]["main"]["content"]
    except Exception as e:
        logger.error(f"Erreur fetch Wikipedia '{title}': {e}")
        return None


def parse_date_fr(day: int, month_str: str, year: int) -> Optional[date]:
    month = MONTHS_FR.get(month_str.lower())
    if not month:
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


def is_confirmed(context: str, target_date: date) -> bool:
    ctx_lower = context.lower()
    if any(s in ctx_lower for s in APPROXIMATE_SIGNALS):
        return False
    months_ahead = (target_date.year - date.today().year) * 12 + (target_date.month - date.today().month)
    if months_ahead <= 18:
        return True
    return any(s in ctx_lower for s in CONFIRMED_SIGNALS)


def extract_dates_from_content(content: str, election_type: str, uid_prefix: str) -> dict:
    """
    Extrait les dates d'un wikicode Wikipedia.
    - Si des templates {{date|DD|mois|YYYY}} précis existent → événements confirmés ou non
    - Sinon → fallback mois/année approximatif (jamais de faux positifs texte)
    """
    confirmed  = []
    approximate = []
    found_dates = []
    already_found_dates: set = set()

    # ── 1. Templates {{date|DD|mois|YYYY}} ─────────────────────────────
    template_hits = []
    for m in re.finditer(TEMPLATE_PATTERN, content, re.IGNORECASE):
        day_s, month_s, year_s = m.group(1), m.group(2), m.group(3)
        try:
            month_num = int(month_s)
            month_str = next((k for k, v in MONTHS_FR.items() if v == month_num), None)
        except ValueError:
            month_str = month_s.lower()
        d = parse_date_fr(int(day_s), month_str, int(year_s)) if month_str else None
        if d and d >= date.today():
            start_ctx = max(0, m.start() - 300)
            end_ctx   = min(len(content), m.end() + 300)
            template_hits.append({"date": d, "pos": m.start(), "context": content[start_ctx:end_ctx]})

    # Regrouper les templates proches du même mois/année comme 2 tours
    used = set()
    for i, h1 in enumerate(template_hits):
        if i in used:
            continue
        pair = None
        for j, h2 in enumerate(template_hits):
            if j <= i or j in used:
                continue
            if (h1["date"].year  == h2["date"].year and
                h1["date"].month == h2["date"].month and
                abs(h2["pos"] - h1["pos"]) < 300):
                pair = (i, j)
                break
        if pair:
            used.add(pair[0]); used.add(pair[1])
            d1 = template_hits[pair[0]]["date"]
            d2 = template_hits[pair[1]]["date"]
            ctx = template_hits[pair[0]]["context"]
            found_dates.append({"tours": sorted([d1, d2]), "context": ctx,
                                 "raw": f"template-{d1}-{d2}", "precise": True})
            already_found_dates.add(d1); already_found_dates.add(d2)
        else:
            used.add(i)
            d = h1["date"]
            found_dates.append({"tours": [d], "context": h1["context"],
                                 "raw": f"template-{d}", "precise": True})
            already_found_dates.add(d)

    # ── 2. Fallback approximatif (uniquement si aucun template précis trouvé) ──
    # Extrait mois+année depuis les 500 premiers caractères de la page
    if not found_dates:
        intro = content[:800]
        # Semestre → on prend le milieu (mois 3 ou 9)
        for m in re.finditer(SEMESTER_PATTERN, intro, re.IGNORECASE):
            sem, year_s = m.group(1).lower(), int(m.group(2))
            month = 3 if sem in ("premier", "1er") else 9
            d = date(year, month, 1) if (year := year_s) else None
            if d and d >= date.today():
                ctx = intro[max(0, m.start()-200):min(len(intro), m.end()+200)]
                found_dates.append({"tours": [d], "context": ctx,
                                     "raw": f"semestre-{d}", "precise": False})
                already_found_dates.add(d)
                break

        # Mois + année explicite
        for m in re.finditer(MONTH_YEAR_PATTERN, intro, re.IGNORECASE):
            month_str, year_s = m.group(1).lower(), int(m.group(2))
            month_num = MONTHS_FR.get(month_str)
            if not month_num:
                continue
            d = date(int(year_s), month_num, 1)
            if d >= date.today() and d not in already_found_dates:
                ctx = intro[max(0, m.start()-200):min(len(intro), m.end()+200)]
                found_dates.append({"tours": [d], "context": ctx,
                                     "raw": f"approx-{d}", "precise": False})
                already_found_dates.add(d)
                break

    # ── 3. Dédup + génération des événements ───────────────────────────
    seen = set()
    unique_dates = []
    for fd in found_dates:
        key = tuple(str(d) for d in fd["tours"])
        if key not in seen:
            seen.add(key)
            unique_dates.append(fd)

    for i, fd in enumerate(unique_dates):
        tours   = fd["tours"]
        precise = fd.get("precise", True)
        confirmed_flag = precise and is_confirmed(fd["context"], tours[0])

        if precise and len(tours) == 2:
            items = [
                (tours[0], f"{election_type} — 1er tour", f"{uid_prefix}-t1"),
                (tours[1], f"{election_type} — 2e tour",  f"{uid_prefix}-t2"),
            ]
        else:
            items = [(tours[0], election_type, f"{uid_prefix}-t{i+1}")]

        for d, label, uid in items:
            event = {
                "uid":         f"{uid}@calendrier-france",
                "summary":     label,
                "start":       d.isoformat(),
                "end":         d.isoformat(),
                "categories":  ["Élections", "Société"],
                "zones":       [],
                "description": _build_description(label, d, confirmed_flag, fd["context"]),
            }
            if confirmed_flag:
                confirmed.append(event)
            else:
                approximate.append({**event, "approximate": True})

    return {"confirmed": confirmed, "approximate": approximate}


def _build_description(label: str, d: date, confirmed: bool, context: str) -> str:
    # Description personnalisée selon le type d'élection
    if "présidentielle" in label.lower():
        base = f"Élection présidentielle française : le président de la République est élu au suffrage universel direct pour un mandat de 5 ans."
    elif "municipales" in label.lower():
        base = f"Élections municipales françaises : renouvellement des conseils municipaux dans toutes les communes. Les maires sont élus par les conseillers municipaux."
    elif "législatives" in label.lower():
        base = f"Élections législatives françaises : renouvellement des députés à l'Assemblée nationale pour un mandat de 5 ans."
    elif "régionales" in label.lower():
        base = f"Élections régionales et départementales françaises : renouvellement des conseils régionaux et départementaux."
    elif "1er tour" in label.lower():
        base = f"Premier tour de l'élection."
    elif "2e tour" in label.lower():
        base = f"Second tour de l'élection."
    else:
        base = f"Élection nationale ou locale."
    status = "Date confirmée par décret." if confirmed else "Date approximative — non encore fixée par décret officiel."
    sentences = re.split(r"[.!?]", context)
    relevant  = next((s.strip() for s in sentences
                      if any(kw in s.lower() for kw in ["décret", "fixé", "devrait", "prévu", "constitution"])), "")
    relevant  = relevant[:200] if relevant else ""
    desc = f"{base} {status}"
    if relevant:
        desc += f" Source Wikipedia : « {relevant}… »"
    return desc


def get_elections() -> dict[str, list]:
    result = {"confirmed": [], "approximate": []}

    for page in ELECTION_PAGES:
        logger.info(f"Scraping Wikipedia : {page['title']}")
        content = fetch_wikipedia_content(page["title"])
        if not content:
            logger.warning(f"Contenu vide pour {page['title']}, page ignorée")
            continue

        extracted = extract_dates_from_content(content, page["type"], page["uid_prefix"])
        result["confirmed"]   += extracted["confirmed"]
        result["approximate"] += extracted["approximate"]
        logger.info(
            f"  → {len(extracted['confirmed'])} confirmées, "
            f"{len(extracted['approximate'])} approximatives"
        )

    result["confirmed"]   = sorted(result["confirmed"],   key=lambda e: e["start"])
    result["approximate"] = sorted(result["approximate"], key=lambda e: e["start"])

    logger.info(
        f"Total élections : {len(result['confirmed'])} confirmées, "
        f"{len(result['approximate'])} approximatives"
    )
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    data = get_elections()
    print(json.dumps(data, ensure_ascii=False, indent=2))