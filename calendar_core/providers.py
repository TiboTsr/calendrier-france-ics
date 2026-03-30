from datetime import timedelta

from .education import fetch_exam_dates
from .astronomy import build_moon_events, build_season_and_time_events
from .society import build_holidays_events, build_celebrations_events

from .config import YEARS
from .models import CalendarEvent
from .utils import last_weekday, nth_weekday


def build_base_events() -> list[CalendarEvent]:
    events: list[CalendarEvent] = []

    for year in YEARS:
        # 1. Jours fériés, fêtes, journées mondiales et dates spéciales
        events.extend(build_holidays_events(year))
        events.extend(build_celebrations_events(year))
        
        # 2. Astronomie (Saisons, phases lunaires, changements d'heure)
        events.extend(build_season_and_time_events(year))
        events.extend(build_moon_events(year))

        # 3. Examens Nationaux (Scraping du Bulletin Officiel)
        for exam in fetch_exam_dates(year):
            events.append(CalendarEvent(
                summary=exam["summary"],
                start=exam["start"],
                end=exam.get("end"),
                categories=exam["categories"],
                description=exam["description"],
            ))

    return events


def build_soldes_events() -> list[CalendarEvent]:
    events: list[CalendarEvent] = []
    SOLDES_DURATION = timedelta(weeks=4)

    for year in YEARS:
        # Soldes d'hiver
        hiver_start = nth_weekday(year, 1, 2, 2)
        hiver_end   = hiver_start + SOLDES_DURATION
        events.append(CalendarEvent(
            summary="Soldes d'hiver", start=hiver_start, end=hiver_end,
            categories=["Commerce", "Société"],
            description="Les soldes d'hiver débutent le deuxième mercredi de janvier et durent 4 semaines.",
        ))

        # Soldes d'été
        ete_candidate = last_weekday(year, 6, 2)
        ete_start = nth_weekday(year, 7, 2, 1) if ete_candidate.day > 28 else ete_candidate
        ete_end   = ete_start + SOLDES_DURATION
        events.append(CalendarEvent(
            summary="Soldes d'été", start=ete_start, end=ete_end,
            categories=["Commerce", "Société"],
            description="Les soldes d'été débutent le dernier mercredi de juin et durent 4 semaines.",
        ))

    return events