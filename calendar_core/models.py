from dataclasses import dataclass, field
from datetime import date
import hashlib


@dataclass
class CalendarEvent:
    summary: str
    start: date
    end: date | None = None
    categories: list[str] = field(default_factory=list)
    description: str = ""
    zones: set[str] | None = None
    include_in_profiles: set[str] | None = None

    def uid(self, domain: str) -> str:
        zone_key = "" if self.zones is None else ",".join(sorted(self.zones))
        payload = "|".join(
            [
                self.summary,
                self.start.isoformat(),
                self.end.isoformat() if self.end else "",
                ",".join(self.categories),
                zone_key,
            ]
        )
        digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:24]
        return f"{digest}@{domain}"

    def to_json(self) -> dict:
        return {
            "summary": self.summary,
            "start": self.start.isoformat(),
            "end": self.end.isoformat() if self.end else None,
            "description": self.description,
            "categories": self.categories,
            "zones": sorted(self.zones) if self.zones else [],
        }
