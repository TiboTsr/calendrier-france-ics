# Calendrier Complet France 🇫🇷

Ce projet génère un calendrier complet pour la France incluant :

- Jours fériés
- Fêtes chrétiennes
- Fêtes familiales
- Changement d’heure
- Événements spéciaux (Black Friday, soldes, etc.)
- Vacances scolaires pour les zones A, B et C

Le fichier `.ics` est mis à jour automatiquement grâce à GitHub Actions et est accessible publiquement via GitHub Pages.

---

## 📅 Lien pour iPhone / Google Calendar

Tu peux ajouter ce calendrier sur ton iPhone ou Google Calendar en utilisant le lien suivant :

**[Calendrier Complet France](https://tibotsr.github.io/calendrier-france-ics/calendrier.ics)**


---

## ℹ️ Instructions rapides

1. Ajouter un abonnement sur iPhone :
   - Ouvre **Calendrier → Calendriers → Ajouter un abonnement**
   - Colle le lien `.ics` ci-dessus
   - Ton calendrier se mettra à jour automatiquement chaque jour
2. Le script `generate_ics.py` régénère le fichier `.ics` avec toutes les fêtes et vacances.

---

## 💻 Génération du fichier

Pour générer localement le `.ics` (optionnel) :

```bash
python generate_ics.py