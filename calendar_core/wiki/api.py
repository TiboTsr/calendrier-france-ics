import requests
from .cache import wiki_cache_get, wiki_cache_set

def fetch_wiki_extract(title: str, lang: str = "en", intro: bool = True) -> str:
    cached = wiki_cache_get(title, lang, intro)
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
    
    wiki_cache_set(title, lang, intro, extract)
    return extract