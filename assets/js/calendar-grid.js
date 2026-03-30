/**
 * calendar-grid.js — Rendu de la vue Grille Mensuelle
 * Dépend de : utils.js, state.js
 */

const W_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MO_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function getIsoDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function renderCalendarGrid() {
  const root = document.getElementById('grid-root');
  if (!root) return;

  const year = window.STATE?.curYear;
  if (!year) return;

  const evMap = {};

  const eventsForYear = (window.STATE.srcEvts || []).filter(e => {
    if (!e || !e._date) return false;
    const sy = e._date.getFullYear();
    const ey = e._endDate ? e._endDate.getFullYear() : sy;
    return sy === year || ey === year;
  });

  eventsForYear.forEach(e => {
    const start = new Date(e._date);
    const end = e._endDate ? new Date(e._endDate) : new Date(e._date);

    let cur = new Date(start);
    while (cur <= end) {
      const k = getIsoDateStr(cur);
      if (!evMap[k]) evMap[k] = [];
      evMap[k].push(e);
      cur.setDate(cur.getDate() + 1);
    }
  });

  const todayStr = getIsoDateStr(new Date());
  let html = '';

  for (let m = 0; m < 12; m++) {
    const firstDay = new Date(year, m, 1);
    const lastDay = new Date(year, m + 1, 0);
    const numDays = lastDay.getDate();

    let startOffset = firstDay.getDay() - 1;
    if (startOffset === -1) startOffset = 6;

    let bodyHtml = '';

    for (let i = 0; i < startOffset; i++) {
      bodyHtml += `<div class="g-day empty"></div>`;
    }

    for (let d = 1; d <= numDays; d++) {
      const curDate = new Date(year, m, d);
      const k = getIsoDateStr(curDate);
      const isToday = k === todayStr ? 'today' : '';

      let evHtml = '';
      if (evMap[k]) {
        const uniqueEvts = Array.from(new Set(evMap[k].map(e => e.summary)))
          .map(title => evMap[k].find(e => e.summary === title));

        uniqueEvts.forEach(e => {
          const cats = Array.isArray(e.categories) ? e.categories : [];
          const catName = cats.length > 0 ? cats[0] : 'Dates spéciales';

          const def = window.cd ? window.cd(catName) : { c: '#6b8cff', d: 'rgba(107,140,255,.12)' };
          const titleEscaped = window.escHtml ? window.escHtml(e.summary) : e.summary;

          evHtml += `<div class="g-ev" style="background:${def.d}; color:${def.c};" title="${titleEscaped}">${titleEscaped}</div>`;
        });
      }

      bodyHtml += `
        <div class="g-day ${isToday}">
          <div class="g-num">${d}</div>
          ${evHtml}
        </div>`;
    }

    const totalCells = startOffset + numDays;
    const endOffset = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 0; i < endOffset; i++) {
      bodyHtml += `<div class="g-day empty"></div>`;
    }

    html += `
      <div class="grid-month">
        <div class="grid-mhead">${MO_NAMES[m]} ${year}</div>
        <div class="grid-days-head">${W_DAYS.map(w => `<div>${w}</div>`).join('')}</div>
        <div class="grid-body">${bodyHtml}</div>
      </div>`;
  }

  root.innerHTML = html;
}

window.renderCalendarGrid = renderCalendarGrid;