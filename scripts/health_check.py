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
"""

import argparse
import json
import os
import smtplib
import sys
from dataclasses import dataclass, field
from datetime import datetime
from email.mime.text import MIMEText

import requests

TIMEOUT = 15
YEAR = datetime.now().year
UA = "CalendrierFR-HealthCheck/1.0 (+https://calendrier-fr.tibotsr.dev)"


# ── Définition des sources ────────────────────────────────────────────────────

@dataclass
class Source:
    name: str
    url: str
    method: str = "GET"
    params: dict = field(default_factory=dict)
    expected_keys: list[str] = field(default_factory=list)  # clés JSON attendues
    expected_status: int = 200
    note: str = ""  # info affichée en cas d'échec pour guider le debug


SOURCES: list[Source] = [

    # ── Vacances scolaires & examens ─────────────────────────────────────────
    Source(
        name="data.education.gouv.fr — Calendrier scolaire",
        url="https://data.education.gouv.fr/api/records/1.0/search/",
        params={"dataset": "fr-en-calendrier-scolaire", "rows": 1},
        expected_keys=["records"],
        note="Source principale des vacances scolaires. Si down, les vacances ne s'affichent plus.",
    ),

    # ── F1 Monaco ────────────────────────────────────────────────────────────
    Source(
        name="Jolpi Ergast API — Calendrier F1",
        url=f"https://api.jolpi.ca/ergast/f1/{YEAR}.json",
        expected_keys=["MRData"],
        note="Source du Grand Prix de Monaco. Miroir communautaire de l'API Ergast (originale morte en 2024).",
    ),

    # ── Wikipedia EN ─────────────────────────────────────────────────────────
    Source(
        name="Wikipedia EN API — Roland-Garros",
        url="https://en.wikipedia.org/w/api.php",
        params={
            "action": "query", "format": "json", "prop": "extracts",
            "exintro": 1, "explaintext": 1, "titles": f"{YEAR}_French_Open",
        },
        expected_keys=["query"],
        note="Source des dates de Roland-Garros.",
    ),
    Source(
        name="Wikipedia EN API — 24h du Mans",
        url="https://en.wikipedia.org/w/api.php",
        params={
            "action": "query", "format": "json", "prop": "extracts",
            "exintro": 1, "explaintext": 1, "titles": f"{YEAR}_24_Hours_of_Le_Mans",
        },
        expected_keys=["query"],
        note="Source des dates des 24h du Mans.",
    ),
    Source(
        name="Wikipedia EN API — Tour de France",
        url="https://en.wikipedia.org/w/api.php",
        params={
            "action": "query", "format": "json", "prop": "extracts",
            "exintro": 1, "explaintext": 1, "titles": f"{YEAR}_Tour_de_France",
        },
        expected_keys=["query"],
        note="Source des dates du Tour de France.",
    ),
    Source(
        name="Wikipedia EN API — Ligue 1",
        url="https://en.wikipedia.org/w/api.php",
        params={
            "action": "query", "format": "json", "prop": "extracts",
            "exintro": 1, "explaintext": 1,
            "titles": f"{YEAR}–{str(YEAR + 1)[-2:]}_Ligue_1",
        },
        expected_keys=["query"],
        note="Source des dates de la saison Ligue 1.",
    ),
    Source(
        name="Wikipedia EN API — Ligue des Champions",
        url="https://en.wikipedia.org/w/api.php",
        params={
            "action": "query", "format": "json", "prop": "extracts",
            "exintro": 1, "explaintext": 1,
            "titles": f"{YEAR}–{str(YEAR + 1)[-2:]}_UEFA_Champions_League",
        },
        expected_keys=["query"],
        note="Source des dates de la Ligue des Champions.",
    ),

    # ── Wikipedia FR ─────────────────────────────────────────────────────────
    Source(
        name="Wikipedia FR API — Tournoi des Six Nations",
        url="https://fr.wikipedia.org/w/api.php",
        params={
            "action": "query", "format": "json", "prop": "extracts",
            "exintro": 1, "explaintext": 1,
            "titles": f"Tournoi_des_Six_Nations_{YEAR}",
        },
        expected_keys=["query"],
        note="Source des dates du Tournoi des Six Nations.",
    ),
    Source(
        name="Wikipedia FR API — Top 14 finale",
        url="https://fr.wikipedia.org/w/api.php",
        params={
            "action": "query", "format": "json", "prop": "extracts",
            "exintro": 1, "explaintext": 1,
            "titles": f"Championnat_de_France_de_rugby_à_XV_{YEAR - 1}-{YEAR}",
        },
        expected_keys=["query"],
        note="Source de la date de la finale du Top 14.",
    ),
    Source(
        name="Wikipedia FR API — Coupe de France de football",
        url="https://fr.wikipedia.org/w/api.php",
        params={
            "action": "query", "format": "json", "prop": "extracts",
            "explaintext": 1,
            "titles": f"Coupe_de_France_de_football_{YEAR - 1}-{YEAR}",
        },
        expected_keys=["query"],
        note="Source de la date de la finale de la Coupe de France.",
    ),

    # ── Bulletin Officiel — Examens ──────────────────────────────────────────
    Source(
        name="education.gouv.fr — BO n°36 (calendrier examens)",
        url=f"https://www.education.gouv.fr/bo/{YEAR - 1}/Hebdo36/",
        expected_status=200,
        note=(
            "Page index du BO n°36 contenant les dates d'examens de l'année suivante. "
            f"Si 403, ajouter manuellement les dates {YEAR + 1} dans KNOWN_DATES de providers.py."
        ),
    ),
]


# ── Résultat d'un check ───────────────────────────────────────────────────────

@dataclass
class CheckResult:
    source: Source
    ok: bool
    status_code: int | None = None
    error: str | None = None
    latency_ms: int | None = None


# ── Logique de vérification ───────────────────────────────────────────────────

def check_source(source: Source) -> CheckResult:
    headers = {"User-Agent": UA}
    try:
        t0 = datetime.now()
        response = requests.request(
            source.method,
            source.url,
            params=source.params or None,
            headers=headers,
            timeout=TIMEOUT,
        )
        latency_ms = int((datetime.now() - t0).total_seconds() * 1000)

        if response.status_code != source.expected_status:
            return CheckResult(
                source=source,
                ok=False,
                status_code=response.status_code,
                error=f"HTTP {response.status_code} (attendu {source.expected_status})",
                latency_ms=latency_ms,
            )

        if source.expected_keys:
            try:
                data = response.json()
            except Exception:
                return CheckResult(
                    source=source, ok=False,
                    status_code=response.status_code,
                    error="Réponse non-JSON",
                    latency_ms=latency_ms,
                )
            for key in source.expected_keys:
                if key not in data:
                    return CheckResult(
                        source=source, ok=False,
                        status_code=response.status_code,
                        error=f"Clé JSON manquante : '{key}'",
                        latency_ms=latency_ms,
                    )

        return CheckResult(
            source=source, ok=True,
            status_code=response.status_code,
            latency_ms=latency_ms,
        )

    except requests.Timeout:
        return CheckResult(source=source, ok=False, error=f"Timeout ({TIMEOUT}s)")
    except requests.ConnectionError as exc:
        return CheckResult(source=source, ok=False, error=f"Connexion impossible : {exc}")
    except Exception as exc:
        return CheckResult(source=source, ok=False, error=str(exc))


def run_checks() -> list[CheckResult]:
    results = []
    for source in SOURCES:
        result = check_source(source)
        results.append(result)
    return results


# ── Formatage du rapport ──────────────────────────────────────────────────────

def format_report(results: list[CheckResult], verbose: bool = True) -> str:
    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    ok_count = sum(1 for r in results if r.ok)
    ko_count = len(results) - ok_count
    user_id = "476420730989445130"
    header = f"<@{user_id}>\n**🩺 Health Check CalendrierFR** — `{now}`"
    summary = f"**Sources testées**: `{len(results)}` | **OK**: `{ok_count}` | **KO**: `{ko_count}`"
    report = f"{header}\n{summary}"
    if ko_count:
        report += "\n\n__**Erreurs détectées :**__\n"
        for r in results:
            if not r.ok:
                report += (f"\n> ❌ **{r.source.name}**\n"
                           f"> • **Erreur**: `{r.error}`\n"
                           f"> • **Latence**: `{r.latency_ms if r.latency_ms else '—'} ms`\n"
                           f"> • **URL**: <{r.source.url}>\n"
                           f"> • **Note**: {r.source.note}\n")
    if verbose:
        report += "\n\n__**Détail des sources :**__\n"
        for r in results:
            status = "✓" if r.ok else "✗"
            latency = f"{r.latency_ms} ms" if r.latency_ms else "—"
            report += f"{status} {r.source.name} [{latency}]\n"
    return report


# ── Notifications ─────────────────────────────────────────────────────────────

def send_email_alert(report: str) -> None:
    dest = os.environ.get("ALERT_EMAIL", "")
    if not dest:
        print("ALERT_EMAIL non défini — mail non envoyé", file=sys.stderr)
        return

    msg = MIMEText(report, "plain", "utf-8")
    msg["Subject"] = f"[CalendrierFR] ⚠️ Source(s) en erreur — {datetime.now().strftime('%d/%m/%Y')}"
    msg["From"] = os.environ.get("SMTP_USER", "calendrier-fr@noreply")
    msg["To"] = dest

    host = os.environ.get("SMTP_HOST", "localhost")
    port = int(os.environ.get("SMTP_PORT", "25"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")

    with smtplib.SMTP(host, port) as smtp:
        if user and password:
            smtp.login(user, password)
        smtp.sendmail(msg["From"], [dest], msg.as_bytes())

    print(f"Mail d'alerte envoyé à {dest}")


def send_webhook_alert(report: str) -> None:
    url = os.environ.get("DISCORD_WEBHOOK_URL", "") or os.environ.get("WEBHOOK_URL", "")
    if not url:
        print("WEBHOOK_URL (ou DISCORD_WEBHOOK_URL) non défini — webhook non envoyé", file=sys.stderr)
        return

    is_discord = "discord.com/api/webhooks" in url or "discordapp.com/api/webhooks" in url
    if is_discord:
        payload = {"content": report[:1900]}
    else:
        payload = {"text": report} 

    response = requests.post(url, json=payload, timeout=10)
    response.raise_for_status()
    print(f"Webhook envoyé vers {url}")


# ── Point d'entrée ────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Health check des sources externes CalendrierFR")
    parser.add_argument(
        "--notify", choices=["email", "webhook", "both"],
        help="Envoyer une alerte si au moins une source est KO",
    )
    parser.add_argument(
        "--quiet", action="store_true",
        help="Affiche uniquement les erreurs",
    )
    parser.add_argument(
        "--json", action="store_true",
        help="Sortie JSON (pour intégration CI/monitoring)",
    )
    args = parser.parse_args()

    results = run_checks()
    has_errors = any(not r.ok for r in results)

    if args.json:
        output = {
            "timestamp": datetime.now().isoformat(),
            "total": len(results),
            "ok": sum(1 for r in results if r.ok),
            "ko": sum(1 for r in results if not r.ok),
            "sources": [
                {
                    "name": r.source.name,
                    "ok": r.ok,
                    "status_code": r.status_code,
                    "error": r.error,
                    "latency_ms": r.latency_ms,
                    "url": r.source.url,
                    "note": r.source.note,
                }
                for r in results
            ],
        }
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        report = format_report(results, verbose=not args.quiet)
        print(report)

    if has_errors and args.notify in ("email", "both"):
        report_text = format_report(results, verbose=True)
        send_email_alert(report_text)

    if has_errors and args.notify in ("webhook", "both"):
        report_text = format_report(results, verbose=False)
        send_webhook_alert(report_text)

    sys.exit(1 if has_errors else 0)


if __name__ == "__main__":
    main()
