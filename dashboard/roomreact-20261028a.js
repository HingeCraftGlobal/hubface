/* reactions-20261028a (Dan approved Oct 28 2026, Brain OS task 166): standard-emoji reactions in live HubFace rooms.
   Taps the /api/room-live WebSocket (no change to room-live.js); sends {t:'react', e}; server broadcasts {t:'react'} to everyone
   (no chat line, no transcript, no bot hooks/TTS, no meter). Floats show the emoji only (no text near Finn); sender name in tooltip.
   Rollback: remove the script tag from dashboard/index.html (and the 'react' branch in server/roomserver.mjs). */
(function () {
  'use strict';
  if (window.__hfReact) return; window.__hfReact = 'reactions-20261028a';
  var EMO = ['\u{1F44D}', '\u{1F44E}', '\u2764\uFE0F', '\u{1F602}', '\u{1F44F}', '\u{1F389}', '\u{1F64F}', '\u{1FABD}', '\u{1F62E}', '\u{1F44B}', '\u2705', '\u2753', '\u{1F525}'];
  var sock = null, last = 0, bar = null;
  function css() {
    if (document.getElementById('hfReactCss')) return;
    var s = document.createElement('style'); s.id = 'hfReactCss';
    s.textContent = '#hfReactBar{position:fixed;z-index:2147483000;display:none;gap:2px;padding:3px 6px;border-radius:18px;background:rgba(15,20,35,.72);box-shadow:0 2px 10px rgba(0,0,0,.35);left:50%;bottom:86px;transform:translateX(-50%)}' +
      '#hfReactBar.on{display:flex;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 8px);box-sizing:border-box}#hfReactBar button{border:0;background:none;cursor:pointer;font-size:20px;line-height:1;padding:3px 4px;border-radius:12px;transition:transform .12s}' +
      '#hfReactBar button:hover{transform:scale(1.25);background:rgba(255,255,255,.08)}#hfReactBar button:disabled{opacity:.45;cursor:default;transform:none}' +
      '@media (max-width:480px){#hfReactBar{bottom:78px;padding:2px 4px;max-width:236px;border-radius:14px}#hfReactBar button{font-size:18px;padding:3px 3px}}' +
      '.hfReactFloat{position:fixed;z-index:2147483001;pointer-events:none;font-size:34px;line-height:1;animation:hfReactUp 2.5s ease-out forwards;will-change:transform,opacity}' +
      '@keyframes hfReactUp{0%{transform:translateY(0) scale(.6);opacity:0}12%{transform:translateY(-20px) scale(1.15);opacity:1}100%{transform:translateY(-220px) scale(1);opacity:0}}' +
      '@media (prefers-reduced-motion:reduce){.hfReactFloat{animation-duration:1.2s}}';
    (document.head || document.documentElement).appendChild(s);
  }
  function place() {   // sit just above the room bar (#rbBar) wherever it is; fallback bottom-centre
    if (!bar || !bar.classList.contains('on')) return; var rb = document.getElementById('rbBar'), r = rb && rb.getBoundingClientRect();
    if (r && r.width > 0 && r.top > 60) { var w = bar.offsetWidth || 240, x = Math.min(Math.max(4, r.left + r.width / 2 - w / 2), innerWidth - w - 4); bar.style.left = Math.round(x) + 'px'; bar.style.transform = 'none'; bar.style.bottom = Math.round(innerHeight - r.top + 6) + 'px'; }
    else { bar.style.left = ''; bar.style.transform = ''; bar.style.bottom = ''; }
  }
  setInterval(place, 1000); addEventListener('resize', place);
  function show(on) { if (!bar && on) build(); if (bar) { bar.classList.toggle('on', !!on); place(); } }
  function build() {
    css(); bar = document.createElement('div'); bar.id = 'hfReactBar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Reactions');
    EMO.forEach(function (e) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = e; b.setAttribute('aria-label', 'React ' + e);
      b.addEventListener('click', function (ev) { ev.stopPropagation(); send(e); });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
  }
  function send(e) {
    var n = Date.now(); if (n - last < 1000 || !sock || sock.readyState !== 1) return; last = n;
    try { sock.send(JSON.stringify({ t: 'react', e: e })); } catch (_) {}
    var bs = bar ? bar.querySelectorAll('button') : []; for (var i = 0; i < bs.length; i++) bs[i].disabled = true;
    setTimeout(function () { for (var j = 0; j < bs.length; j++) bs[j].disabled = false; }, 1000);
  }
  function float(e, who) {
    if (EMO.indexOf(e) < 0 || !document.body) return; css();
    var r = bar && bar.classList.contains('on') ? bar.getBoundingClientRect() : { left: innerWidth / 2 - 80, width: 160, top: innerHeight - 90 };
    var d = document.createElement('div'); d.className = 'hfReactFloat'; d.textContent = e; if (who) d.title = who;
    d.style.left = Math.round(r.left + Math.random() * Math.max(40, r.width - 34)) + 'px'; d.style.top = Math.round(r.top - 40) + 'px';
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2600);
  }
  window.__hfReactTest = { float: float, send: send, show: show, EMO: EMO };
  var WS = window.WebSocket;
  if (WS && !WS.__hfReact) {
    var Wrap = function (url, protos) {
      var w = protos === undefined ? new WS(url) : new WS(url, protos);
      try {
        if (/\/api\/room-live\b/.test(String(url))) {
          w.addEventListener('message', function (ev) { try { var m = JSON.parse(ev.data); if (m.t === 'welcome') { sock = w; show(true); } else if (m.t === 'react') float(m.e, m.from && m.from.name); } catch (_) {} });
          w.addEventListener('close', function () { if (sock === w) { sock = null; show(false); } });
        }
      } catch (_) {}
      return w;
    };
    Wrap.prototype = WS.prototype; ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { Wrap[k] = WS[k]; }); Wrap.__hfReact = true;
    for (var k in WS) { try { if (!(k in Wrap)) Wrap[k] = WS[k]; } catch (_) {} }
    window.WebSocket = Wrap;
  }
})();
