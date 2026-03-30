import ephem
import pytz
from datetime import date
from ..models import CalendarEvent

def get_accurate_moon_phases(year: int) -> list[tuple[date, str]]:
    """Génère les phases lunaires exactes pour l'année donnée via PyEphem."""
    tz_paris = pytz.timezone('Europe/Paris')
    phases = []
    
    start_date = ephem.Date(f"{year-1}-12-15")
    
    phase_funcs = [
        (ephem.next_new_moon, "Nouvelle Lune"),
        (ephem.next_first_quarter_moon, "Premier Quartier"),
        (ephem.next_full_moon, "Pleine Lune"),
        (ephem.next_last_quarter_moon, "Dernier Quartier de Lune"),
    ]
    
    for next_func, name in phase_funcs:
        current_date = start_date
        while True:
            phase_time = next_func(current_date)
            
            dt_utc = phase_time.datetime().replace(tzinfo=pytz.utc)
            dt_paris = dt_utc.astimezone(tz_paris)
            
            if dt_paris.year > year:
                break
                
            if dt_paris.year == year:
                phases.append((dt_paris.date(), name))
                
            current_date = ephem.Date(phase_time + 20)
            
    phases.sort(key=lambda x: x[0])
    return phases

def build_moon_events(year: int) -> list[CalendarEvent]:
    events = []
    phase_descriptions = {
        "Nouvelle Lune": "La face de la Lune tournée vers la Terre n'est pas éclairée — elle est invisible dans le ciel.",
        "Premier Quartier": "La moitié droite de la Lune est éclairée. Mi-chemin entre la Nouvelle Lune et la Pleine Lune.",
        "Pleine Lune": "La face de la Lune est entièrement éclairée par le Soleil.",
        "Dernier Quartier de Lune": "La moitié gauche de la Lune est éclairée. C'est la fin du cycle lunaire.",
    }
    
    for moon_date, moon_name in get_accurate_moon_phases(year):
        events.append(CalendarEvent(
            summary=moon_name, start=moon_date,
            categories=["Astronomie", "Lunaire"],
            description=phase_descriptions.get(moon_name, f"Phase lunaire : {moon_name}."),
        ))
    return events