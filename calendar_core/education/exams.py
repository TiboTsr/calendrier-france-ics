import re
import requests
from datetime import date

def fetch_exam_dates(year: int) -> list[dict]:
    KNOWN_DATES: dict[int, list[dict]] = {
        2026: [
            {
                "summary": "Baccalauréat général et technologique — Épreuves de spécialité",
                "start": date(2026, 6, 16), "end": date(2026, 6, 18),
                "description": "Épreuves terminales écrites de spécialité du baccalauréat général et technologique. Créé par Napoléon en 1808, le baccalauréat est l'un des plus anciens examens nationaux. Environ 500 000 candidats passent ces épreuves chaque année.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat général et technologique — Philosophie",
                "start": date(2026, 6, 15), "end": date(2026, 6, 15),
                "description": "L'épreuve de philosophie est l'épreuve d'ouverture du bac, traditionnellement le premier jour. Unique en Europe, cette épreuve de 4 heures fait de la France le seul pays où la philo est une matière obligatoire pour tous les lycéens jusqu'au baccalauréat.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat général et technologique — Grand Oral",
                "start": date(2026, 6, 22), "end": date(2026, 7, 1),
                "description": "Le Grand Oral évalue la capacité des candidats à présenter et défendre un projet à l'oral. Introduit par la réforme du bac de 2019, il remplace l'ancien oral de TPE.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat — Épreuve anticipée de français (1re)",
                "start": date(2026, 6, 11), "end": date(2026, 6, 11),
                "description": "L'épreuve écrite anticipée de français se passe en classe de Première, un an avant le bac. Elle compte dans la note finale du baccalauréat général et technologique.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Brevet des collèges (DNB) — Épreuves écrites",
                "start": date(2026, 6, 26), "end": date(2026, 6, 30),
                "description": "Le diplôme national du brevet sanctionne la fin du collège. Il se déroule sur trois jours fin juin. Près de 800 000 élèves le passent chaque année en France.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "BTS — Épreuves écrites",
                "start": date(2026, 5, 18), "end": date(2026, 5, 21),
                "description": "Le Brevet de Technicien Supérieur (BTS) est un diplôme bac+2 de l'enseignement supérieur court. Les épreuves écrites communes se déroulent en mai sur quatre jours.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat professionnel — Épreuves écrites",
                "start": date(2026, 5, 20), "end": date(2026, 6, 5),
                "description": "Le baccalauréat professionnel valide une formation en lycée professionnel ou en alternance. Ses épreuves écrites se déroulent de fin mai à début juin.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "CAP — Épreuves écrites d'enseignement général",
                "start": date(2026, 6, 8), "end": date(2026, 6, 9),
                "description": "Le Certificat d'Aptitude Professionnelle (CAP) certifie des compétences dans un métier précis. Les épreuves écrites d'enseignement général se déroulent sur deux jours en juin.",
                "categories": ["Éducation", "Examens"],
            },
        ],
        2025: [
            {
                "summary": "Baccalauréat général et technologique — Épreuves de spécialité",
                "start": date(2025, 3, 18), "end": date(2025, 3, 20),
                "description": "Épreuves terminales écrites de spécialité du baccalauréat général et technologique.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Baccalauréat général et technologique — Philosophie et Grand Oral",
                "start": date(2025, 6, 16), "end": date(2025, 6, 27),
                "description": "L'épreuve de philosophie ouvre le bac terminal, suivie du Grand Oral introduit par la réforme 2019.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "Brevet des collèges (DNB) — Épreuves écrites",
                "start": date(2025, 6, 26), "end": date(2025, 6, 27),
                "description": "Le diplôme national du brevet sanctionne la fin du collège.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "BTS — Épreuves écrites",
                "start": date(2025, 5, 13), "end": date(2025, 5, 16),
                "description": "Le Brevet de Technicien Supérieur (BTS) est un diplôme bac+2 de l'enseignement supérieur court.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "summary": "CAP — Épreuves écrites d'enseignement général",
                "start": date(2025, 6, 4), "end": date(2025, 6, 5),
                "description": "Le Certificat d'Aptitude Professionnelle (CAP) certifie des compétences dans un métier précis.",
                "categories": ["Éducation", "Examens"],
            },
        ],
    }

    if year in KNOWN_DATES:
        return KNOWN_DATES[year]

    results: list[dict] = []
    try:
        bo_url = f"https://www.education.gouv.fr/bo/{year - 1}/Hebdo36/"
        headers = {"User-Agent": "Mozilla/5.0 (compatible; CalendrierFR/1.0; +https://calendrier-fr.tibotsr.dev)"}
        index_resp = requests.get(bo_url, headers=headers, timeout=15)
        index_resp.raise_for_status()

        nor_match = re.search(
            r'href="(/bo/[^"]*MENE[^"]*N)"[^>]*>[^<]*[Cc]alendrier[^<]*examen',
            index_resp.text,
        )
        if not nor_match:
            nor_match = re.search(r'href="(/bo/[^"]*MENE\d{7,}N)"', index_resp.text)
        if not nor_match:
            return results

        note_url = "https://www.education.gouv.fr" + nor_match.group(1)
        note_resp = requests.get(note_url, headers=headers, timeout=15)
        note_resp.raise_for_status()
        text = note_resp.text

        MONTHS_FR_LOCAL = {
            "janvier": 1, "février": 2, "mars": 3, "avril": 4,
            "mai": 5, "juin": 6, "juillet": 7, "août": 8,
            "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12,
        }

        def parse_bo_date(s: str) -> date | None:
            s = s.strip().lower()
            for m_name, m_num in MONTHS_FR_LOCAL.items():
                if m_name in s:
                    d_match = re.search(r"(\d{1,2})", s)
                    if d_match:
                        try:
                            return date(year, m_num, int(d_match.group(1)))
                        except ValueError:
                            pass
            return None

        EXAM_SEARCHES = [
            {
                "pattern": r"[Éé]preuves.*?baccalauréat général.*?(?:lundi|mardi|mercredi|jeudi|vendredi)\s+(\d{1,2})\s+(\w+)\s+\d{4}",
                "summary": "Baccalauréat général et technologique — Épreuves terminales",
                "description": "Épreuves terminales du baccalauréat général et technologique.",
                "categories": ["Éducation", "Examens"],
            },
            {
                "pattern": r"[Éé]preuves.*?brevet.*?(?:lundi|mardi|mercredi|jeudi|vendredi)\s+(\d{1,2})\s+(\w+)\s+\d{4}",
                "summary": "Brevet des collèges (DNB) — Épreuves écrites",
                "description": "Épreuves écrites du diplôme national du brevet.",
                "categories": ["Éducation", "Examens"],
            },
        ]

        for search in EXAM_SEARCHES:
            match = re.search(search["pattern"], text, flags=re.IGNORECASE | re.DOTALL)
            if match:
                d = parse_bo_date(f"{match.group(1)} {match.group(2)}")
                if d:
                    results.append({
                        "summary": search["summary"],
                        "start": d, "end": None,
                        "description": search["description"],
                        "categories": search["categories"],
                    })

    except (requests.RequestException, ValueError, TypeError, AttributeError):
        pass

    return results