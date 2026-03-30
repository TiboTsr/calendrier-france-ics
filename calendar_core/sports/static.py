import json
from datetime import datetime
from pathlib import Path
from ..models import CalendarEvent

def fetch_static_sports() -> list[CalendarEvent]:
    """Lit les événements sportifs depuis le fichier JSON local."""
    events = []
    data_path = Path(__file__).parent.parent / "data" / "sports.json"
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