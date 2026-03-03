from datetime import datetime, timezone
import json
from pathlib import Path

from .config import (
	CALENDAR_JSON_FILE,
	DOMAIN,
	EVENTS_META_FILE,
	MAIN_ICS_FILE,
	NOISE_PROFILES,
	ZONE_FILES,
)
from .exporters import serialize_calendar
from .models import CalendarEvent
from .providers import build_base_events, build_vacation_events


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


def event_is_current_or_future(event: CalendarEvent, today) -> bool:
	effective_end = event.end or event.start
	return effective_end >= today


def save_calendar_json(events: list[CalendarEvent]) -> None:
	sorted_events = sorted(events, key=lambda event: (event.start, event.summary))
	payload = {
		"generatedAt": datetime.now(timezone.utc).isoformat(),
		"totalEvents": len(sorted_events),
		"profiles": list(NOISE_PROFILES.keys()),
		"events": [event.to_json() for event in sorted_events],
	}
	CALENDAR_JSON_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def save_weekly_meta(current_uids: set[str], previous_uids: set[str]) -> None:
	new_uids = sorted(current_uids - previous_uids)
	payload = {
		"generatedAt": datetime.now(timezone.utc).isoformat(),
		"newEventsThisWeek": len(new_uids),
		"newEventUids": new_uids[:50],
		"totalEvents": len(current_uids),
	}
	EVENTS_META_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def generate_all() -> None:
	previous_uids = parse_uids_from_ics(MAIN_ICS_FILE)
	today = datetime.now(timezone.utc).date()

	events = build_base_events()
	events.extend(build_vacation_events())
	base_events = [event for event in events if "Lunaire" not in event.categories]
	ics_base_events = [event for event in base_events if event_is_current_or_future(event, today)]

	global_ics, global_uids = serialize_calendar(ics_base_events, "Calendrier Complet France", DOMAIN)
	MAIN_ICS_FILE.write_text(global_ics, encoding="utf-8")

	for zone, path in ZONE_FILES.items():
		zone_events = [event for event in events if event_in_zone(event, zone) and event_is_current_or_future(event, today)]
		zone_ics, _ = serialize_calendar(zone_events, f"Calendrier France - Zone {zone}", DOMAIN)
		path.write_text(zone_ics, encoding="utf-8")

	for profile in NOISE_PROFILES.keys():
		profile_events = [
			event
			for event in events
			if event_matches_profile(event, profile) and event_is_current_or_future(event, today)
		]
		profile_file = Path(f"calendrier-{profile}.ics")
		profile_ics, _ = serialize_calendar(profile_events, f"Calendrier France - Profil {profile}", DOMAIN)
		profile_file.write_text(profile_ics, encoding="utf-8")

	save_calendar_json(events)
	save_weekly_meta(global_uids, previous_uids)

	print(f"{MAIN_ICS_FILE} généré avec succès !")
	for zone, path in ZONE_FILES.items():
		print(f"{path} généré avec succès ! ({zone})")
	for profile in NOISE_PROFILES.keys():
		print(f"calendrier-{profile}.ics généré avec succès !")
	print(f"{CALENDAR_JSON_FILE} généré avec succès !")
	print(f"{EVENTS_META_FILE} généré avec succès !")
