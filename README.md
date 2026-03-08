# Calendrier Complet France 🇫🇷 (Toujours en développement)

Plateforme de calendrier personnalisable (ICS + JSON) pour la France.

## Contenu généré

- export global `calendrier.ics`
- export par zone `zone-a.ics`, `zone-b.ics`, `zone-c.ics`
- export par profil `calendrier-essentiel.ics`, `calendrier-culturel.ics`, `calendrier-commercial.ics`, `calendrier-complet.ics`
- base ouverte `calendrier.json`
- métadonnées `events-meta.json`

## Nouveautés récentes

- Frontend séparé en fichiers dédiés :
	- `index.html` (structure)
	- `assets/css/styles.css` (styles)
	- `assets/js/app.js` (logique)
- Ajout d’un écran de chargement au démarrage de l’application.
- Ajout d’un tutoriel de première visite (onboarding guidé).
- Amélioration de la recherche de zone scolaire par ville (gestion des communes homonymes).
- Améliorations UX de navigation/lecture (barres sticky, section de découverte enrichie).

## Lien public

- https://calendrier-fr.tibotsr.dev/

## Génération locale (optionnel)

```bash
python calendrier.py
```

## Structure du projet

- `calendrier.py` : point d’entrée de génération
- `calendar_core/config.py` : constantes et profils
- `calendar_core/models.py` : modèle d’événement
- `calendar_core/utils.py` : calculs de dates/utilitaires
- `calendar_core/providers.py` : sources d’événements (fériés, vacances, culture, sport, santé, etc.)
- `calendar_core/exporters.py` : sérialisation ICS
- `calendar_core/generator.py` : orchestration globale, exports et métadonnées
- `scripts/validate_ics.py` : validation automatique de syntaxe ICS
- `index.html` : page web principale
- `assets/css/styles.css` : styles de l’interface
- `assets/js/app.js` : scripts frontend (filtres, zone finder, rendu)

## Déploiement auto

Le workflow GitHub Actions publie automatiquement sur `gh-pages` :

- tous les jours (cron)
- à chaque push sur `main`
- à la demande (`workflow_dispatch`)

## API ICS dynamique (Vercel)

Pour que les options avancées (`zone`, `cats`, `alarm`) fonctionnent vraiment, une API dynamique est fournie :

- endpoint : `/api/calendrier.ics`
- implémentation : [api/calendrier.ics.js](api/calendrier.ics.js)
