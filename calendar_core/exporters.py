from datetime import datetime, timedelta, timezone
import csv
from io import StringIO
from xml.sax.saxutils import escape

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
            # RFC 5545 : DTEND est exclusif pour les événements all-day.
            # On ajoute toujours +1 jour ici — providers.py ne doit PAS soustraire de son côté.
            dtend_exclusive = event.end + timedelta(days=1)
            lines.append(f"DTEND;VALUE=DATE:{dtend_exclusive.strftime('%Y%m%d')}")
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\n".join(lines) + "\n", uids


def serialize_csv(events: list[CalendarEvent]) -> str:
    sorted_events = sorted(events, key=lambda event: (event.start, event.summary))
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["summary", "start", "end", "categories", "description", "zones"])
    for event in sorted_events:
        writer.writerow(
            [
                event.summary,
                event.start.isoformat(),
                event.end.isoformat() if event.end else "",
                "|".join(event.categories),
                event.description,
                "|".join(sorted(event.zones)) if event.zones else "",
            ]
        )
    return buffer.getvalue()


def serialize_rss(events: list[CalendarEvent], title: str, site_url: str) -> str:
    now_rfc2822 = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
    sorted_events = sorted(events, key=lambda event: (event.start, event.summary))
    items = []
    for event in sorted_events[:200]:
        event_url = f"{site_url}?date={event.start.isoformat()}"
        description = event.description or "Événement du calendrier"
        pub_date = datetime(event.start.year, event.start.month, event.start.day, tzinfo=timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
        items.append(
            "\n".join(
                [
                    "    <item>",
                    f"      <title>{escape(event.summary)}</title>",
                    f"      <link>{escape(event_url)}</link>",
                    f"      <guid>{escape(event.uid('calendrier-fr.tibotsr.dev'))}</guid>",
                    f"      <description>{escape(description)}</description>",
                    f"      <pubDate>{pub_date}</pubDate>",
                    "    </item>",
                ]
            )
        )

    rss = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0">',
        "  <channel>",
        f"    <title>{escape(title)}</title>",
        f"    <link>{escape(site_url)}</link>",
        "    <description>Mises à jour du calendrier France.</description>",
        "    <language>fr-fr</language>",
        f"    <lastBuildDate>{now_rfc2822}</lastBuildDate>",
        *items,
        "  </channel>",
        "</rss>",
        "",
    ]
    return "\n".join(rss)