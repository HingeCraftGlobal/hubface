/* botrelay-room.js — botrelay-20261022a. Room page: when this room's bot relay is active, flip to RELAY-ONLY view.
   Hides tiles/widgets/transcript, silences TTS + media, pauses mic, signals moderator/companions to stand down. Reads mode only (no content). */
(function () {
  'use strict';
  var API = '/api/botrelay/rooms/';
  function roomId() {
    if (window.HF_ROOM_ID) return String(window.HF_ROOM_ID);
    var src = location.href + ' ' + (document.title || '');
    var m = src.match(/HF-[A-Z0-9]{5}-[A-Z0-9]{5}/);
    if (m) return m[0];
    var p = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ''));
    return p.get('room') || h.get('room') || p.get('code') || h.get('code') || '';
  }
  var css = '.hf-botrelay body>*:not(#hf-botrelay-overlay){display:none!important}' +
    '#hf-botrelay-overlay{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0b1020;color:#e8ecf8;font:16px/1.5 system-ui,sans-serif;z-index:2147483647;text-align:center;padding:24px}' +
    '#hf-botrelay-overlay h1{font-size:22px;margin:0 0 8px}#hf-botrelay-overlay .s{opacity:.75}' +
    '#hf-botrelay-overlay .dot{width:12px;height:12px;border-radius:50%;background:#3ddc84;display:inline-block;margin-right:8px;animation:hfbr 1.2s infinite}' +
    '@keyframes hfbr{50%{opacity:.25}}';
  var on = false, overlay, saved = [];
  function enter(st) {
    if (!on) {
      on = true;
      var s = document.createElement('style'); s.id = 'hf-botrelay-css'; s.textContent = css; document.head.appendChild(s);
      overlay = document.createElement('div'); overlay.id = 'hf-botrelay-overlay'; document.body.appendChild(overlay);
      document.documentElement.classList.add('hf-botrelay');
      window.HF_BOTRELAY_ACTIVE = true;
      try { speechSynthesis.cancel(); } catch (e) {}
      document.querySelectorAll('audio,video').forEach(function (m) { if (!m.paused || !m.muted) { saved.push([m, m.muted, m.paused]); m.muted = true; try { m.pause(); } catch (e) {} } });
      window.dispatchEvent(new CustomEvent('hf:botrelay', { detail: { active: true, room: st.room } }));
    }
    try { speechSynthesis.cancel(); } catch (e) {}
    overlay.innerHTML = '<h1><span class="dot"></span>Bot relay in progress</h1><div class="s"></div>';
    overlay.querySelector('.s').textContent = (st.bots || []).join(' \u2194 ') + ' \u2014 turn ' + (st.turns || 0) + '. Voice, companions and transcript are paused for this room. A receipt will be available when it ends.';
  }
  function exit(st) {
    if (!on) return; on = false;
    document.documentElement.classList.remove('hf-botrelay');
    var c = document.getElementById('hf-botrelay-css'); c && c.remove(); overlay && overlay.remove();
    saved.forEach(function (x) { x[0].muted = x[1]; if (!x[2]) x[0].play().catch(function () {}); }); saved = [];
    window.HF_BOTRELAY_ACTIVE = false;
    window.dispatchEvent(new CustomEvent('hf:botrelay', { detail: { active: false, room: st.room, endReason: st.endReason, receiptReady: st.receiptReady } }));
  }
  // Guard: block TTS while relay is active even if a companion script tries to speak.
  try { var sp = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = function (u) { if (window.HF_BOTRELAY_ACTIVE) return; return sp(u); }; } catch (e) {}
  var delay = 3000;
  function tick() {
    var id = roomId();
    if (!id) return setTimeout(tick, 5000);
    fetch(API + encodeURIComponent(id) + '/status', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (st) {
      if (st && st.mode === 'relay') { enter(st); delay = 2000; } else { if (st) exit(st); delay = 4000; }
    }).catch(function () { delay = 8000; }).then(function () { setTimeout(tick, delay); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick); else tick();
})();
