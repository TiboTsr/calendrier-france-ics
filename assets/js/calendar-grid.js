/**
 * calendar-grid.js — Vue grille mensuelle (7 colonnes × N semaines)
 *
 * Usage : appeler initCalendarGrid() après que allEvts est disponible.
 * Le composant s'injecte dans l'élément #cal-grid-root si présent.
 *
 * Intégration dans index.html :
 *   1. Ajouter <div id="cal-grid-root"></div> dans la section #explorer,
 *      après le bloc .ex-tb et avant #ev-root.
 *   2. Charger ce fichier : <script src="./assets/js/calendar-grid.js"></script>
 *   3. Appeler window.calendarGrid.render() depuis refreshAll() dans app.js.
 */

(function () {
  "use strict";

  const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const MONTHS_FR = [
    "janvier","février","mars","avril","mai","juin",
    "juillet","août","septembre","octobre","novembre","décembre",
  ];

  let _root = null;
  let _visible = false;

  // ── CSS injecté une seule fois ────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("cal-grid-styles")) return;
    const style = document.createElement("style");
    style.id = "cal-grid-styles";
    style.textContent = `
      .cg-wrap {
        margin-bottom: 13px;
        border: 1px solid var(--b);
        border-radius: var(--rl);
        background: var(--bg1);
        overflow: hidden;
      }
      .cg-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--b);
      }
      .cg-title {
        font-family: var(--ffd);
        font-size: 15px;
        font-weight: 700;
        text-transform: capitalize;
        letter-spacing: -.2px;
      }
      .cg-nav {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .cg-nav-btn {
        width: 28px; height: 28px;
        border-radius: 7px;
        border: 1px solid var(--b);
        background: var(--bg2);
        color: var(--t2);
        font-size: 14px;
        display: grid; place-items: center;
        cursor: pointer;
        transition: .15s;
      }
      .cg-nav-btn:hover { border-color: var(--acc); color: var(--acc); }
      .cg-toggle {
        font-size: 12px;
        font-weight: 600;
        padding: 5px 11px;
        border-radius: 999px;
        border: 1px solid var(--b);
        background: var(--bg2);
        color: var(--t2);
        cursor: pointer;
        transition: .15s;
      }
      .cg-toggle.on { border-color: var(--acc); background: var(--accd); color: var(--acc); }
      .cg-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
      }
      .cg-dow {
        padding: 7px 4px;
        text-align: center;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .5px;
        color: var(--t3);
        border-bottom: 1px solid var(--b);
      }
      .cg-dow:nth-child(6), .cg-dow:nth-child(7) { color: var(--acc); }
      .cg-cell {
        min-height: 64px;
        padding: 6px 5px 4px;
        border-right: 1px solid var(--b);
        border-bottom: 1px solid var(--b);
        cursor: pointer;
        transition: background .12s;
        position: relative;
        overflow: hidden;
      }
      .cg-cell:nth-child(7n) { border-right: none; }
      .cg-cell:hover { background: var(--bg2); }
      .cg-cell.cg-today { background: var(--accd); }
      .cg-cell.cg-today .cg-day-num { color: var(--acc); font-weight: 800; }
      .cg-cell.cg-other-month { opacity: .35; }
      .cg-cell.cg-weekend .cg-day-num { color: var(--acc); }
      .cg-day-num {
        font-family: var(--ffd);
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        margin-bottom: 4px;
        color: var(--t1);
      }
      .cg-dots {
        display: flex;
        flex-wrap: wrap;
        gap: 2px;
      }
      .cg-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
        cursor: pointer;
        transition: transform .1s;
      }
      .cg-dot:hover { transform: scale(1.4); }
      .cg-dot-label {
        font-size: 10px;
        line-height: 1.3;
        color: var(--t3);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }
      @media (max-width: 760px) {
        .cg-cell { min-height: 48px; padding: 4px 3px; }
        .cg-day-num { font-size: 11px; }
        .cg-dot { width: 5px; height: 5px; }
        .cg-dot-label { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Construire le HTML de la grille ──────────────────────────────────────
  function buildGrid(year, month, evts) {
    // month est 0-indexé
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Lundi = 0, Dimanche = 6
    let startOffset = (firstDay.getDay() + 6) % 7; // décaler pour commencer lundi
    const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;

    // Index des événements par date string YYYY-MM-DD
    const byDate = new Map();
    evts.forEach(e => {
      if (!e.date) return;
      const start = e.date;
      const end = e.endDate || e.date;
      // Pour les événements multi-jours, on les ajoute sur chaque jour
      const cur = new Date(start);
      while (cur <= end) {
        const key = cur.toISOString().slice(0, 10);
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key).push(e);
        cur.setDate(cur.getDate() + 1);
      }
    });

    const cells = [];
    for (let i = 0; i < totalCells; i++) {
      const dayOffset = i - startOffset;
      const cellDate = new Date(year, month, 1 + dayOffset);
      const isCurrentMonth = cellDate.getMonth() === month;
      const isToday = cellDate.getTime() === today.getTime();
      const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
      const dateKey = cellDate.toISOString().slice(0, 10);
      const dayEvts = byDate.get(dateKey) || [];

      // Max 3 dots + éventuellement un "+N"
      const dotsToShow = dayEvts.slice(0, 4);

      cells.push({
        date: cellDate,
        dateKey,
        isCurrentMonth,
        isToday,
        isWeekend,
        dayNum: cellDate.getDate(),
        evts: dayEvts,
        dotsToShow,
      });
    }
    return cells;
  }

  function renderGrid(year, month, evts, openModalFn) {
    injectStyles();

    const titleStr = `${MONTHS_FR[month]} ${year}`;

    const cells = buildGrid(year, month, evts);

    const wrap = document.createElement("div");
    wrap.className = "cg-wrap";

    // Header
    const header = document.createElement("div");
    header.className = "cg-header";
    header.innerHTML = `
      <span class="cg-title">${titleStr}</span>
      <div class="cg-nav">
        <button class="cg-nav-btn" id="cg-prev" title="Mois précédent">‹</button>
        <button class="cg-nav-btn" id="cg-next" title="Mois suivant">›</button>
      </div>
    `;
    wrap.appendChild(header);

    // Grille
    const grid = document.createElement("div");
    grid.className = "cg-grid";

    // En-têtes jours
    DAYS_FR.forEach(d => {
      const el = document.createElement("div");
      el.className = "cg-dow";
      el.textContent = d;
      grid.appendChild(el);
    });

    // Cellules
    cells.forEach(cell => {
      const el = document.createElement("div");
      el.className = "cg-cell" +
        (cell.isToday ? " cg-today" : "") +
        (!cell.isCurrentMonth ? " cg-other-month" : "") +
        (cell.isWeekend ? " cg-weekend" : "");

      const dayNum = document.createElement("div");
      dayNum.className = "cg-day-num";
      dayNum.textContent = cell.dayNum;
      el.appendChild(dayNum);

      if (cell.dotsToShow.length > 0) {
        const dots = document.createElement("div");
        dots.className = "cg-dots";
        cell.dotsToShow.forEach((ev, idx) => {
          if (idx === 3 && cell.evts.length > 4) {
            const more = document.createElement("span");
            more.className = "cg-dot-label";
            more.textContent = `+${cell.evts.length - 3}`;
            dots.appendChild(more);
            return;
          }
          const cat = (ev.categories || [])[0] || "Divers";
          const dot = document.createElement("span");
          dot.className = "cg-dot";
          dot.style.background = (window.cd ? window.cd(cat).c : "#6b8cff");
          dot.title = ev.summary;
          dot.addEventListener("click", e => {
            e.stopPropagation();
            if (openModalFn) openModalFn(ev, evts);
          });
          dots.appendChild(dot);
        });
        el.appendChild(dots);
      }

      // Clic sur la cellule → ouvre la modal du premier événement du jour
      if (cell.evts.length > 0) {
        el.addEventListener("click", () => {
          if (openModalFn) openModalFn(cell.evts[0], evts);
        });
      }

      grid.appendChild(el);
    });

    wrap.appendChild(grid);
    return { wrap, year, month };
  }

  // ── API publique ──────────────────────────────────────────────────────────
  let _year = new Date().getFullYear();
  let _month = new Date().getMonth();
  let _currentWrap = null;

  function render(year, month, evts, openModalFn) {
    _root = document.getElementById("cal-grid-root");
    if (!_root || !_visible) return;

    _year = year !== undefined ? year : _year;
    _month = month !== undefined ? month : _month;

    const { wrap } = renderGrid(_year, _month, evts, openModalFn);

    // Nav prev/next
    wrap.querySelector("#cg-prev").addEventListener("click", () => {
      _month--;
      if (_month < 0) { _month = 11; _year--; }
      render(_year, _month, evts, openModalFn);
    });
    wrap.querySelector("#cg-next").addEventListener("click", () => {
      _month++;
      if (_month > 11) { _month = 0; _year++; }
      render(_year, _month, evts, openModalFn);
    });

    _root.innerHTML = "";
    _root.appendChild(wrap);
    _currentWrap = wrap;
  }

  function toggle(year, month, evts, openModalFn) {
    _visible = !_visible;
    if (_visible) {
      render(year, month, evts, openModalFn);
    } else {
      _root = document.getElementById("cal-grid-root");
      if (_root) _root.innerHTML = "";
    }
    return _visible;
  }

  window.calendarGrid = { render, toggle, isVisible: () => _visible };

  
})();


