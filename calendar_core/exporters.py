from datetime import datetime, timedelta, timezone
import csv
from io import StringIO
from xml.sax.saxutils import escape

from .models import CalendarEvent

LONG_EVENT_COMPACT_AFTER_DAYS = 7


def escape_ics_text(value: str) -> str:
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace("\n", "\\n")
        .replace(";", "\\;")
        .replace(",", "\\,")
    )


def fold_ics_line(line: str, max_len: int = 75) -> str:
    if len(line) <= max_len:
        return line

    chunks: list[str] = []
    start = 0
    while start < len(line):
        prefix = "" if start == 0 else " "
        chunks.append(prefix + line[start:start + max_len])
        start += max_len
    return "\r\n".join(chunks)


def event_duration_days(event: CalendarEvent) -> int:
    if not event.end:
        return 1
    return (event.end - event.start).days + 1


def format_date_range(event: CalendarEvent) -> str:
    if not event.end:
        return event.start.strftime("%d/%m/%Y")
    return f"du {event.start.strftime('%d/%m/%Y')} au {event.end.strftime('%d/%m/%Y')}"


def build_ics_description(event: CalendarEvent, include_range: bool = False) -> str:
    description = event.description
    if include_range:
        range_note = f"Période complète : {format_date_range(event)}."
        if description:
            return f"{description}\n\n{range_note}"
        return range_note
    return description


def append_ics_event(
    lines: list[str],
    event: CalendarEvent,
    uid: str,
    dtstamp: str,
    summary: str | None = None,
    start=None,
    include_range: bool = False,
    include_end: bool = True,
) -> None:
    event_start = start or event.start
    lines.extend(
        [
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{dtstamp}",
            f"SUMMARY:{escape_ics_text(summary or event.summary)}",
            f"DESCRIPTION:{escape_ics_text(build_ics_description(event, include_range))}",
            f"CATEGORIES:{','.join(escape_ics_text(category) for category in event.categories)}",
            f"DTSTART;VALUE=DATE:{event_start.strftime('%Y%m%d')}",
        ]
    )
    if include_end and event.end:
        # RFC 5545 : DTEND est exclusif pour les événements all-day.
        # On ajoute toujours +1 jour ici — providers.py ne doit PAS soustraire de son côté.
        dtend_exclusive = event.end + timedelta(days=1)
        lines.append(f"DTEND;VALUE=DATE:{dtend_exclusive.strftime('%Y%m%d')}")
    lines.append("END:VEVENT")


def marker_uid(uid: str, marker: str) -> str:
    local_part, domain = uid.rsplit("@", 1)
    return f"{local_part}-{marker}@{domain}"


def serialize_calendar(
    events: list[CalendarEvent],
    cal_name: str,
    domain: str,
    timezone_name: str = "Europe/Paris",
    compact_long_events: bool = False,
) -> tuple[str, set[str]]:
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
        if compact_long_events and event_duration_days(event) > LONG_EVENT_COMPACT_AFTER_DAYS:
            start_uid = marker_uid(uid, "start")
            end_uid = marker_uid(uid, "end")
            uids.update({start_uid, end_uid})
            append_ics_event(
                lines,
                event,
                start_uid,
                dtstamp,
                summary=f"Début : {event.summary}",
                start=event.start,
                include_range=True,
                include_end=False,
            )
            append_ics_event(
                lines,
                event,
                end_uid,
                dtstamp,
                summary=f"Fin : {event.summary}",
                start=event.end,
                include_range=True,
                include_end=False,
            )
            continue

        uids.add(uid)
        append_ics_event(lines, event, uid, dtstamp)

    lines.append("END:VCALENDAR")
    folded = [fold_ics_line(line) for line in lines]
    return "\r\n".join(folded) + "\r\n", uids


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
