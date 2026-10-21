/* HingeCraft Assistants: Ava + Finn (build hca-20261016-v1).
 * Port of HingeHub's room Ava (src/components/AvaAgent.tsx + src/useVoice.ts) to the HingeCraft Interface dashboard.
 * Off (X on the face) until tapped. On = continuous browser STT -> POST /api/assistant/turn (LLM + tools) ->
 * tools run on the real dashboard DOM -> re-scan -> up to 6 steps -> one spoken reply via Grok TTS (/api/tts).
 * Ava speaks with voice "eve", Finn with "lumen" (unchanged from the old dashboard assistants).
 * Only one assistant is on at a time. While one is on, the dashboard's own voice engine (VoiceLayer, "Yoda" wake word)
 * is paused so only one recognizer owns the mic; it resumes when the assistant goes off.
 * No conversation is persisted: memory lives in this page only and is wiped whenever the assistant goes off. */
(function () {
  'use strict';
  if (window.__hca) return;
  var BUILD = 'hca-20261016-v1';
  var MAX_STEPS = 6;
  var P = { ava: { key: 'ava', name: 'Ava', voice: 'eve', img: 'assets/dan-ava.jpg' }, finn: { key: 'finn', name: 'Finn', voice: 'lumen', img: 'assets/yoda-finn.jpg' } };
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  /* ---------------------------------------------------------------- phrases (ported from AvaAgent.tsx, names = ava|finn) */
  var NAME = '(?:ava|finn|fin)';
  function clean(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
  function low(t) { return clean(String(t || '').toLowerCase()); }
  function slug(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
  function isSoftCloser(raw) {
    var t = low(raw).replace(/[.,!?]+$/g, '').trim(); if (!t) return false;
    if (new RegExp('\\b' + NAME + '\\b').test(t) && !/\bava\s*dan\b/.test(t)) return false;
    if (/\b(sleep|dismiss|stand\s+down|shut\s+off|turn\s+off|power\s*(off|down)|stop\s+listening|go\s+away)\b/.test(t)) return false;
    return /^(no|nope|nah|no\s+thanks|no\s+thank\s+you|not\s+really|not\s+now|nothing|nothing\s+else|no\s+more|i'?m\s+good|i\s+am\s+good|i'?m\s+good\s+for\s+now|all\s+good|i'?m\s+fine|we'?re\s+good)(\s*,?\s*(thanks|thank\s+you))?$/.test(t);
  }
  function isDismiss(raw) {
    var t = low(raw); if (!t || isSoftCloser(t)) return false;
    t = t.replace(/[.!?]+$/, '');
    if (/^(ok|okay|all right|alright)[,]?\s*(thanks|thank you)$/.test(t)) return true;
    if (/^(thanks|thank you|thanks a lot|thank you so much)$/.test(t)) return true;
    if (/^(bye|goodbye|good bye|see you|see ya|later|talk later|gotta go)$/.test(t)) return true;
    if (/\b(go\s+to\s+sleep|power\s*(off|down)|shut\s*(off|down)|turn\s+off|dismiss|stand\s+down|stop\s+listening|go\s+quiet|go\s+away)\b/.test(t) && !/\b(video|youtube|music|sound|volume|fog|light|camera|it|that|the)\b/.test(t) && t.length < 60) return true;
    if (new RegExp('\\b' + NAME + '\\b').test(t) && t.length < 60) {
      if (/\b(that'?s|thats)\s+(all|enough|it)\b/.test(t)) return true;
      if (/\b(i'?m|i am)\s+(all\s+)?(set|done|good)(\s+for\s+now)?\b/.test(t)) return true;
      if (/\b(bye|goodbye|good bye|see you|later)\b/.test(t)) return true;
    }
    if (/^(that'?s|thats) (all|it)$/.test(t)) return true;
    return false;
  }
  /** "hey Finn" while Ava is on (or vice versa) -> hand over. Returns 'ava' | 'finn' | null. */
  function wakeTarget(raw) {
    var t = low(raw);
    if (/\bava\s*dan\b/.test(t)) return null;
    var m = /^(?:hey|hi|hello|ok|okay|yo)?\s*,?\s*(ava|finn|fin)\b/.exec(t) || /\b(?:switch to|talk to|give me|get me)\s+(ava|finn|fin)\b/.exec(t);
    if (!m) return null; return m[1] === 'ava' ? 'ava' : 'finn';
  }
  function stripWake(raw) { return clean(String(raw || '').replace(/^\s*(hey|hi|hello|ok|okay|yo)?\s*,?\s*(ava|finn|fin)\b[,!.:]?\s*/i, '')); }

  /* ---------------------------------------------------------------- screen scan (ported scanScreen, dashboard-aware ids) */
  var SEL = '[data-ava-id],[data-voice],button,a[href],input:not([type=hidden]):not([type=file]),textarea,select,[role=button],[role=option],[role=tab],[role=menuitem],[role=switch],.witem,.ritem,.boxclose,.boxmin';
  function shown(el) {
    if (!el.isConnected) return false;
    var tgt = el.matches('input[type=checkbox],input[type=radio]') ? (el.closest('label') || el) : el;
    var r = tgt.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    var cs = getComputedStyle(tgt); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
    if (el.closest('.closed,[hidden],[aria-hidden="true"]')) return false;
    return true;
  }
  function labelOf(el) {
    var tag = el.tagName.toLowerCase(), field = tag === 'input' || tag === 'select' || tag === 'textarea';
    var dv = el.getAttribute('data-voice'); if (dv) dv = dv.split('|')[0];
    var lab = el.getAttribute('data-ava-label') || dv || el.getAttribute('aria-label') || (field ? '' : el.innerText || '') || el.getAttribute('title') || el.getAttribute('placeholder') || (el.closest('label') ? el.closest('label').innerText : '') || '';
    return clean(lab).slice(0, 90);
  }
  function boxOf(el) { var b = el.closest('[data-w]'); return b ? b.getAttribute('data-w') : ''; }
  function scan() {
    var reg = new Map(), choices = [], seen = new Set();
    var els = document.querySelectorAll(SEL);
    var pri = [], rest = [];
    els.forEach(function (el) {
      if (seen.has(el)) return; seen.add(el);
      if (el.closest('.hca-agent') || el.closest('[data-ava-skip]')) return;
      if (!shown(el)) return;
      var lab = labelOf(el), tag = el.tagName.toLowerCase(), field = tag === 'input' || tag === 'select' || tag === 'textarea';
      var w = boxOf(el), id = el.getAttribute('data-ava-id') || '';
      if (!id) {
        if (el.closest('.wres') && w === 'ent') { var items = Array.prototype.filter.call(el.closest('.wres').children, shown); var top = el; while (top.parentElement && top.parentElement !== el.closest('.wres')) top = top.parentElement; var n = items.indexOf(top) + 1; if (n > 0) id = 'ent:result-' + n; }
        else if (el.classList.contains('witem')) { if (!lab) return; id = 'widget:' + slug(lab); }
        else { if (!lab && !field) return; id = (w ? w + ':' : '') + (tag === 'a' ? 'link' : field ? 'field' : 'btn') + ':' + slug(lab || el.getAttribute('name') || el.className || tag); }
      }
      if (reg.has(id)) { var k = 2; while (reg.has(id + '-' + k)) k++; id = id + '-' + k; }
      reg.set(id, el);
      var c = { id: id, label: lab || id };
      var type = el.type;
      if (field) c.kind = type || tag; else if (id.indexOf('widget:') === 0) c.kind = 'widget';
      if (el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' || (type === 'checkbox' && el.checked)) c.selected = true;
      if (el.disabled) c.disabled = true;
      if (field && type !== 'checkbox') c.value = String(el.value || '').slice(0, 120);
      if (tag === 'select') c.options = Array.prototype.map.call(el.options, function (o) { return o.value; });
      (id.indexOf('widget:') === 0 || id.indexOf('ent:') === 0 || w ? pri : rest).push(c);
    });
    choices = pri.concat(rest).slice(0, 180);
    var boxes = [];
    document.querySelectorAll('[data-w]').forEach(function (b) { if (!shown(b)) return; var t = b.querySelector('.wtitle, header b, .chead b'); boxes.push({ id: b.getAttribute('data-w'), title: t ? clean(t.innerText).slice(0, 40) : '', minimized: b.classList.contains('collapsed') || b.classList.contains('min') }); });
    var notes = [];
    try { if (window.__ytPicking && window.__ytPicking()) notes.push('YouTube results are showing: "play number n" = play_result(n).'); } catch (e) {}
    try { if (window.__ytCtl && window.__ytCtl.cur()) notes.push('A YouTube video is loaded in the YouTube box.'); } catch (e) {}
    return { screen: { title: document.title || 'HingeCraft dashboard', choices: choices, notes: notes, state: { open_boxes: boxes.slice(0, 30), assistant: S.cur ? P[S.cur].name : null } }, reg: reg };
  }

  /* ---------------------------------------------------------------- tool execution (ported exec) */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function setNative(el, v) {
    var proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var d = Object.getOwnPropertyDescriptor(proto, 'value'); if (d && d.set) d.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  async function settle() { await sleep(250); var prev = -1; for (var i = 0; i < 12; i++) { var n = document.querySelectorAll(SEL).length; if (n === prev) return; prev = n; await sleep(120); } }
  function flash(el) { try { el.classList.add('hca-flash'); setTimeout(function () { el.classList.remove('hca-flash'); }, 900); } catch (e) {} }
  function find(id, reg) {
    if (!id) return null;
    var fresh = scan().reg, old = reg && reg.get(id);
    var hit = fresh.get(id) || (old && old.isConnected ? old : null);
    if (hit) return hit;
    var key = String(id).toLowerCase(); var best = null;
    fresh.forEach(function (el, k) { if (!best && (k.slice(-key.length - 1) === ':' + key || k.split(':').pop() === key)) best = el; });
    return best;
  }
  function visibleQ(sel) { var a = document.querySelectorAll(sel); for (var i = 0; i < a.length; i++) if (shown(a[i])) return a[i]; return null; }
  async function ytOpen() {
    var q = visibleQ('[data-w="ent"] .wyq'); if (q) return q;
    var s = scan(), cand = null;
    s.reg.forEach(function (el, k) {
      if (cand) return; if (el.closest('[data-w="ent"]')) return;
      if (el.matches('a[href*="youtube.com"]')) return; /* the Social link opens the website, not the widget */
      if (/^widget:.*you-?tube/.test(k)) cand = el;
    });
    if (!cand) s.reg.forEach(function (el, k) { if (!cand && /you-?tube/.test(k) && !el.matches('a[href]') && !el.closest('[data-w="ent"]') && !/social/.test(k)) cand = el; });
    if (cand) { flash(cand); cand.click(); await settle(); q = visibleQ('[data-w="ent"] .wyq'); if (q) return q; }
    /* last resort: the dashboard's own YouTube rule, addressed explicitly (no wake word, no chat) */
    try { var VL = window.VoiceLayer; if (VL && VL.route && VL.route('open youtube') === 'youtube' && VL.handle) { VL.handle('open youtube'); await settle(); } } catch (e) {}
    return visibleQ('[data-w="ent"] .wyq');
  }
  async function exec(a, reg) {
    var args = a.args || {};
    switch (a.name) {
      case 'click': {
        var id = String(args.target_id || ''), el = find(id, reg);
        if (!el) return 'error: no clickable choice with id "' + id + '" on this screen';
        if (el.disabled) return 'error: "' + id + '" is disabled right now';
        if (/\b(send|gmail)\b/i.test(labelOf(el)) && el.closest('[data-w], .cbox, .compose')) {
          var lastU = lastUser(); if (!/\b(yes|yeah|yep|send it|go ahead|open (it )?in gmail|do it)\b/i.test(lastU) || /\b(no|don'?t|wait|stop|cancel|not yet)\b/i.test(lastU)) return 'error: blocked. Read back the recipient and subject with ask_user and wait for Dan to say yes before pressing a send/Gmail button.';
        }
        try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {}
        flash(el); var lab = labelOf(el) || id; el.click();
        return 'ok: clicked ' + id + ' (' + lab + ')';
      }
      case 'set_field': {
        var fid = String(args.field_id || ''), f = find(fid, reg);
        if (!f || !('value' in f)) return 'error: no field with id "' + fid + '"';
        var v = String(args.value == null ? '' : args.value);
        if (f instanceof HTMLSelectElement) { var opts = Array.prototype.map.call(f.options, function (o) { return o.value; }); if (opts.indexOf(v) < 0) return 'error: "' + v + '" is not one of ' + opts.join(', '); }
        flash(f); try { f.focus(); } catch (e) {} setNative(f, v);
        return 'ok: ' + fid + ' is now "' + String(f.value).slice(0, 80) + '"';
      }
      case 'youtube_search': {
        var qs = clean(args.query || '');
        var box = await ytOpen(); if (!box) return 'error: could not open the YouTube widget (no YouTube entry on screen)';
        if (!qs) return 'ok: YouTube widget is open';
        setNative(box, qs);
        var go = visibleQ('[data-w="ent"] .wys');
        if (go) go.click(); else box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        for (var i = 0; i < 20; i++) { await sleep(250); if (document.querySelectorAll('[data-w="ent"] .wres > *').length) break; }
        var n = document.querySelectorAll('[data-w="ent"] .wres > *').length;
        if (args.play_first && n) { var it = document.querySelector('[data-w="ent"] .wres > *'); var btn = it.querySelector('button,[role=button],a') || it; btn.click(); return 'ok: searched YouTube for "' + qs + '" and started the first result'; }
        return n ? 'ok: searched YouTube for "' + qs + '"; ' + n + ' results listed as ent:result-1..' + n : 'ok: search started for "' + qs + '" (results still loading)';
      }
      case 'play_result': {
        var k = parseInt(args.n, 10); var items = Array.prototype.filter.call(document.querySelectorAll('[data-w="ent"] .wres > *'), shown);
        if (!items.length) return 'error: no YouTube results are showing';
        if (!(k >= 1 && k <= items.length)) return 'error: there are only ' + items.length + ' results';
        var tgt = items[k - 1], b = tgt.querySelector('button.wplay,[data-a=play],button,[role=button]') || tgt;
        flash(tgt); b.click(); return 'ok: playing result ' + k;
      }
      case 'ask_user': return 'ok: question spoken; waiting for the user to answer';
      case 'say': return 'ok: spoken';
      default: return 'error: unknown tool ' + a.name;
    }
  }

  /* ---------------------------------------------------------------- voice (ported useVoice: STT half-duplex + Grok TTS) */
  var S = { cur: null, msgs: [], gen: 0, sgen: 0, thinking: false, speaking: false, listening: false, rec: null, recOn: false, audio: null, speakGen: 0, chain: Promise.resolve(), speech: Promise.resolve(), log: [], vlPaused: false, lastErr: '', speakVia: '', lastVoice: '' };
  function lastUser() { for (var i = S.msgs.length - 1; i >= 0; i--) if (S.msgs[i].role === 'user') return String(S.msgs[i].content || ''); return ''; }
  function startRec() {
    if (!SR || !S.cur) return;
    try { if (S.rec) S.rec.abort(); } catch (e) {}
    var rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
    rec.onstart = function () { S.listening = true; paint(); };
    rec.onresult = function (e) { var fin = '', mid = ''; for (var i = e.resultIndex; i < e.results.length; i++) { var t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t; else mid += t; } ui.heard(mid); fin = fin.trim(); if (fin.length >= 2) { ui.heard(''); onFinal(fin); } };
    rec.onerror = function (e) { if (e.error === 'no-speech' || e.error === 'aborted') return; S.lastErr = 'Speech recognition: ' + e.error; if (/not-allowed|service-not-allowed|audio-capture/.test(e.error)) S.recOn = false; paint(); };
    rec.onend = function () { S.listening = false; paint(); if (S.recOn && S.cur && !S.speaking) setTimeout(function () { if (S.recOn && S.cur && !S.speaking) startRec(); }, 250); };
    S.rec = rec; try { rec.start(); } catch (e) {}
  }
  function stopRec() { S.recOn = false; try { if (S.rec) S.rec.abort(); } catch (e) {} S.rec = null; S.listening = false; }
  function stopSpeaking() {
    S.speakGen++; try { speechSynthesis.cancel(); } catch (e) {}
    if (S.audio) { try { S.audio.onended = S.audio.onerror = null; S.audio.pause(); var s = S.audio.src; S.audio.src = ''; if (s.indexOf('blob:') === 0) URL.revokeObjectURL(s); } catch (e) {} S.audio = null; }
    S.speaking = false; paint();
  }
  function speakNow(text, voice) {
    return new Promise(function (resolve) {
      text = clean(text); if (!text) return resolve();
      /* chimegate-20261019c (Dan): corner Ava/Finn wait for dock chime + 2s when opened via ?src=dock */
      if (window.__hfChimeFromDock && !window.__hfChimeSkip) {
        var until = window.__hfChimeDoneAt || 0, played = !!window.__hfChimePlayed;
        if (!played || (until && Date.now() < until)) {
          var wait = played && until ? Math.max(40, until - Date.now()) : 80;
          try { console.log('[chimegate] defer agent speak', Date.now(), 'until', until, 'wait', wait, text.slice(0, 48)); } catch (e) {}
          setTimeout(function () { speakNow(text, voice).then(resolve); }, wait);
          return;
        }
      }
      try { console.log('[chimegate] agent speak start', Date.now(), 'doneAt', window.__hfChimeDoneAt || 0, text.slice(0, 48)); } catch (e) {}
      stopSpeaking(); var g = ++S.speakGen; S.speaking = true; S.lastVoice = voice; paint();
      try { if (S.rec) S.rec.abort(); } catch (e) {} /* half-duplex: never transcribe our own voice */
      var done = function () { if (g !== S.speakGen) return resolve(); S.speaking = false; paint(); if (S.recOn && S.cur) startRec(); resolve(); };
      var fallback = function () { if (g !== S.speakGen) return resolve(); S.speakVia = 'browser'; try { var u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 1.05; var fin = false, end = function () { if (fin) return; fin = true; done(); }; u.onend = u.onerror = end; setTimeout(end, 1500 + text.length * 90); speechSynthesis.speak(u); } catch (e) { done(); } };
      fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, voice_id: voice }) })
        .then(function (r) { if (g !== S.speakGen) throw 0; if (!r.ok) { S.lastErr = 'Grok TTS ' + r.status; throw 1; } return r.blob(); })
        .then(function (b) { if (g !== S.speakGen) return resolve(); var url = URL.createObjectURL(b), a = new Audio(url); S.audio = a; a.onended = function () { URL.revokeObjectURL(url); if (S.audio === a) S.audio = null; done(); }; a.onerror = function () { URL.revokeObjectURL(url); S.lastErr = 'TTS playback failed'; fallback(); }; S.speakVia = 'grok'; return a.play().catch(function () { S.lastErr = 'TTS play blocked'; fallback(); }); })
        .catch(function (e) { if (e === 0) return resolve(); fallback(); });
    });
  }
  /** Queue speech so multi-step replies never cut each other off; drop lines from superseded turns. */
  function speakOut(text) {
    var t = clean(text); if (!t || !S.cur) return;
    var gen = S.gen, sgen = S.sgen, voice = P[S.cur].voice;
    S.speech = S.speech.then(function () { if (gen !== S.gen || sgen !== S.sgen || !S.cur) return; ui.caption(P[S.cur].name, t); return speakNow(t, voice); });
  }

  /* ---------------------------------------------------------------- turn loop (ported runTurn / enqueueTurn) */
  async function runTurn(text) {
    var gen = S.gen, persona = S.cur, log = [], spoke = false;
    S.sgen++; ui.caption('You', text);
    /* 2026-10-17-tourfix-v2: the dashboard's own command stack first (same as the Fin bar: aliases, voice grammar, widgets);
       the model only gets what that stack doesn't know. Keeps the model's memory of the exchange. */
    var loc = null; try { loc = window.__hfLocal ? window.__hfLocal(text) : null; } catch (e) { loc = null; }
    if (loc) {
      var said0 = typeof loc.then === 'function' ? (loc.checking || 'Checking\u2026') : String(loc);
      S.msgs = S.msgs.concat([{ role: 'user', content: text }, { role: 'assistant', content: said0 }]).slice(-40);
      var it0 = { step: 0, tool: 'local', args: { text: text }, result: said0, source: 'local' }; log.push(it0); S.log = S.log.concat([it0]).slice(-60);
      speakOut(said0);
      if (typeof loc.then === 'function') { try { var later = await loc; if (gen === S.gen && later) { S.msgs = S.msgs.concat([{ role: 'assistant', content: String(later) }]).slice(-40); speakOut(String(later)); } } catch (e) {} }
      return log;
    }
    S.msgs = S.msgs.concat([{ role: 'user', content: text }]).slice(-40);
    S.thinking = true; paint();
    try {
      for (var step = 1; step <= MAX_STEPS; step++) {
        var s = scan(); window.__hcaLastScreen = s.screen;
        var r = await fetch('/api/assistant/turn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: persona, messages: S.msgs, screen: s.screen }) });
        if (gen !== S.gen) return log;
        if (!r.ok) throw new Error('assistant server ' + r.status);
        var j = await r.json();
        if (j.assistant && (j.assistant.content || j.assistant.tool_calls)) S.msgs = S.msgs.concat([j.assistant]);
        var actions = j.actions || [], acted = false, asked = false, toSay = [];
        for (var i = 0; i < actions.length; i++) {
          var a = actions[i], result;
          if (a.name === 'say') { if (!spoke || acted) toSay.push(String((a.args || {}).text || '')); result = 'ok: spoken'; }
          else if (a.name === 'ask_user') { toSay.push(String((a.args || {}).question || '')); asked = true; result = 'ok: question spoken; waiting for the user to answer'; }
          else { try { result = await exec(a, s.reg); } catch (e) { result = 'error: ' + (e && e.message || e); } acted = true; await settle(); }
          if (gen !== S.gen) return log;
          if (String(a.id || '').indexOf('local_') !== 0) S.msgs = S.msgs.concat([{ role: 'tool', tool_call_id: a.id, content: result }]);
          var item = { step: step, tool: a.name, args: a.args, result: result, source: j.source }; log.push(item); S.log = S.log.concat([item]).slice(-60);
        }
        var fin = clean(j.text || '');
        if (!actions.length && fin && !/^done\.?$/i.test(fin) && !spoke) toSay.push(fin);
        if (toSay.filter(Boolean).length) { speakOut(toSay.filter(Boolean).join(' ')); spoke = true; }
        if (!actions.length || asked || !acted) break;
      }
      if (!spoke) speakOut('Done.');
    } catch (e) {
      console.warn('[hca]', e && e.message || e);
      if (gen === S.gen) speakOut("Sorry, I couldn't reach my brain just now. Please try again.");
    } finally { if (gen === S.gen) { S.thinking = false; paint(); } }
    return log;
  }
  function enqueue(text) {
    var p = S.chain.then(function () {
      if (!S.cur) return [];
      if (isSoftCloser(text)) { speakOut('Okay.'); return []; }
      if (isDismiss(text)) { speakOut(/\b(bye|goodbye|see you)\b/i.test(text) ? 'Goodbye.' : "Okay, I'm here when you need me."); return S.speech.then(function () { deactivate(); return []; }); }
      return runTurn(text);
    });
    S.chain = p.catch(function () {}); return p;
  }
  function onFinal(text) {
    if (!S.cur) return;
    /* 2026-10-17-tourfix-v1: Finn's tutorial offer (yes / no / "start the tutorial") and the running tutorial take precedence */
    try { var FT = window.__finTour; if (FT && FT.claim && FT.claim(text)) return; } catch (e) {}
    var w = wakeTarget(text);
    if (w && w !== S.cur) { var rest = stripWake(text); switchTo(w); if (rest && !isSoftCloser(rest) && !isDismiss(rest)) enqueue(rest); return; }
    if (w === S.cur) { text = stripWake(text); if (!text) { speakOut("I'm here."); return; } }
    /* a new utterance interrupts whatever is still being said and drops queued lines */
    if (S.speaking) { S.sgen++; stopSpeaking(); }
    enqueue(text);
  }

  /* ---------------------------------------------------------------- on / off */
  function pauseDashboardVoice() {
    try { var VL = window.VoiceLayer; if (VL) { if (VL.endConversation) VL.endConversation(); if (VL.pause && VL.pause()) S.vlPaused = true; } } catch (e) {}
  }
  function resumeDashboardVoice() { try { var VL = window.VoiceLayer; if (S.vlPaused && VL && VL.resume) VL.resume(); } catch (e) {} S.vlPaused = false; }
  function activate(k, greet) {
    if (!P[k]) return; if (S.cur === k) return;
    if (S.cur) wipe();
    S.cur = k; S.msgs = []; S.gen++; S.sgen++;
    pauseDashboardVoice();
    S.recOn = !!SR; if (SR) startRec(); else S.lastErr = 'Voice input needs Chrome or Edge.';
    paint();
    if (greet !== false) speakOut(greet || ('Hi, I\u2019m ' + P[k].name + '. What would you like to do?'));
  }
  function wipe() { S.gen++; S.sgen++; S.speech = Promise.resolve(); S.chain = Promise.resolve(); stopSpeaking(); S.msgs = []; S.thinking = false; }
  function deactivate() { if (!S.cur) return; wipe(); stopRec(); S.cur = null; ui.caption('', ''); paint(); resumeDashboardVoice(); }
  function switchTo(k) { var was = S.cur; wipe(); stopRec(); S.cur = null; activate(k, 'Hi, ' + P[k].name + ' here.' + (was ? '' : '')); }

  /* ---------------------------------------------------------------- UI */
  var css = '.hca-agent{position:fixed;right:16px;bottom:96px;z-index:2147482000;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font:13px/1.35 Montserrat,system-ui,sans-serif;color:#fff;pointer-events:none}' +
    '.hca-row{display:flex;gap:10px;pointer-events:auto}.hca-face{position:relative;width:54px;height:54px;border-radius:50%;border:2px solid rgba(255,255,255,.55);padding:0;overflow:hidden;cursor:pointer;background:#223 center/cover;box-shadow:0 4px 14px rgba(0,0,0,.35)}' +
    '.hca-face img{width:100%;height:100%;object-fit:cover;display:block}.hca-face .hca-ini{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px}' +
    '.hca-face svg{position:absolute;inset:0;width:100%;height:100%}.hca-face svg line{stroke:#ff3b3b;stroke-width:9;stroke-linecap:round}.hca-face.on{border-color:#6ee7b7;box-shadow:0 0 0 3px rgba(110,231,183,.35),0 4px 14px rgba(0,0,0,.35)}' +
    '.hca-face.speaking{animation:hcaPulse 1s ease-in-out infinite}@keyframes hcaPulse{50%{box-shadow:0 0 0 7px rgba(110,231,183,.25)}}.hca-dot{position:absolute;right:3px;bottom:3px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #fff}' +
    '.hca-name{font-size:11px;text-align:center;margin-top:2px;text-shadow:0 1px 3px #000}.hca-cap{max-width:320px;background:rgba(15,18,30,.82);backdrop-filter:blur(6px);border-radius:12px;padding:8px 11px;pointer-events:auto;display:none}' +
    '.hca-cap.show{display:block}.hca-cap b{color:#6ee7b7}.hca-cap .you{opacity:.8;font-style:italic}.hca-st{font-size:11px;opacity:.75}.hca-flash{outline:3px solid #6ee7b7 !important;outline-offset:2px}';
  var root, faces = {}, cap, st, heardEl, capWho = '', capText = '', heardText = '';
  function build() {
    if (root) return;
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    root = document.createElement('div'); root.className = 'hca-agent'; root.setAttribute('data-ava-skip', '');
    cap = document.createElement('div'); cap.className = 'hca-cap'; cap.setAttribute('aria-live', 'polite');
    var row = document.createElement('div'); row.className = 'hca-row';
    ['ava', 'finn'].forEach(function (k) {
      var wrap = document.createElement('div');
      var b = document.createElement('button'); b.type = 'button'; b.className = 'hca-face'; b.setAttribute('data-hca', k);
      b.innerHTML = '<span class="hca-ini">' + P[k].name[0] + '</span><img alt="" src="' + P[k].img + '" onerror="this.remove()">';
      b.addEventListener('click', function (e) { e.stopPropagation(); if (S.cur === k) deactivate(); else if (S.cur) switchTo(k); else activate(k); });
      b.addEventListener('dblclick', function (e) { e.stopPropagation(); });
      var n = document.createElement('div'); n.className = 'hca-name'; n.textContent = P[k].name;
      wrap.appendChild(b); wrap.appendChild(n); row.appendChild(wrap); faces[k] = b;
    });
    root.appendChild(cap); root.appendChild(row); document.body.appendChild(root);
    paint();
  }
  var ui = {
    caption: function (who, t) { capWho = who; capText = t; paint(); clearTimeout(ui._t); if (who && who !== 'You') ui._t = setTimeout(function () { if (!S.speaking && !S.thinking) { capWho = ''; capText = ''; paint(); } }, 9000); },
    heard: function (t) { heardText = t || ''; paint(); }
  };
  function esc(t) { return String(t || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function paint() {
    if (!root) return;
    ['ava', 'finn'].forEach(function (k) {
      var b = faces[k], on = S.cur === k; b.classList.toggle('on', on); b.classList.toggle('speaking', on && S.speaking);
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.title = on ? 'Turn ' + P[k].name + ' off' : 'Turn ' + P[k].name + ' on and talk';
      var x = b.querySelector('svg'), dot = b.querySelector('.hca-dot');
      if (!on && !x) b.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 100 100" aria-hidden="true"><line x1="22" y1="22" x2="78" y2="78"/><line x1="78" y1="22" x2="22" y2="78"/></svg>');
      if (on && x) x.remove();
      if (on && S.listening && !S.speaking) { if (!dot) b.insertAdjacentHTML('beforeend', '<span class="hca-dot"></span>'); } else if (dot) dot.remove();
    });
    var status = !S.cur ? '' : S.speaking ? 'Speaking' : S.thinking ? 'Thinking\u2026' : S.listening ? 'Listening' : (S.lastErr || 'Ready');
    var html = '';
    if (S.cur) html += '<div class="hca-st">' + esc(P[S.cur].name) + ' \u00b7 ' + esc(status) + '</div>';
    if (heardText) html += '<div class="you">\u201c' + esc(heardText) + '\u2026\u201d</div>';
    else if (capText) html += capWho === 'You' ? '<div class="you">\u201c' + esc(capText) + '\u201d</div>' : '<div><b>' + esc(capWho) + ':</b> ' + esc(capText) + '</div>';
    cap.innerHTML = html; cap.classList.toggle('show', !!S.cur && !!html);
  }

  /* ---------------------------------------------------------------- test hooks + boot */
  window.__hca = {
    build: BUILD,
    on: function (k) { activate(k); }, off: deactivate,
    /** inject a transcript as if heard; resolves with the action log */
    test: function (k, text) { if (S.cur !== k) { if (S.cur) switchTo(k); else activate(k, false); } return enqueue(String(text)); },
    scan: function () { return scan().screen; },
    state: function () { return { build: BUILD, assistant: S.cur, voice: S.cur ? P[S.cur].voice : null, lastVoice: S.lastVoice, speakVia: S.speakVia, speaking: S.speaking, listening: S.listening, thinking: S.thinking, memory: S.msgs.length, dashboardVoicePaused: S.vlPaused, lastErr: S.lastErr, log: S.log.slice() }; },
    phrases: { isSoftCloser: isSoftCloser, isDismiss: isDismiss, wakeTarget: wakeTarget }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
