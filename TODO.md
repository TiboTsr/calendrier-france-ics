# TODO — Calendrier France

---

## 🔴 Bugs critiques

- [ ] **DTEND pas incrémenté d'un jour** (`exporters.py`) — RFC 5545 impose une date de fin exclusive (lendemain). Tous les événements durent 1 jour de moins dans Google/Apple Calendar. Fix : `event.end + timedelta(days=1)` dans `serialize_calendar()`.
- [ ] **Vacances scolaires finissent 1 jour trop tôt** (`providers.py`) — le code soustrait déjà 1 jour à la date de fin de l'API, puis `serialize_calendar` n'ajoute pas le +1 RFC 5545. Fix global : ne pas soustraire dans `build_vacation_events`, et corriger `serialize_calendar` (lié au bug précédent).
- [ ] **ID `#today-marker` dupliqué dans le DOM** (`app.js` — `buildMoBlock()`) — quand un événement tombe exactement sur `today`, il peut apparaître dans les deux branches past/future, produisant deux éléments avec le même id. HTML invalide + scroll cassé. Fix : utiliser un flag booléen pour n'injecter le marqueur qu'une seule fois.
- [ ] **XSS dans `buildMoBlock()`** (`app.js`) — `ev.summary` est injecté via `innerHTML` sans `_escHtml()`. Fix : remplacer `${ev.summary}` par `${_escHtml(ev.summary)}` dans tous les templates innerHTML.
- [ ] **Route catch-all dans `vercel.json`** — la règle `"src": "/(.*)"` redirige tout vers la serverless function ICS, y compris les fichiers statiques. Fix : supprimer la catch-all ou ajouter des règles explicites pour les assets avant.
- [ ] **Collisions de UID possibles** (`api/calendrier.ics.js` — `makeUid()`) — hash FNV-1a 32 bits trop court pour des milliers d'événements. Deux événements avec le même UID = l'un écrase l'autre silencieusement. Fix : passer à 64 bits ou `crypto.subtle.digest('SHA-256')`.
- [ ] **`scrollToToday()` peu fiable** (`app.js`) — le `setTimeout(80ms)` est trop aléatoire, sur mobile lent le scroll rate sa cible. Fix : double `requestAnimationFrame` ou `scroll-into-view` natif.
- [ ] **`initMoSelect()` mobile se crée avec 0 options** (`app.js`) — appelé à `DOMContentLoaded` alors que les boutons `.mb` sont générés dynamiquement après le fetch JSON. Fix : appeler `initMoSelect()` depuis la fin de `renderTL()`.

---

## 🟠 Warnings

- [ ] **`responsive.css` introuvable** (`index.html`) — le fichier est importé dans le HTML mais absent du projet. 404 silencieux qui dégrade le layout mobile.
- [ ] **USNO API bloquée depuis GitHub Actions** (`health_check.py`) — l'USNO bloque les IPs AWS/Azure. Le health check renvoie toujours une erreur pour cette source, créant du bruit inutile dans les alertes Discord. Ajouter un flag `skip_on_ci` ou désactiver ce check.
- [ ] **Événements perso sérialisés en JSON dans l'URL** (`app.js`) — le paramètre `pe` peut dépasser les limites d'URL (2048–8192 chars selon navigateur/serveur). L'abonnement peut silently fail avec beaucoup d'événements perso.
- [ ] **Appels Wikipedia/sports synchrones et en série** (`providers.py`) — 7+ appels en séquence. Si une source est lente (timeout 15s), tout bloque. Peut dépasser 2 min de génération.
- [ ] **Fallback phases lunaires peut produire des doublons** (`utils.py`) — le calcul de secours peut détecter le même franchissement de seuil deux jours consécutifs si la phase tourne très près du seuil.

---

## 🚀 Performances

- [ ] **`getFiltered()` reparse les dates à chaque appel** (`app.js`) — `pd(e.start)` et `pd(e.end)` sont appelés sur tous les événements à chaque frappe de recherche ou changement de filtre. Fix : pré-calculer les objets `Date` une fois au chargement dans `srcEvts`.
- [ ] **`refreshAll()` reconstruit tout le DOM à chaque filtre** (`app.js`) — efface et recrée la timeline complète à chaque changement. Fix : DOM diffing partiel ou liste virtuelle.
- [ ] **Boucle palindromes inutile** (`providers.py`) — itère sur les 365 jours × N années (~30 000 itérations) alors que ces dates sont entièrement prévisibles. Fix : lookup table précalculée.
- [ ] **Pas de cache pour les appels Wikipedia** (`providers.py`) — chaque run quotidien refait tous les appels, même si les données n'ont pas changé. Fix : cache JSON avec TTL 7 jours.

---

## 💡 Idées d'amélioration

### Frontend / UX
- [ ] **Vue calendrier mensuel en grille** — en complément de la timeline, une grille 7 colonnes × N semaines avec des points colorés sur les jours avec événements. Plus naturel pour visualiser les ponts et vacances.
- [ ] **Navigation clavier dans la modal** (`app.js`) — ajouter des flèches gauche/droite (ou swipe mobile) pour naviguer vers l'occurrence précédente/suivante. Le code calcule déjà `prev` et `next`, ils sont juste non-cliquables.
- [ ] **Prévisualisation live dans l'explorateur** — quand l'utilisateur configure son abonnement en mode avancé, appliquer les filtres en temps réel sur l'explorateur en bas de page.
- [ ] **Partage de config via URL** — bouton "Partager ma config" qui encode la sélection dans le hash de l'URL (`#zone=B&cats=fériés,vacances`). Les utilisateurs pourraient s'envoyer leur config directement.
- [ ] **Export PDF / impression** — vue mensuelle propre du mois sélectionné avec les événements filtrés. Utile pour les enseignants, RH, parents.
- [ ] **Compteur de jours jusqu'au prochain férié / vacances** — petit widget dans le hero ou le radar du type "Prochain jour férié : dans 12 jours".

### Backend / Données
- [ ] **Calcul automatique des ponts** (`providers.py`) — détecter quand un férié tombe un mardi ou jeudi et générer un événement "Pont possible" pour le lundi/vendredi. C'est l'info la plus cherchée sur ce genre de site.
- [ ] **Jours fériés Alsace-Moselle** (`providers.py` + `zone-departments.json`) — ajouter une zone "AM" pour les départements 57, 67, 68 avec Vendredi Saint et 26 décembre. La lib `holidays` les supporte déjà.
- [ ] **Endpoint `/api/today.json` opérationnel** — le fichier existe mais est vide. Retourner les événements du jour pour des widgets homescreen, bots Discord, dashboards.
- [ ] **Appels Wikipedia en parallèle** (`providers.py`) — utiliser `concurrent.futures.ThreadPoolExecutor` pour faire les 7+ appels en parallèle et diviser le temps de génération par ~5.

### SEO / Distribution
- [ ] **Pages dédiées par événement** — URLs canoniques type `/ferie/paques-2026` avec rich snippets Schema.org `Event` pour améliorer l'indexation Google des événements spécifiques.