"""
health_check.py — Vérification quotidienne des sources externes du calendrier

Usage :
    python health_check.py                    # affiche le rapport en console
    python health_check.py --notify email     # envoie un mail si erreur
    python health_check.py --notify webhook   # POST vers WEBHOOK_URL si erreur

Variables d'environnement :
    ALERT_EMAIL       adresse de destination pour les alertes mail
    SMTP_HOST         serveur SMTP (défaut : localhost)
    SMTP_PORT         port SMTP (défaut : 25)
    SMTP_USER         login SMTP (optionnel)
    SMTP_PASSWORD     mot de passe SMTP (optionnel)
    WEBHOOK_URL       URL pour les alertes webhook (Slack, Discord, ntfy.sh...)
    CALENDRIER_ENV    "prod" pour réduire les logs en console
    CI                défini automatiquement par GitHub Actions (et la plupart des CI)
"""

import argparse
import json
import os
import smtplib
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime
from email.mime.text import MIMEText
from pathlib import Path

import requests

TIMEOUT = 15
YEAR = datetime.now().year
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

IS_CI = os.environ.get("CI", "").lower() in ("true", "1", "yes")


@dataclass
class Source:
    name: str
    url: str | None = None
    method: str = "GET"
    params: dict = field(default_factory=dict)
    expected_keys: list[str] = field(default_factory=list)
    expected_status: int = 200
    note: str = ""
    skip_ci: bool = False
    local_check: Callable[[], tuple[bool, str | None]] | None = None


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _parse_iso_date(value: str) -> date | None:
    try:
        return datetime.fromisoformat(value).date()
    except Exception:
        return None


def _check_sports_json() -> tuple[bool, str | None]:
    """
    Le sport est maintenu dans un JSON local (plus de scraping Wikipedia/Ergast).
    On valide le schema et qu'il contient au moins 1 evenement sur l'annee courante.
    """
    sports_path = _repo_root() / "calendar_core" / "data" / "sports.json"
    if not sports_path.exists():
        return False, f"Fichier manquant: {sports_path.as_posix()}"

    try:
        payload = json.loads(sports_path.read_text(encoding="utf-8"))
    except Exception:
        return False, "sports.json invalide (JSON non parsable)"

    if not isinstance(payload, dict) or "events" not in payload or not isinstance(payload["events"], list):
        return False, "sports.json invalide (schema attendu: { events: [...] })"

    year_start = date(YEAR, 1, 1)
    year_end = date(YEAR, 12, 31)
    overlaps_year = 0
    overlaps_year_sport = 0

    for i, item in enumerate(payload["events"]):
        if not isinstance(item, dict):
            return False, f"sports.json invalide (event #{i} n'est pas un objet)"

        summary = item.get("summary")
        start_s = item.get("start")
        end_s = item.get("end")
        categories = item.get("categories")

        if not isinstance(summary, str) or not summary.strip():
            return False, f"sports.json invalide (event #{i} summary manquant)"
        if not isinstance(start_s, str):
            return False, f"sports.json invalide (event #{i} start manquant)"
        if not isinstance(categories, list) or not all(isinstance(c, str) and c.strip() for c in categories):
            return False, f"sports.json invalide (event #{i} categories manquantes)"

        start_dt = _parse_iso_date(start_s)
        if not start_dt:
            return False, f"sports.json invalide (event #{i} start invalide: {start_s})"

        end_dt = None
        if end_s is not None:
            if not isinstance(end_s, str):
                return False, f"sports.json invalide (event #{i} end invalide)"
            end_dt = _parse_iso_date(end_s)
            if not end_dt:
                return False, f"sports.json invalide (event #{i} end invalide: {end_s})"
            if end_dt < start_dt:
                return False, f"sports.json invalide (event #{i} end < start)"

        effective_end = end_dt or start_dt
        if start_dt <= year_end and effective_end >= year_start:
            overlaps_year += 1
            if any(c.strip().lower() == "sport" for c in categories):
                overlaps_year_sport += 1

    if overlaps_year == 0:
        return False, f"sports.json ne contient aucun evenement pour {YEAR}"

    if overlaps_year_sport == 0:
        return False, f"sports.json: aucun evenement {YEAR} n'a la categorie 'Sport'"

    return True, None


