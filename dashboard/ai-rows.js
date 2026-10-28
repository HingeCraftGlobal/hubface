/* airows-20261021d (Dan, Oct 21 ~9:33am ET): Moderator, Professor and the two Support companions live in the AI Assistant
   dropdown (#aiDd) instead of the dashboard widget row (#ui .blist), where their tiles sat partly off-screen.
   - CSS hides #ui .blist .build[data-bot=moderator|professor|companion-f|companion-m] (tiles stay in the DOM, just hidden).
   - Adds one .dd-row per bot right above "+ Add assistant", order: Moderator, Professor, Support companion (female), (male).
     Moderator's row comes from moderator.js (data-mod); the others are data-hfrow. Rows have no data-ai, so picking one never
     changes the selected voice assistant.
   - Clicking a row clicks that bot's hidden tile (Professor has none: HF_professor.open()), so each opens its own existing panel (professor.js / companion.js / moderator.js).
   Invite bot picker untouched. Roll back: remove the <script src="ai-rows.js"> tag. */
(function () {
  'use strict';
  if (window.__hfAiRows) return;
  var IDS = [['moderator', 'Moderator'], ['professor', 'Professor'], ['companion-f', 'Support companion (female)'], ['companion-m', 'Support companion (male)']];
  var st = document.createElement('style');
  st.textContent = IDS.map(function (b) { return '#ui .blist .build[data-bot="' + b[0] + '"]'; }).join(',') + '{display:none!important}' +
    '#aiDd{width:max-content!important;max-width:calc(100vw - 16px)}#aiDd .dd-row{white-space:nowrap}';   /* airows-20261021d: dropdown widens so every full label fits on one line */
  (document.head || document.documentElement).appendChild(st);
  function tile(id) { return document.querySelector('#ui .blist .build[data-bot="' + id + '"]'); }
  function openBot(id) { var t = tile(id); if (t) { t.click(); return; }   // professor.js has no tile: use its API
    try { if (id === 'professor' && window.HF_professor) return window.HF_professor.open(); if (window.__hfCompanion && /^companion-/.test(id)) return window.__hfCompanion.open(id); } catch (e) { console.warn('[ai-rows]', e); } }
  function rows() {
    var dd = document.getElementById('aiDd'); if (!dd) return;
    var add = dd.querySelector('.dd-row.add');
    var list = [];
    IDS.forEach(function (b) {
      var id = b[0], r = id === 'moderator' ? dd.querySelector('.dd-row[data-mod]') : dd.querySelector('.dd-row[data-hfrow="' + id + '"]');
      if (!r) { if (id === 'moderator') return; r = document.createElement('div'); r.className = 'dd-row yes'; r.setAttribute('data-hfrow', id); r.setAttribute('role', 'option'); r.textContent = b[1]; r.title = b[2] || b[1];
        r.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); openBot(id); }, true); }
      list.push(r);
    });
    var ok = list.every(function (r, i) { return r.parentNode === dd && r.nextSibling === (list[i + 1] || add); });
    if (!ok) list.forEach(function (r) { dd.insertBefore(r, add || null); });   // fixed order, right above + Add assistant
  }
  /* keep the widened dropdown on screen */
  /* aipicker1-20261027 (Dan): open the picker right beside the AI Assistant row (left = row's right edge, top = row's top, flowing down),
     moved up if it would run off the bottom of the window. Rollback: ai-rows.js.bak-aipicker1 */
  function place(d) { try { var a = document.getElementById('witAi'), u = document.getElementById('ui'); if (!a || !u || !a.offsetHeight || d.parentNode !== u) return;
    var ur = u.getBoundingClientRect(), k = (ur.width / u.clientWidth) || 1, ar = a.getBoundingClientRect();
    var L = Math.round((ar.right - ur.left) / k), T = Math.round((ar.top - ur.top) / k);
    var h = d.offsetHeight * k; if (ar.top + h > innerHeight - 8) T = Math.round(Math.max(8 - ur.top, innerHeight - 8 - h - ur.top) / k);
    if (d.style.left !== L + 'px') d.style.setProperty('left', L + 'px', 'important'); if (d.style.top !== T + 'px') d.style.setProperty('top', T + 'px', 'important'); } catch (e) {} }
  function clamp() { var d = document.getElementById('aiDd'); if (!d) return; d.style.translate = ''; if (!d.classList.contains('open')) return; place(d); var b = d.getBoundingClientRect(), dx = 0;
    if (b.right > innerWidth - 8) dx = innerWidth - 8 - b.right; if (b.left + dx < 8) dx = 8 - b.left; if (dx) { var k = d.offsetWidth ? b.width / d.offsetWidth : 1; d.style.translate = (dx / k) + 'px 0'; } }
  setInterval(function () { rows(); clamp(); }, 250); rows(); addEventListener('resize', clamp);
  window.__hfAiRows = { build: 'airows-20261021d', ids: IDS.map(function (b) { return b[0]; }) };
})();
