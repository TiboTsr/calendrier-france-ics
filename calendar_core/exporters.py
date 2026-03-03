from datetime import datetime, timezone

from .models import CalendarEvent


def escape_ics_text(value: str) -> str:
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace("\n", "\\n")
        .replace(";", "\\;")
        .replace(",", "\\,")
    )


def serialize_calendar(events: list[CalendarEvent], cal_name: str, domain: str, timezone_name: str = "Europe/Paris") -> tuple[str, set[str]]:
    dtstamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Calendrier Complet//FR//FR",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_ics_text(cal_name)}",
        f"X-WR-TIMEZONE:{timezone_name}",
    ]

    sorted_events = sorted(events, key=lambda event: (event.start, event.summary))
    uids = set()

    for event in sorted_events:
        uid = event.uid(domain)
        uids.add(uid)
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{uid}",
                f"DTSTAMP:{dtstamp}",
                f"SUMMARY:{escape_ics_text(event.summary)}",
                f"DESCRIPTION:{escape_ics_text(event.description)}",
                f"CATEGORIES:{','.join(escape_ics_text(category) for category in event.categories)}",
                f"DTSTART;VALUE=DATE:{event.start.strftime('%Y%m%d')}",
            ]
        )
        if event.end:
            lines.append(f"DTEND;VALUE=DATE:{event.end.strftime('%Y%m%d')}")
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\n".join(lines) + "\n", uids
