from datetime import date
from ..models import CalendarEvent
from ..utils import season_start_dates, last_sunday

def build_season_and_time_events(year: int) -> list[CalendarEvent]:
    events = []

    # ── CHANGEMENTS D'HEURE ──
    events.extend([
        CalendarEvent("Passage à l'heure d'été", last_sunday(year, 3), categories=["Changement d'heure"],
            description="Dans la nuit du samedi au dimanche, les montres avancent d'une heure (2h → 3h)."),
        CalendarEvent("Passage à l'heure d'hiver", last_sunday(year, 10), categories=["Changement d'heure"],
            description="Dans la nuit du samedi au dimanche, les montres reculent d'une heure (3h → 2h)."),
    ])

    # ── SAISONS & ASTRONOMIE ──
    seasons = season_start_dates(year)
    events.extend([
        CalendarEvent("Début du Printemps — Équinoxe de printemps", seasons["printemps"], categories=["Saisons", "Astronomie"],
            description="L'équinoxe de printemps marque le début astronomique du printemps."),
        CalendarEvent("Début de l'Été — Solstice d'été", seasons["ete"], categories=["Saisons", "Astronomie"],
            description="Le solstice d'été est le jour le plus long de l'année."),
        CalendarEvent("Début de l'Automne — Équinoxe d'automne", seasons["automne"], categories=["Saisons", "Astronomie"],
            description="L'équinoxe d'automne marque le début de l'automne."),
        CalendarEvent("Début de l'Hiver — Solstice d'hiver", seasons["hiver"], categories=["Saisons", "Astronomie"],
            description="Le solstice d'hiver est le jour le plus court de l'année."),
        CalendarEvent("Jour le plus long de l'année", seasons["ete"], categories=["Saisons", "Astronomie"],
            description=f"Le {seasons['ete'].day} {seasons['ete'].strftime('%B')} est le jour le plus long de l'année {year}."),
        CalendarEvent("Jour le plus court de l'année", seasons["hiver"], categories=["Saisons", "Astronomie"],
            description=f"Le {seasons['hiver'].day} {seasons['hiver'].strftime('%B')} est le jour le plus court de l'année {year}."),
    ])
    
    return events