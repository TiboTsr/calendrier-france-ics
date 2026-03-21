/**
 * tutorial.js — Tutoriel opt-in via bouton ? dans la topbar
 * Dépend de : utils.js (KEYS)
 *
 * CHANGEMENT UX Sprint 4 :
 * - Le tutoriel ne s'affiche PLUS automatiquement à la première visite
 * - Un bouton "?" (#help-btn) dans la topbar permet de l'ouvrir à tout moment
 * - La popup de bienvenue est supprimée (trop intrusive)
 */

(function () {
  const PAD    = 10;
  const TOPBAR = 60;
  const GAP    = 16;

  const STEPS = [
    {
      sel:   '#tp-simple .sp',
      icon:  '<i class="fa-solid fa-bolt"></i>',
      title: 'Synchronisez votre agenda',
      desc:  "Choisissez votre appli (iPhone, Google, Outlook), copiez le lien et cliquez \"S'abonner\". Le calendrier se mettra à jour tout seul, pour toujours.",
      onEnter() {
        document.querySelector('[data-t="simple"]')?.click();
        document.querySelector('#sync').scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    },
    {
      sel:   '#zone .zone-sec',
      icon:  '<i class="fa-solid fa-location-dot"></i>',
      title: 'Trouvez votre zone scolaire',
      desc:  'Tapez votre ville pour savoir si vous êtes Zone A, B ou C. Indispensable pour les bonnes vacances scolaires.',
      placement: 'above',
      onEnter() { document.querySelector('#zone').scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    },
    {
      sel:   '#tp-advanced .adv',
      icon:  '<i class="fa-solid fa-sliders"></i>',
      title: 'Personnalisez votre abonnement',
      desc:  "Profil, zones multiples, catégories à la carte, événements personnels — tout se configure ici dans l'onglet Avancé.",
      onEnter() {
        document.querySelector('[data-t="advanced"]')?.click();
        document.querySelector('#sync').scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    },
    {
      sel:   '#explorer .sidebar',
      icon:  '<i class="fa-solid fa-tags"></i>',
      title: 'Filtrez par catégorie',
      desc:  "Activez ou désactivez les catégories pour n'afficher que les événements qui vous intéressent. Les changements sont immédiats.",
      onEnter() {
        document.querySelector('[data-t="simple"]')?.click();
        document.querySelector('#explorer').scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    },
    {
      sel:    '#explorer .radar',
      icon:   '<i class="fa-solid fa-satellite-dish"></i>',
      title:  'Les prochains événements',
      desc:   "Le radar sépare les événements à venir et ceux en cours. Cliquez sur une carte pour voir la fiche détaillée avec occurrences passées et futures.",
      isLast: true,
      onEnter() { document.querySelector('#explorer').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    },
  ];

  let step    = 0;
  let rafId   = null;
  const overlay = document.getElementById('tuto-overlay');
  const spot    = document.getElementById('tuto-spot');
  const card    = document.getElementById('tuto-card');
  const arrow   = document.getElementById('tuto-arrow');

  // La popup de bienvenue (#tuto-welcome) n'est plus utilisée en auto — on la cache
  const welcome = document.getElementById('tuto-welcome');
  if (welcome) welcome.style.display = 'none';

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  /* Dots */
  function buildDots() {
    const c = document.getElementById('tuto-dots'); if (!c) return; c.innerHTML = '';
    STEPS.forEach((_, i) => { const d = document.createElement('div'); d.className = 'tuto-dot'; d.id = 'tdot' + i; c.appendChild(d); });
  }
  function syncDots(s) {
    STEPS.forEach((_, i) => {
      const d = document.getElementById('tdot' + i); if (!d) return;
      d.className = 'tuto-dot' + (i < s ? ' done' : i === s ? ' active' : '');
    });
  }

  /* Card content */
  function fillCard(s) {
    const st = STEPS[s];
    const stepLabel = document.getElementById('tuto-step-label');
    const icon      = document.getElementById('tuto-icon');
    const title     = document.getElementById('tuto-title');
    const desc      = document.getElementById('tuto-desc');
    const nextBtn   = document.getElementById('tuto-next-btn');
    const prevBtn   = document.getElementById('tuto-prev-btn');
    if (stepLabel) stepLabel.textContent = `Étape ${s + 1} / ${STEPS.length}`;
    if (icon)      icon.innerHTML  = st.icon;
    if (title)     title.textContent = st.title;
    if (desc)      desc.textContent  = st.desc;
    if (nextBtn)   nextBtn.innerHTML = st.isLast
      ? 'Terminer <i class="fa-solid fa-champagne-glasses"></i>'
      : 'Suivant <i class="fa-solid fa-arrow-right"></i>';
    if (prevBtn) { prevBtn.disabled = s === 0; prevBtn.style.opacity = s === 0 ? '.3' : '1'; }
    syncDots(s);
  }

  /* Positionnement */
  function visibleRect(el) {
    const r  = el.getBoundingClientRect();
    const x1 = Math.max(r.left, 0),     y1 = Math.max(r.top, TOPBAR);
    const x2 = Math.min(r.right, window.innerWidth), y2 = Math.min(r.bottom, window.innerHeight);
    return (x2 <= x1 || y2 <= y1) ? null : { left: x1, top: y1, right: x2, bottom: y2, width: x2 - x1, height: y2 - y1 };
  }

  function positionFrame() {
    const st  = STEPS[step];
    const el  = document.querySelector(st.sel); if (!el) return;
    const vis = visibleRect(el);               if (!vis) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const sx = Math.max(0, vis.left - PAD),   sy = Math.max(TOPBAR, vis.top - PAD);
    const sw = Math.min(vw - sx, vis.width + PAD * 2), sh = Math.min(vh - sy, vis.height + PAD * 2);
    spot.style.cssText = `left:${sx}px;top:${sy}px;width:${sw}px;height:${sh}px;display:block`;

    const TW = Math.min(300, vw - 32);
    card.style.width = TW + 'px';
    card.style.visibility = 'hidden'; card.style.top = '-9999px';
    const TH = card.offsetHeight || 200;
    card.style.visibility = ''; card.style.top = '';

    const cx = sx + sw / 2, cy = sy + sh / 2;
    const spL = sx, spR = vw - sx - sw, spB = vh - sy - sh, spA = sy - TOPBAR;
    const minSide = TW + GAP + 8, minVert = TH + GAP + 8;

    const prefMap = { above: 'bot', below: 'top', left: 'right', right: 'left' };
    const pref    = prefMap[st.placement] || null;
    const sides   = [pref, 'left', 'right', 'top', 'bot'].filter((v, i, a) => v && a.indexOf(v) === i);
    const space   = { left: spR, right: spL, top: spB, bot: spA };
    const fits    = s => (s === 'left' || s === 'right') ? space[s] >= minSide : space[s] >= minVert;
    const chosen  = sides.find(fits) || sides.slice().sort((a, b) => space[b] - space[a])[0];

    let tx, ty;
    if (chosen === 'left')  { tx = sx + sw + GAP; ty = clamp(cy - TH / 2, TOPBAR + 8, vh - TH - 8); }
    if (chosen === 'right') { tx = sx - GAP - TW; ty = clamp(cy - TH / 2, TOPBAR + 8, vh - TH - 8); }
    if (chosen === 'top')   { tx = clamp(cx - TW / 2, 16, vw - TW - 16); ty = sy + sh + GAP; }
    if (chosen === 'bot')   { tx = clamp(cx - TW / 2, 16, vw - TW - 16); ty = sy - GAP - TH; }
    tx = clamp(tx, 8, vw - TW - 8); ty = clamp(ty, TOPBAR + 8, vh - TH - 8);
    card.style.top = ty + 'px'; card.style.left = tx + 'px';

    const AS = 12;
    const midX = cx - tx - AS / 2, midY = cy - ty - AS / 2;
    arrow.style.cssText = `position:absolute;width:${AS}px;height:${AS}px;background:var(--bg1);border:1px solid var(--ba);transform:rotate(45deg)`;
    if (chosen === 'left')  { arrow.style.left = (-AS/2)+'px'; arrow.style.top = clamp(midY,16,TH-30)+'px'; arrow.style.borderRight='none'; arrow.style.borderTop='none'; }
    if (chosen === 'right') { arrow.style.right = (-AS/2)+'px'; arrow.style.top = clamp(midY,16,TH-30)+'px'; arrow.style.borderLeft='none'; arrow.style.borderBottom='none'; }
    if (chosen === 'top')   { arrow.style.top = (-AS/2)+'px'; arrow.style.left = clamp(midX,16,TW-30)+'px'; arrow.style.borderTop='none'; arrow.style.borderLeft='none'; }
    if (chosen === 'bot')   { arrow.style.bottom = (-AS/2)+'px'; arrow.style.left = clamp(midX,16,TW-30)+'px'; arrow.style.borderBottom='none'; arrow.style.borderRight='none'; }
  }

  function startTracking() {
    cancelAnimationFrame(rafId);
    spot.style.transition = 'none'; card.style.transition = 'none';
    function loop() { if (!overlay?.classList.contains('visible')) return; positionFrame(); rafId = requestAnimationFrame(loop); }
    rafId = requestAnimationFrame(loop);
  }

  function stopTracking() { cancelAnimationFrame(rafId); }

  function showStep(s) {
    step = s; fillCard(s);
    if (STEPS[s].onEnter) STEPS[s].onEnter();
    setTimeout(positionFrame, 120);
  }

  function endTuto() {
    stopTracking();
    if (overlay) overlay.classList.remove('visible');
    if (spot)    spot.style.display = 'none';
    if (card)    card.style.display = 'none';
    // On ne sauvegarde plus "tuto vu" — il reste accessible à tout moment via le bouton ?
  }

  function startTuto() {
    buildDots();
    if (overlay) overlay.classList.add('visible');
    if (card)    card.style.display = 'block';
    startTracking();
    showStep(0);
    // Scroll en haut pour commencer depuis le début
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── Bouton ? dans la topbar ── */
  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      // Si le tuto est déjà ouvert, le fermer
      if (overlay?.classList.contains('visible')) {
        endTuto();
      } else {
        startTuto();
      }
    });
  }

  /* ── Boutons internes du tuto ── */
  document.getElementById('tuto-skip-btn')?.addEventListener('click', endTuto);
  document.getElementById('tuto-next-btn')?.addEventListener('click', () => {
    step >= STEPS.length - 1 ? endTuto() : showStep(step + 1);
  });
  document.getElementById('tuto-prev-btn')?.addEventListener('click', () => {
    if (step > 0) showStep(step - 1);
  });

  // Fermer avec Échap
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay?.classList.contains('visible')) endTuto();
  });

  /* ── API publique ── */
  // Exposé pour rétrocompatibilité (utilisé dans certains boutons inline)
  window._startTutoIfNeeded = function () { startTuto(); };
  window._startTuto         = startTuto;
  window._endTuto           = endTuto;

  /* ── Anciens boutons de la popup de bienvenue (conservés pour compatibilité) ── */
  // #tuto-start et #tuto-skip-all ne sont plus affichés mais peuvent encore exister dans le DOM
  document.getElementById('tuto-start')?.addEventListener('click', startTuto);
  document.getElementById('tuto-skip-all')?.addEventListener('click', () => {
    if (welcome) welcome.style.display = 'none';
  });

})();