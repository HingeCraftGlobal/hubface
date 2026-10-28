/* roomchime-20261027a: soft Web Audio chime for people already in a live HubFace room when another person joins (higher) or leaves (lower).
   Read-only tap on the /api/room-live WebSocket (no change to room-live.js). Silent for: initial roster, reconnects, own account,
   bots/NPCs (Yoda, Ava, Finn, Stella, avatars, role bot/yoda), and quick leave/rejoin flaps. Mute: bell toggle in the Live roster
   window, stored in localStorage 'hf-room-chime-muted' = '1'. Rollback: remove the script tag from dashboard/index.html. */
(function () {
  'use strict';
  if (window.__hfRoomChime) return; window.__hfRoomChime = 'roomchime-20261027a';
  var KEY = 'hf-room-chime-muted', ctx = null;
  function muted() { try { return localStorage.getItem(KEY) === '1'; } catch (_) { return false; } }
  function setMuted(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (_) {} }
  function unlock() { try { if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; if (C) ctx = new C(); } if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (_) {} }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { addEventListener(ev, unlock, { capture: true, passive: true }); });
  function tone(f, t0, dur, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function play(kind) {
    if (muted() || !ctx || ctx.state !== 'running') return false;
    var t = ctx.currentTime + 0.01, v = 0.06;
    if (kind === 'join') { tone(784, t, 0.45, v); tone(1047, t + 0.14, 0.6, v); }   // G5 -> C6, rising
    else { tone(659, t, 0.45, v); tone(523, t + 0.14, 0.6, v); }                       // E5 -> C5, falling
    return true;
  }
  var BOT = /^(yoda|ava|finn|stella|liora)\b|\bbot\b|avatar|\(ai\)|ai ceo/i;
  function isBot(p) { if (!p) return true; var r = String(p.role || '').toLowerCase(); if (r === 'bot' || r === 'yoda' || r === 'agent' || p.bot) return true; return BOT.test(String(p.name || '')); }
  function keyOf(p) { return String(p.user || p.name || p.id || ''); }
  /* core logic (exposed for tests): state per socket */
  function Tracker(sound, now) {
    this.sound = sound; this.now = now || Date.now; this.self = null; this.ready = 0; this.peers = {}; this.recentLeave = {}; this.pendLeave = {};
  }
  Tracker.prototype.msg = function (m) {
    var T = this, n = T.now();
    if (m.t === 'welcome') { T.self = m.self || null; T.ready = n + 3000; T.peers = {}; (m.peers || []).forEach(function (p) { if (p && p.id) T.peers[p.id] = p; }); return null; }
    if (!T.self) return null;
    if (m.t === 'peer-join' && m.peer) {
      var p = m.peer; T.peers[p.id] = p;
      if (n < T.ready || isBot(p) || (T.self && (p.id === T.self.id || (p.user && p.user === T.self.user)))) return null;
      var k = keyOf(p);
      if (T.pendLeave[k]) { clearTimeout(T.pendLeave[k]); delete T.pendLeave[k]; return null; }          // flap: left then back quickly
      if (T.recentLeave[k] && n - T.recentLeave[k] < 10000) return null;
      T.sound('join'); return 'join';
    }
    if (m.t === 'peer-leave') {
      var q = T.peers[m.id] || { id: m.id, name: m.name }; delete T.peers[m.id];
      if (n < T.ready || isBot(q) || (T.self && q.user && q.user === T.self.user)) return null;
      var k2 = keyOf(q); T.recentLeave[k2] = n;
      if (T.pendLeave[k2]) return null;
      T.pendLeave[k2] = setTimeout(function () { delete T.pendLeave[k2]; T.sound('leave'); }, 4000);   // wait out reconnect flaps
      return 'leave-pending';
    }
    return null;
  };
  window.__hfRoomChimeTest = { Tracker: Tracker, isBot: isBot, play: play };
  /* tap room-live sockets without touching room-live.js */
  var WS = window.WebSocket;
  if (WS && !WS.__hfChime) {
    var Wrap = function (url, protos) {
      var w = protos === undefined ? new WS(url) : new WS(url, protos);
      try { if (/\/api\/room-live\b/.test(String(url))) { var tr = new Tracker(play); w.addEventListener('message', function (e) { try { tr.msg(JSON.parse(e.data)); } catch (_) {} }); } } catch (_) {}
      return w;
    };
    Wrap.prototype = WS.prototype; ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { Wrap[k] = WS[k]; }); Wrap.__hfChime = true;
    window.WebSocket = Wrap;
  }
  /* bell toggle inside the Live roster window only */
  function paintBell() {
    var ps = document.querySelectorAll('p.muted');
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i]; if (!/^Live roster/.test(p.textContent || '') || p.querySelector('.hfChimeBtn')) continue;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'hfChimeBtn';
      b.style.cssText = 'margin-left:6px;border:0;background:none;cursor:pointer;font-size:13px;padding:0 2px;vertical-align:middle';
      var set = function (bb) { var m = muted(); bb.textContent = m ? '\ud83d\udd15' : '\ud83d\udd14'; bb.title = m ? 'Join/leave chime off (click to turn on)' : 'Join/leave chime on (click to mute)'; };
      set(b); b.addEventListener('click', function (e) { e.stopPropagation(); setMuted(!muted()); set(this); unlock(); if (!muted()) play('join'); });
      p.appendChild(b);
    }
  }
  var pend = 0; new MutationObserver(function () { if (pend) return; pend = setTimeout(function () { pend = 0; paintBell(); }, 250); }).observe(document.documentElement, { childList: true, subtree: true });
})();