SOURCES: list[Source] = [
    Source(
        name="data.education.gouv.fr - Calendrier scolaire",
        url="https://data.education.gouv.fr/api/records/1.0/search/",
        params={"dataset": "fr-en-calendrier-scolaire", "rows": 1},
        expected_keys=["records"],
        note="Source principale des vacances scolaires (provider vacances).",
    ),
    Source(
        name="Local - sports.json (source Sport)",
        local_check=_check_sports_json,
        note="Les evenements Sport sont maintenus dans calendar_core/data/sports.json.",
    ),
    Source(
        name="fr.wikipedia.org - API (elections)",
        url="https://fr.wikipedia.org/w/api.php",
        params={
            "action": "query",
            "titles": "Élections municipales françaises de 2026",
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "format": "json",
            "formatversion": "2",
        },
        expected_keys=["query"],
        note="Source des prochaines elections (scraping MediaWiki).",
    ),
    Source(
        name="education.gouv.fr - BO n36 (calendrier examens)",
        url=f"https://www.education.gouv.fr/bo/{YEAR - 1}/Hebdo36/",
        expected_status=200,
        note="Source utilisee par le provider Examens (fallback possible si page indisponible).",
    ),
    Source(
        name="geo.api.gouv.fr - Communes (recherche zone par ville)",
        url="https://geo.api.gouv.fr/communes",
        params={"nom": "Paris", "fields": "nom,codesPostaux", "format": "json", "geometry": "centre"},
        expected_status=200,
        note="Utilise par le front pour determiner la zone via une ville.",
    ),
]


@dataclass
class CheckResult:
    source: Source
    ok: bool
    status_code: int | None = None
    error: str | None = None
    latency_ms: int | None = None
    skipped: bool = False


def check_source(source: Source) -> CheckResult:
    if source.skip_ci and IS_CI:
        return CheckResult(source=source, ok=True, skipped=True)

    headers = {"User-Agent": UA}
    try:
        if source.local_check is not None:
            t0 = datetime.now()
            ok, err = source.local_check()
            latency_ms = int((datetime.now() - t0).total_seconds() * 1000)
            return CheckResult(
                source=source,
                ok=ok,
                status_code=None,
                error=err,
                latency_ms=latency_ms,
            )

        t0 = datetime.now()
        response = requests.request(
            source.method, source.url,
            params=source.params or None,
            headers=headers, timeout=TIMEOUT,
        )
        latency_ms = int((datetime.now() - t0).total_seconds() * 1000)

        if response.status_code != source.expected_status:
            return CheckResult(source=source, ok=False, status_code=response.status_code,
                               error=f"HTTP {response.status_code} (attendu {source.expected_status})", latency_ms=latency_ms)

        if source.expected_keys:
            try:
                data = response.json()
            except Exception:
                return CheckResult(source=source, ok=False, status_code=response.status_code,
                                   error="Réponse non-JSON", latency_ms=latency_ms)
            for key in source.expected_keys:
                if key not in data:
                    return CheckResult(source=source, ok=False, status_code=response.status_code,
                                       error=f"Clé JSON manquante : '{key}'", latency_ms=latency_ms)

        return CheckResult(source=source, ok=True, status_code=response.status_code, latency_ms=latency_ms)

    except requests.Timeout:
        return CheckResult(source=source, ok=False, error=f"Timeout ({TIMEOUT}s)")
    except requests.ConnectionError:
        # Ne pas logger le message d'erreur réseau brut (peut contenir des détails d'infra)
        return CheckResult(source=source, ok=False, error="Connexion impossible")
    except Exception:
        return CheckResult(source=source, ok=False, error="Erreur inattendue")


def run_checks() -> list[CheckResult]:
    return [check_source(source) for source in SOURCES]


def _sanitize_source_name(name: str) -> str:
    """Retourne un nom court sans révéler les URLs internes."""
    return name


def format_report_webhook(results: list[CheckResult]) -> str:
    """
    Rapport filtré pour le webhook Discord.
    - Pas d'URLs internes ni de traces réseau
    - Uniquement nom de la source, statut HTTP, latence
    - Note de debug volontairement courte
    """
    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    skipped = [r for r in results if r.skipped]
    active  = [r for r in results if not r.skipped]
    ok_count = sum(1 for r in active if r.ok)
    ko_count = len(active) - ok_count

    user_id = "476420730989445130"
    header  = f"<@{user_id}>\n**🩺 Health Check CalendrierFR** — `{now}`"
    ci_note = f" *(CI — {len(skipped)} ignorée(s))*" if IS_CI and skipped else ""
    summary = f"**Sources testées** : `{len(active)}`{ci_note} | **OK** : `{ok_count}` | **KO** : `{ko_count}`"

    report = f"{header}\n{summary}"

    if ko_count:
        report += "\n\n__**Erreurs :**__\n"
        for r in active:
            if not r.ok:
                # On n'expose que le nom et le code HTTP — pas l'URL ni la trace complète
                latency = f"{r.latency_ms} ms" if r.latency_ms else "—"
                http    = f"HTTP {r.status_code}" if r.status_code else "—"
                report += (
                    f"\n> ❌ **{r.source.name}**\n"
                    f"> • Statut : `{http}` · Latence : `{latency}`\n"
                    f"> • Note : {r.source.note}\n"
                )

    return report


