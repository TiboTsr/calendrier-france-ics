/**
 * state.js — État global de l'application
 * Objet unique muté par les différents modules.
 * Chargé après utils.js.
 */

const STATE = {
  // Données brutes depuis le JSON
  srcEvts: [],

  // Événements approximatifs (upcoming[]) — affichés sur le site, jamais dans l'ICS
  upcomingEvts: [],

  // Données filtrées (recalculées à chaque refreshAll)
  allEvts: [],

  // Navigation explorateur
  curYear:  new Date().getFullYear(),
  curMonth: 'all', // 'all' ou index 0-11
  showPast: false,

  // Rendu incrémental (infinite scroll)
  renderedMonths: 0,

  // Filtre zone sidebar
  expZone: 'all',

  // Clé de dernier rendu (pour le diff léger)
  lastRefreshKey: '',
};