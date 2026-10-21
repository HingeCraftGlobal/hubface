/* bridge-ui-20261019a (Dan approved Oct 19 2026): HingeCraft bridge app v0.1, room UI side.
   - "+" button beside Send in Room Chat -> menu "Add a bot (bridge app)" -> card: host creates a one-use invitation (5 min, copyable),
     downloads for the bridge app (Grok / xAI), unsigned-file notes (Windows SmartScreen, macOS Gatekeeper), bots in this room, "Give floor".
   - Room roster widget gets a "Bots (bridge app)" list (maker shown as self-claimed).
   Server: POST /api/rooms/<ID>/bridge-invite (host only), GET /api/rooms/<ID>/bots, POST /api/rooms/<ID>/bridge-turn (host only).
   Roll back: remove the <script src="bridge-ui.js..."> tag from index.html. Nothing else depends on this file. */
(function () {
  'use strict';
  if (window.__bridgeUi) return;
  var RB = window.__rb, App = RB && RB.App; if (!App) return;
  var BUILD = 'bridge-ui-20261019b';
  var bots = [], floor = null, pollT = null, lastSig = '', card = null, inv = null, cdT = null;
  var DL = [
    { k: 'win', label: 'Windows (64-bit)', file: 'HingeCraft-Bridge-Grok.exe', note: 'Unsigned file: if Windows SmartScreen says \u201cWindows protected your PC\u201d, click <b>More info</b>, then <b>Run anyway</b>.' },
    { k: 'win32', label: 'Windows 32-bit', file: 'HingeCraft-Bridge-Grok-win32.exe', note: 'For older 32-bit Windows. Unsigned file: if Windows SmartScreen says \u201cWindows protected your PC\u201d, click <b>More info</b>, then <b>Run anyway</b>.' },
    { k: 'mac', label: 'Mac (Apple silicon M1\u2013M4)', file: 'HingeCraft-Bridge-Grok-mac-arm64.zip', note: 'Unsigned file: double-click the zip, then in Finder <b>right-click</b> the app file, choose <b>Open</b>, then <b>Open</b> again (Gatekeeper). It opens in Terminal.' },
    { k: 'macx', label: 'Mac (Intel)', file: 'HingeCraft-Bridge-Grok-mac-x64.zip', note: 'Same as above: unzip, then <b>right-click</b> \u2192 <b>Open</b> (Gatekeeper).' },
    { k: 'lin', label: 'Linux (x64)', file: 'HingeCraft-Bridge-Grok-linux-x64', note: 'Run <code>chmod +x</code> on it, then start it from a terminal.' }
  ];
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var RI = function () { return window.__roomId; };
  function roomId() { var r = RI(); return App.inRoom && r && r.id() ? r.id() : null; }
  function key() { try { return (App.state.room && App.state.room.roomKey) || null; } catch (_) { return null; } }
  function toast(m) { try { App.toast(m); } catch (_) {} }
  function api(method, path, body) { return fetch(path, { method: method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }).then(function (x) { return x.json().catch(function () { return {}; }).then(function (j) { return { s: x.status, j: j || {} }; }); }); }
  function css() {
    if (document.getElementById('bru-css')) return;
    var s = document.createElement('style'); s.id = 'bru-css';
    s.textContent = '.bruPlus{min-width:30px;font-weight:700;font-size:16px;line-height:1;padding:0 8px;margin-right:4px;cursor:pointer}.bruMenu{position:fixed;z-index:2147482100;min-width:210px;padding:6px;border-radius:12px;background:rgba(16,24,38,.94);border:1px solid rgba(255,255,255,.22);box-shadow:0 10px 30px rgba(0,0,0,.45);font:13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Montserrat,sans-serif;color:#fff}.bruMenu button{display:block;width:100%;text-align:left;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:#fff;font:inherit;cursor:pointer}.bruMenu button:hover{background:rgba(255,255,255,.12)}' +
      '#bruCard{position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:2147482050;width:min(520px,calc(100% - 28px));max-height:calc(100vh - 100px);overflow:auto;box-sizing:border-box;padding:16px 18px;border-radius:16px;background:rgba(14,22,36,.9);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.22);box-shadow:0 14px 40px rgba(0,0,0,.5);color:#fff;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Montserrat,sans-serif}' +
      '#bruCard h3{margin:0 0 4px;font-size:16px}#bruCard h4{margin:14px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.8}#bruCard .mut{opacity:.75;font-size:12px}#bruCard button{border-radius:9px;padding:6px 12px;font:600 12.5px/1.2 inherit;cursor:pointer;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);color:#fff}#bruCard button.pri{background:#009cfd;border-color:#009cfd}#bruCard .x{position:absolute;right:10px;top:8px;padding:2px 8px}' +
      '#bruCard textarea{width:100%;box-sizing:border-box;height:64px;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;background:rgba(0,0,0,.35);color:#e2e8f0;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:6px;resize:none;word-break:break-all}#bruCard .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px}#bruCard .dl{padding:7px 0;border-top:1px solid rgba(255,255,255,.1)}#bruCard .dl a{color:#7dd3fc;font-weight:600}#bruCard .dl .n{font-size:11.5px;opacity:.8;margin-top:2px}#bruCard code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px}#bruCard ol{margin:4px 0 0 18px;padding:0}#bruCard .bot{display:flex;gap:8px;align-items:center;padding:4px 0}#bruCard .bot b{flex:1}.bruRoster{margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12)}.bruRoster .h{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}';
    document.head.appendChild(s);
  }
  /* ---------- "+" button beside Send in Room Chat ---------- */
  function plant() {
    var inp = document.getElementById('rb_rcIn'); if (!inp) return;
    var row = inp.parentElement; if (!row || row.querySelector('.bruPlus')) return;
    css(); var b = document.createElement('button'); b.type = 'button'; b.className = 'bruPlus'; b.textContent = '+'; b.title = 'More: add a bot (bridge app)'; b.setAttribute('aria-label', 'More options'); b.setAttribute('aria-haspopup', 'menu');
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); menu(b); });
    row.insertBefore(b, inp);
  }
  function menu(anchor) {
    var old = document.querySelector('.bruMenu'); if (old) { old.remove(); return; }
    var m = document.createElement('div'); m.className = 'bruMenu'; m.setAttribute('role', 'menu');
    m.innerHTML = '<button type="button" role="menuitem" data-a="bot">\ud83e\udd16 Add a bot (bridge app)</button>';
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px'; m.style.top = Math.max(8, r.top - m.offsetHeight - 6) + 'px';
    m.addEventListener('click', function (e) { var t = e.target.closest('button'); if (!t) return; m.remove(); if (t.getAttribute('data-a') === 'bot') openCard(); });
    setTimeout(function () { document.addEventListener('click', function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', off, true); } }, true); }, 0);
  }
  /* ---------- the card ---------- */
  function dlHtml() { return DL.map(function (d) { var u = '/interface/downloads/bridge/' + d.file; return '<div class="dl"><a href="' + u + '" download>' + esc(d.label) + ' \u2014 ' + esc(d.file) + '</a><div class="n">' + d.note + '</div></div>'; }).join(''); }
  function botsHtml() {
    if (!bots.length) return '<p class="mut">No bots in this room yet.</p>';
    return bots.map(function (b) { return '<div class="bot"><b>\ud83e\udd16 ' + esc(b.display_name) + '</b><span class="mut">' + esc(b.maker_claim || 'maker unstated') + ', self-claimed \u00b7 ' + esc(b.state) + (floor === b.seat_id ? ' \u00b7 has the floor' : '') + '</span>' + (b.state !== 'disconnected' ? '<button type="button" data-floor="' + esc(b.seat_id) + '">Give floor</button>' : '') + '</div>'; }).join('');
  }
  function openCard() {
    var id = roomId(); if (!id) { toast('Enter a room first.'); return; }
    css(); if (card) card.remove();
    card = document.createElement('div'); card.id = 'bruCard'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Add a bot (bridge app)');
    card.innerHTML = '<button type="button" class="x" aria-label="Close">\u2715</button><h3>Add a bot (bridge app)</h3>' +
      '<p class="mut">A bot joins this room from its owner\u2019s own computer using the HingeCraft bridge app and the owner\u2019s own xAI API key. The key never leaves that computer. Text only. Maker names are self-claimed, not verified.</p>' +
      '<h4>1 \u00b7 Invitation (host only)</h4><div class="row"><button type="button" class="pri" data-a="mk">Create invitation</button><span class="mut bruSt"></span></div><div class="bruInv"></div>' +
      '<h4>2 \u00b7 Download the bridge app (Grok)</h4><p class="mut">One file, no installer, no account. Run it, enter your xAI API key once, paste the invitation.</p>' + dlHtml() +
      '<h4>Bots in this room</h4><div class="bruBots">' + botsHtml() + '</div>' +
      '<p class="mut" style="margin-top:10px">To give a bot the floor, start a Room Chat line with its name, e.g. \u201cGrok, what do you think?\u201d</p>';
    document.body.appendChild(card);
    ['pointerdown', 'keydown', 'keyup', 'keypress', 'dblclick', 'click', 'contextmenu'].forEach(function (ev) { card.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    card.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.classList.contains('x')) { closeCard(); return; }
      if (t.getAttribute('data-a') === 'mk') { makeInvite(); return; }
      if (t.getAttribute('data-a') === 'copy') { copy(); return; }
      var f = t.getAttribute('data-floor'); if (f) giveFloor(f);
    });
    if (inv && inv.room === id && inv.exp > Date.now()) showInvite(); poll();
  }
  function closeCard() { clearInterval(cdT); if (card) card.remove(); card = null; }
  function st(m) { var e = card && card.querySelector('.bruSt'); if (e) e.textContent = m; }
  function makeInvite() {
    var id = roomId(); if (!id) return; st('Creating\u2026');
    api('POST', '/api/rooms/' + encodeURIComponent(id) + '/bridge-invite', { key: key() }).then(function (x) {
      if (x.s === 201 && x.j.code) { inv = { room: id, code: x.j.code, exp: Date.parse(x.j.invite.expires_at) || (Date.now() + 300000) }; st(''); showInvite(); }
      else if (x.s === 403) st('Only the room host can create bot invitations (open the room on the browser that created it, or sign in as its owner).');
      else st(x.j.error || ('Could not create an invitation (HTTP ' + x.s + ').'));
    }, function () { st('No connection to HubFace.'); });
  }
  function showInvite() {
    var box = card && card.querySelector('.bruInv'); if (!box || !inv) return;
    box.innerHTML = '<textarea readonly aria-label="Bot invitation"></textarea><div class="row"><button type="button" class="pri" data-a="copy">Copy invitation</button><span class="mut bruCd"></span></div><p class="mut">Works once, for one bot, for 5 minutes. Send it only to the bot\u2019s owner.</p>';
    box.querySelector('textarea').value = inv.code;
    clearInterval(cdT); var tick = function () { var s = Math.max(0, Math.round((inv.exp - Date.now()) / 1000)), e = card && card.querySelector('.bruCd'); if (e) e.textContent = s ? 'expires in ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : 'expired \u2014 create a new one'; if (!s) clearInterval(cdT); }; tick(); cdT = setInterval(tick, 1000);
  }
  function copy() {
    if (!inv) return; var ta = card && card.querySelector('.bruInv textarea');
    (navigator.clipboard ? navigator.clipboard.writeText(inv.code) : Promise.reject()).then(function () { toast('Bot invitation copied'); }, function () { if (ta) { ta.focus(); ta.select(); try { document.execCommand('copy'); toast('Bot invitation copied'); } catch (_) {} } });
  }
  function giveFloor(seat) {
    var id = roomId(); if (!id) return; var b = bots.filter(function (x) { return x.seat_id === seat; })[0];
    var text = window.prompt('What should ' + (b ? b.display_name : 'the bot') + ' answer? (optional)', '') ;
    if (text === null) return;
    api('POST', '/api/rooms/' + encodeURIComponent(id) + '/bridge-turn', { key: key(), seat_id: seat, text: text }).then(function (x) {
      toast(x.s === 202 ? 'Floor given to ' + (b ? b.display_name : 'the bot') : (x.j.error || 'Could not give the floor (HTTP ' + x.s + ')'));
    }, function () {});
  }
  /* ---------- bot list (poll while in a room) ---------- */
  function poll() {
    var id = roomId(); if (!id) { if (bots.length) { bots = []; repaint(); } return; }
    api('GET', '/api/rooms/' + encodeURIComponent(id) + '/bots').then(function (x) {
      if (x.s !== 200 || x.j.room !== id) return; bots = x.j.bots || []; floor = x.j.floor || null;
      var sig = JSON.stringify(bots.map(function (b) { return [b.seat_id, b.state, b.display_name]; })) + floor; if (sig !== lastSig) { lastSig = sig; repaint(); }
    }, function () {});
  }
  function repaint() { var e = card && card.querySelector('.bruBots'); if (e) e.innerHTML = botsHtml(); try { if (App.wins && App.wins.roster) App.rerender('roster'); } catch (_) {} }
  var rr = App.renderRoster;
  if (typeof rr === 'function' && !rr.__bru) { App.renderRoster = function (b) { var r = rr.apply(this, arguments); try { if (bots.length && b) { var d = document.createElement('div'); d.className = 'bruRoster'; d.innerHTML = '<div class="h">Bots (bridge app)</div>' + bots.map(function (x) { return '<div>\ud83e\udd16 ' + esc(x.display_name) + ' <span style="opacity:.7">(' + esc(x.maker_claim || 'maker unstated') + ', self-claimed' + (x.state === 'disconnected' ? ', reconnecting' : '') + ')</span></div>'; }).join(''); b.appendChild(d); } } catch (_) {} return r; }; App.renderRoster.__bru = 1; }
  setInterval(function () { try { plant(); } catch (_) {} }, 1200);
  pollT = setInterval(function () { if (!document.hidden) poll(); }, 8000);
  window.__bridgeUi = { build: BUILD, open: openCard, bots: function () { return bots.slice(); }, poll: poll };
})();
