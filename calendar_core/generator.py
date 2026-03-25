from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from dateutil import parser

from .config import (
	CALENDAR_CSV_FILE,
	CALENDAR_JSON_FILE,
	CALENDAR_RSS_FILE,
	DOMAIN,
	EVENTS_META_FILE,
	MAIN_ICS_FILE,
	NOISE_PROFILES,
	SITEMAP_FILE,
	STRICT_FUTURE_ONLY,
	ZONE_FILES,
)
from .exporters import serialize_calendar, serialize_csv, serialize_rss
from .models import CalendarEvent
from .providers import build_base_events, build_vacation_events
from .providers import fetch_static_sports
from .elections import get_elections
from .utils import deduplicate_events


def event_in_zone(event: CalendarEvent, zone: str) -> bool:
	return event.zones is None or zone in event.zones


def event_matches_profile(event: CalendarEvent, profile: str) -> bool:
	wanted_categories = NOISE_PROFILES.get(profile)
	if wanted_categories is None:
		return True
	return any(category in wanted_categories for category in event.categories)


def parse_uids_from_ics(path: Path) -> set[str]:
	if not path.exists():
		return set()
	content = path.read_text(encoding="utf-8", errors="ignore")
	return {line[4:].strip() for line in content.splitlines() if line.startswith("UID:")}


def event_is_exportable(event: CalendarEvent, today, strict_future_only: bool) -> bool:
	if strict_future_only:
		return event.start > today
	effective_end = event.end or event.start
	return effective_end >= today


def save_calendar_json(events: list[CalendarEvent], upcoming: list[dict]) -> str:
	sorted_events = sorted(events, key=lambda event: (event.start, event.summary))
	content_version = build_content_version(sorted_events, upcoming)
	payload = {
		"generatedAt": datetime.now(timezone.utc).isoformat(),
		"contentVersion": content_version,
		"totalEvents": len(sorted_events),
		"profiles": list(NOISE_PROFILES.keys()),
		"events": [event.to_json() for event in sorted_events],
		"upcoming": upcoming,
	}
	CALENDAR_JSON_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
	return content_version


def save_weekly_meta(current_uids: set[str], previous_uids: set[str], content_version: str) -> None:
	new_uids = sorted(current_uids - previous_uids)
	payload = {
		"generatedAt": datetime.now(timezone.utc).isoformat(),
		"contentVersion": content_version,
		"newEventsThisWeek": len(new_uids),
		"newEventUids": new_uids[:50],
		"totalEvents": len(current_uids),
	}
	EVENTS_META_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def save_sitemap() -> None:
	lastmod = datetime.now(timezone.utc).date().isoformat()
	xml = (
		'<?xml version="1.0" encoding="UTF-8"?>\n'
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
		'  <url>\n'
		f'    <loc>https://{DOMAIN}/</loc>\n'
		f'    <lastmod>{lastmod}</lastmod>\n'
		'    <changefreq>daily</changefreq>\n'
		'    <priority>1.0</priority>\n'
		'  </url>\n'
		'</urlset>\n'
	)
	SITEMAP_FILE.write_text(xml, encoding="utf-8")


def build_content_version(events: list[CalendarEvent], upcoming: list[dict]) -> str:
	sorted_upcoming = sorted(
		upcoming,
		key=lambda item: (
			item.get("start") or "",
			item.get("summary") or item.get("title") or "",
			item.get("slug") or "",
		),
	)
	canonical_payload = {
		"events": [event.to_json() for event in events],
		"upcoming": sorted_upcoming,
	}
	serialized = json.dumps(canonical_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
	return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:16]


def dict_to_cal_event(ev: dict) -> CalendarEvent:
	from datetime import date
	# Convert ISO string to date
	def parse_date(d):
		if isinstance(d, date):
			return d
		if isinstance(d, str):
			try:
				return date.fromisoformat(d)
			except Exception:
				return None
		return None
	summary = ev.get("summary") or "Élection"
	start = parse_date(ev.get("start"))
	if not start:
		start = date.today()
	return CalendarEvent(
		summary=summary,
		start=start,
		end=parse_date(ev.get("end")),
		categories=ev.get("categories", []),
		zones=set(ev.get("zones", [])) if ev.get("zones") else None,
		description=ev.get("description", ""),
	)


def generate_all() -> None:
	previous_uids = parse_uids_from_ics(MAIN_ICS_FILE)
	today = datetime.now(timezone.utc).date()

	events = build_base_events()
	events.extend(fetch_static_sports())
	events.extend(build_vacation_events())
	events = deduplicate_events(events)
	upcoming = []
	election_data = get_elections()
	# Convert confirmed elections to CalendarEvent
	events.extend([dict_to_cal_event(ev) for ev in election_data["confirmed"]])
	upcoming.extend(election_data["approximate"])
	base_events = [event for event in events if hasattr(event, "categories") and "Lunaire" not in event.categories]
	ics_base_events = [event for event in base_events if event_is_exportable(event, today, STRICT_FUTURE_ONLY)]

	global_ics, global_uids = serialize_calendar(ics_base_events, "Calendrier Complet France", DOMAIN)
	MAIN_ICS_FILE.write_text(global_ics, encoding="utf-8")

	for zone, path in ZONE_FILES.items():
		zone_events = [
			event
			for event in events
			if event_in_zone(event, zone) and event_is_exportable(event, today, STRICT_FUTURE_ONLY)
			and ("Vacances scolaires" in event.categories or "Examens" in event.categories)
		]
		zone_ics, _ = serialize_calendar(zone_events, f"Vacances Scolaires, jours fériés & Examens - Zone {zone}", DOMAIN)
		path.write_text(zone_ics, encoding="utf-8")

	for profile in NOISE_PROFILES.keys():
		profile_events = [
			event
			for event in events
			if event_matches_profile(event, profile) and event_is_exportable(event, today, STRICT_FUTURE_ONLY)
		]
		
		profile_file = Path(f"calendrier-{profile}.ics")
		profile_ics, _ = serialize_calendar(profile_events, f"Calendrier France - Profil {profile}", DOMAIN)
		profile_file.write_text(profile_ics, encoding="utf-8")

	CALENDAR_CSV_FILE.write_text(serialize_csv(events), encoding="utf-8")
	CALENDAR_RSS_FILE.write_text(
		serialize_rss(ics_base_events, "Calendrier Complet France - Flux RSS", f"https://{DOMAIN}/"),
		encoding="utf-8",
	)
	save_sitemap()

	content_version = save_calendar_json(events, upcoming)
	save_weekly_meta(global_uids, previous_uids, content_version)

	print(f"{MAIN_ICS_FILE} généré avec succès !")
	for zone, path in ZONE_FILES.items():
		print(f"{path} généré avec succès ! ({zone})")
	for profile in NOISE_PROFILES.keys():
		print(f"calendrier-{profile}.ics généré avec succès !")
	print(f"{CALENDAR_JSON_FILE} généré avec succès !")
	print(f"{CALENDAR_CSV_FILE} généré avec succès !")
	print(f"{CALENDAR_RSS_FILE} généré avec succès !")
	print(f"{EVENTS_META_FILE} généré avec succès !")
