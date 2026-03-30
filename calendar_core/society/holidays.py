import holidays
from datetime import date, timedelta
from ..models import CalendarEvent
from ..utils import easter_date, localize_holiday_name

def build_holidays_events(year: int) -> list[CalendarEvent]:
    events: list[CalendarEvent] = []
    fr_holidays = holidays.country_holidays("FR", years=year, language="fr")
    _easter = easter_date(year)
    
    SPECIFIC_DESCRIPTIONS: dict[date, str] = {
        date(year, 1, 1): "Premier jour de l'année civile grégorienne. La tradition des vœux existe depuis l'Antiquité romaine. Le gui porte-bonheur vient d'une coutume druidique bien antérieure au christianisme.",
        date(year, 5, 1): "Commémore la grève de Chicago du 1er mai 1886 pour les 8 heures de travail, réprimée dans le sang. Férié et chômé en France depuis 1947. La tradition d'offrir du muguet vient d'une coutume de Charles IX datant de 1561.",
        date(year, 5, 8): "Le 8 mai 1945, l'Allemagne nazie signe sa capitulation sans condition, mettant fin à la guerre en Europe. Férié depuis 1953, supprimé par Giscard en 1975, puis rétabli par Mitterrand en 1981.",
        date(year, 7, 14): "Commémore la prise de la Bastille le 14 juillet 1789, symbole de la Révolution française. Jour férié depuis 1880. Défilé militaire sur les Champs-Élysées, bals des pompiers et feux d'artifice dans toute la France.",
        date(year, 8, 15): "Célèbre l'élévation de la Vierge Marie au ciel. Fête chrétienne ancienne, jour férié en France depuis le Concordat de 1802. Elle tombe en plein cœur de l'été, au milieu des grandes vacances.",
        date(year, 11, 1): "Fête de tous les saints, instituée par le pape Grégoire IV en 835. En France, la tradition de fleurir les tombes avec des chrysanthèmes s'est greffée dessus — ces fleurs sont désormais intimement liées à ce jour.",
        date(year, 11, 11): "Le 11 novembre 1918 à 11h, l'armistice met fin à la Première Guerre mondiale après quatre ans de combats. Jour férié depuis 1922. Chaque commune française a son monument aux morts — 36 000 érigés entre 1920 et 1925.",
        date(year, 12, 25): "Célèbre la naissance du Christ. La date du 25 décembre a été fixée au IVe siècle sur une fête solaire romaine préexistante. Le sapin, la bûche et les cadeaux sont des traditions popularisées bien plus tard, au XIXe siècle.",
        _easter + timedelta(days=1): "Jour férié qui prolonge le dimanche de Pâques. La tradition des œufs vient du Carême : l'Église interdisait d'en manger pendant 40 jours, on offrait donc à Pâques ceux accumulés.",
        _easter + timedelta(days=39): "Fête chrétienne commémorant la montée du Christ au ciel, 40 jours après Pâques. Toujours un jeudi, ce qui en fait naturellement un pont avec le vendredi.",
        _easter + timedelta(days=50): "Jour férié désigné depuis 2004 Journée de solidarité envers les personnes âgées. Les salariés travaillent ce jour sans rémunération supplémentaire, finançant ainsi la prise en charge de la dépendance — instauré après la canicule de 2003 qui fit 15 000 morts en France.",
    }

    SUMMARY_OVERRIDES: dict[str, str] = {
        "Fête de la Victoire": "Fête de la Victoire 1945",
    }

    for holiday_date, holiday_name in fr_holidays.items():
        localized = localize_holiday_name(holiday_name)
        localized = SUMMARY_OVERRIDES.get(localized, localized)
        description = SPECIFIC_DESCRIPTIONS.get(
            holiday_date,
            "Jour férié légal en France — chômé et payé depuis la loi du 13 juillet 1906.",
        )
        events.append(CalendarEvent(
            summary=localized,
            start=holiday_date,
            categories=["Jours fériés"],
            description=description,
        ))

    # PONTS AUTOMATIQUES
    ferie_dates: set[date] = set(fr_holidays.keys())
    for ferie_date, ferie_name in fr_holidays.items():
        weekday = ferie_date.weekday()
        bridge_date: date | None = None
        if weekday == 1:
            bridge_date = ferie_date - timedelta(days=1)
        elif weekday == 3:
            bridge_date = ferie_date + timedelta(days=1)

        if bridge_date and bridge_date not in ferie_dates:
            localized_name = localize_holiday_name(ferie_name)
            events.append(CalendarEvent(
                summary=f"Pont possible — {localized_name}",
                start=bridge_date,
                categories=["Ponts / Congés"],
                description=f"{localized_name} tombe un {'mardi' if weekday == 1 else 'jeudi'} le {ferie_date.strftime('%d/%m/%Y')}. Le {'lundi' if weekday == 1 else 'vendredi'} {bridge_date.strftime('%d/%m/%Y')} est un pont potentiel — vérifiez auprès de votre employeur.",
            ))

    # ALSACE-MOSELLE
    events.extend([
        CalendarEvent("Vendredi Saint", _easter - timedelta(days=2), categories=["Jours fériés", "Christianisme"],
            description="Commémore la crucifixion du Christ. Jour férié uniquement en Alsace-Moselle (départements 57, 67, 68) en vertu du régime concordataire.", zones={"AM"}),
        CalendarEvent("Saint-Étienne", date(year, 12, 26), categories=["Jours fériés", "Christianisme"],
            description="Le 26 décembre est férié uniquement en Alsace-Moselle (depts 57, 67, 68). Fête de saint Étienne, premier martyr chrétien.", zones={"AM"}),
    ])

    return events