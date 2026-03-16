# TODO — Calendrier France

---

## 🔴 Bugs critiques

- [x] **DTEND pas incrémenté d'un jour** (`exporters.py`) — corrigé : `event.end + timedelta(days=1)` dans `serialize_calendar()`.
- [x] **Vacances scolaires finissent 1 jour trop tôt** (`providers.py`) — corrigé : `end - timedelta(days=1)` dans `build_vacation_events` + `+1` dans `exporters.py`.
- [x] **ID `#today-marker` dupliqué dans le DOM** (`app.js`) — corrigé : flag `todayMarkerPlaced` dans `buildMoBlock()`.
- [x] **XSS dans `buildMoBlock()`** (`app.js`) — corrigé : `_escHtml(ev.summary)` partout.
- [x] **Route catch-all dans `vercel.json`** — corrigée : règle `"/(.*)"` supprimée.
- [x] **Collisions de UID possibles** (`api/calendrier.ics.js`) — corrigé : FNV-32 → SHA-256 async avec fallback.
- [x] **`scrollToToday()` peu fiable** (`app.js`) — corrigé : double `requestAnimationFrame`.
- [x] **`initMoSelect()` mobile se crée avec 0 options** (`app.js`) — corrigé : appelé en fin de `renderTL()`.
- [ ] **Doublon du 8 mai** (`providers.py`) — `holidays` génère "Fête de la Victoire" ET `build_base_events` ajoute "Victoire 1945 — Capitulation…" le même jour. Supprimer l'entrée manuelle dans `build_base_events`.

---

## 🟠 Warnings

- [x] **USNO API bloquée depuis GitHub Actions** (`health_check.py`) — corrigé : `skip_ci=True` sur la source USNO, détection via variable `CI`.
- [x] **Événements perso sérialisés en JSON dans l'URL** (`app.js`) — corrigé : avertissement visuel `_checkPeUrlLength()` quand l'URL dépasse 2000 chars.
- [x] **Appels Wikipedia/sports synchrones et en série** (`providers.py`) — corrigé : `ThreadPoolExecutor` dans `_fetch_sports_dates()` et `_fetch_football_periods()`.
- [x] **Fallback phases lunaires peut produire des doublons** (`utils.py`) — corrigé : dict `seen_phases` avec fenêtre de 2 jours.
- [ ] **`responsive.css` introuvable** (`index.html`) — le fichier est importé mais absent du projet. 404 silencieux qui dégrade le layout mobile. À vérifier : s'assurer qu'il est bien déployé avec le reste.

---

## 🚀 Performances

- [x] **`getFiltered()` reparse les dates à chaque appel** (`app.js`) — corrigé : `_date`/`_endDate` pré-calculés au chargement, `getFiltered()` utilise ces champs directement.
- [x] **`refreshAll()` reconstruit tout le DOM à chaque filtre** (`app.js`) — corrigé : clé de cache `_lastRefreshKey`, skip du rendu si rien n'a changé.
- [x] **Boucle palindromes inutile** (`providers.py`) — corrigé : `_find_palindromes_for_year()` itère sur 12×31 jours max au lieu de 365.
- [x] **Pas de cache pour les appels Wikipedia** (`providers.py`) — corrigé : cache JSON TTL 7 jours dans `/tmp/calendrier_fr_wiki_cache/`.

---

## 💡 Idées d'amélioration

### Frontend / UX
- [x] **Vue calendrier mensuel en grille** — `calendar-grid.js` créé, à inclure dans `index.html` et intégrer à `refreshAll()`.
- [x] **Navigation clavier dans la modal** (`app.js`) — ←/→ entre occurrences, clic sur prev/next, cursor pointer.
- [ ] **Prévisualisation live dans l'explorateur** — quand l'utilisateur configure son abonnement en mode avancé, appliquer les filtres en temps réel sur l'explorateur en bas de page.
- [x] **Partage de config via URL** (`app.js`) — `copyShareUrl()` encode la config en hash URL, restauration au chargement.
- [ ] **Export PDF / impression** — vue mensuelle propre du mois sélectionné avec les événements filtrés.
- [x] **Compteur de jours jusqu'au prochain férié / vacances** (`app.js`) — widget `#r-countdown` dans le radar.

### Backend / Données
- [x] **Calcul automatique des ponts** (`providers.py`) — fériés mardi/jeudi → événement "Pont possible" lundi/vendredi.
- [x] **Jours fériés Alsace-Moselle** (`providers.py` + `zone-departments.json`) — zone "AM" ajoutée (depts 57, 67, 68), Vendredi Saint + 26 décembre.
- [ ] **Endpoint `/api/today.json` opérationnel** — le fichier existe mais est vide. Retourner les événements du jour pour widgets homescreen, bots Discord, dashboards.
- [x] **Appels Wikipedia en parallèle** (`providers.py`) — `ThreadPoolExecutor`.

### SEO / Distribution
- [x] **Pages dédiées par événement** — `api/event-page.js` créé, route `/ferie/[slug]` dans `vercel.json`, Schema.org `Event` complet.

---

## 🎨 UX / HTML

- [ ] **Doublon 8 mai dans la timeline** (`providers.py`) — "Fête de la Victoire" et "Victoire 1945 — Capitulation…" s'affichent deux fois le même jour. Supprimer l'entrée manuelle dans `build_base_events`.
- [ ] **Bouton "Partager ma config" mal placé** (`index.html`) — actuellement tout en haut du panneau avancé. Déplacer juste après `#adv-generate`, quand l'URL est déjà générée.
- [ ] **Aucun CTA après le finder de zone** (`app.js`) — l'utilisateur trouve "Zone B" mais rien ne lui propose de s'abonner. Ajouter un bouton "S'abonner à la Zone B" dans `renderZoneSingleResult()`.
- [ ] **Label "Aujourd'hui" trompeur dans la modal** (`index.html`) — affiche la date de l'occurrence cliquée, pas la date du jour. Renommer en "Cette occurrence".
- [ ] **Zone "AM" non expliquée** (`index.html`) — le bouton affiche juste "AM". Renommer en "Alsace-Moselle" ou ajouter `title="Alsace-Moselle (depts 57, 67, 68)"`.
- [ ] **Section "Tout ce dont vous avez besoin" redondante** (`index.html`) — les 4 cartes features répètent les pills de la hero. Supprimer ou déplacer dans le footer.
- [ ] **URL webcal illisible dans le panneau Simple** (`index.html`) — masquer l'URL par défaut, n'afficher que le bouton S'abonner, avec un lien "Voir le lien" pour les curieux.
- [ ] **Différence Simple/Avancé pas expliquée** (`index.html`) — remplacer le sous-titre par "Simple = tout le calendrier · Avancé = choisir ses zones et catégories".
- [ ] **Aucun feedback après clic sur S'abonner** (`app.js`) — ajouter un message "Normalement votre appli calendrier s'est ouverte — confirmez l'ajout pour terminer." après le clic sur `#sub-btn`.
- [ ] **Popup tutoriel intrusive** (`app.js`) — s'affiche automatiquement au premier chargement et bloque le contenu. Rendre opt-in : lien "? Aide" dans le header plutôt que popup automatique.
- [ ] **Scroll hint inutile** (`index.html`) — supprimer le bloc `.scroll-hint` ("Défiler pour continuer" + flèche animée).
- [ ] **Footer vide** (`index.html`) — ajouter : lien ICS direct, date de dernière mise à jour des données, lien "Signaler une erreur", mention des sources officielles.
- [ ] **Compteur prochain férié dans la hero** (`index.html`) — remonter le widget countdown depuis le radar vers la section hero, visible dès l'arrivée sur le site.