def format_report_console(results: list[CheckResult], verbose: bool = True) -> str:
    """Rapport complet pour la console (non envoyé au webhook)."""
    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    skipped = [r for r in results if r.skipped]
    active  = [r for r in results if not r.skipped]
    ok_count = sum(1 for r in active if r.ok)
    ko_count = len(active) - ok_count

    lines = [f"Health Check — {now}", f"OK: {ok_count} / KO: {ko_count} / Ignorées: {len(skipped)}"]

    if ko_count:
        lines.append("\nErreurs détectées :")
        for r in active:
            if not r.ok:
                lines.append(f"  ✗ {r.source.name}")
                lines.append(f"    Erreur  : {r.error}")
                lines.append(f"    Latence : {r.latency_ms} ms" if r.latency_ms else "    Latence : —")
                lines.append(f"    URL     : {r.source.url}")
                lines.append(f"    Note    : {r.source.note}")

    if verbose:
        lines.append("\nDétail :")
        for r in results:
            if r.skipped:
                lines.append(f"  ⏭ {r.source.name} [ignoré CI]")
            else:
                status  = "✓" if r.ok else "✗"
                latency = f"{r.latency_ms} ms" if r.latency_ms else "—"
                lines.append(f"  {status} {r.source.name} [{latency}]")

    return "\n".join(lines)


def send_email_alert(report: str) -> None:
    dest = os.environ.get("ALERT_EMAIL", "")
    if not dest:
        print("ALERT_EMAIL non défini — mail non envoyé", file=sys.stderr)
        return

    msg = MIMEText(report, "plain", "utf-8")
    msg["Subject"] = f"[CalendrierFR] ⚠️ Source(s) en erreur — {datetime.now().strftime('%d/%m/%Y')}"
    msg["From"] = os.environ.get("SMTP_USER", "calendrier-fr@noreply")
    msg["To"]   = dest

    host     = os.environ.get("SMTP_HOST", "localhost")
    port     = int(os.environ.get("SMTP_PORT", "25"))
    user     = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")

    with smtplib.SMTP(host, port) as smtp:
        if user and password:
            smtp.login(user, password)
        smtp.sendmail(msg["From"], [dest], msg.as_bytes())

    print(f"Mail d'alerte envoyé à {dest}")


def send_webhook_alert(report: str) -> None:
    url = os.environ.get("DISCORD_WEBHOOK_URL", "") or os.environ.get("WEBHOOK_URL", "")
    if not url:
        print("WEBHOOK_URL non défini — webhook non envoyé", file=sys.stderr)
        return

    is_discord = "discord.com/api/webhooks" in url or "discordapp.com/api/webhooks" in url
    payload    = {"content": report[:1900]} if is_discord else {"text": report}

    response = requests.post(url, json=payload, timeout=10)
    response.raise_for_status()
    # Ne pas logger l'URL du webhook
    print("Webhook envoyé.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Health check des sources externes CalendrierFR")
    parser.add_argument("--notify", choices=["email", "webhook", "both"])
    parser.add_argument("--quiet",  action="store_true")
    parser.add_argument("--json",   action="store_true")
    args = parser.parse_args()

    results    = run_checks()
    has_errors = any(not r.ok and not r.skipped for r in results)

    if args.json:
        output = {
            "timestamp": datetime.now().isoformat(),
            "ci": IS_CI,
            "total":   len(results),
            "skipped": sum(1 for r in results if r.skipped),
            "ok":      sum(1 for r in results if r.ok and not r.skipped),
            "ko":      sum(1 for r in results if not r.ok and not r.skipped),
            "sources": [
                {
                    "name":        r.source.name,
                    "ok":          r.ok,
                    "skipped":     r.skipped,
                    "status_code": r.status_code,
                    # On omet l'URL et le message d'erreur réseau brut dans la sortie JSON publique
                    "error":       r.error,
                    "latency_ms":  r.latency_ms,
                    "note":        r.source.note,
                }
                for r in results
            ],
        }
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        # Rapport console complet (jamais envoyé au webhook)
        print(format_report_console(results, verbose=not args.quiet))

    if has_errors and args.notify in ("email", "both"):
        send_email_alert(format_report_console(results, verbose=True))

    if has_errors and args.notify in ("webhook", "both"):
        # Rapport webhook filtré — sans URLs ni traces réseau
        send_webhook_alert(format_report_webhook(results))

    sys.exit(1 if has_errors else 0)


if __name__ == "__main__":
    main()
