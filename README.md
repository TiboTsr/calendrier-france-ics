# Calendrier Complet France 🇫🇷

Ce projet génère un calendrier complet pour la France incluant :

# Calendrier Complet France 🇫🇷

Plateforme de calendrier personnalisable (ICS + JSON) avec :

- export global `calendrier.ics`
- export par zone `zone-a.ics`, `zone-b.ics`, `zone-c.ics`
- export par profil de bruit `calendrier-essentiel.ics`, `calendrier-culturel.ics`, `calendrier-commercial.ics`, `calendrier-complet.ics`
- base ouverte `calendrier.json`
- méta changements `events-meta.json`

## Lien public

- https://calendrier-fr.tibotsr.dev/

## Génération locale

```bash
python calendrier.py
```

## Structure du projet

- `calendrier.py` : point d’entrée
- `calendar_core/config.py` : constantes et profils
- `calendar_core/models.py` : modèle d’événement
- `calendar_core/utils.py` : calculs de dates/utilitaires
- `calendar_core/providers.py` : sources d’événements (fériés, vacances, culture, sport, santé, etc.)
- `calendar_core/exporters.py` : sérialisation ICS
- `calendar_core/generator.py` : orchestration globale, exports et métadonnées
- `scripts/validate_ics.py` : validation automatique de syntaxe ICS

## Déploiement auto

Le workflow GitHub Actions publie automatiquement sur `gh-pages` :

- tous les jours (cron)
- à chaque push sur `main`
- à la demande (`workflow_dispatch`)