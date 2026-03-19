// Écoute les changements de l'OS en temps réel
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  // On ne change auto que si l'utilisateur n'a pas forcé le thème manuellement
  if (!localStorage.getItem(KEYS.theme)) {
    applyTheme(e.matches ? 'dark' : 'light', false);
  }
});
/**
 * theme.js — Gestion du thème (dark/light) et du mode accessibilité
 * Dépend de : utils.js (KEYS)
 */

/* ── Thème ──────────────────────────────────────────── */
function getTheme() {
  const saved = localStorage.getItem(KEYS.theme);
  return saved || (window.matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark');
}

function applyTheme(t, save = true) {
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('theme-btn');
  const lbl = document.getElementById('theme-label');
  if (btn) {
    if (t === 'dark') {
      btn.innerHTML = '<i class="fa-solid fa-sun"></i>';
      btn.setAttribute('aria-label', 'Passer en thème clair');
      btn.setAttribute('title', 'Passer en thème clair');
    } else {
      btn.innerHTML = '<i class="fa-regular fa-moon"></i>';
      btn.setAttribute('aria-label', 'Passer en thème sombre');
      btn.setAttribute('title', 'Passer en thème sombre');
    }
  }
  if (lbl) lbl.textContent = t === 'dark' ? 'Thème sombre' : 'Thème clair';
  if (save) localStorage.setItem(KEYS.theme, t);
}

document.getElementById('theme-btn').addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});
applyTheme(getTheme(), false);

/* ── Accessibilité ──────────────────────────────────── */
function getA11y() {
  try { return localStorage.getItem(KEYS.a11y) === 'on'; } catch { return false; }
}

function applyA11y(on, save = true) {
  const enabled = !!on;
  document.documentElement.setAttribute('data-accessibility', enabled ? 'on' : 'off');
  const btn = document.getElementById('a11y-btn');
  const lbl = document.getElementById('a11y-label');
  if (btn) {
    btn.classList.toggle('on', enabled);
    btn.setAttribute('aria-label', enabled ? 'Désactiver le mode accessibilité' : 'Activer le mode accessibilité');
    btn.setAttribute('title',      enabled ? 'Désactiver le mode accessibilité' : 'Activer le mode accessibilité');
  }
  if (lbl) lbl.textContent = enabled ? 'Accessibilité renforcée' : 'Accessibilité';
  if (save) { try { localStorage.setItem(KEYS.a11y, enabled ? 'on' : 'off'); } catch {} }
}

document.getElementById('a11y-btn')?.addEventListener('click', () => {
  applyA11y(document.documentElement.getAttribute('data-accessibility') !== 'on');
});
applyA11y(getA11y(), false);

/* ── Sync date (pill topbar) ────────────────────────── */
function setSyncAge(dt) {
  const el   = document.getElementById('sync-age');
  const pill = document.getElementById('sync-pill');
  if (!el) return;
  if (!dt) { el.textContent = ''; return; }
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) { el.textContent = ''; return; }
  const abs = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
  el.textContent = `· ${abs}`;
  if (pill) pill.title = `Dernière synchronisation : ${abs}`;
}

/* ── Exposer pour app.js ── */
window.setSyncAge = setSyncAge;
window.applyTheme = applyTheme;
window.applyA11y = applyA11y;