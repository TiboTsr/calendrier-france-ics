from datetime import date, timedelta
from ..models import CalendarEvent
from ..utils import easter_date, last_weekday, nth_weekday
from ..parsers import to_roman

def build_celebrations_events(year: int) -> list[CalendarEvent]:
    events: list[CalendarEvent] = []
    
    easter = easter_date(year)
    ascension = easter + timedelta(days=39)
    pentecote = easter + timedelta(days=49)

    # CHRISTIANISME
    events.extend([
        CalendarEvent("Pâques", easter, categories=["Christianisme"], description="Fête chrétienne célébrant la résurrection du Christ. Sa date varie chaque année car elle suit le calendrier lunaire."),
        CalendarEvent("Lundi de Pâques", easter + timedelta(days=1), categories=["Christianisme", "Jours fériés"], description="Jour férié qui prolonge le dimanche de Pâques."),
        CalendarEvent("Ascension", ascension, categories=["Christianisme", "Jours fériés"], description="Fête chrétienne commémorant la montée du Christ au ciel, 40 jours après Pâques."),
        CalendarEvent("Pentecôte", pentecote, categories=["Christianisme"], description="Célèbre la descente de l'Esprit Saint sur les apôtres, 50 jours après Pâques."),
        CalendarEvent("Lundi de Pentecôte", pentecote + timedelta(days=1), categories=["Christianisme", "Jours fériés"], description="Jour férié désigné depuis 2004 Journée de solidarité envers les personnes âgées."),
        CalendarEvent("Début du Carême", easter - timedelta(days=46), categories=["Christianisme"], description="Le Carême commence le Mercredi des Cendres, 46 jours avant Pâques."),
        CalendarEvent("Mardi Gras", easter - timedelta(days=47), categories=["Christianisme", "Culture", "Fêtes"], description="Dernier jour avant le Carême, où la tradition voulait qu'on fasse bombance avant l'abstinence."),
        CalendarEvent("Dimanche des Rameaux", easter - timedelta(days=7), categories=["Christianisme"], description="Ouvre la Semaine Sainte en rappelant l'entrée triomphale de Jésus à Jérusalem."),
        CalendarEvent("Vendredi Saint", easter - timedelta(days=2), categories=["Christianisme"], description="Commémore la crucifixion du Christ. Non férié en France depuis la loi de 1905 — sauf en Alsace-Moselle."),
        CalendarEvent("Toussaint", date(year, 11, 1), categories=["Christianisme", "Jours fériés"], description="Fête de tous les saints, instituée par le pape Grégoire IV en 835."),
        CalendarEvent("Noël", date(year, 12, 25), categories=["Christianisme", "Jours fériés", "Fêtes"], description="Célèbre la naissance du Christ."),
        CalendarEvent("Épiphanie", date(year, 1, 6), categories=["Christianisme", "Culture", "Gastronomie"], description="Célèbre la visite des Rois Mages à Jésus, 12 jours après Noël."),
        CalendarEvent("Saint-Nicolas", date(year, 12, 6), categories=["Christianisme", "Culture", "Fêtes"], description="Fête de Nicolas de Myre, évêque du IVe siècle devenu patron des enfants."),
        CalendarEvent("Assomption de Marie", date(year, 8, 15), categories=["Christianisme", "Jours fériés"], description="Célèbre l'élévation de la Vierge Marie au ciel."),
    ])

    # FÊTES POPULAIRES
    events.extend([
        CalendarEvent("Saint-Sylvestre / Réveillon du Nouvel An", date(year, 12, 31), categories=["Fêtes", "Culture"], description="Dernier jour de l'année, nommé d'après le pape Sylvestre Ier mort ce jour en 335."),
        CalendarEvent("Saint-Valentin", date(year, 2, 14), categories=["Fêtes", "Culture"], description="Fête des amoureux le 14 février."),
        CalendarEvent("Chandeleur", date(year, 2, 2), categories=["Culture", "Christianisme", "Gastronomie"], description="Fête de la Présentation de Jésus au Temple, 40 jours après Noël."),
        CalendarEvent("Poisson d'avril", date(year, 4, 1), categories=["Culture"], description="Journée des farces et des canulars."),
        CalendarEvent("Fête du Travail", date(year, 5, 1), categories=["Jours fériés", "Société"], description="Commémore la grève de Chicago du 1er mai 1886 pour les 8 heures de travail."),
        CalendarEvent("Fête des Mères", last_weekday(year, 5, 6) if last_weekday(year, 5, 6) != pentecote else nth_weekday(year, 6, 6, 1), categories=["Fêtes", "Culture"], description="Célébrée le dernier dimanche de mai, sauf si c'est la Pentecôte."),
        CalendarEvent("Fête des Pères", nth_weekday(year, 6, 6, 3), categories=["Fêtes", "Culture"], description="Née aux États-Unis en 1910, introduite en France dans les années 1950."),
        CalendarEvent("Fête des Grands-Mères", nth_weekday(year, 3, 6, 1), categories=["Fêtes", "Culture"], description="Créée en 1987 par la marque de café Grand'Mère."),
        CalendarEvent("Fête des Grands-Pères", nth_weekday(year, 10, 6, 1), categories=["Fêtes", "Culture"], description="Créée en 2008, elle a lieu chaque premier dimanche d'octobre."),
        CalendarEvent("Halloween", date(year, 10, 31), categories=["Culture", "Fêtes"], description="Fête d'origine celtique (la nuit de Samain) christianisée puis popularisée par la diaspora irlandaise."),
        CalendarEvent("Saint-Patrick", date(year, 3, 17), categories=["Culture", "Fêtes"], description="Fête nationale irlandaise le 17 mars, commémorant la mort de saint Patrick (461)."),
        CalendarEvent("Fête Nationale", date(year, 7, 14), categories=["Jours fériés", "Société", "Dates spéciales"], description="Commémore la prise de la Bastille le 14 juillet 1789."),
        CalendarEvent("Fête de la Musique", date(year, 6, 21), categories=["Culture", "Fêtes"], description="Créée en 1982 par le ministre Jack Lang."),
        CalendarEvent("Journées du Patrimoine", nth_weekday(year, 9, 5, 3), categories=["Culture", "Société"], description="Créées en France en 1984 par Jack Lang, étendues à toute l'Europe en 1991."),
        CalendarEvent("Nuit Blanche", nth_weekday(year, 10, 5, 1), categories=["Culture"], description="Initiée à Paris en 2002 par le maire Bertrand Delanoë."),
        CalendarEvent("Beaujolais Nouveau", nth_weekday(year, 11, 3, 3), categories=["Gastronomie", "Culture", "Commercial"], description="Chaque troisième jeudi de novembre, le Beaujolais Nouveau est mis en vente."),
        CalendarEvent("Braderie de Lille", nth_weekday(year, 9, 5, 1), categories=["Culture", "Commerce"], description="Plus grande braderie d'Europe, organisée le premier week-end de septembre à Lille."),
        CalendarEvent("Fête de la Bretagne", date(year, 11, 30), categories=["Culture", "Société"], description="Célébrée le 30 novembre (Saint-André) depuis les années 1990."),
    ])

    # DATES CIVIQUES & MÉMOIRE
    events.extend([
        CalendarEvent("Journée nationale de la Mémoire de la Shoah", date(year, 1, 27), categories=["Mémoire", "Société"], description="Commémore la libération du camp d'Auschwitz le 27 janvier 1945."),
        CalendarEvent("Commémoration de la Rafle du Vél d'Hiv", nth_weekday(year, 7, 6, 2), categories=["Mémoire", "Société"], description="Les 16-17 juillet 1942, la police française arrêta 13 152 Juifs à Paris."),
        CalendarEvent("Appel du 18 juin 1940 — Anniversaire", date(year, 6, 18), categories=["Mémoire", "Dates spéciales"], description="Le 18 juin 1940, de Gaulle lance depuis Londres un appel à la Résistance sur la BBC."),
        CalendarEvent("Débarquement en Normandie — Commémoration du Jour J", date(year, 6, 6), categories=["Mémoire", "Dates spéciales"], description="Le 6 juin 1944, 156 000 soldats alliés débarquent sur les plages de Normandie."),
        CalendarEvent("Abolition de l'esclavage en France — Commémoration", date(year, 5, 10), categories=["Mémoire", "Société"], description="Journée nationale instaurée par la loi Taubira de 2001."),
        CalendarEvent("Journée de la Laïcité", date(year, 12, 9), categories=["Société", "Dates spéciales"], description="Commémore la loi du 9 décembre 1905 séparant les Églises de l'État."),
        CalendarEvent("Journée nationale de la Résistance", date(year, 5, 27), categories=["Mémoire", "Société"], description="Le 27 mai 1943, Jean Moulin préside la première réunion secrète du CNR."),
        CalendarEvent("Armistice de 1918 — Journée du Souvenir", date(year, 11, 11), categories=["Jours fériés", "Mémoire", "Dates spéciales"], description="Le 11 novembre 1918 à 11h, l'armistice met fin à la Première Guerre mondiale."),
    ])

    # SANTÉ, SOCIÉTÉ, ENVIRONNEMENT, GASTRONOMIE ET ÉDUCATION
    events.extend([
        CalendarEvent("Journée mondiale contre le cancer", date(year, 2, 4), categories=["Santé"], description="Initiée par l'Union Internationale Contre le Cancer depuis 2000."),
        CalendarEvent("Journée mondiale de la Santé", date(year, 4, 7), categories=["Santé"], description="Commémore la fondation de l'OMS le 7 avril 1948."),
        CalendarEvent("Journée mondiale sans tabac", date(year, 5, 31), categories=["Santé"], description="Lancée par l'OMS en 1987."),
        CalendarEvent("Journée mondiale de la santé mentale", date(year, 10, 10), categories=["Santé", "Société"], description="Créée par la Fédération Mondiale pour la Santé Mentale en 1992."),
        CalendarEvent("Lancement d'Octobre Rose", date(year, 10, 1), categories=["Santé"], description="Tout octobre est dédié à la sensibilisation au cancer du sein."),
        CalendarEvent("Lancement du Mois sans Tabac", date(year, 11, 1), categories=["Santé"], description="Lancé en France en 2016 par Santé Publique France."),
        CalendarEvent("Journée internationale des femmes", date(year, 3, 8), categories=["Société"], description="Issue des luttes ouvrières du début du XXe siècle en Europe et aux États-Unis."),
        CalendarEvent("Journée internationale des droits de l'enfant", date(year, 11, 20), categories=["Société"], description="Commémore l'adoption de la Convention des Nations Unies relative aux droits de l'enfant."),
        CalendarEvent("Journée mondiale des personnes handicapées", date(year, 12, 3), categories=["Société"], description="Instaurée par l'ONU en 1992."),
        CalendarEvent("Journée mondiale du Bénévolat", date(year, 12, 5), categories=["Société"], description="Créée par l'ONU en 1985."),
        CalendarEvent("Fête des Voisins", last_weekday(year, 5, 4), categories=["Société"], description="Créée en 2000 pour lutter contre l'isolement urbain."),
        CalendarEvent("Journée nationale de lutte contre les discriminations", date(year, 3, 21), categories=["Société"], description="Créée par l'ONU en 1966 en mémoire du massacre de Sharpeville."),
        CalendarEvent("Jour de la Terre", date(year, 4, 22), categories=["Environnement", "Société"], description="Né le 22 avril 1970 après une marée noire en Californie."),
        CalendarEvent("Journée mondiale de l'océan", date(year, 6, 8), categories=["Environnement"], description="Proposée lors du Sommet de la Terre de Rio en 1992."),
        CalendarEvent("Journée mondiale de la biodiversité", date(year, 5, 22), categories=["Environnement"], description="Commémore l'adoption de la Convention sur la Diversité Biologique à Rio."),
        CalendarEvent("Journée mondiale sans voiture", date(year, 9, 22), categories=["Environnement", "Société"], description="Lancée en France en 1998 par La Rochelle."),
        CalendarEvent("Journée mondiale de l'eau", date(year, 3, 22), categories=["Environnement", "Société"], description="Proclamée par l'ONU en 1993."),
        CalendarEvent("Journée mondiale des zones humides", date(year, 2, 2), categories=["Environnement"], description="Commémore la Convention de Ramsar signée le 2 février 1971."),
        CalendarEvent("Journée nationale de l'arbre", nth_weekday(year, 11, 3, 1), categories=["Environnement"], description="Célébrée chaque premier jeudi de novembre."),
        CalendarEvent("Journée mondiale de l'alimentation", date(year, 10, 16), categories=["Gastronomie", "Société", "Santé"], description="Commémore la fondation de la FAO le 16 octobre 1945."),
        CalendarEvent("Semaine du Goût", nth_weekday(year, 10, 0, 2), categories=["Gastronomie", "Culture"], description="Créée en 1990 par le chef Joël Robuchon."),
        CalendarEvent("Journée mondiale du cacao et du chocolat", date(year, 10, 1), categories=["Gastronomie", "Culture"], description="Célébrée le 1er octobre et associée à l'Organisation internationale du cacao (ICCO)."),
        CalendarEvent("Nuit des Musées", nth_weekday(year, 5, 5, 4), categories=["Culture"], description="Créée en France en 2005 et étendue à toute l'Europe."),
        CalendarEvent("Festival de Cannes — Ouverture", date(year, 5, 12), categories=["Culture", "Cinéma"], description="Le Festival International du Film de Cannes, créé en 1946."),
        CalendarEvent("Fête du Cinéma", nth_weekday(year, 6, 6, 4), categories=["Culture", "Cinéma"], description="Créée en 1985, elle propose chaque fin juin des places à tarif réduit."),
        CalendarEvent("Festival d'Avignon — Ouverture", date(year, 7, 5), categories=["Culture", "Théâtre"], description="Créé par Jean Vilar en 1947 dans la cour du Palais des Papes."),
        CalendarEvent("Salon de l'Agriculture — Ouverture", nth_weekday(year, 2, 5, 4), categories=["Gastronomie", "Agriculture", "Culture"], description="Le Salon International de l'Agriculture se tient chaque fin février à Paris."),
        CalendarEvent("Rentrée des classes", date(year, 9, 2), categories=["Éducation", "Société"], description="La rentrée de septembre mobilise 12 millions d'élèves et 870 000 enseignants en France."),
        CalendarEvent("Journée internationale de l'Éducation", date(year, 1, 24), categories=["Éducation", "Société"], description="Proclamée par l'ONU en 2019."),
        CalendarEvent("Nuit des Étoiles", nth_weekday(year, 8, 5, 1), categories=["Astronomie", "Éducation", "Culture"], description="Organisée chaque premier week-end d'août par l'Association Française d'Astronomie depuis 1991."),
    ])

    # DATES SPÉCIALES
    is_leap_year = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    if is_leap_year:
        events.append(CalendarEvent("Jour supplémentaire (année bissextile)", date(year, 2, 29), categories=["Dates spéciales"], description=f"Une année solaire dure 365,2422 jours. {year} est l'une des années rares à 366 jours."))
    
    mid_year_date = date(year, 7, 1) if is_leap_year else date(year, 7, 2)
    events.extend([
        CalendarEvent("Milieu de l'année", mid_year_date, categories=["Dates spéciales"], description=f"Ce jour marque le point médian exact de l'année {year}."),
        CalendarEvent("Dernier jour de l'année", date(year, 12, 31), categories=["Dates spéciales"], description=f"Clôture de l'année civile {year}."),
    ])

    if year % 10 == 0:
        events.append(CalendarEvent("Début d'une nouvelle décennie", date(year, 1, 1), categories=["Dates spéciales"], description=f"Le 1er janvier {year} ouvre la décennie {year}–{year + 9}."))
    if year % 10 == 9:
        events.append(CalendarEvent("Fin d'une décennie", date(year, 12, 31), categories=["Dates spéciales"], description=f"Le 31 décembre {year} clôture la décennie {year - 9}–{year}."))
    if year % 100 == 1:
        century_number = (year - 1) // 100 + 1
        events.append(CalendarEvent("Début d'un nouveau siècle", date(year, 1, 1), categories=["Dates spéciales"], description=f"Le 1er janvier {year} ouvre le {to_roman(century_number)}e siècle."))
    if year % 100 == 0:
        century_number = year // 100
        events.append(CalendarEvent("Fin d'un siècle", date(year, 12, 31), categories=["Dates spéciales"], description=f"Le 31 décembre {year} clôture le {to_roman(century_number)}e siècle."))
    if date(year, 12, 28).isocalendar().week == 53:
        events.append(CalendarEvent("Année avec 53e semaine ISO", date(year, 12, 28), categories=["Dates spéciales"], description=f"L'année {year} comporte une semaine 53 dans le calendrier ISO."))

    def _find_palindromes_for_year(y: int) -> list[tuple[int, int]]:
        results = []
        import calendar as _cal
        for m in range(1, 13):
            max_day = _cal.monthrange(y, m)[1]
            for d in range(1, max_day + 1):
                stamp = f"{d:02d}{m:02d}{y:04d}"
                if stamp == stamp[::-1]:
                    results.append((d, m))
        return results

    for d, m in _find_palindromes_for_year(year):
        day_cursor = date(year, m, d)
        stamp = day_cursor.strftime("%d%m%Y")
        events.append(CalendarEvent("Date palindrome", day_cursor, categories=["Dates spéciales"], description=f"La date du {day_cursor.strftime('%d/%m/%Y')} se lit de la même façon dans les deux sens ({stamp})."))

    return events
