/* moderator-20261021a (Dan approved by voice Oct 21 ~9:17am ET) - HubFace "Moderator" bot, v1: page-only, rule-based, no LLM, no server change, no new spend.
   Mission: keep room conversations civil, fair and on track. Strictly neutral: it never judges who is right.
   Hooks (all existing): window.HF_onBotInvite(id) from the invite-bot picker; window.__rb.App (open/rerender/toast/chatLine);
   room socket messages (chat, peer-state incl. hand, peer-join/leave) read through a passive WebSocket tap (same pattern
   as room-extras.js); talking rings (#rbSelf.talking, .rlPanel.talking); room-timer DOM (#rtBox .rtClk, .warn).
   Voice: browser speechSynthesis on THIS screen only (free), distinct pitch/rate from Yoda(0.8)/Ava(1.15)/Finn(1.0).
   Only the browser that invited the Moderator acts ("driver"), so nudges are not duplicated. Chat nudges go out as
   room chat lines prefixed "Moderator:" through App.chatLine (v1 limitation: server shows them from the inviter's name).
   Persona: female, warm, calm, reassuring. Browser voice: a calm female system voice that is NOT the voice Ava's browser fallback
   uses (room-live.js picks the FIRST en voice at pitch 1.15 for Ava); Moderator skips that voice, pitch 1.0, rate 0.9.
   Wiring (invitebot-20261021a in room-extras.js): marks the 'moderator' entry of HF_INVITABLE_BOTS live (soon:false), chains
   HF_onBotInvite / HF_onBotRemove, hides the 'coming soon' placeholder tile, and auto-resumes if HF_roomBots() lists her.
   Dashboard: adds a 'Moderator' row to the AI Assistant dropdown (#aiDd) that opens her prep card (no data-ai, so it never
   changes the selected voice assistant). Roll back: remove the <script src="moderator.js"> tag. */
