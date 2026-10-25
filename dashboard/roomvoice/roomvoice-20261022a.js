/* roomvoice-20261022a (Dan approved by voice 9:39 AM ET Oct 22 2026, room page feature only): opt-in native-audio voice line.
   Toggle "Voice" (bottom-left in a room, ON by default since 20261022b; explicit off remembered per browser). When on: a LOCAL keyword spotter (vosk-browser wasm, grammar-limited, no network)
   listens for a bot name at the START of an utterance. Only then is mic audio (PCM16 24 kHz, incl. the name) streamed to /api/room-voice for that
   one turn, ended by 600 ms of local silence. Unnamed speech: nothing is sent, nothing is shown. No transcripts anywhere.
   Reply audio plays here and in every room browser with the toggle on. Corner readout: last / avg latency.
   Rollback: /opt/hubface/backups/roomvoice-20261022a/ROLLBACK.sh */
(function () {
  'use strict';
  if (window.__hfRoomVoice) return;
  var TAG = 'roomvoice-20261022a', BASE = 'roomvoice/', RATE = 24000, BOTS = ['yoda', 'stella', 'ava'];
  var GRAMMAR = BOTS.concat(['dan', 'hey', 'okay', 'so', 'the', 'a', 'i', 'you', 'what', 'how', 'is', 'it', 'and', 'to', 'can', 'we', 'that', 'this', 'no', 'yes', 'please', 'tell', 'me', '[unk]']);
  var S = { on: false, ws: null, ctx: null, stream: null, proc: null, model: null, rec: null, gate: null, ring: [], armed: null, turnId: null, playing: false,
    nextT: 0, floor: 0.004, lat: [], cur: null, loading: false, pill: null, read: null };
  function log() { try { console.log.apply(console, ['[' + TAG + ']'].concat([].slice.call(arguments))); } catch (_) {} }
  function App() { return window.__rb && window.__rb.App; }
  function inRoom() { var a = App(); return !!(a && a.state && a.state.room && document.documentElement.classList.contains('rb-room')); }
  function roomId() { try { var s = window.__roomLive.state(); if (s && s.room && s.room.id) return String(s.room.id); } catch (_) {} try { return String(App().state.room.id || ''); } catch (_) { return ''; } }
  function selfId() { try { var s = window.__roomLive.state(); return s && s.self && s.self.id; } catch (_) { return null; } }
  function toast(t) { try { var a = App(); a && a.toast && a.toast(t); } catch (_) {} }
  function tone(f, ms, vol) { try { var c = S.ctx || new (window.AudioContext || window.webkitAudioContext)(); var o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; g.gain.value = vol || 0.05; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + ms / 1000); } catch (_) {} }
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

  /* ---------- UI ---------- */
  function ui() {
    if (S.pill || !document.body) return;
    var w = document.createElement('div'); w.id = 'hf-roomvoice';
    w.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483000;font:12px/1.3 system-ui,sans-serif;display:none;gap:6px;align-items:center';
    w.innerHTML = '<button type="button" style="border:0;border-radius:14px;padding:5px 10px;cursor:pointer;background:#333;color:#fff">\ud83c\udf99 Voice: off</button><span style="background:rgba(0,0,0,.6);color:#fff;border-radius:10px;padding:3px 8px;display:none"></span>';
    document.body.appendChild(w); S.pill = w; S.btn = w.firstChild; S.read = w.lastChild;
    S.btn.addEventListener('click', function (e) { e.stopPropagation(); setOn(!S.on); });
  }
  function paint(state) {
    if (!S.btn) return;
    S.btn.textContent = '\ud83c\udf99 Voice: ' + (S.on ? (state || 'say \u201cYoda\u2026\u201d') : 'off');
    S.btn.style.background = S.on ? (S.armed ? '#c0392b' : '#1e7d4f') : '#333';
    if (S.lat.length) { var last = S.lat[S.lat.length - 1], avg = S.lat.reduce(function (a, b) { return a + b; }, 0) / S.lat.length;
      S.read.style.display = ''; S.read.textContent = 'reply ' + (last / 1000).toFixed(2) + 's \u00b7 avg ' + (avg / 1000).toFixed(2) + 's (' + S.lat.length + ')'; }
  }

  /* ---------- server socket ---------- */
  function sock() {
    if (S.ws && S.ws.readyState <= 1) return S.ws;
    var id = roomId(), me = selfId(); if (!id || !me) return null;
    var ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/room-voice?room=' + encodeURIComponent(id) + '&peer=' + encodeURIComponent(me));
    ws.binaryType = 'arraybuffer'; ws._q = [];
    ws.onopen = function () { ws._q.forEach(function (m) { ws.send(m); }); ws._q = []; };
    ws.onmessage = onServer; ws.onclose = function () { if (S.ws === ws) S.ws = null; };
    S.ws = ws; return ws;
  }
  function tx(m) { var ws = sock(); if (!ws) return false; if (ws.readyState === 1) ws.send(m); else ws._q.push(m); return true; }
  function pcm16(f) { var o = new Int16Array(f.length); for (var i = 0; i < f.length; i++) { var v = Math.max(-1, Math.min(1, f[i])); o[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } return o.buffer; }
  function onServer(e) {
    if (typeof e.data !== 'string') return play(e.data);
    var m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m.t === 'turn-ok') { S.turnId = m.turn; return; }
    if (m.t === 'refused') { if (S.armed) { S.armed = null; S.gate.reset(); }
      if (m.why === 'cap') { tone(220, 350, 0.08); toast('\ud83c\udf99 Voice cap reached for today ($1.00). Text chat still works.'); }
      else if (m.why === 'busy') tone(330, 120, 0.05);
      paint(); return; }
    if (m.t === 'reply-start') { S.playing = true; if (S.cur && m.turn === S.turnId) S.cur.first = performance.now(); return; }
    if (m.t === 'reply-end') { setTimeout(function () { S.playing = false; }, Math.max(0, (S.nextT - (S.ctx ? S.ctx.currentTime : 0)) * 1000) + 300);
      var c = S.cur; if (c && m.turn === S.turnId) { S.cur = null;
        if (c.play && c.end) { var row = { bot: c.bot, wakeToEndMs: Math.round(c.end - c.wake), endToFirstMs: Math.round((c.first || c.play) - c.end), firstToPlayMs: Math.round(c.play - (c.first || c.play)), endToPlayMs: Math.round(c.play - c.end), wakeToPlayMs: Math.round(c.play - c.wake) };
          S.lat.push(row.endToPlayMs); if (S.lat.length > 20) S.lat.shift(); tx(JSON.stringify(Object.assign({ t: 'lat' }, row))); log('latency', row, 'server', m.server); } }
      paint(); return; }
  }
  function play(ab) {
    if (!S.ctx) return; var i16 = new Int16Array(ab), f = new Float32Array(i16.length); for (var i = 0; i < i16.length; i++) f[i] = i16[i] / 32768;
    var b = S.ctx.createBuffer(1, f.length, RATE); b.copyToChannel(f, 0); var s = S.ctx.createBufferSource(); s.buffer = b; s.connect(S.ctx.destination);
    var now = S.ctx.currentTime, at = Math.max(now + 0.03, S.nextT); s.start(at); S.nextT = at + b.duration;
    if (S.cur && !S.cur.play) S.cur.play = performance.now() + (at - now) * 1000;
  }

  /* ---------- mic, VAD, wake ---------- */
  function onBlock(f) {
    var t = performance.now(), sum = 0; for (var i = 0; i < f.length; i++) sum += f[i] * f[i]; var rms = Math.sqrt(sum / f.length);
    var speaking = rms > Math.max(0.012, S.floor * 3); if (!speaking) S.floor = S.floor * 0.97 + rms * 0.03;
    var copy = new Float32Array(f); S.ring.push({ t: t, f: copy }); while (S.ring.length && t - S.ring[0].t > 2000) S.ring.shift();
    if (S.armed) tx(pcm16(copy));
    else if (!S.playing && S.rec) { try { S.rec.acceptWaveformFloat(copy, RATE); } catch (_) {} }
    var r = S.playing && !S.armed ? null : S.gate.vad(speaking, t);
    if (r === 'end') { tx(JSON.stringify({ t: 'end' })); if (S.cur) S.cur.end = t; S.armed = null; paint('thinking\u2026'); try { S.rec.retrieveFinalResult(); } catch (_) {} }
    else if (r === 'reset') { try { S.rec.retrieveFinalResult(); } catch (_) {} }
  }
  function onWords(list) {
    var w = S.gate.words(list); if (!w || !w.wake) return;
    var t = performance.now(); S.armed = w.wake; S.turnId = null; S.cur = { bot: w.wake, wake: t };
    tone(880, 40, 0.03);
    if (!tx(JSON.stringify({ t: 'turn', bot: w.wake }))) { S.armed = null; S.gate.reset(); return; }
    var from = S.gate.speechAt - 250; S.ring.forEach(function (x) { if (x.t >= from) tx(pcm16(x.f)); });   // pre-roll: the utterance from its start (incl. the name)
    paint('listening (' + w.wake + ')');
  }
  async function start() {
    if (S.loading) return; S.loading = true; paint('loading\u2026');
    try {
      if (!window.HFVoiceGate) await loadScript(BASE + 'gate-20261022a.js?v=' + TAG);
      if (!window.Vosk) await loadScript(BASE + 'vosk.js?v=0.0.8');
      S.gate = new window.HFVoiceGate({ bots: BOTS, silenceMs: 600 });
      S.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: RATE });
      if (S.ctx.sampleRate !== RATE) throw new Error('rate ' + S.ctx.sampleRate);
      S.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      if (!S.model) S.model = await window.Vosk.createModel(BASE + 'vosk-model-small-en-us-0.15.tar.gz');
      S.rec = new S.model.KaldiRecognizer(RATE, JSON.stringify(GRAMMAR));
      S.rec.on('partialresult', function (m) { var p = (m.result && m.result.partial) || ''; onWords(p ? p.split(/\s+/) : []); });
      S.rec.on('result', function (m) { var p = (m.result && m.result.text) || ''; onWords(p ? p.split(/\s+/) : []); S.gate.segmentDone(); });
      var src = S.ctx.createMediaStreamSource(S.stream), proc = S.ctx.createScriptProcessor(1024, 1, 1), mute = S.ctx.createGain(); mute.gain.value = 0;
      proc.onaudioprocess = function (ev) { if (S.on) onBlock(ev.inputBuffer.getChannelData(0)); };
      src.connect(proc); proc.connect(mute); mute.connect(S.ctx.destination); S.proc = proc; S.src = src;
      sock(); S.loading = false; paint(); log('on');
    } catch (e) { S.loading = false; log('start failed', e && e.message); toast('\ud83c\udf99 Voice could not start: ' + String(e && e.message || e).slice(0, 80)); setOn(false); }
  }
  function stop() {
    try { S.proc && S.proc.disconnect(); S.src && S.src.disconnect(); } catch (_) {}
    try { S.stream && S.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
    try { S.rec && S.rec.remove(); } catch (_) {}
    try { if (S.armed) tx(JSON.stringify({ t: 'cancel' })); S.ws && S.ws.close(); } catch (_) {}
    try { S.ctx && S.ctx.close(); } catch (_) {}
    S.proc = S.src = S.stream = S.rec = S.ws = S.ctx = null; S.armed = null; S.playing = false; S.nextT = 0;
  }
  function setOn(v) { S.on = !!v; try { localStorage.setItem('hfRoomVoice', S.on ? '1' : '0'); } catch (_) {} if (S.on) start(); else stop(); paint(); }
  setInterval(function () { ui(); if (!S.pill) return; var r = inRoom(); S.pill.style.display = r ? 'flex' : 'none';
    if (!r && S.on) { S.on = false; stop(); paint(); }
    if (r && !S.on && !S.loading && !S.autoTried) { S.autoTried = true; try { if (localStorage.getItem('hfRoomVoice') !== '0') setOn(true);   /* defaulton-20261022b (Dan, Oct 22 10:44 PM ET): on unless this browser chose off */ } catch (_) {} }
    if (!r) S.autoTried = false; }, 1000);
  window.__hfRoomVoice = { tag: TAG, state: function () { return { on: S.on, armed: S.armed, lat: S.lat.slice(), ws: S.ws && S.ws.readyState }; }, _onWords: onWords, _onBlock: onBlock };
})();
