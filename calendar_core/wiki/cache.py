import json
import hashlib
import tempfile
import time
from pathlib import Path

_WIKI_CACHE_TTL_SECONDS = 7 * 24 * 3600
_WIKI_CACHE_DIR = Path(tempfile.gettempdir()) / "calendrier_fr_wiki_cache"

def _wiki_cache_path(title: str, lang: str, intro: bool) -> Path:
    key = hashlib.md5(f"{lang}:{title}:{intro}".encode()).hexdigest()
    return _WIKI_CACHE_DIR / f"{key}.json"

def wiki_cache_get(title: str, lang: str, intro: bool) -> str | None:
    try:
        p = _wiki_cache_path(title, lang, intro)
        if not p.exists():
            return None
        if time.time() - p.stat().st_mtime > _WIKI_CACHE_TTL_SECONDS:
            p.unlink(missing_ok=True)
            return None
        data = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or "extract" not in data or not isinstance(data["extract"], str):
            p.unlink(missing_ok=True)
            return None
        return data["extract"]
    except Exception:
        return None

def wiki_cache_set(title: str, lang: str, intro: bool, extract: str) -> None:
    try:
        _WIKI_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        p = _wiki_cache_path(title, lang, intro)
        p.write_text(json.dumps({"extract": extract}), encoding="utf-8")
    except Exception:
        pass