(function () {
  'use strict';
  if (window.__hfModerator) return;
  var ID = 'moderator', NAME = 'Moderator', LS = 'hubface-moderator:';
  var App = function () { return window.__rb && window.__rb.App; };
  var CFG = { turnSec: 120, warnSec: 20, overlapMs: 1500, driftMin: 3, heatWindow: 4, cooldownSec: 30, speak: true };
  var S = { on: false, room: null, mode: 'general', agenda: [], cur: 0, kw: [], queue: [], floor: null, floorAt: 0,
            lastLines: [], agreements: [], open: [], sides: {}, heat: 0, lastNudge: 0, ws: null, talk: {}, overlapAt: 0, warned: {} };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function roomId() { try { return window.__roomId && window.__roomId.id(); } catch (_) { return null; } }
  function inRoom() { var A = App(); return !!(A && A.inRoom && roomId()); }
  function toast(t) { try { App().toast(t); } catch (_) {} }
  function save() { try { localStorage.setItem(LS + (S.room || 'dash'), JSON.stringify({ agenda: S.agenda, cur: S.cur, mode: S.mode, agreements: S.agreements, open: S.open, cfg: CFG })); } catch (_) {} }
  function load(k) { try { var j = JSON.parse(localStorage.getItem(LS + k) || 'null'); if (j) { S.agenda = j.agenda || []; S.cur = j.cur || 0; S.mode = j.mode || 'general'; S.agreements = j.agreements || []; S.open = j.open || []; Object.assign(CFG, j.cfg || {}); } } catch (_) {} }

  /* ---------- output: chat line + optional local voice. Fixed, neutral wording only. ---------- */
  function say(text, opts) {
    opts = opts || {}; var now = Date.now();
    if (!opts.force && now - S.lastNudge < 8000) return;
    /* modfix-20261021a: never say the same line twice within 2 minutes (crisis line excepted), so a stuck rule cannot loop */
    S.said = S.said || {}; if (text !== LINES.crisis && S.said[text] && now - S.said[text] < 120000) return; S.said[text] = now; S.lastNudge = now;
    if (inRoom() && opts.chat !== false) { try { App().chatLine('roomChat', NAME + ': ' + text, true); } catch (_) {} } else toast(NAME + ': ' + text);
    if (CFG.speak && opts.voice !== false && window.__hfVoice && !window.__botQuiet && !(window.__roomLive && window.__roomLive.botMute.isMuted(ID))) {
      try { window.__hfVoice.say(text, 'aurora', { bot: 'moderator', silentFail: true }); } catch (_) {}   /* voice4-20261021a */
    }
    log('mod', text);
  }
  /* calm female voice, never the one Ava's fallback uses (first en voice) */
  var PREF = [/Google UK English Female/i, /Libby/i, /Sonia/i, /Jenny/i, /Aria/i, /Samantha/i, /Karen/i, /Moira/i, /Tessa/i, /Serena/i, /Fiona/i, /Zira/i, /female/i];
  function pickVoice() { try { var all = speechSynthesis.getVoices().filter(function (x) { return /^en/i.test(x.lang); }); var ava = all[0]; var pool = all.filter(function (x) { return x !== ava; });
    for (var i = 0; i < PREF.length; i++) { var m = pool.filter(function (x) { return PREF[i].test(x.name); })[0]; if (m) return m; } return pool[0] || null; } catch (_) { return null; } }
  function log(kind, text) { S.lastLines.push({ at: Date.now(), kind: kind, text: text }); if (S.lastLines.length > 200) S.lastLines.shift(); }

  var LINES = {
    hello: 'Hello everyone, I am the Moderator. I am here to help this conversation feel calm and fair for everyone. I do not take sides. Whenever you would like to speak, just raise your hand.',
    overlap: 'Two people are speaking at once. Let us take one voice at a time. {who} has the floor.',
    next: '{who}, you have the floor.',
    warn: '{who}, about {s} seconds left on this turn.',
    over: 'Thank you, {who}. Time for this turn is up.',
    drift: 'We may be drifting from the topic. Current item: {item}. Shall we come back to it or park this for later?',
    agenda: 'Next agenda item: {item}.',
    heat: 'I can hear this matters a lot to everyone. Let us take a short, calm pause. When we continue, let us speak about the issue, not the person.',
    cool: 'Let us take {s} seconds of quiet, then pick up with {who}.',
    child: 'A gentle reminder: you both care about the children. Let us keep the focus on what works best for them.',
    summary: 'Here is where things stand. {a}. {b}. Does each side feel that is a fair summary?',
    timer2: 'About two minutes left in this session. Let us note any agreements before we finish.',
    timer1: 'One minute left. Final agreements: {ag}.',
    crisis: 'If anyone is in danger or thinking of harming themselves or someone else, please stop and contact local emergency services now. In the US you can call or text 988. I am not a crisis service.',
    scope: 'I am a meeting moderator, not a therapist, lawyer, or mediator. For legal or custody decisions, please consult a qualified professional.'
  };
  function fill(t, o) { return t.replace(/\{(\w+)\}/g, function (_, k) { return o && o[k] != null ? o[k] : ''; }); }

  /* ---------- rule sets (no LLM). Kept deliberately small and conservative. ---------- */
  var HEAT = /\b(shut up|liar|lying|stupid|idiot|hate you|always do this|never listen|ridiculous|pathetic|screw you|f+u+c+k|bullshit|you people)\b/i;
  var CAPS = function (t) { var l = t.replace(/[^A-Za-z]/g, ''); return l.length >= 12 && l === l.toUpperCase(); };
  var CRISIS = /\b(kill (myself|him|her|you)|suicid|end my life|hurt (myself|the kids?|the children)|he hits|she hits|abuse[sd]?|threaten(ed|ing)? me|not safe)\b/i;
  var AGREE = /\b(we agree|agreed|deal|ok(ay)? let'?s do|i can do that|sounds good)\b/i;
  var STOP = { the:1, a:1, an:1, and:1, or:1, to:1, of:1, in:1, on:1, is:1, it:1, that:1, this:1, for:1, we:1, i:1, you:1, be:1, with:1, about:1, so:1, but:1, are:1, was:1 };
  function words(t) { return String(t).toLowerCase().match(/[a-z']{3,}/g) || []; }
  function setKw() { var it = S.agenda[S.cur] || ''; S.kw = words(it).filter(function (w) { return !STOP[w]; }); }
  var offCount = 0;
  function onLine(m) {
    if (!S.on || !m || !m.text) return; var txt = String(m.text), who = (m.from && m.from.name) || 'Someone';
    if (txt.indexOf(NAME + ':') === 0) return; log('line', who + ': ' + txt);
    if (CRISIS.test(txt)) { say(LINES.crisis, { force: true }); return; }                         // safety first, always
    var hot = HEAT.test(txt) || CAPS(txt) || (txt.match(/!/g) || []).length >= 3;
    S.heat = Math.max(0, S.heat - 0.25) + (hot ? 1 : 0);
    if (S.heat >= 2) { S.heat = 0; say(LINES.heat, { force: true }); if (S.mode === 'coparent') setTimeout(function () { say(LINES.child, { force: true }); }, 4000); coolDown(); return; }
    if (AGREE.test(txt)) { S.agreements.push(who + ': ' + txt.slice(0, 140)); save(); paint(); }
    var sd = S.sides[who] = S.sides[who] || []; sd.push(txt.slice(0, 200)); if (sd.length > 6) sd.shift();
    if (S.kw.length) { var ws = words(txt), hit = ws.some(function (w) { return S.kw.indexOf(w) >= 0; }); offCount = hit ? 0 : offCount + (ws.length >= 4 ? 1 : 0);
      if (offCount >= CFG.driftMin) { offCount = 0; say(fill(LINES.drift, { item: S.agenda[S.cur] })); } }
  }
  function coolDown() { var nx = S.queue[0] || S.floor || 'the next speaker'; say(fill(LINES.cool, { s: CFG.cooldownSec, who: nx }), { force: true, voice: false }); }

  /* neutral summary: last 2 lines from each of the two most active speakers, quoted verbatim, alternating order */
  function summarize() {
    var ppl = Object.keys(S.sides).sort(function (a, b) { return S.sides[b].length - S.sides[a].length; }).slice(0, 2);
    if (ppl.length < 2) { toast('Not enough from two sides to summarize yet.'); return; }
    var pick = function (p) { return p + ' said "' + S.sides[p].slice(-1)[0].slice(0, 120) + '"'; };
    if (Math.random() < 0.5) ppl.reverse();               // no fixed order = no implied priority
    say(fill(LINES.summary, { a: pick(ppl[0]), b: pick(ppl[1]) }), { force: true });
  }

  /* ---------- floor: raised-hand queue, per-speaker timer, overlap ---------- */
  function names() { var out = {}; try { var st = window.__roomLive.state(); (st.peers || []).forEach(function (p) { out[p.id] = p.name; }); if (st.self) out[st.self.id] = st.self.name; } catch (_) {} return out; }
  function onHand(id, up) { var n = names()[id] || 'Someone'; var i = S.queue.indexOf(n); if (up && i < 0) S.queue.push(n); if (!up && i >= 0) S.queue.splice(i, 1); if (up && !S.floor) nextSpeaker(); paint(); }
  function nextSpeaker() { if (S.floor) say(fill(LINES.over, { who: S.floor }), { voice: false }); S.floor = S.queue.shift() || null; S.floorAt = Date.now(); S.warned = {}; if (S.floor) say(fill(LINES.next, { who: S.floor }), { force: true }); paint(); }
  function talkers() { var t = []; var me = document.getElementById('rbSelf'); if (me && me.classList.contains('talking')) t.push('me');
    document.querySelectorAll('#ui > .rlPanel.talking, .rlTile.talking').forEach(function (e) { var k = e.getAttribute('data-name') || e.getAttribute('data-peer') || e.textContent.slice(0, 20); if (t.indexOf(k) < 0) t.push(k); }); return t; }
  function tick() {
    if (!S.on) return; var r = roomId(); if (inRoom() && r !== S.room) { S.room = r; load(r); setKw(); }
    var now = Date.now();
    var tk = talkers(); if (tk.length >= 2) { if (!S.overlapAt) S.overlapAt = now; if (now - S.overlapAt > CFG.overlapMs) { S.overlapAt = now + 10000; say(fill(LINES.overlap, { who: S.floor || 'whoever raised a hand first' })); } } else if (S.overlapAt < now) S.overlapAt = 0;
    if (S.floor) { var left = CFG.turnSec - (now - S.floorAt) / 1000;
      if (left <= CFG.warnSec && !S.warned.w) { S.warned.w = 1; say(fill(LINES.warn, { who: S.floor, s: Math.max(0, Math.round(left)) }), { voice: false }); }
      if (left <= 0 && !S.warned.o) { S.warned.o = 1; nextSpeaker(); } }
    var rt = document.querySelector('#rtBox .rtClk'), box = document.getElementById('rtBox');      // room-timer tie-in (read-only)
    if (rt && box) { var p = String(rt.textContent).split(':').map(Number), sec = p.length === 2 ? p[0] * 60 + p[1] : p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : NaN;
      if (box.classList.contains('warn') && !S.warned.t2) { S.warned.t2 = 1; say(LINES.timer2, { force: true }); }
      if (sec > 0 && sec <= 60 && box.classList.contains('warn') && !S.warned.t1) { S.warned.t1 = 1; say(fill(LINES.timer1, { ag: S.agreements.length ? S.agreements.length + ' noted' : 'none noted yet' }), { force: true }); } }
    paint();
  }

  /* ---------- passive socket tap (reads only; never sends on the room socket) ---------- */
  try { var WP = WebSocket.prototype, dS = WP.send, dOM = Object.getOwnPropertyDescriptor(WP, 'onmessage');
    WP.send = function (x) { try { if (typeof x === 'string' && x.indexOf('"t":"join"') >= 0) S.ws = this; } catch (_) {} return dS.apply(this, arguments); };
    if (dOM && dOM.set) Object.defineProperty(WP, 'onmessage', { configurable: true, enumerable: dOM.enumerable, get: function () { return dOM.get.call(this); }, set: function (f) {
      var ws = this; if (typeof f !== 'function') return dOM.set.call(this, f);
      dOM.set.call(this, function (ev) { if (ws === S.ws && typeof ev.data === 'string' && ev.data.charAt(0) === '{') { try { var m = JSON.parse(ev.data);
        if (m.t === 'chat') onLine(m);
        if (m.t === 'peer-state' && m.peer && 'hand' in m.peer) onHand(m.peer.id, !!m.peer.hand);
        if (m.t === 'peer-leave') { var n = names()[m.id]; if (n) { var i = S.queue.indexOf(n); if (i >= 0) S.queue.splice(i, 1); if (S.floor === n) nextSpeaker(); } }
      } catch (_) {} } return f.apply(this, arguments); }); } });
  } catch (e) { console.warn('[moderator] tap', e); }

  /* ---------- panel (room: floor + agenda + agreements; dashboard: prep card + launch) ---------- */
  var FACE = 'assets/moderator-face.jpg?v=modface-20261021a';   // modface-20261021a: photo portrait (was drawn SVG)
  var css = document.createElement('style');
  css.textContent = '#hfMod{position:fixed;right:16px;top:90px;z-index:9990;width:260px;background:rgba(40,30,48,.93);color:#f7eef6;border:1px solid #cdb4db;border-radius:12px;font:12px system-ui;padding:10px;box-shadow:0 4px 18px rgba(0,0,0,.35)}' +
    '#hfMod h4{margin:0 0 6px;font:600 13px system-ui;display:flex;align-items:center;gap:6px}#hfMod .av{width:28px;height:28px;border-radius:50%;background:center/cover no-repeat}' +
    '#hfMod button{font:11px system-ui;margin:2px 2px 0 0;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:#1f3b36;color:#fff;padding:3px 6px;cursor:pointer}#hfMod textarea,#hfMod select{width:100%;box-sizing:border-box;background:#0f2421;color:#fff;border:1px solid #2c6b60;border-radius:6px;font:11px system-ui}' +
    '#rxModTile{display:none!important}#hfMod .sec{margin-top:6px}#hfMod .cur{color:#ffc8dd;font-weight:600}#hfMod small{opacity:.7}';
  document.head.appendChild(css);
  var el = null;
  function paint() {
    if (!S.on) { if (el) { el.remove(); el = null; } return; }
    if (!el) { el = document.createElement('div'); el.id = 'hfMod'; document.body.appendChild(el); el.addEventListener('click', onClick); }
    var room = inRoom(), h = '<h4><span class="av" style="background-image:url(\'' + FACE + '\')"></span>Moderator <small>' + (room ? 'in room \u00b7 neutral' : 'prep') + '</small></h4>';
    h += '<div class="sec"><small>Mode</small><select data-a="mode">' + ['general', 'negotiation', 'coparent', 'meeting'].map(function (m) { return '<option' + (S.mode === m ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></div>';
    h += '<div class="sec"><small>Agenda (one item per line)</small><textarea rows="3" data-a="agenda">' + esc(S.agenda.join('\n')) + '</textarea>';
    if (S.agenda.length) h += '<div>Now: <span class="cur">' + esc(S.agenda[S.cur] || '(done)') + '</span></div>';
    h += '<button data-a="saveAg">Save agenda</button>' + (room ? '<button data-a="nextAg">Next item</button>' : '') + '</div>';
    if (room) {
      var left = S.floor ? Math.max(0, Math.round(CFG.turnSec - (Date.now() - S.floorAt) / 1000)) : 0;
      h += '<div class="sec"><small>Floor</small><div>' + (S.floor ? '<span class="cur">' + esc(S.floor) + '</span> \u00b7 ' + left + 's' : 'open') + '</div><div><small>Queue:</small> ' + (S.queue.length ? S.queue.map(esc).join(', ') : 'none') + '</div>' +
        '<button data-a="next">Next speaker</button><button data-a="turn">Turn: ' + CFG.turnSec + 's</button></div>';
      h += '<div class="sec"><button data-a="sum">Summarize both sides</button><button data-a="cool">Cool-down</button>' + (S.mode === 'coparent' ? '<button data-a="child">Child focus</button>' : '') + '<button data-a="scope">What I am not</button></div>';
      h += '<div class="sec"><small>Agreements (' + S.agreements.length + ')</small>' + S.agreements.slice(-4).map(function (a) { return '<div>\u2713 ' + esc(a) + '</div>'; }).join('') + '<button data-a="addAg">+ Add</button><button data-a="post">Post list to chat</button></div>';
    } else {
      h += '<div class="sec"><small>Turn length</small> <button data-a="turn">' + CFG.turnSec + 's</button> <button data-a="voice">Voice: ' + (CFG.speak ? 'on' : 'off') + '</button></div>';
      h += '<div class="sec"><button data-a="launch">Start a room with Moderator</button></div>';
    }
    h += '<div class="sec"><button data-a="leave">' + (room ? 'Remove Moderator' : 'Close') + '</button></div>';
    el.innerHTML = h;
  }
  function onClick(e) {
    var a = e.target && e.target.getAttribute && e.target.getAttribute('data-a'); if (!a) return; e.stopPropagation();
    var ta = el.querySelector('[data-a=agenda]'), md = el.querySelector('[data-a=mode]'); if (md) S.mode = md.value;
    if (a === 'saveAg') { S.agenda = ta.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 12); S.cur = 0; setKw(); save(); if (inRoom() && S.agenda.length) say(fill(LINES.agenda, { item: S.agenda[0] }), { force: true }); }
    if (a === 'nextAg') { S.cur = Math.min(S.agenda.length, S.cur + 1); setKw(); save(); if (S.agenda[S.cur]) say(fill(LINES.agenda, { item: S.agenda[S.cur] }), { force: true }); }
    if (a === 'next') nextSpeaker();
    if (a === 'turn') { var o = [60, 90, 120, 180, 300]; CFG.turnSec = o[(o.indexOf(CFG.turnSec) + 1) % o.length]; save(); }
    if (a === 'voice') { CFG.speak = !CFG.speak; save(); }
    if (a === 'sum') summarize();
    if (a === 'cool') { say(LINES.heat, { force: true }); coolDown(); }
    if (a === 'child') say(LINES.child, { force: true });
    if (a === 'scope') say(LINES.scope, { force: true });
    if (a === 'addAg') { var t = prompt('Agreement (neutral wording):'); if (t) { S.agreements.push(t.slice(0, 160)); save(); } }
    if (a === 'post') say('Agreements so far: ' + (S.agreements.length ? S.agreements.map(function (x, i) { return (i + 1) + ') ' + x; }).join(' ') : 'none yet') + '.', { force: true, voice: false });
    if (a === 'launch') { save(); try { localStorage.setItem(LS + 'pending', '1'); } catch (_) {} toast('Pick a room type; the Moderator will join with this agenda.'); try { var A = App(); if (A && A.open) A.open('picker'); } catch (_) {} }
    if (a === 'leave') { if (inRoom() && typeof window.HF_removeBot === 'function') { window.HF_removeBot(ID); return; } stop(); return; }
    paint();
  }

  /* ---------- entry points ---------- */
  function start(where) {
    S.on = true; S.room = inRoom() ? roomId() : null; load(S.room || 'dash'); setKw();
    if (S.room && where !== 'resume') { say(LINES.hello, { force: true }); if (S.mode === 'coparent') setTimeout(function () { say(LINES.scope, { force: true, voice: false }); }, 3000); }
    paint(); return true;
  }
  function stop() { if (S.on && inRoom()) say('The Moderator is leaving now. Thank you all, take care.', { force: true, voice: false }); S.on = false; paint(); }
  /* invite picker (room-extras invitebot-20261021a): mark live, chain hooks */
  function markLive() { try { (window.HF_INVITABLE_BOTS || []).forEach(function (b) { if (b.id === ID) { b.soon = false; b.name = NAME; } }); } catch (_) {} }
  markLive();
  var prevI = window.HF_onBotInvite, prevR = window.HF_onBotRemove;
  window.HF_onBotInvite = function (id) { if (String(id).toLowerCase() === ID && !S.on) start('room'); return typeof prevI === 'function' ? prevI.apply(this, arguments) : undefined; };
  window.HF_onBotRemove = function (id) { if (String(id).toLowerCase() === ID) stop(); return typeof prevR === 'function' ? prevR.apply(this, arguments) : undefined; };
  /* moderatortile-20261021b: main dashboard widget row (#ui .blist) tile before .bnew, same pattern as companion.js; one tile only */
  function dashTile() { var list = document.querySelector('#ui .blist'); if (!list || list.querySelector('.build[data-bot="' + ID + '"]')) return; var d = document.createElement('div'); d.className = 'build bsm hfModTile'; d.setAttribute('data-bot', ID); d.setAttribute('role', 'button');
    d.title = 'Moderator \u2014 calm, neutral, keeps it fair and on track'; d.innerHTML = '<b>' + NAME + '</b>';
    ['pointerdown', 'dblclick'].forEach(function (ev) { d.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    d.addEventListener('click', function (e) { e.stopPropagation(); if (S.on && !inRoom()) { S.on = false; paint(); } else if (!S.on) start('dash'); });
    var plus = list.querySelector('.bnew'); list.insertBefore(d, plus || null); }
  /* dashboard: AI Assistant dropdown row */
  function ddRow() { var dd = document.getElementById('aiDd'); if (!dd || dd.querySelector('.dd-row[data-mod]')) return; var r = document.createElement('div'); r.className = 'dd-row yes'; r.setAttribute('data-mod', '1'); r.setAttribute('role', 'option'); r.title = 'Moderator: calm, neutral, keeps it fair and on track';
    r.textContent = 'Moderator'; var add = dd.querySelector('.dd-row.add'); dd.insertBefore(r, add || null);
    r.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); if (S.on) { S.on = false; paint(); } else start('dash'); }, true); }
  /* launch flow: if a room opens while "pending", auto-join */
  setInterval(function () { try { markLive(); ddRow(); dashTile(); if (!S.on && inRoom() && typeof window.HF_roomBots === 'function' && window.HF_roomBots().indexOf(ID) >= 0) start('resume'); if (S.on && !inRoom() && S.room) { S.on = false; S.room = null; paint(); } } catch (_) {} try { if (!S.on && inRoom() && localStorage.getItem(LS + 'pending')) { localStorage.removeItem(LS + 'pending'); var ag = localStorage.getItem(LS + 'dash'); if (ag) localStorage.setItem(LS + roomId(), ag); if (typeof window.HF_inviteBot === 'function') window.HF_inviteBot(ID); else start('room'); } } catch (_) {} tick(); }, 1000);

  window.__hfModerator = { build: 'moderator-20261021b', face: FACE, start: start, state: function () { return JSON.parse(JSON.stringify({ on: S.on, room: S.room, mode: S.mode, agenda: S.agenda, cur: S.cur, floor: S.floor, queue: S.queue, agreements: S.agreements })); }, cfg: CFG, _rules: { HEAT: HEAT, CRISIS: CRISIS } };
})();
