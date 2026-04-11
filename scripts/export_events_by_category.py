"""
Génère des fichiers JSON par catégorie à partir des fonctions de data Python.
On exploite les builders offline (célébrations, jours fériés, saisons, phases lunaires) pour produire
une base JSON utilisable ensuite par d'autres générations.
"""

import json
import sys
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from calendar_core.models import CalendarEvent

YEAR = datetime.now().year
YEARS = list(range(YEAR - 1, YEAR + 3))

BUILDERS = []
try:
    from calendar_core.society.celebrations import build_celebrations_events
    BUILDERS.append(build_celebrations_events)
except Exception:
    pass
try:
    from calendar_core.society.holidays import build_holidays_events
    BUILDERS.append(build_holidays_events)
except Exception:
    pass
try:
    from calendar_core.astronomy.seasons import build_season_and_time_events
    BUILDERS.append(build_season_and_time_events)
except Exception:
    pass
try:
    from calendar_core.astronomy.moon import build_moon_events
    BUILDERS.append(build_moon_events)
except Exception:
    pass

OUTPUT_DIR = Path("calendar_core") / "data" / "generated_events"

def slugify(category: str) -> str:
    safe = "".join(
        ch.lower()
        if ch.isalnum()
        else "_" if ch in (" ", "/", "-")
        else ""
        for ch in category
    )
    return safe.strip("_") or "autre"

def to_dict(event: CalendarEvent, year: int) -> dict:
    payload = event.to_json()
    payload["year"] = year
    payload["source"] = "generated_py"
    return payload

def main():
    if not BUILDERS:
        print("Aucun builder disponible, impossible de générer les JSON.")
        return
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    categories: dict[str, list[dict]] = {}

    for year in YEARS:
        for builder in BUILDERS:
            try:
                events = builder(year)
            except Exception as exc:
                print(f"Erreur pour {builder.__name__}({year}): {exc}")
                continue
            for event in events:
                if not isinstance(event, CalendarEvent):
                    continue
                data = to_dict(event, year)
                for cat in data.get("categories", []):
                    key = slugify(cat)
                    categories.setdefault(key, []).append(data)

    for cat, events in categories.items():
        target = OUTPUT_DIR / f"{cat}.json"
        with open(target, "w", encoding="utf-8") as f:
            json.dump(events, f, ensure_ascii=False, indent=2)
        print(f"  {target} ({len(events)} événements)")

if __name__ == "__main__":
    main()
