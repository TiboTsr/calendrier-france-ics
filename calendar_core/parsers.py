import re
from datetime import date

def to_roman(value: int) -> str:
    mapping = [
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
        (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    ]
    remaining = value
    result = []
    for number, symbol in mapping:
        while remaining >= number:
            result.append(symbol)
            remaining -= number
    return "".join(result)

EN_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

FR_MONTHS = {
    "janvier": 1, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12,
}

def _norm_token(value: str) -> str:
    return (
        str(value or "")
        .lower()
        .replace("é", "e").replace("è", "e").replace("ê", "e").replace("ë", "e")
        .replace("à", "a").replace("â", "a").replace("ä", "a")
        .replace("î", "i").replace("ï", "i")
        .replace("ô", "o").replace("ö", "o")
        .replace("ù", "u").replace("û", "u").replace("ü", "u")
        .replace("ç", "c")
        .strip()
    )

def parse_en_date_range(text: str) -> tuple[date, date] | None:
    if not text:
        return None
    txt = text.replace("\n", " ")
    patterns = [
        r"from\s+(\d{1,2})\s+([A-Za-z]+)\s+to\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})",
        r"from\s+(\d{1,2})\s+to\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})",
        r"on\s+(\d{1,2})[–-](\d{1,2})\s+([A-Za-z]+)\s+(\d{4})",
    ]
    for idx, pattern in enumerate(patterns):
        match = re.search(pattern, txt, flags=re.IGNORECASE)
        if not match:
            continue
        try:
            if idx == 0:
                d1, m1, d2, m2, y = match.groups()
                month1 = EN_MONTHS.get(_norm_token(m1))
                month2 = EN_MONTHS.get(_norm_token(m2))
            elif idx == 1:
                d1, d2, m1, y = match.groups()
                month1 = EN_MONTHS.get(_norm_token(m1))
                month2 = month1
            else:
                d1, d2, m1, y = match.groups()
                month1 = EN_MONTHS.get(_norm_token(m1))
                month2 = month1
            if not month1 or not month2:
                continue
            return date(int(y), int(month1), int(d1)), date(int(y), int(month2), int(d2))
        except ValueError:
            continue
    return None

def parse_fr_du_au_range(text: str) -> tuple[date, date] | None:
    if not text:
        return None
    txt = text.replace("\n", " ")
    match = re.search(
        r"du\s+(\d{1,2})\s+([A-Za-zéèêëàâäîïôöùûüç]+)\s+au\s+(\d{1,2})\s+([A-Za-zéèêëàâäîïôöùûüç]+)\s+(\d{4})",
        txt, flags=re.IGNORECASE,
    )
    if not match:
        return None
    d1, m1, d2, m2, y = match.groups()
    month1 = FR_MONTHS.get(_norm_token(m1))
    month2 = FR_MONTHS.get(_norm_token(m2))
    if not month1 or not month2:
        return None
    try:
        return date(int(y), month1, int(d1)), date(int(y), month2, int(d2))
    except ValueError:
        return None

def parse_fr_single_date(text: str) -> date | None:
    if not text:
        return None
    match = re.search(r"(\d{1,2})\s+([A-Za-zéèêëàâäîïôöùûüç]+)\s+(\d{4})", text, flags=re.IGNORECASE)
    if not match:
        return None
    day, month_txt, year_txt = match.groups()
    month = FR_MONTHS.get(_norm_token(month_txt))
    if not month:
        return None
    try:
        return date(int(year_txt), month, int(day))
    except ValueError:
        return None

def parse_en_single_date(text: str) -> date | None:
    if not text:
        return None
    txt = text.replace("\n", " ")
    match = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", txt, flags=re.IGNORECASE)
    if match:
        day, month_txt, year_txt = match.groups()
        month = EN_MONTHS.get(_norm_token(month_txt))
        if month:
            try:
                return date(int(year_txt), month, int(day))
            except ValueError:
                pass
    match = re.search(r"([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})", txt, flags=re.IGNORECASE)
    if match:
        month_txt, day, year_txt = match.groups()
        month = EN_MONTHS.get(_norm_token(month_txt))
        if month:
            try:
                return date(int(year_txt), month, int(day))
            except ValueError:
                pass
    return None

def parse_en_from_to_month_day_range(text: str) -> tuple[date, date] | None:
    if not text:
        return None
    txt = text.replace("\n", " ")
    match = re.search(
        r"from\s+([A-Za-z]+)\s+(\d{1,2})\s+to\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})",
        txt, flags=re.IGNORECASE,
    )
    if not match:
        return None
    m1, d1, m2, d2, y = match.groups()
    month1 = EN_MONTHS.get(_norm_token(m1))
    month2 = EN_MONTHS.get(_norm_token(m2))
    if not month1 or not month2:
        return None
    try:
        return date(int(y), month1, int(d1)), date(int(y), month2, int(d2))
    except ValueError:
        return None

def parse_en_begin_end_range(text: str) -> tuple[date, date] | None:
    if not text:
        return None
    txt = text.replace("\n", " ")
    patterns = [
        r"(?:began|starts?|started|will begin|will start)\s+on\s+([^\.,;]+?)\s+and\s+(?:is set to\s+)?(?:conclude|concludes|concluded|end|ends|finish|finishes|will end)\s+on\s+([^\.,;]+)",
        r"from\s+([^\.,;]+?)\s+to\s+([^\.,;]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, txt, flags=re.IGNORECASE)
        if not match:
            continue
        left = parse_en_single_date(match.group(1))
        right = parse_en_single_date(match.group(2))
        if left and right:
            return left, right
    return None