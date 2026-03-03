from pathlib import Path
import sys

ICS_FILES = [
    Path("calendrier.ics"),
    Path("zone-a.ics"),
    Path("zone-b.ics"),
    Path("zone-c.ics"),
    Path("calendrier-essentiel.ics"),
    Path("calendrier-culturel.ics"),
    Path("calendrier-commercial.ics"),
    Path("calendrier-complet.ics"),
]


def validate_file(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.exists():
        return [f"{path} manquant"]

    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    content = "\n".join(lines)

    if "BEGIN:VCALENDAR" not in content or "END:VCALENDAR" not in content:
        errors.append("VCALENDAR invalide")

    begin_events = sum(1 for line in lines if line.strip() == "BEGIN:VEVENT")
    end_events = sum(1 for line in lines if line.strip() == "END:VEVENT")
    if begin_events != end_events:
        errors.append("Nombre BEGIN:VEVENT / END:VEVENT incohérent")

    required_props = ["UID:", "DTSTAMP:", "SUMMARY:", "DESCRIPTION:", "CATEGORIES:", "DTSTART;VALUE=DATE:"]
    event_blocks = content.split("BEGIN:VEVENT")
    for block in event_blocks[1:]:
        for prop in required_props:
            if prop not in block:
                errors.append(f"VEVENT sans propriété requise: {prop}")
                break

    return errors


def main() -> int:
    failed = False
    for ics_file in ICS_FILES:
        issues = validate_file(ics_file)
        if issues:
            failed = True
            print(f"[ERREUR] {ics_file}")
            for issue in issues:
                print(f"  - {issue}")
        else:
            print(f"[OK] {ics_file}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
