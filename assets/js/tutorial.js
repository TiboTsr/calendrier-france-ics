/**
 * tutorial.js — Tutoriel interactif (Version Ultra Clean)
 * Dépend de : utils.js (KEYS)
 */

(function () {
  const PAD = 10;
  const TOPBAR = 60;
  const GAP = 16;

  const STEPS = [
    {
      sel: "#tp-simple .sp",
      icon: '<i class="fa-solid fa-bolt" style="color: #3ecf8e;"></i>',
      title: "Synchronisation instantanée",
      desc: 'Choisissez votre appli (Apple, Google, Outlook), copiez le lien et cliquez sur "S\'abonner". Le calendrier se mettra à jour tout seul.',
      onEnter() {
        document.querySelector('[data-t="simple"]')?.click();
        document.querySelector("#sync")?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    },
    {
      sel: "#zone .zone-sec",
      icon: '<i class="fa-solid fa-location-dot" style="color: #6b8cff;"></i>',
      title: "Quelle est votre zone ?",
      desc: "Tapez le nom de votre ville. Le calendrier s'adaptera automatiquement pour afficher vos bonnes dates de vacances scolaires.",
      placement: "above",
      onEnter() {
        document.querySelector("#zone")?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    },
    {
      sel: "#tp-advanced .adv",
      icon: '<i class="fa-solid fa-sliders" style="color: #a78bfa;"></i>',
      title: "Du sur-mesure",
      desc: "Multi-zones, choix des catégories, ajout de vos propres événements... L'onglet Avancé vous permet de créer un calendrier unique.",
      onEnter() {
        document.querySelector('[data-t="advanced"]')?.click();
        document.querySelector("#sync")?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    },
    {
      sel: "#explorer .sidebar",
      icon: '<i class="fa-solid fa-filter" style="color: #f5a020;"></i>',
      title: "Filtrez en un clic",
      desc: "Désactivez ce qui ne vous intéresse pas (ex: jours fériés, fêtes). Le calendrier s'allège en temps réel.",
      onEnter() {
        document.querySelector('[data-t="simple"]')?.click();
        document.querySelector("#explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    },
    {
      sel: "#explorer .radar",
      icon: '<i class="fa-solid fa-satellite-dish" style="color: #ff5a5a;"></i>',
      title: "Le Radar des événements",
      desc: "Visualisez rapidement ce qui arrive ou ce qui est en cours. Cliquez sur une carte pour voir tout l'historique d'un événement.",
      onEnter() {
        document.querySelector("#explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    },
    {
      sel: '.ev-row',
      icon: '<i class="fa-solid fa-arrow-right" style="color: #60a5fa;"></i>',
      title: "Voir la page dédiée",
      desc: "Cliquez sur un événement pour ouvrir le popup avec les infos rapides, puis cliquez sur 'Voir la page dédiée' pour accéder à la page complète avec tous les détails : conditions du week-end, saison, durée exacte, récurrences, et bien plus.",
      onEnter() {
        document.querySelector("#explorer")?.scrollIntoView({ behavior: "smooth", block: "center" });
        
        setTimeout(() => {
          // Chercher le premier .mo-block qui n'est pas passé
          const futureBlocks = Array.from(document.querySelectorAll('.mo-block')).filter(block => {
            return !block.classList.contains('past');
          });
          
          if (futureBlocks.length > 0) {
            const firstEvent = futureBlocks[0].querySelector('.ev-row');
            if (firstEvent) {
              firstEvent.scrollIntoView({ behavior: "smooth", block: "center" });
              setTimeout(() => firstEvent.click(), 1500);
            }
          }
        }, 300);
      },
    },
    {
      sel: ".faq-grid > div:first-child, .faq-grid", 
      icon: '<i class="fa-solid fa-circle-question" style="color: #22d3ee;"></i>',
      title: "Une question ? La FAQ !",
      desc: "Un problème de synchronisation ? Retrouvez ici toutes les réponses aux questions les plus posées.",
      onEnter() {
        const faqEl = document.querySelector(".faq-grid");
        faqEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    },
    {
      sel: "footer a[href='/proposer']",
      icon: '<i class="fa-solid fa-bug" style="color: #ef4444;"></i>',
      title: "Signaler un problème",
      desc: "Vous avez trouvé une erreur ou une date incorrecte ? Vous voulez nous soumettre des idées ? Utilisez le lien 'Signaler une erreur' pour nous aider à améliorer le calendrier.",
      placement: "above",
      onEnter() {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      },
    },
    {
      sel: "body",
      placement: "center",
      icon: '<i class="fa-solid fa-hand-sparkles" style="color: #facc15;"></i>',
      title: "Bonne visite !",
      desc: "Votre agenda est prêt. N'hésitez pas à nous contacter pour toute suggestion. Profitez bien de votre nouveau calendrier !",
      isLast: true,
      onEnter() {
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
    },
  ];

  let step = 0;
  let rafId = null;
  const overlay = document.getElementById("tuto-overlay");
  const spot = document.getElementById("tuto-spot");
  const card = document.getElementById("tuto-card");
  const arrow = document.getElementById("tuto-arrow");

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  function buildDots() {
    const c = document.getElementById("tuto-dots");
    if (!c) return;
    c.innerHTML = "";
    STEPS.forEach((_, i) => {
      const d = document.createElement("div");
      d.className = "tuto-dot";
      d.id = "tdot" + i;
      c.appendChild(d);
    });
  }
  
  function syncDots(s) {
    STEPS.forEach((_, i) => {
      const d = document.getElementById("tdot" + i);
      if (!d) return;
      d.className = "tuto-dot" + (i < s ? " done" : i === s ? " active" : "");
    });
  }

  function fillCard(s) {
    const st = STEPS[s];
    const stepLabel = document.getElementById("tuto-step-label");
    const icon = document.getElementById("tuto-icon");
    const title = document.getElementById("tuto-title");
    const desc = document.getElementById("tuto-desc");
    const nextBtn = document.getElementById("tuto-next-btn");
    const prevBtn = document.getElementById("tuto-prev-btn");
    
    if (stepLabel) stepLabel.textContent = `Étape ${s + 1} / ${STEPS.length}`;
    if (icon) icon.innerHTML = st.icon;
    if (title) title.textContent = st.title;
    if (desc) desc.textContent = st.desc;
    
    if (nextBtn) {
      nextBtn.innerHTML = st.isLast ? 'Terminer <i class="fa-solid fa-check"></i>' : 'Suivant <i class="fa-solid fa-arrow-right"></i>';
      nextBtn.style.background = st.isLast ? "var(--acc)" : "";
      nextBtn.style.color = st.isLast ? "#fff" : "";
    }
    
    if (prevBtn) {
      prevBtn.disabled = s === 0;
      prevBtn.style.opacity = s === 0 ? "0.3" : "1";
    }

    if (overlay) {
        overlay.style.backdropFilter = st.isLast ? "blur(4px)" : "none";
        overlay.style.transition = "backdrop-filter 0.4s ease";
    }

    syncDots(s);
  }

  function visibleRect(el) {
    const r = el.getBoundingClientRect();
    const x1 = Math.max(r.left, 0), y1 = Math.max(r.top, TOPBAR);
    const x2 = Math.min(r.right, window.innerWidth), y2 = Math.min(r.bottom, window.innerHeight);
    return x2 <= x1 || y2 <= y1 ? null : { left: x1, top: y1, right: x2, bottom: y2, width: x2 - x1, height: y2 - y1 };
  }

  function positionFrame() {
    const st = STEPS[step];
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (st.placement === "center") {
      if (spot) spot.style.display = "none";
      if (arrow) arrow.style.display = "none";
      const TW = Math.min(360, vw - 32);
      card.style.width = TW + "px";
      card.style.visibility = "hidden";
      card.style.top = "-9999px";
      const TH = card.offsetHeight || 200;
      card.style.visibility = "";
      card.style.left = (vw / 2 - TW / 2) + "px";
      card.style.top = (vh / 2 - TH / 2) + "px";
      return;
    }

    if (arrow) arrow.style.display = "block";
    const el = document.querySelector(st.sel);
    if (!el) return;
    const vis = visibleRect(el);
    if (!vis) return;
    const sx = Math.max(0, vis.left - PAD), sy = Math.max(TOPBAR, vis.top - PAD);
    const sw = Math.min(vw - sx, vis.width + PAD * 2), sh = Math.min(vh - sy, vis.height + PAD * 2);
    if (spot) {
      spot.style.display = "block";
      spot.style.left = `${sx}px`; spot.style.top = `${sy}px`; spot.style.width = `${sw}px`; spot.style.height = `${sh}px`;
    }

    const TW = Math.min(320, vw - 32);
    card.style.width = TW + "px";
    card.style.visibility = "hidden";
    card.style.top = "-9999px";
    const TH = card.offsetHeight || 200;
    card.style.visibility = "";

    const cx = sx + sw / 2, cy = sy + sh / 2;
    const spL = sx, spR = vw - sx - sw, spB = vh - sy - sh, spA = sy - TOPBAR;
    const minSide = TW + GAP + 8, minVert = TH + GAP + 8;
    const prefMap = { above: "bot", below: "top", left: "right", right: "left" };
    const pref = prefMap[st.placement] || null;
    const sides = [pref, "left", "right", "top", "bot"].filter((v, i, a) => v && a.indexOf(v) === i);
    const space = { left: spR, right: spL, top: spB, bot: spA };
    const fits = (s) => s === "left" || s === "right" ? space[s] >= minSide : space[s] >= minVert;
    const chosen = sides.find(fits) || sides.slice().sort((a, b) => space[b] - space[a])[0];

    let tx, ty;
    if (chosen === "left") { tx = sx + sw + GAP; ty = clamp(cy - TH / 2, TOPBAR + 8, vh - TH - 8); }
    if (chosen === "right") { tx = sx - GAP - TW; ty = clamp(cy - TH / 2, TOPBAR + 8, vh - TH - 8); }
    if (chosen === "top") { tx = clamp(cx - TW / 2, 16, vw - TW - 16); ty = sy + sh + GAP; }
    if (chosen === "bot") { tx = clamp(cx - TW / 2, 16, vw - TW - 16); ty = sy - GAP - TH; }
    tx = clamp(tx, 8, vw - TW - 8); ty = clamp(ty, TOPBAR + 8, vh - TH - 8);
    card.style.top = ty + "px"; card.style.left = tx + "px";

    const AS = 12;
    const midX = cx - tx - AS / 2, midY = cy - ty - AS / 2;
    if (arrow) {
      arrow.style.cssText = `position:absolute;width:${AS}px;height:${AS}px;background:var(--bg1);border:1px solid var(--ba);transform:rotate(45deg)`;
      if (chosen === "left") { arrow.style.left = -AS / 2 + "px"; arrow.style.top = clamp(midY, 16, TH - 30) + "px"; arrow.style.borderRight = "none"; arrow.style.borderTop = "none"; }
      if (chosen === "right") { arrow.style.right = -AS / 2 + "px"; arrow.style.top = clamp(midY, 16, TH - 30) + "px"; arrow.style.borderLeft = "none"; arrow.style.borderBottom = "none"; }
      if (chosen === "top") { arrow.style.top = -AS / 2 + "px"; arrow.style.left = clamp(midX, 16, TW - 30) + "px"; arrow.style.borderTop = "none"; arrow.style.borderLeft = "none"; }
      if (chosen === "bot") { arrow.style.bottom = -AS / 2 + "px"; arrow.style.left = clamp(midX, 16, TW - 30) + "px"; arrow.style.borderBottom = "none"; arrow.style.borderRight = "none"; }
    }
  }

  function startTracking() {
    cancelAnimationFrame(rafId);
    if (spot) spot.style.transition = "all 0.3s ease-out";
    if (card) card.style.transition = "top 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), left 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.3s ease, opacity 0.3s ease";
    function loop() {
      if (!overlay?.classList.contains("visible")) return;
      positionFrame();
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
  }

  function stopTracking() { cancelAnimationFrame(rafId); }

  function showStep(s) {
    step = s;
    fillCard(s);
    if (STEPS[s].onEnter) STEPS[s].onEnter();
    if (card) {
      card.style.opacity = "0";
      card.style.transform = "translateY(10px) scale(0.98)";
      setTimeout(() => { card.style.opacity = "1"; card.style.transform = "translateY(0) scale(1)"; }, 50); 
    }
    setTimeout(positionFrame, 150);
  }

  function endTuto() {
    stopTracking();
    if (overlay) {
        overlay.classList.remove("visible");
        overlay.style.backdropFilter = "none";
    }
    if (spot) spot.style.display = "none";
    if (card) card.style.display = "none";
  }

  function startTuto() {
    buildDots();
    if (overlay) overlay.classList.add("visible");
    if (card) card.style.display = "block";
    startTracking();
    showStep(0);
  }

  const helpBtn = document.getElementById("help-btn");
  if (helpBtn) {
    helpBtn.addEventListener("click", () => {
      overlay?.classList.contains("visible") ? endTuto() : startTuto();
    });
  }

  document.getElementById("tuto-skip-btn")?.addEventListener("click", endTuto);
  document.getElementById("tuto-next-btn")?.addEventListener("click", () => {
    step >= STEPS.length - 1 ? endTuto() : showStep(step + 1);
  });
  document.getElementById("tuto-prev-btn")?.addEventListener("click", () => {
    if (step > 0) showStep(step - 1);
  });

  document.addEventListener("keydown", (e) => {
    if (!overlay?.classList.contains("visible")) return;
    if (e.key === "Enter" && step >= STEPS.length - 1) endTuto();
  });

  window._startTuto = startTuto;
  window._endTuto = endTuto;

  const welcome = document.getElementById("tuto-welcome");
  document.getElementById("tuto-start")?.addEventListener("click", () => {
    if (welcome) welcome.classList.remove("visible");
    startTuto();
  });
  document.getElementById("tuto-skip-all")?.addEventListener("click", () => {
    if (welcome) welcome.classList.remove("visible");
  });
})();