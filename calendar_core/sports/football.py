from datetime import date
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

from ..wiki import fetch_wiki_extract
from ..parsers import (
    parse_en_from_to_month_day_range,
    parse_en_date_range,
    parse_en_begin_end_range
)

def fetch_football_periods(year: int) -> dict[str, tuple[date, date]]:
    """Récupère les périodes football/compétitions en parallèle."""
    periods: dict[str, tuple[date, date]] = {}
    season_next = str((year + 1) % 100).zfill(2)
    fetchers = []

    if year % 4 == 2:
        def fetch_worldcup():
            try:
                txt = fetch_wiki_extract(f"{year}_FIFA_World_Cup", lang="en", intro=True)
                rng = parse_en_from_to_month_day_range(txt) or parse_en_date_range(txt)
                if rng:
                    return "worldcup", rng
            except (requests.RequestException, ValueError, TypeError):
                pass
            return None
        fetchers.append(fetch_worldcup)

    if year % 4 == 0:
        def fetch_euro():
            try:
                txt = fetch_wiki_extract(f"UEFA_Euro_{year}", lang="en", intro=True)
                rng = parse_en_from_to_month_day_range(txt) or parse_en_date_range(txt)
                if rng:
                    return "euro", rng
            except (requests.RequestException, ValueError, TypeError):
                pass
            return None
        fetchers.append(fetch_euro)

    if year % 2 == 1 and year >= 2013:
        def fetch_afcon():
            try:
                txt = fetch_wiki_extract(f"{year}_Africa_Cup_of_Nations", lang="en", intro=True)
                rng = parse_en_from_to_month_day_range(txt) or parse_en_date_range(txt)
                if rng:
                    return "afcon", rng
            except (requests.RequestException, ValueError, TypeError):
                pass
            return None
        fetchers.append(fetch_afcon)

    def fetch_ligue1():
        try:
            txt = fetch_wiki_extract(f"{year}–{season_next}_Ligue_1", lang="en", intro=True)
            rng = parse_en_begin_end_range(txt)
            if rng:
                return "ligue1", rng
        except (requests.RequestException, ValueError, TypeError):
            pass
        return None

    def fetch_ucl():
        try:
            txt = fetch_wiki_extract(f"{year}–{season_next}_UEFA_Champions_League", lang="en", intro=True)
            rng = parse_en_begin_end_range(txt)
            if rng:
                return "ucl", rng
        except (requests.RequestException, ValueError, TypeError):
            pass
        return None

    fetchers.extend([fetch_ligue1, fetch_ucl])

    if not fetchers:
        return periods

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