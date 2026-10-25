/* =====================================================================================================================
   HingeCraft Interface — voice-only TV control layer ("Yoda, …")                       build 2026-10-10-voice-tv-r1
   REVIEW BUILD. Not deployed, not wired into the live dashboard.

   Drop-in: load AFTER the dashboard's own scripts (it wraps window.__yodaHands, it never replaces it):
       <link rel="stylesheet" href="voice-layer.css">
       <script src="voice-layer.js"></script>
       <script>VoiceLayer.init({ engine: 'webspeech', sendPolicy: 'off' });</script>

   What it adds
     1. Wake word "Yoda" (always listening) -> LISTENING state (ring + chime) -> timeout back to IDLE; "Yoda, stop" / "never mind".
     2. Every control reachable by voice:
          - existing __yodaHands commands (boxes, fog, video, volume, widgets, email, roster handoff) keep working as is;
          - auto-discovered controls: anything with data-voice="name|synonym", aria-label, title, or short visible text;
          - "show numbers" -> numbered badges on every interactive element; "click 7", "double-click 7", "focus 7";
          - "scroll down", "go back".
     3. Quantified sizing: "expand Weather by half", "make Priorities 600 by 400", "Schedule full screen", "shrink News 20 percent".
     4. Email by voice: "open email", "read the first one", "next", "reply to this about …", "close reader", guarded "send it".
     5. Widget tiles: "open Pet Vault", plus create / rename (existing) and delete (now with a spoken confirm).
     6. Dictation: "type …", "dictate" … "stop dictation", "new line", "clear that", "press enter".
   Safety
     - Never navigates, never evals, never sends email unless Dan explicitly enables sendPolicy AND says "confirm".
     - Destructive actions (delete widget, clear field, reset layout, send) need a spoken "confirm" within 15 s.
     - The LLM fallback may only press controls that exist in the registry and are not on the deny list.
   ===================================================================================================================== */
(function (root) {
  'use strict';

  var VERSION = '2026-10-10-hangup-v1';
  var STAGE_W = 1024, STAGE_H = 576;                 /* the dashboard lays out on a fixed 1024x576 stage, scaled to the TV */

  /* ------------------------------------------------------------------------------------------------ configuration */
  var DEFAULTS = {
    engine: 'webspeech',              /* 'webspeech' | 'porcupine' | 'openwakeword' | 'none' (tests) */
    commandStt: 'webspeech',          /* after a keyword-only wake (porcupine/openwakeword): 'webspeech' | 'server' */
    lang: 'en-US',
    processLocally: true,             /* Chrome 142+ desktop: on-device recognition, audio never leaves the box */
    wakeWords: ['yoda'],
    wakeAliases: ['yoda', 'yoder', 'yota', 'yodah', 'yo da', 'yolda', 'iota', 'yoga', 'yodas', 'yoda s', 'yoders'],   /* 2026-10-12-voicefix-v1: + yoga, yoda's */   /* common mis-hearings of "Yoda" */
    /* 2026-10-10-wakewindow-v1 CONVERSATION MODE: after "Yoda" she stays on like a phone call; every utterance is a command/chat
       without repeating "Yoda", until "that's all" / "go to sleep" / "stop listening" / "thanks Yoda, that's it", or 5 minutes
       with no speech from Dan (reset by every utterance, including words still being spoken). Was: 8 s after a bare "Yoda",
       7 s after each reply. */
    listenMs: 300000,                 /* conversation idle timeout after "Yoda" (was 8000) */
    followUpMs: 300000,               /* conversation idle timeout after each reply (was 7000); restarts when Yoda stops talking */
    endSilenceMs: 1900,               /* 2026-10-10-wakewindow-v1: a command is complete after this much silence following speech;
                                         Chrome's separate final pieces ("Yoda open the" … "weather box") are joined into one command */
    holdMs: 15000,                    /* "Yoda, wait" / "hold on": keep the command open this long for the rest */
    maxCommandMs: 30000,              /* hard cap on one spoken command */
    dictateIdleMs: 45000,             /* dictation ends after this much silence */
    confirmMs: 15000,                 /* spoken confirmations expire */
    maxPerMinute: 40,                 /* local rate limit on executed commands */
    chime: true,
    sendPolicy: 'off',                /* 'off' (default: TV never sends) | 'gmail' (opens Gmail compose) | 'server' (POST, see server/voice-ws.ts) */
    sendEndpoint: '/api/voice/email/send',
    denySelector: '#cGmail, #btnRec, [data-voice-deny]',            /* never pressed by voice or by the LLM */
    confirmSelector: '.bdel, [data-voice-confirm], #cClear, #vbEnd', /* pressed by voice only after "confirm" */
    porcupine: { accessKey: '', keywordPath: '/voice/yoda_wasm.ppn', modelPath: '/voice/porcupine_params.pv',
                 moduleUrl: '/voice/porcupine-web.mjs', wvpUrl: '/voice/web-voice-processor.mjs', sensitivity: 0.6 },
    openWakeWord: { ortUrl: '/voice/ort.min.mjs', melUrl: '/voice/melspectrogram.onnx', embUrl: '/voice/embedding_model.onnx',
                    wakeUrl: '/voice/yoda.onnx', threshold: 0.5 },
    serverStt: { tokenUrl: '/api/voice/token', url: (root.location ? (root.location.protocol === 'https:' ? 'wss://' : 'ws://') + root.location.host : '') + '/voice/ws' },
    speak: null,                      /* function(text): default = dashboard voice (__voice.say), then speechSynthesis */
    llm: null,                        /* function(text, catalog): default = window.__voice.ask(text) (existing chat + ACTIONS whitelist) */
    onState: null,                    /* function(state, info) for embedding/telemetry */
    debug: false
  };
  var cfg = {};

  /* ------------------------------------------------------------------------------------------------ small helpers */
  var doc = root.document;
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return [].slice.call((ctx || doc).querySelectorAll(sel)); }
  function log() { if (cfg.debug && root.console) root.console.log.apply(root.console, ['[voice]'].concat([].slice.call(arguments))); }
  function now() { return Date.now(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function cap(s) { return String(s || '').replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }); }
  function isJsdom() { return /jsdom/i.test((root.navigator && root.navigator.userAgent) || ''); }
  /* damerau-levenshtein, for fuzzy control names ("whether" -> "weather") */
  function dist(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    if (Math.abs(m - n) > 3) return 9;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
      var c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  function uniq(a) { var s = {}; return a.filter(function (x) { x = String(x).trim(); if (!x || s[x]) return false; s[x] = 1; return true; }).map(function (x) { return String(x).trim(); }); }

  /* --------------------------------------------------------------------------------------- text normalisation */
  var ONES = { zero: 0, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };   /* "one" handled per rule */
  var TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  var ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
  /* "six hundred by four hundred" -> "600 by 400"; "twenty five percent" -> "25 percent" */
  function wordsToDigits(t) {
    var toks = t.split(' '), out = [], acc = null, i;
    function flush() { if (acc !== null) { out.push(String(acc)); acc = null; } }
    for (i = 0; i < toks.length; i++) {
      var w = toks[i], has = acc !== null;
      if (ONES[w] !== undefined) { if (has && acc % 10 !== 0) flush(); acc = (acc || 0) + ONES[w]; continue; }
      if (w === 'one' && has && acc % 10 === 0 && acc > 0 && acc % 100 !== 0) { acc += 1; continue; }
      if (TENS[w] !== undefined) { if (has && acc % 100 !== 0) flush(); acc = (acc || 0) + TENS[w]; continue; }
      if (w === 'hundred' && (has || toks[i - 1] === 'one' || toks[i - 1] === 'a')) { if (!has) { out.pop(); acc = 1; } acc *= 100; continue; }
      if (w === 'thousand' && has) { acc *= 1000; continue; }
      flush(); out.push(w);
    }
    flush();
    return out.join(' ');
  }
  /* lower-case, strip punctuation and politeness, keep digits */
  function norm(text) {
    var t = String(text || '').toLowerCase()
      .replace(/[\u2018\u2019']/g, '').replace(/[\u201c\u201d"]/g, '')
      .replace(/(\d),(\d)/g, '$1$2')
      .replace(/%/g, ' percent ')
      .replace(/(\d)\s*x\s*(\d)/g, '$1 by $2')
      .replace(/[^a-z0-9+ -]+/g, ' ').replace(/-/g, ' ')
      .replace(/\s+/g, ' ').trim();
    t = stripWake(t);
    t = t.replace(/\b(please|could you|can you|would you|will you|go ahead and|i want you to|i need you to|for me|thanks|thank you)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return wordsToDigits(t);
  }
  /* light form for free text (topics): keeps every word, only drops case, punctuation, the wake word and a leading "please" */
  function light(raw) { return stripWake(plain(raw)).replace(/^(please|can you|could you)\s+/, '').trim(); }
  var wakeRe = /^yoda\b[\s,.!:]*/i;
  function buildWake() {
    var alts = cfg.wakeWords.concat(cfg.wakeAliases).sort(function (a, b) { return b.length - a.length; }).map(function (w) { return w.replace(/ /g, '\\s'); }).join('|');
    wakeRe = new RegExp('^(?:(?:hey there|hey|ok|okay|hi there|hi|hello there|hello|yo|good morning|good afternoon|good evening)\\s)?(?:' + alts + ')\\b[\\s,.!:]*', 'i');
    /* 2026-10-17-wakeanywhere-v1: the strong wake names (Finn / Fin / Yoda, never loose aliases like "yoga") also wake mid- or
       end-of-phrase ("can you open the weather, Finn"). The start-of-phrase rule above is unchanged. */
    var strong = (cfg.wakeStrong || ['finn', 'fin', 'fynn', 'phin', 'yoda', 'ava']).join('|');
    wakeAnyRe = new RegExp('(?:^|[\\s,.!:?])(?:' + strong + ')\\b[\\s,.!:?]*', 'i');
    wakeAnyReG = new RegExp(wakeAnyRe.source, 'gi');
  }
  var wakeAnyRe = null, wakeAnyReG = null;
  function plain(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function hasWake(t) { var p = plain(t); return wakeRe.test(p) || !!(wakeAnyRe && wakeAnyRe.test(p)); }
  function stripWake(t) { var s = String(t).replace(wakeRe, ''); if (wakeAnyReG) s = s.replace(wakeAnyReG, ' ').replace(/\s+([,.!?])/g, '$1').replace(/^[\s,.!:?]+|[\s,]+$/g, '').replace(/\s+/g, ' '); return s.trim(); }

  /* ================================================================================================ STATE MACHINE
     off -> idle --wake--> listening --utterance--> busy --reply--> listening(follow-up) --timeout--> idle
                               |                      \--destructive--> confirm --"confirm"/"cancel"/timeout--> listening/idle
                               \--"dictate"--> dictate --"stop dictation"/silence--> listening
     "stop" / "never mind" from any state -> idle (and silences speech). */
  var S = { OFF: 'off', IDLE: 'idle', LISTENING: 'listening', BUSY: 'busy', CONFIRM: 'confirm', DICTATE: 'dictate' };
  var state = S.OFF, stateTimer = 0, pending = null, dictation = null, lastSaid = { text: '', at: 0 }, rate = [];
  var history = [];   /* recent {heard, said, via} for review/debugging */

  var listenKind = 'wake';
  function armListen(ms) { clearTimeout(stateTimer); stateTimer = setTimeout(function () { if (state === S.LISTENING && !coll) setState(S.IDLE, 'timeout'); }, ms); }
  function setState(s, info) {
    var prev = state; state = s;
    clearTimeout(stateTimer);
    if (s === S.LISTENING) { listenKind = info === 'followup' ? 'followup' : 'wake'; armListen(info === 'followup' ? cfg.followUpMs : cfg.listenMs); }
    if (s === S.DICTATE) stateTimer = setTimeout(function () { if (state === S.DICTATE) { endDictation(); setState(S.IDLE, 'timeout'); } }, cfg.dictateIdleMs);
    if (s === S.CONFIRM) stateTimer = setTimeout(function () { if (state === S.CONFIRM) { pending = null; ui.confirm(null); speak('Okay, I didn\u2019t do it.'); setState(S.IDLE, 'timeout'); } }, cfg.confirmMs);
    ui.state(s, info);
    if (cfg.chime && prev !== s) {
      if (s === S.LISTENING && prev === S.IDLE) chime('up');
      else if (s === S.IDLE && prev !== S.OFF) chime('down');
    }
    if (typeof cfg.onState === 'function') { try { cfg.onState(s, info); } catch (e) {} }
    try { doc.dispatchEvent(new root.CustomEvent('voicelayer:state', { detail: { state: s, prev: prev, info: info || '' } })); } catch (e) {}
    log('state', prev, '->', s, info || '');
  }

  /* audible cue: two short WebAudio tones (rising = listening, falling = back to idle) */
  var actx = null;
  function chime(dir) {
    try {
      var C = root.AudioContext || root.webkitAudioContext; if (!C) return;
      actx = actx || new C(); if (actx.state === 'suspended') actx.resume();
      var t = actx.currentTime, f = dir === 'up' ? [660, 990] : [880, 520];
      f.forEach(function (hz, i) {
        var o = actx.createOscillator(), g = actx.createGain(), t0 = t + i * 0.09;
        o.type = 'sine'; o.frequency.value = hz; g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
        o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + 0.12);
      });
    } catch (e) {}
  }

  /* TTS feedback hook. Default: the dashboard's own voice (Grok TTS "liora" via __voice.say), else the browser voice. */
  function speak(text) {
    text = String(text || '').trim(); if (!text) return;
    lastSaid = { text: plain(text), at: now() };
    ui.caption(text);
    if (typeof cfg.speak === 'function') { try { cfg.speak(text); } catch (e) {} return; }
    var v = root.__voice;
    if (v && typeof v.say === 'function') { v.say(text, null, true); return; }   /* actfix: a command confirmation is always spoken, even if it repeats */
    try { var u = new root.SpeechSynthesisUtterance(text); u.lang = cfg.lang; root.speechSynthesis.speak(u); } catch (e) {}
  }
  /* 2026-10-10-hangup-v1: silence(true) = hang up (end the call and the conversation); silence() = just stop talking / cancel
     the pending reply and keep the conversation (falls back to hangUp on pages without __voice.quiet). */
  var hanging = false;
  function silence(full) {
    var v = root.__voice;
    if (v && !full && typeof v.quiet === 'function') { try { v.quiet(); } catch (e) {} }
    else if (v && typeof v.hangUp === 'function' && !hanging) { hanging = true; try { v.hangUp(); } catch (e) {} hanging = false; }
    try { if (root.speechSynthesis) root.speechSynthesis.cancel(); } catch (e) {}
  }
  /* TV speakers feed Yoda's own words back into the mic: drop transcripts that echo the last spoken line */
  function isEcho(t) {
    if (!lastSaid.text || now() - lastSaid.at > 6000) return false;
    var a = plain(t); if (a.split(' ').length < 4 || hasWake(a)) return false;   /* short commands ("stop dictation") always pass */
    return lastSaid.text.indexOf(a) >= 0;
  }

  /* ================================================================================================ DOM ACTIONS
     Every action goes through the page's own handlers (synthetic pointer/click events), so clamping, saving to
     localStorage and side effects are identical to a hand on the mouse. Synthetic events are isTrusted=false, which the
     dashboard deliberately requires for "Open in Gmail": voice can never open Gmail through that button. */
  function stage() { return $('#stage'); }
  function scale() { var s = stage(); return (s && s.getBoundingClientRect().width / STAGE_W) || 1; }
  function center(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function ptr(el, type, x, y) {
    var P = root.PointerEvent || root.MouseEvent;
    el.dispatchEvent(new P(type, { bubbles: true, cancelable: true, composed: true, pointerId: 78, pointerType: 'mouse', isPrimary: true,
      button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
  }
  function press(el, dbl) {
    var c = center(el);
    ptr(el, 'pointerdown', c.x, c.y); ptr(el, 'pointerup', c.x, c.y);
    el.dispatchEvent(new root.MouseEvent('click', { bubbles: true, cancelable: true, clientX: c.x, clientY: c.y, detail: 1 }));
    if (dbl) {
      el.dispatchEvent(new root.MouseEvent('click', { bubbles: true, cancelable: true, clientX: c.x, clientY: c.y, detail: 2 }));
      el.dispatchEvent(new root.MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: c.x, clientY: c.y, detail: 2 }));
    }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) { try { el.focus(); } catch (e) {} }
    flash(el);
  }
  /* drag an element by (dx,dy) STAGE pixels using its own pointer handlers (scaled to screen pixels) */
  function dragBy(el, dx, dy) {
    var r = el.getBoundingClientRect(), s = scale(), x = r.left + Math.min(6, r.width / 2), y = r.top + Math.min(6, r.height / 2);
    ptr(el, 'pointerdown', x, y); ptr(el, 'pointermove', x + dx * s / 2, y + dy * s / 2);
    ptr(el, 'pointermove', x + dx * s, y + dy * s); ptr(el, 'pointerup', x + dx * s, y + dy * s);
  }
  function flash(el) {
    if (!el || !el.classList) return;
    el.classList.remove('vl-flash'); void el.offsetWidth; el.classList.add('vl-flash');
    setTimeout(function () { el.classList.remove('vl-flash'); }, 700);
  }
  function key(el, k) {
    el = el || doc.activeElement || doc.body;
    ['keydown', 'keyup'].forEach(function (t) { el.dispatchEvent(new root.KeyboardEvent(t, { key: k, bubbles: true, cancelable: true })); });
  }

  /* ================================================================================================ TARGETS (boxes)
     Floating boxes are read from the DOM (section[data-float]) so new boxes are picked up automatically. Each target
     knows its move handle and resize grip. The email reader is a target too. */
  var BOX_SYN = {
    'news-briefing': ['news briefing', 'news', 'headlines', 'briefing'], 'home-status': ['home status', 'home', 'house'],
    priorities: ['priorities', 'priority', 'to dos', 'todos', 'tasks'], schedule: ['schedule', 'calendar', 'agenda'],
    weather: ['weather', 'forecast'], other: ['other box', 'other widget', 'widgets box', 'other'], call: ['call box', 'calls', 'call', 'phone'],
    yoda: ['yoda bar', 'voice bar', 'assistant bar']
  };
  function targets() {
    var out = [];
    $$('#ui > section[data-float]').forEach(function (el) {
      var id = el.getAttribute('data-float'), hb = $('header b', el), names = (BOX_SYN[id] || []).slice();
      var dv = el.getAttribute('data-voice'); if (dv) names = names.concat(dv.toLowerCase().split('|'));
      if (hb) names.push(hb.textContent.trim().toLowerCase());
      names.push(id.replace(/-/g, ' '));
      out.push({ id: id, el: el, kind: 'float', names: uniq(names), label: id === 'yoda' ? 'the bot bar' : cap(id.replace(/-/g, ' ')),
        handle: ':scope > .fhandle', grip: ':scope > .boxresize' });
    });
    var rd = $('#emailReader');
    if (rd) out.push({ id: 'reader', el: rd, kind: 'reader', names: ['email reader', 'reader'], label: 'the email reader', handle: '.rhead', grip: '.rgrip' });
    return out;
  }
  /* the box named anywhere in a clause; longest name wins ("news briefing" over "news") */
  function findTarget(c) {
    var best = null, bl = 0;
    targets().forEach(function (t) { t.names.forEach(function (n) {
      if (n.length > bl && new RegExp('\\b' + n.replace(/ /g, '\\s') + '\\b').test(c)) { best = t; bl = n.length; } }); });
    return best;
  }
  var focusTarget = null;   /* last box touched by voice: "collapse" with no name means this one */
  function geom(t) {
    var el = t.el, cs = root.getComputedStyle(el);
    return { x: parseFloat(el.style.left || cs.left) || el.offsetLeft || 0, y: parseFloat(el.style.top || cs.top) || el.offsetTop || 0,
      w: parseFloat(el.style.width || cs.width) || el.offsetWidth || 0, h: parseFloat(el.style.height || cs.height) || el.offsetHeight || 0 };
  }
  function hands() { return root.__yodaHands; }
  function ensureVisible(t) {
    var H = hands();
    if (t.kind === 'float' && H && H.run && (t.el.classList.contains('closed') || t.el.classList.contains('collapsed'))) H.run({ a: 'restore', box: t.id });
  }
  function moveTo(t, x, y) {
    var h = $(t.handle, t.el); if (!h) return false;
    var g = geom(t); dragBy(h, x - g.x, y - g.y); return true;
  }
  function resizeTo(t, w, h) {
    ensureVisible(t);
    var grip = $(t.grip, t.el); if (!grip) return null;
    var g = geom(t);
    w = Math.round(clamp(w, 60, STAGE_W)); h = Math.round(clamp(h, 40, STAGE_H));
    /* boxes clamp at the stage edge, so slide the box first if the new size would not fit where it is */
    var nx = g.x + w > STAGE_W ? Math.max(0, STAGE_W - w) : g.x, ny = g.y + h > STAGE_H ? Math.max(0, STAGE_H - h) : g.y;
    if (nx !== g.x || ny !== g.y) { moveTo(t, nx, ny); g = geom(t); }
    dragBy(grip, w - g.w, h - g.h);
    var r = geom(t); flash(t.el); focusTarget = t;
    return { w: Math.round(r.w), h: Math.round(r.h), asked: { w: w, h: h } };
  }
  var fsSaved = {};   /* per-box geometry before "full screen", so "exit full screen" puts it back */
  function sizeReport(t, r) {
    var exact = Math.abs(r.w - r.asked.w) <= 2 && Math.abs(r.h - r.asked.h) <= 2;
    return cap(t.label) + ' is now ' + r.w + ' by ' + r.h + (exact ? '.' : ', as close as it fits.');
  }

  /* ================================================================================================ REGISTRY
     Auto-discovers every voice-addressable control. Spoken name sources, in priority order:
       data-voice="name|synonym|…"  >  aria-label  >  title  >  placeholder / <label>  >  short visible text.
     So a new feature becomes voice-controllable just by having one of those — no parser edits. Code can also add
     commands: VoiceLayer.register({ id, examples, match(c, raw) -> args|null, run(args, raw) -> spoken reply }). */
  var INTERACTIVE = '[data-voice],button,a[href],input:not([type=hidden]),textarea,select,[role=button],[role=option],[role=tab],' +
    '[role=menuitem],[role=link],[role=checkbox],[role=switch],.witem,.build,.dd-row,.ritem,.pritem,.gline,.greply,.boxclose,.fogbtn,.boxmin,.boxresize';
  var reg = { items: [], dirty: true };
  function visible(el) {
    if (!el.isConnected) return false;
    if (el.closest('.closed,[hidden],[aria-hidden=true],.vl-layer')) return false;
    for (var p = el; p && p !== doc.body; p = p.parentElement) {
      var cs = root.getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    if (isJsdom()) return true;   /* no layout engine in the test harness */
    var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  }
  function cleanName(s) {
    return String(s || '').toLowerCase().replace(/\(.*?\)/g, '')
      .replace(/[\u2190-\u21ff\u2700-\u27bf\u00d7\u2715\u2039\u203a\u2013\u2026\u270e]/g, ' ')
      .replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function nameOf(el) {
    var n = el.getAttribute('data-voice');
    if (!n) n = el.getAttribute('aria-label');
    if (!n) n = el.getAttribute('title');
    if (!n && el.placeholder) n = el.placeholder;
    if (!n && el.id) { var lb = $('label[for="' + el.id + '"]'); if (lb) n = lb.textContent; }
    if (!n && el.closest('label')) { var sp = el.closest('label').querySelector('span'); if (sp) n = sp.textContent; }
    var txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!n && txt && txt.length <= 48) n = txt;
    if (!n && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return [];
    var names = n ? String(n).split('|') : [];
    if (txt && txt.length <= 48 && !el.getAttribute('data-voice')) names.push(txt);   /* visible text is always a synonym */
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {   /* fields: their label, name and id are synonyms ("body", "subject", "to") */
      var lab = el.closest('label'), ls = lab && lab.querySelector('span'); if (ls) names.push(ls.textContent);
      if (el.name) names.push(el.name);
      if (el.id) names.push(el.id.replace(/^[a-z](?=[A-Z])/, '').replace(/([a-z])([A-Z])/g, '$1 $2'));
    }
    return uniq(names.map(cleanName));
  }
  function scan() {
    var items = [];
    $$(INTERACTIVE).forEach(function (el) {
      if (!visible(el)) return;
      var names = nameOf(el); if (!names.length) return;
      var box = el.closest('#ui > section[data-float]');
      items.push({ el: el, names: names,
        scope: box ? box.getAttribute('data-float') : el.closest('#emailReader') ? 'reader' : el.closest('#composeBox') ? 'compose' : '',
        field: /^(INPUT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable,
        deny: el.matches(cfg.denySelector), confirm: el.matches(cfg.confirmSelector) });
    });
    reg.items = items; reg.dirty = false;
    return items;
  }
  function registry() { if (reg.dirty) scan(); return reg.items; }
  /* best control(s) for a spoken phrase -> {hits, score}; several hits = ambiguous */
  function resolve(phrase, opt) {
    opt = opt || {};
    phrase = String(phrase || '').replace(/^(the|a|an)\s+/, '').replace(/\s+(button|icon|link|tab|tile|option|field)$/, '').trim();
    if (!phrase) return { hits: [], score: 0 };
    var best = 0, hits = [];
    registry().forEach(function (it) {
      if (opt.fieldsOnly && !it.field) return;
      if (opt.scope && it.scope !== opt.scope) return;
      var s = 0;
      it.names.forEach(function (n) {
        var v = 0;
        if (n === phrase) v = 100;
        else if (phrase.length >= 3 && n.indexOf(phrase + ' ') === 0) v = 80;
        else if (phrase.length >= 4 && (' ' + n + ' ').indexOf(' ' + phrase + ' ') >= 0) v = 70;
        else if (phrase.length >= 5 && dist(phrase, n) <= Math.floor(n.length / 5)) v = 60;
        if (v > s) s = v;
      });
      if (!s) return;
      if (s > best) { best = s; hits = [it]; } else if (s === best) hits.push(it);
    });
    /* nested matches (a tile and its own label) count once */
    hits = hits.filter(function (h, i) { return !hits.some(function (o, j) { return j !== i && h.el.contains(o.el) && h.el !== o.el; }); });
    return { hits: hits, score: best };
  }

  /* ================================================================================================ NUMBER OVERLAY */
  var numbered = [];   /* badge n -> registry item n-1 */
  function showNumbers(scopeId, only) {
    var layer = ui.layer(); layer.innerHTML = ''; numbered = [];
    var list = only || registry().filter(function (it) { return !scopeId || it.scope === scopeId; });
    list.forEach(function (it, i) {
      numbered.push(it);
      var r = it.el.getBoundingClientRect(), b = doc.createElement('span');
      b.className = 'vl-badge' + (it.deny ? ' vl-deny' : '') + (it.confirm ? ' vl-warn' : '');
      b.textContent = String(i + 1); b.style.left = Math.round(r.left) + 'px'; b.style.top = Math.round(r.top) + 'px';
      b.title = it.names[0];
      layer.appendChild(b);
    });
    layer.classList.add('on');
    return numbered.length;
  }
  function hideNumbers() { var l = ui.layer(); l.classList.remove('on'); l.innerHTML = ''; numbered = []; }

  /* ================================================================================================ CONFIRMATIONS */
  function ask(question, run) {
    pending = { question: question, run: run, misses: 0 };
    ui.confirm(question);
    return { say: question + ' Say \u201cconfirm\u201d, or \u201ccancel\u201d.', state: S.CONFIRM };
  }

  /* ================================================================================================ DICTATION */
  var lastField = null;
  function isField(a) { return a && (/^(INPUT|TEXTAREA)$/.test(a.tagName) || a.isContentEditable) && !a.disabled && !(a.closest && a.closest('.vl-layer')); }
  function textTarget() {
    var a = doc.activeElement;
    if (isField(a)) return a;
    if (lastField && lastField.isConnected && visible(lastField)) return lastField;
    var cb = $('#composeBox'); if (cb && cb.classList.contains('open')) return $('#cBody', cb);
    return null;
  }
  function fieldName(el) {
    var lb = el.closest && el.closest('label'), s = lb && lb.querySelector('span');
    if (s) return cap(cleanName(s.textContent));
    if (el.getAttribute('aria-label')) return cap(cleanName(el.getAttribute('aria-label')));
    if (el.id) return cap(el.id.replace(/^[a-z](?=[A-Z])/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
    return cap(nameOf(el)[0] || 'the field');
  }
  var PUNCT = [[/\s*\bcomma\b/gi, ','], [/\s*\b(period|full stop)\b/gi, '.'], [/\s*\bquestion mark\b/gi, '?'], [/\s*\bexclamation (mark|point)\b/gi, '!'],
    [/\s*\bsemicolon\b/gi, ';'], [/\s*\bcolon\b/gi, ':'], [/\bopen quote\s*/gi, '\u201c'], [/\s*\bclose quote\b/gi, '\u201d']];
  function spokenText(raw) {
    var t = String(raw || '').trim();
    PUNCT.forEach(function (p) { t = t.replace(p[0], p[1]); });
    t = t.replace(/\s+([,.?!:;])/g, '$1').replace(/([.?!]\s+)([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
    return t;
  }
  function insert(el, text) {
    if (!el) return false;
    var before = el.isContentEditable ? el.textContent : el.value;
    if (el.isContentEditable) el.textContent += text;
    else {
      var v = el.value, s = typeof el.selectionStart === 'number' ? el.selectionStart : v.length, e = typeof el.selectionEnd === 'number' ? el.selectionEnd : v.length;
      if (doc.activeElement !== el) { s = e = v.length; }   /* not focused: append */
      var pre = v.slice(0, s), sep = pre && !/\s$/.test(pre) && text && !/^[\s,.?!:;]/.test(text) ? ' ' : '';
      el.value = pre + sep + text + v.slice(e);
      var p = (pre + sep + text).length; try { el.setSelectionRange(p, p); } catch (er) {}
    }
    el.dispatchEvent(new root.Event('input', { bubbles: true }));
    if (!dictation || dictation.el !== el) dictation = { el: el, stack: [], live: !!(dictation && dictation.live) };
    dictation.stack.push({ el: el, before: before });
    lastField = el;
    return true;
  }
  function setValue(el, v) { if (el.isContentEditable) el.textContent = v; else el.value = v; el.dispatchEvent(new root.Event('input', { bubbles: true })); }
  function undoLast() {
    if (!dictation || !dictation.stack.length) return false;
    var u = dictation.stack.pop(); setValue(u.el, u.before); return true;
  }
  function endDictation() { if (dictation) dictation.live = false; ui.dictate(null); }

  /* ================================================================================================ EMAIL HELPERS */
  function feed() { return root.__emailFeed || { items: [], waiting: [] }; }
  function readerItem() {
    var R = root.__reader; if (!R || !R.isOpen()) return null; var c = R.current(); if (!c) return null;
    var L = (c.k === 'w' ? feed().waiting : feed().items) || []; return { cur: c, m: L[c.i], n: L.length };
  }
  function announce(x) {
    if (!x || !x.m) return 'No email open.';
    var who = x.cur.k === 'w' ? 'to ' + (x.m.to || 'someone') : 'from ' + (x.m.from || 'someone');
    return (x.cur.i + 1) + ' of ' + x.n + ': ' + who + ', \u201c' + (x.m.subject || 'no subject') + '\u201d.';
  }
  function composeOpen() { var C = root.__compose; return !!(C && C.isOpen && C.isOpen()); }
  function composeFields() { var C = root.__compose; return C && C.fields ? C.fields() : null; }

  /* ================================================================================================ GRAMMAR
     Each rule: { id, examples:[...], match(c, raw) -> args|null, run(args, raw) -> string | {say, state} | null }.
     c is the normalised utterance (lower case, wake word and politeness stripped, number words as digits).
     Rules run in order, first match wins; a run() that returns null falls through. Unmatched speech goes on to
     __yodaHands (all existing commands), then the auto-discovered registry, then the LLM. The examples double as the
     grammar table in DESIGN.md and as test cases. */
  var GROW = /\b(expand|grow|enlarge|bigger|larger|increase|widen|wider|taller|lengthen|stretch|blow up)\b/;
  var SHRINK = /\b(shrink|reduce|smaller|decrease|narrower|thinner|shorter|squeeze)\b/;
  function fraction(c) {
    var m;
    if ((m = /\b(\d{1,3}) percent\b/.exec(c))) return +m[1] / 100;
    if (/\bhalf\b/.test(c)) return 0.5;
    if (/\b(a |one )?third\b/.test(c)) return 1 / 3;
    if (/\b(a |one )?quarter\b/.test(c)) return 0.25;
    if (/\b(double|twice)\b/.test(c)) return 1;
    if (/\btriple\b/.test(c)) return 2;
    return null;
  }
  function ordinal(c) {
    var m = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d{1,2}(?:st|nd|rd|th)?|last|top|latest|newest)\b/.exec(c);
    if (!m) return null; var w = m[1];
    if (w === 'last') return -1; if (w === 'top' || w === 'latest' || w === 'newest') return 1;
    return ORD[w] || parseInt(w, 10) || null;
  }
  function widgetNames() {
    var W = root.__customWidgets;
    var b = W ? W.builtins().concat(W.list()) : $$('#ui .blist .build b').map(function (x) { return x.textContent.trim(); });
    return b.filter(function (n) { return !/^\+/.test(n); });
  }
  var PICK_FIRST = 'Pick a field first: say \u201cshow numbers\u201d, then \u201cfocus\u201d and the number.';

  var RULES = [
    /* ---- numbers overlay (Voice Access style) ---- */
    { id: 'numbers.show', examples: ['show numbers', 'show numbers in weather', 'number everything'],
      match: function (c) { return /^(show|display|turn on) (the )?numbers?\b|^number (everything|it all|the screen)$/.test(c) ? { t: findTarget(c) } : null; },
      run: function (a) { var n = showNumbers(a.t ? a.t.id : ''); return n ? n + ' numbers on screen. Say \u201cclick\u201d and a number.' : 'Nothing to number there.'; } },
    { id: 'numbers.hide', examples: ['hide numbers', 'numbers off'],
      match: function (c) { return /^(hide|remove|clear|turn off) (the )?numbers?$|^numbers? off$/.test(c) ? {} : null; },
      run: function () { hideNumbers(); return 'Numbers off.'; } },
    { id: 'numbers.pick', examples: ['click 7', 'double click 3', 'focus 2', 'number 4', 'press one'],
      match: function (c) {
        var m = /^(click|press|tap|select|choose|pick|open|double click|focus( on)?|go to|number)?\s*(?:number )?(\d{1,3}|one)$/.exec(c);
        if (!m || (!m[1] && !numbered.length)) return null;
        return { n: m[3] === 'one' ? 1 : +m[3], dbl: /double/.test(m[1] || ''), focus: /focus|go to/.test(m[1] || '') };
      },
      run: function (a) {
        if (!numbered.length) showNumbers();
        var it = numbered[a.n - 1]; if (!it) return 'There\u2019s no number ' + a.n + '.';
        hideNumbers(); return activate(it, a.dbl, a.focus);
      } },

    /* ---- quantified sizing / placement ---- */
    { id: 'size.exact', examples: ['make priorities 600 by 400', 'set weather to 300 by 200', 'schedule 400 x 250'],
      match: function (c) { var m = /\b(\d{2,4}) by (\d{2,4})\b/.exec(c), t = findTarget(c); return m && t && !/\bmove\b/.test(c) ? { t: t, w: +m[1], h: +m[2] } : null; },
      run: function (a) { var r = resizeTo(a.t, a.w, a.h); return r ? sizeReport(a.t, r) : cap(a.t.label) + ' can\u2019t be resized.'; } },
    { id: 'size.axis', examples: ['make news 400 wide', 'make schedule 300 tall'],
      match: function (c) { var m = /\b(\d{2,4}) (?:pixels? )?(wide|width|tall|high|height)\b/.exec(c), t = findTarget(c); return m && t ? { t: t, n: +m[1], w: /wid/.test(m[2]) } : null; },
      run: function (a) { ensureVisible(a.t); var g = geom(a.t), r = resizeTo(a.t, a.w ? a.n : g.w, a.w ? g.h : a.n); return r ? sizeReport(a.t, r) : null; } },
    { id: 'size.relative', examples: ['expand weather by half', 'shrink news 20 percent', 'make the schedule a third bigger', 'grow priorities by 100 pixels', 'make call twice as big', 'make weather wider by 25 percent'],
      match: function (c) {
        var t = findTarget(c); if (!t || !(GROW.test(c) || SHRINK.test(c) || /\b(double|twice|triple)\b/.test(c))) return null;
        var f = fraction(c), px = /\bby (\d{1,4}) ?(pixels?|px|points?)\b/.exec(c);
        if (f === null && !px) return null;   /* no number: plain "bigger" stays with __yodaHands (+20%) */
        return { t: t, f: f, px: px ? +px[1] : 0, smaller: SHRINK.test(c), wOnly: /\b(wider|widen|narrower|thinner)\b/.test(c), hOnly: /\b(taller|lengthen|shorter)\b/.test(c) };
      },
      run: function (a) {
        ensureVisible(a.t); var g = geom(a.t), k = a.smaller ? -1 : 1, w = g.w, h = g.h;
        if (a.f !== null) { var m = a.smaller ? Math.max(0.1, 1 - a.f) : 1 + a.f; if (!a.hOnly) w = g.w * m; if (!a.wOnly) h = g.h * m; }
        else { if (!a.hOnly) w = g.w + k * a.px; if (!a.wOnly) h = g.h + k * a.px; }
        var r = resizeTo(a.t, w, h); return r ? sizeReport(a.t, r) : null;
      } },
    { id: 'size.fullscreen', examples: ['schedule full screen', 'make priorities full screen', 'exit full screen on schedule', 'weather back to normal size'],
      match: function (c) {
        var t = findTarget(c); if (!t || t.id === 'yoda') return null;
        if (/\b(exit|leave|undo|out of|un) ?full ?screen\b|\bback to (normal|regular|its) size\b|\bnormal size\b/.test(c)) return { t: t, on: false };
        if (/\bfull ?screen\b|\bfill the screen\b|\bas big as possible\b/.test(c)) return { t: t, on: true };
        return null;
      },
      run: function (a) {
        if (a.on) {
          ensureVisible(a.t); if (!fsSaved[a.t.id]) fsSaved[a.t.id] = geom(a.t);
          moveTo(a.t, 0, 0); var r = resizeTo(a.t, STAGE_W, STAGE_H);
          var H = hands(); if (H && H.run && a.t.kind === 'float') H.run({ a: 'front', box: a.t.id });
          return r ? cap(a.t.label) + ' is full screen. Say \u201cexit full screen\u201d to put it back.' : null;
        }
        var s = fsSaved[a.t.id]; if (!s) return cap(a.t.label) + ' isn\u2019t full screen.';
        delete fsSaved[a.t.id]; resizeTo(a.t, s.w, s.h); moveTo(a.t, s.x, s.y); return cap(a.t.label) + ' is back to its size.';
      } },
    { id: 'move.coords', examples: ['move call to 300 200', 'move weather to x 40 y 80'],
      match: function (c) { var m = /\bmove\b.*?\bto (?:x )?(\d{1,4}),? (?:and )?(?:y )?(\d{1,4})$/.exec(c), t = findTarget(c); return m && t ? { t: t, x: +m[1], y: +m[2] } : null; },
      run: function (a) { ensureVisible(a.t); moveTo(a.t, a.x, a.y); flash(a.t.el); focusTarget = a.t; var g = geom(a.t); return 'Moved ' + a.t.label + ' to ' + Math.round(g.x) + ', ' + Math.round(g.y) + '.'; } },

    /* ---- email ---- */
    { id: 'email.open', examples: ['open email', 'show my inbox', 'check email', 'go to email'],
      match: function (c) { return /^(open|show|check|go to|bring up|pull up)( me)?( my| the)? (e ?mails?|inbox|mail)$/.test(c) ? {} : null; },
      run: function () {
        var P = root.__prio; if (!P) return null; P.show('email'); var f = feed(), n = (f.items || []).length, w = (f.waiting || []).length;
        return 'Email: ' + n + ' need' + (n === 1 ? 's' : '') + ' a reply' + (w ? ', ' + w + ' waiting on someone' : '') + '. Say \u201cread the first one\u201d.';
      } },
    { id: 'email.pick', examples: ['read the first one', 'open the second email', 'read email 3', 'open the last one', 'read the first waiting one'],
      match: function (c) {
        if (!/^(read|open|show|play)( me)? /.test(c)) return null;
        if (!/\b(one|email|message|mail|first|second|third|fourth|fifth|last|latest|\d{1,2})\b/.test(c) || /\b(from|by|widget|numbers?)\b/.test(c)) return null;
        if (findTarget(c) && !/\b(email|message|mail)\b/.test(c)) return null;
        var n = ordinal(c); if (n === null) return null;
        return { n: n, k: /\bwaiting\b/.test(c) ? 'w' : 'r', read: /^(read|play)/.test(c) };
      },
      run: function (a) {
        var R = root.__reader, L = (a.k === 'w' ? feed().waiting : feed().items) || []; if (!R) return null;
        if (!L.length) return a.k === 'w' ? 'Nothing is waiting on anyone.' : 'No emails need a reply right now.';
        var i = a.n === -1 ? L.length - 1 : a.n - 1; if (i < 0 || i >= L.length) return 'There are only ' + L.length + '.';
        R.open(a.k, i); var s = announce(readerItem());
        if (a.read) { var t = R.speakText(); if (t) s += ' ' + t; }
        return s;
      } },
    { id: 'email.step', examples: ['next', 'next one', 'previous', 'go back one'],
      match: function (c) {
        if (!(root.__reader && root.__reader.isOpen())) return null;
        if (/^(next|next one|next email|next message|skip)$/.test(c)) return { d: 1 };
        if (/^(previous|previous one|previous email|back one|go back one|prior)$/.test(c)) return { d: -1 };
        return null;
      },
      run: function (a) {
        var before = readerItem(); root.__reader.step(a.d); var x = readerItem();
        if (before && x && before.cur.i === x.cur.i) return a.d > 0 ? 'That was the last one.' : 'That\u2019s the first one.';
        return announce(x);
      } },
    { id: 'email.reply', examples: ['reply to this', 'reply to this about the meeting on monday', 'reply saying sounds good', 'follow up on this'],
      match: function (c, raw) {
        var RE = /^(reply|respond|answer|follow up)( to (this|it|that|her|him|them)| on (this|it|that))?( (about|saying|that|to say|telling (her|him|them)) (.+))?$/;
        var m = RE.exec(light(raw)) || RE.exec(c);
        return m && readerItem() ? { topic: m[8] || '' } : null;
      },
      run: function (a) {
        var x = readerItem(), C = root.__compose; if (!C) return null;
        C.replyTo(x.m, x.cur.k === 'w');
        var who = (x.cur.k === 'w' ? (x.m.to || 'them') : (x.m.from || 'them')).split(' ')[0];
        if (a.topic) { C.open({ about: a.topic }); C.draft(function (ok) { if (ok) speak('Draft\u2019s ready. Say \u201cread the draft\u201d, or \u201csend it\u201d.'); }); }
        return a.topic ? 'Drafting a reply to ' + who + ' about ' + a.topic + '. Nothing is sent.'
                       : 'Reply to ' + who + ' is open. Say \u201cdraft it about\u201d something, or \u201cdictate\u201d.';
      } },
    { id: 'email.draftAbout', examples: ['draft it about the github codes', 'draft it saying thanks'],
      match: function (c, raw) { var RE = /^draft (it|this|a reply|the reply) (about|saying|that) (.+)$/, m = RE.exec(light(raw)) || RE.exec(c); return m && composeOpen() ? { topic: m[3] } : null; },
      run: function (a) { var C = root.__compose; C.open({ about: a.topic }); C.draft(function (ok) { if (ok) speak('Draft\u2019s ready.'); }); return 'Drafting it now. Nothing is sent.'; } },
    { id: 'email.readDraft', examples: ['read the draft', 'read me the draft'],
      match: function (c) { return /^read( me)? (the |my )?(draft|reply)( back)?$/.test(c) ? {} : null; },
      run: function () { var f = composeFields(); if (!f || !composeOpen()) return 'There\u2019s no draft open.'; return f.body ? 'To ' + (f.to || 'nobody yet') + '. ' + f.body : 'The draft is empty.'; } },
    { id: 'email.closeReader', examples: ['close reader', 'close the email', 'close the email reader'],
      match: function (c) { return /^(close|hide|dismiss|exit)( the)? (email )?(reader|email|message)$/.test(c) ? {} : null; },
      run: function () { var R = root.__reader; if (!R || !R.isOpen()) return 'The reader isn\u2019t open.'; R.close(); return 'Closed the email.'; } },
    { id: 'email.send', examples: ['send it', 'send the email', 'send this reply'],
      match: function (c) { return /^send (it|this|that|the (e ?mail|reply|draft|message)|my (reply|draft)|this reply)( now)?$/.test(c) ? {} : null; },
      run: function () { return sendFlow(); } },

    /* ---- widget tiles ---- */
    { id: 'widget.delete', examples: ['delete widget garden', 'delete the garden widget', 'remove widget travel plans'],
      match: function (c) {
        var m = /^(delete|remove|get rid of)( the)?( custom)? widget( called| named)? (.+)$/.exec(c), n = m ? m[5] : null;
        if (!m && (m = /^(delete|remove|get rid of) the (.+?) widget$/.exec(c))) n = m[2];
        return n ? { name: n.trim() } : null;
      },
      run: function (a) {
        var W = root.__customWidgets; if (!W) return null;
        var hit = W.list().filter(function (n) { return n.toLowerCase() === a.name; })[0];
        if (!hit) return W.builtins().some(function (n) { return n.toLowerCase() === a.name; }) ? cap(a.name) + ' is a built-in widget, so it can\u2019t be deleted.' : 'I don\u2019t see a custom widget called ' + cap(a.name) + '.';
        return ask('Delete the ' + hit + ' widget?', function () { var r = W.remove(hit); return r.ok ? 'Deleted the ' + hit + ' widget.' : 'Couldn\u2019t delete it.'; });
      } },
    { id: 'widget.open', examples: ['open pet vault', 'show my recipe book', 'go to life canvas board'],
      match: function (c) {
        var m = /^(open|show|go to|launch|pull up|bring up)( me)?( the| my)? (.+?)( widget| tile)?$/.exec(c); if (!m) return null;
        var want = m[4], hit = null;
        widgetNames().forEach(function (n) { var l = cleanName(n); if (l === want || l === 'my ' + want || (want.length >= 6 && dist(l, want) <= 1)) hit = n; });
        return hit ? { name: hit } : null;
      },
      run: function (a) {
        var H = hands(); if (H && H.run) H.run({ a: 'open', box: 'other' });
        var tile = $$('#ui .blist .build').filter(function (t) { var b = $('b', t); return b && b.textContent.trim() === a.name; })[0];
        if (tile) { try { tile.scrollIntoView({ block: 'nearest' }); } catch (e) {} flash(tile); }
        /* future widgets: listen for this event, open yourself, and set detail.handled to what Yoda should say */
        var ev = new root.CustomEvent('hinge:widget-open', { detail: { name: a.name, tile: tile, handled: null } });
        doc.dispatchEvent(ev);
        return ev.detail.handled || (a.name + ' is a label for now \u2014 nothing is built inside it yet.');
      } },

    /* ---- dictation & fields ---- */
    { id: 'dictate.start', examples: ['dictate', 'start dictation', 'take dictation into subject'],
      match: function (c) { var m = /^(start )?(dictate|dictation|take dictation|start typing)( into| in)?( the)?( (.+?))?( field| box)?$/.exec(c); return m ? { field: m[6] || '' } : null; },
      run: function (a) {
        var el = a.field ? (resolve(a.field, { fieldsOnly: true }).hits[0] || {}).el : textTarget();
        if (!el) return PICK_FIRST;
        try { el.focus(); } catch (e) {} lastField = el; dictation = { el: el, stack: [], live: true }; ui.dictate(fieldName(el));
        return { say: 'Dictating into ' + fieldName(el) + '. Say \u201cstop dictation\u201d when you\u2019re done.', state: S.DICTATE };
      } },
    { id: 'focus.field', examples: ['go to the subject field', 'select the to field', 'focus on the body box'],
      match: function (c) { var m = /^(go to|select|focus( on)?|click|tap|use)( on)?( the)? (.+?) (field|box)$/.exec(c); return m && resolve(m[5], { fieldsOnly: true }).hits.length ? { name: m[5] } : null; },
      run: function (a) { var it = resolve(a.name, { fieldsOnly: true }).hits[0]; try { it.el.focus(); } catch (e) {} lastField = it.el; flash(it.el);
        return fieldName(it.el) + ' selected. Say \u201ctype\u201d and the words, or \u201cdictate\u201d.'; } },
    { id: 'type', examples: ['type hello trishala comma thanks for the codes', 'type garden', 'write see you monday'],
      match: function (c, raw) {
        var r = stripWake(String(raw).trim()).replace(/^[\s,.!:]+/, ''), m = /^(type|write)\s+(.+)$/i.exec(r);
        if (!m || /^write\s+(to|back|an? (e-?mail|note|message)|e-?mail)\b/i.test(r)) return null;
        return { text: m[2] };
      },
      run: function (a) { var el = textTarget(); if (!el) return PICK_FIRST; insert(el, spokenText(a.text)); return 'Typed.'; } },
    { id: 'newline', examples: ['new line', 'new paragraph'],
      match: function (c) { return /^new (line|paragraph)$/.test(c) ? { p: /para/.test(c) } : null; },
      run: function (a) { var el = textTarget(); if (!el || el.tagName !== 'TEXTAREA') return 'That field is one line only.'; insert(el, a.p ? '\n\n' : '\n'); return 'New line.'; } },
    { id: 'clear.that', examples: ['clear that', 'undo that', 'scratch that'],
      match: function (c) { return /^(clear|undo|scratch|delete|remove) that$/.test(c) ? {} : null; },
      run: function () { return undoLast() ? 'Cleared.' : 'Nothing to clear.'; } },
    { id: 'clear.field', examples: ['clear the field', 'clear all', 'erase everything'],
      match: function (c) { return /^(clear|erase|empty|wipe)( the)? (field|box|all|everything|text)$/.test(c) ? {} : null; },
      run: function () {
        var el = textTarget(); if (!el) return 'No field selected.'; var v = el.isContentEditable ? el.textContent : el.value; if (!v) return 'It\u2019s already empty.';
        return ask('Clear everything in ' + fieldName(el) + '?', function () { if (!dictation || dictation.el !== el) dictation = { el: el, stack: [], live: false };
          dictation.stack.push({ el: el, before: v }); setValue(el, ''); return 'Cleared. Say \u201cundo that\u201d to bring it back.'; });
      } },
    { id: 'key.enter', examples: ['press enter', 'submit', 'save that'],
      match: function (c) { return /^(press |hit )?(enter|return)$|^(submit|save that|save it)$/.test(c) ? {} : null; },
      run: function () { var el = doc.activeElement; if (!isField(el)) return 'Nothing to submit.'; key(el, 'Enter'); reg.dirty = true; return 'Done.'; } },
    { id: 'key.escape', examples: ['press escape', 'escape'],
      match: function (c) { return /^(press |hit )?(escape|esc)$/.test(c) ? {} : null; },
      run: function () { key(doc.activeElement, 'Escape'); return 'Okay.'; } },

    /* ---- scrolling / navigation ---- */
    { id: 'scroll', examples: ['scroll down', 'scroll up a lot', 'scroll to the bottom', 'scroll down in priorities'],
      match: function (c) {
        var m = /^scroll (up|down)( a lot| a little| a bit)?( in (.+))?$|^scroll to the (top|bottom)( of (.+))?$/.exec(c); if (!m) return null;
        var where = m[4] || m[7];
        return { dir: m[1] || (m[5] === 'top' ? 'up' : 'down'), amt: m[5] ? 'all' : /lot/.test(m[2] || '') ? 'lot' : /little|bit/.test(m[2] || '') ? 'bit' : 'page', t: where ? findTarget(where) : null };
      },
      run: function (a) {
        var el = scroller(a.t); if (!el) return 'Nothing to scroll there.';
        var h = el.clientHeight || 200, d = a.amt === 'all' ? 1e6 : a.amt === 'lot' ? h * 2 : a.amt === 'bit' ? h * 0.3 : h * 0.8;
        d = a.dir === 'up' ? -d : d;
        if (typeof el.scrollBy === 'function') el.scrollBy({ top: d, behavior: 'smooth' }); else el.scrollTop += d;
        return '';   /* silent: the screen is the feedback */
      } },
    { id: 'back', examples: ['go back', 'back'],
      match: function (c) { return /^(go )?back$/.test(c) ? {} : null; },
      run: function () { return goBack(); } },

    /* ---- generic press-by-name (auto-discovered registry) ---- */
    { id: 'press.name', examples: ['click reply in reader', 'press loop background videos', 'double click garden', 'tap the play button'],
      match: function (c) { var m = /^(click|press|tap|hit|choose|double click|toggle)( on)? (.+?)( in (?:the )?(.+))?$/.exec(c);
        if (!m) return null; var sc = m[5] ? findTarget(m[5]) : null; return { name: sc ? m[3] : m[3] + (m[4] || ''), dbl: /double/.test(m[1]), scope: sc }; },
      run: function (a) { return pressByName(a.name, { dbl: a.dbl, scope: a.scope ? a.scope.id : '' }) || 'I don\u2019t see \u201c' + a.name + '\u201d on screen. Say \u201cshow numbers\u201d.'; } },

    /* ---- layout / help ---- */
    { id: 'layout.reset', examples: ['reset the layout', 'reset everything'],
      match: function (c) { return /^reset (the )?(layout|everything|all (the )?boxes|the screen)$/.test(c) ? {} : null; },
      run: function () { return ask('Put every box back where it started?', function () { var H = hands(); return H && H.run ? H.run({ a: 'layout_reset' }) : null; }); } },
    { id: 'help', examples: ['what can i say', 'help'],
      match: function (c) { return /^(help|what can i say|what can you do|commands)$/.test(c) ? {} : null; },
      run: function () { showNumbers(); return 'Name a box and what to do, like \u201cmake Weather 400 by 300\u201d, \u201copen email\u201d, \u201copen Pet Vault\u201d, or say \u201cclick\u201d and a number.'; } }
  ];
  var extraRules = [];

  function activate(it, dbl, focus) {
    if (it.deny) return 'That one stays hands-on' + (it.el.id === 'cGmail' ? ': sending from Gmail is your call on the laptop.' : '.');
    var name = cap(it.names[0]);
    var go = function () {
      if (focus || it.field) {
        try { it.el.focus(); } catch (e) {} lastField = it.el;
        if (it.field) { flash(it.el); return name + ' selected. Say \u201ctype\u201d and the words, or \u201cdictate\u201d.'; }
      }
      press(it.el, dbl); reg.dirty = true; return dbl ? 'Double-clicked ' + name + '.' : 'Pressed ' + name + '.';
    };
    return it.confirm ? ask('Press ' + name + '?', go) : go();
  }
  function pressByName(name, o) {
    o = o || {};
    var r = resolve(name, { scope: o.scope });
    if (!r.hits.length) { reg.dirty = true; r = resolve(name, { scope: o.scope }); }   /* control may have appeared since the last scan */
    if (!r.hits.length) return null;
    if (r.hits.length > 1) { var n = showNumbers('', r.hits); return 'I see ' + n + ' of those. Say the number.'; }
    return activate(r.hits[0], o.dbl, false);
  }
  function scroller(t) {
    var cands = [];
    if (t) cands = [t.el].concat($$('*', t.el));
    else {
      var rd = $('#emailReader'); if (rd && rd.classList.contains('open')) cands.push($('.rbody', rd));
      if (focusTarget) cands = cands.concat($$('*', focusTarget.el));
      cands = cands.concat($$('#prioPanel.open .prlist, #ui .blist, #rosterPanel.open, #ui ol.plist'));
    }
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i]; if (!el || !visible(el)) continue;
      var cs = root.getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY + ' ' + cs.overflow) || el.scrollHeight > el.clientHeight + 4) return el;
    }
    return null;
  }
  function goBack() {
    if (numbered.length) { hideNumbers(); return 'Numbers off.'; }
    if (dictation && dictation.live) { endDictation(); return 'Stopped dictating.'; }
    var R = root.__reader, C = root.__compose, P = root.__prio, Ro = root.__roster;
    if (composeOpen()) { C.close(); return 'Closed the draft. It\u2019s kept.'; }
    if (R && R.isOpen()) { var b = $('#emailReader .rback'); if (b) press(b); else R.close(); return 'Back to the email list.'; }
    if (P && P.isOpen && P.isOpen()) { P.open(false); return 'Closed the categories.'; }
    if (Ro && Ro.isOpen && Ro.isOpen()) { Ro.open(false); return 'Closed the bot list.'; }
    var pr = $('#ui > section[data-float="priorities"]');
    if (P && pr && pr.getAttribute('data-prio-cat') && pr.getAttribute('data-prio-cat') !== 'all') { P.open(true); return 'Here are the priority categories.'; }
    return 'Nothing to go back to.';
  }

  /* ================================================================================================ SEND POLICY
     Sending email from the TV is Dan's decision. Default 'off': Yoda says so and keeps the draft.
       'gmail'  after "confirm", opens Gmail's compose window prefilled (Dan still presses Send in Gmail).
       'server' after "confirm", POSTs the draft to sendEndpoint (server/voice-ws.ts sketches the guarded route). */
  function sendFlow() {
    var C = root.__compose, f = composeFields();
    if (!composeOpen() || !f) return 'There\u2019s no draft open. Say \u201creply to this\u201d first.';
    if (!f.to) return 'The draft has no recipient yet.';
    if (!f.body) return 'The draft is empty. Say \u201cdraft it about\u201d something, or \u201cdictate\u201d.';
    var who = f.to.split(',')[0].replace(/<.*?>/, '').trim() || f.to;
    if (cfg.sendPolicy !== 'gmail' && cfg.sendPolicy !== 'server') return 'Sending from the TV is turned off, so your draft to ' + who + ' stays in the draft box. Send it from Gmail on your laptop.';
    return ask('Sending to ' + who + ', subject \u201c' + (f.subject || 'no subject') + '\u201d.', function () {
      if (cfg.sendPolicy === 'gmail') { var u = C.gmailUrl && C.gmailUrl(); if (!u) return 'I couldn\u2019t build the Gmail link.'; root.open(u, '_blank', 'noopener'); return 'Gmail is open with your draft. Press Send there.'; }
      var v = root.__voice, apiBase = (v && v.api) || '';
      root.fetch(apiBase + cfg.sendEndpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Voice-Confirmed': '1' },
        body: JSON.stringify({ to: f.to, subject: f.subject, body: f.body, confirmedBy: 'voice', at: new Date().toISOString() }) })
        .then(function (r) { speak(r.ok ? 'Sent.' : 'The server didn\u2019t send it (' + r.status + '). The draft is still here.'); })
        .catch(function () { speak('I couldn\u2019t reach the server. The draft is still here.'); });
      return 'Sending.';
    });
  }

  /* ================================================================================================ PIPELINE */
  var inPipeline = false, origLocal = null;
  /* 2026-10-12-voicefix-v1: spoken filler and common mis-hearings are cleaned off the raw words before any rule sees them */
  function cleanRaw(t) {
    var s = String(t || '');
    s = s.replace(/^(\s*(?:(?:hey|ok|okay|hi)[\s,]+)?)(?:yoga|yoda['\u2019]s|yodas|yoders?)\b/i, '$1Yoda');
    s = s.replace(/\bwhether\b/gi, 'weather').replace(/\bwhats\b/gi, 'what\u2019s').replace(/\bhows\b/gi, 'how\u2019s');
    s = s.replace(/(^|[\s,.!?])(?:u+m+|u+h+m*|e+r+m+|hmm+|a+h+|e+h+)(?=[\s,.!?]|$)/gi, '$1');
    s = s.replace(/\b(?:you know|kind of|sort of|basically|actually|i mean|literally)\b,?/gi, ' ');
    s = s.replace(/,\s*like\b,?|\blike,/gi, ' ');
    s = s.replace(/\blike\s+(?=(?:close|open|show|play|make|move|call|turn|switch|search|find|put|hide|minimi[sz]e|what|whats|what\u2019s|how|tell|read|check|start|stop|go|bring|give|pull)\b)/gi, '');
    s = s.replace(/\b(?:can|could|would|will) you(?: please)?\s+(?=\w)/gi, '').replace(/\b(?:i want you to|i need you to|go ahead and)\s+/gi, '').replace(/[,\s]*\bplease\b[,]?/gi, ' ');
    s = s.replace(/^(\s*(?:(?:hey|ok|okay|hi)[\s,]+)?yoda[\s,.!:]*)?(?:so|okay so|ok so|well|alright|all right|right)[,\s]+(?=\w)/i, '$1');
    return s.replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  }
  /* chained commands: "close weather and show Tokyo weather then play jazz on YouTube" -> each part runs (local rules only) */
  var CHAIN = /\s*(?:[,;]\s*)?\b(?:and then|then|after that|afterwards|and also|and)\b[\s,]*/i;
  function actionable(p) {
    var c = norm(p); if (!c) return false;
    var all = extraRules.concat(RULES);
    for (var i = 0; i < all.length; i++) { try { if (all[i].match(c, p)) return 'rule'; } catch (e) {} }
    try { var H = hands(); if (H && H.parse && H.parse(p).length) return 'hands'; } catch (e) {}
    if (c.split(' ').length >= 2 && /^(?:open|close|show|hide|switch|change|go|start|stop|play|pause|resume|turn|make|move|put|bring|minimi[sz]e|maximi[sz]e|restore|reset|mute|unmute|call|ring|phone|find|search|check|read|what|whats|how|hows|is|will|do|did|any|set|take|launch|exit|leave|shuffle|search|tell|give|pull)\b/.test(c)) return 'verb';
    return false;
  }
  function splitChain(raw) {
    var body = stripWake(String(raw).trim()).replace(/^[\s,.!:]+/, ''); if (!CHAIN.test(body)) return null;
    var bits = body.split(new RegExp(CHAIN.source, 'ig')).map(function (x) { return x.trim(); }).filter(Boolean); if (bits.length < 2) return null;
    var out = [], kinds = [];
    bits.forEach(function (b) { var k = actionable(b);
      if (!k && out.length) { out[out.length - 1] += ' and ' + b; return; }   /* "salt and pepper", "Trinidad and Tobago" */
      out.push(b); kinds.push(k); });
    if (out.length < 2 || (kinds.indexOf('rule') < 0 && kinds.indexOf('verb') < 0)) return null;   /* box-only chains stay with __yodaHands (it already chains) */
    return out;
  }
  /* one part: handoff / grammar / hands / control name -> {out, via} | null (null = needs the chat) */
  function core(raw) {
    var c = norm(raw); if (!c) return null; var H = hands();
    inPipeline = true;
    try {
      var g = grammar(c, raw); if (g) return { out: g.out, via: g.via };
      if (origLocal) { var cx = withContext(c), r = safeLocal(stripWake(String(raw).trim())) || (cx !== c ? safeLocal(cx) : null); if (r) { noteTarget(cx); return { out: r, via: 'hands' }; } }
      var m = /^(?:open|show|go to)?\s*(.+)$/.exec(c), pn = m && resolve(m[1]).score >= 80 ? pressByName(m[1]) : null;
      if (pn) return { out: pn, via: 'registry' };
    } finally { inPipeline = false; }
    return null;
  }
  function runChain(raw, parts) {
    var said = [], left = [];
    parts.forEach(function (p) { var r = core(p); if (!r) { left.push(p); return; }
      var o = r.out && typeof r.out === 'object' && typeof r.out.then !== 'function' ? r.out.say : r.out; if (typeof o === 'string' && o) said.push(o); });
    if (left.length) { var done = said.length ? '(Already done on screen: ' + said.join(' ') + ') ' : ''; llm(done + left.join(' and ')); return finish(raw, '', 'chain+llm'); }
    return finish(raw, said.join(' ') || 'Done.', 'chain');
  }
  function grammar(c, raw) {
    var all = extraRules.concat(RULES);
    for (var i = 0; i < all.length; i++) {
      var r = all[i], a = null;
      try { a = r.match(c, raw); } catch (e) { a = null; }
      if (!a) continue;
      var out = r.run(a, raw);
      if (out !== undefined && out !== null) return { out: out, via: 'grammar:' + r.id };
    }
    return null;
  }
  /* "collapse" / "make it bigger" with no box named -> the box Yoda last touched */
  var BOXVERB = /^(collapse|minimi[sz]e|restore|maximi[sz]e|expand|close|hide|bring it to the front|make it (bigger|smaller|wider|taller)|bigger|smaller|move it .+|fog (on|off)|reset it)$/;
  function withContext(c) {
    if (!focusTarget || findTarget(c) || !BOXVERB.test(c)) return c;
    return /\bit\b/.test(c) ? c.replace(/\bit\b/, focusTarget.names[0]) : c + ' ' + focusTarget.names[0];
  }
  function safeLocal(t) { try { return origLocal(t); } catch (e) { log('hands error', e && e.message); return null; } }
  function noteTarget(c) { var t = findTarget(c); if (t) focusTarget = t; }
  function rateOk() { var t = now(); rate = rate.filter(function (x) { return t - x < 60000; }); if (rate.length >= cfg.maxPerMinute) return false; rate.push(t); return true; }
  var STOP = /^(stop|stop it|stop talking|never ?mind|nevermind|cancel|forget it|be quiet|quiet|shut up|go to sleep|thats all|that is all)$/;
  /* ends the conversation (back to waiting for "Yoda"; the wake word stays on) */
  var END = /^(?:(?:ok|okay|alright|all right|great|perfect|cool|no|nope|thanks|thank you|thats great|good) )*(?:thats all|that is all|thats it|that is it|thats everything|thatll be all|that will be all|go to sleep|stop listening|goodbye|good bye|bye|bye bye|good night|were done|we are done|im done|i am done|done for now|end (?:the |this )?conversation|hang up|hang it up|nothing else|dismissed|later|see you|talk to you later|over and out|off|go off|go away|go away now|turn off|turn yourself off|shut off|shut yourself off|shut down|switch off|power off|power down|end (?:the |this )?call|disconnect|you can go|you can go now|thats enough|that is enough)(?: (?:thanks|thank you|for now|then|bye))*$/;
  function isEnd(c) { return END.test(String(c || '').replace(/\b(?:yoda|yoder|yota|yodah)\b/g, ' ').replace(/\s+/g, ' ').trim()); }
  var YES = /^(yes )?(confirm|confirmed|i confirm|yes confirm|confirm it|do it|yes do it)$/;
  var NO = /^(no|nope|dont|do not|cancel( it| that)?|abort)$/;

  /* one utterance already addressed to Yoda (wake word optional) -> {said, via} */
  function handle(raw) {
    raw = cleanRaw(raw);
    var c = norm(raw); if (!c) return { said: '', via: 'empty' };
    /* 0. end of the conversation: "that's all", "go to sleep", "stop listening", "thanks Yoda, that's it" */
    if (isEnd(c) && !(dictation && dictation.live && /^(done|im done|i am done)$/.test(c))) {
      if (coll) { clearTimeout(coll.t); coll = null; }
      pending = null; ui.confirm(null); endDictation(); hideNumbers(); silence(true);
      record(raw, 'Okay.', 'end'); speak('Okay.');
      setState(S.IDLE, 'end');
      return { said: 'Okay.', via: 'end' };
    }
    /* 1. universal stop: silences Yoda and cancels what was pending; the conversation stays on */
    if (STOP.test(c)) {
      var had = !!pending; pending = null; ui.confirm(null); endDictation(); hideNumbers(); silence();
      record(raw, had ? 'Cancelled.' : '', 'stop'); if (had) speak('Cancelled.');
      setState(S.LISTENING, 'followup');
      return { said: had ? 'Cancelled.' : '', via: 'stop' };
    }
    if (!rateOk()) return finish(raw, 'Give me a second \u2014 that\u2019s a lot of commands at once.', 'ratelimit');
    /* 2. a pending confirmation: only "confirm" runs it */
    if (pending) {
      if (YES.test(c)) { var p = pending; pending = null; ui.confirm(null); return finish(raw, p.run(), 'confirm'); }
      if (NO.test(c)) { pending = null; ui.confirm(null); return finish(raw, 'Okay, I didn\u2019t do it.', 'confirm'); }
      if (++pending.misses < 2) return finish(raw, 'Say \u201cconfirm\u201d or \u201ccancel\u201d.', 'confirm');
      pending = null; ui.confirm(null);   /* second miss: drop the confirm, treat this as a new command */
    }
    /* 3. live dictation: everything is text except the control words */
    if (dictation && dictation.live) {
      if (/^(stop|end|finish|done|exit) (dictation|dictating|typing)$|^(done|im done|done dictating)$/.test(c)) { endDictation(); return finish(raw, 'Stopped dictating.', 'dictate'); }
      if (/^new (line|paragraph)$/.test(c)) { insert(dictation.el, /para/.test(c) ? '\n\n' : '\n'); return finish(raw, '', 'dictate'); }
      if (/^(clear|undo|scratch) that$/.test(c)) { undoLast(); return finish(raw, '', 'dictate'); }
      insert(dictation.el, spokenText(stripWake(String(raw).trim()).replace(/^[\s,.!:]+/, ''))); return finish(raw, '', 'dictate');
    }
    var H = hands();
    /* 2026-10-17-actfix: the name that was called answers ("Ava, open recipes" = Ava), and the dashboard's natural-phrase aliases
       (media library, the vaults, settings, minimize everything, boards, schedule, invite...) run before this layer's grammar */
    try { if (root.__hfNameSwitch) root.__hfNameSwitch(raw); } catch (e) {}
    try { var al = root.__hfAlias ? root.__hfAlias(stripWake(String(raw).trim()), true) : null; if (typeof al === 'string' && al) return finish(raw, al, 'alias'); } catch (e) {}
    /* 2026-10-12-voicefix-v1: chained commands run part by part (including weather, YouTube, calls, Hub Rooms) */
    var chain = null; try { chain = splitChain(raw); } catch (e) { chain = null; }
    if (chain) return runChain(raw, chain);
    /* 4. roster handoff ("talk to Brain") — same precedence as the voice bar */
    try { if (H && H.handoff && H.handoff(raw)) { askDashboard(raw); return finish(raw, '', 'handoff'); } } catch (e) {}
    inPipeline = true;
    try {
      /* 5. this layer's grammar */
      var g = grammar(c, raw); if (g) return finish(raw, g.out, g.via);
      /* 6. the existing __yodaHands chain (boxes, fog, video, volume, widget create/rename, email by name, priorities …) */
      if (origLocal) {
        var cx = withContext(c), r = safeLocal(stripWake(String(raw).trim())) || (cx !== c ? safeLocal(cx) : null);
        if (r) { noteTarget(cx); return finish(raw, r, 'hands'); }
      }
      /* 7. a control's spoken name, alone or after open/show/go to */
      var m = /^(?:open|show|go to)?\s*(.+)$/.exec(c), pn = m && resolve(m[1]).score >= 80 ? pressByName(m[1]) : null;
      if (pn) return finish(raw, pn, 'registry');
    } finally { inPipeline = false; }
    /* 8. LLM fallback: dashboard chat (Yoda persona) + ACTIONS whitelist, extended with validated registry clicks */
    llm(raw); return finish(raw, '', 'llm');
  }
  function finish(raw, out, via) {
    var said = out && typeof out === 'object' ? out.say : out;
    record(raw, said, via);
    if (said) speak(said);
    reg.dirty = true;
    setState(pending ? S.CONFIRM : (dictation && dictation.live) ? S.DICTATE : S.LISTENING, 'followup');
    return { said: said || '', via: via };
  }
  function record(raw, said, via) { history.push({ at: now(), heard: String(raw), said: said || '', via: via }); if (history.length > 50) history.shift(); ui.heard(raw); }
  function askDashboard(text) { var v = root.__voice; if (v && v.ask) v.ask(text); }
  function llm(text) {
    if (typeof cfg.llm === 'function') { try { cfg.llm(text, catalog()); } catch (e) {} return; }
    askDashboard(text);
  }
  /* control names the LLM may use with {"a":"click","target":"…"}: visible, not denied, not confirm-gated */
  function catalog() {
    var out = []; registry().forEach(function (it) { if (!it.deny && !it.confirm && out.indexOf(it.names[0]) < 0) out.push(it.names[0]); });
    return out.slice(0, 80);
  }

  /* --------------------------------------------------------------------------------------- incoming transcripts
     ingest() is what a wake engine calls with each FINAL transcript. In IDLE it needs the wake word; once awake it takes
     everything. "Yoda, close weather" in one breath works; "Yoda" alone opens LISTENING. */
  /* 2026-10-10-wakewindow-v1: collect one whole spoken command. Chrome ends a "final" result at every short pause, so acting on the
     first piece ran half commands ("Yoda, can you" -> chat). Pieces are now joined until endSilenceMs of silence (interim results
     keep it open), "wait" / "hold on" keeps it open for holdMs, and the reply runs once. Idle phrases without "Yoda" (sleep/idle
     hooks: YouTube numbers, cook mode) and a bare "Yoda" still act at once. */
  var coll = null, barge = false;
  /* is this phrase part of what Yoda herself just said (dashboard reply or a layer line)? then it is her echo, not Dan */
  function saidIt(c) { var a = ' ' + c + ' ', l = [lastSaid.text, plain(root.__vbLastLine || '')];
    for (var i = 0; i < l.length; i++) if (l[i] && (' ' + norm(l[i]) + ' ').indexOf(a) >= 0) return true; return false; }
  var HOLD = /^(?:wait|wait a (?:sec|second|moment|minute)|hold on|hold on a (?:sec|second)|hang on|one (?:sec|second|moment)|just a (?:sec|second|moment)|give me a (?:sec|second|moment)|let me think|um+|uh+|er+|hmm+)$/;
  var FILLER = /^(?:hey|hi|hello|yo|ok|okay|yes|yeah|so|um+|uh+|er+|hmm+|are you there|you there|you up|are you up|are you awake|you awake|wake up|hello|hey there|how are you|are you listening|can you hear me|i need you|i have a question|listen|please|can you|could you|would you|i want you to|i need|i want)$/;
  function collArm() { if (!coll) return; clearTimeout(coll.t); clearTimeout(stateTimer);
    var wait = coll.hold ? cfg.holdMs : cfg.endSilenceMs; if (now() - coll.at0 > cfg.maxCommandMs) wait = 0;
    coll.t = setTimeout(collDone, wait); }
  function collDone() { var c0 = coll; coll = null; if (!c0) return;
    var txt = c0.parts.join(' ').replace(/\s+/g, ' ').trim();
    if (!txt || !stripWake(plain(txt))) { if (state !== S.OFF) setState(S.LISTENING, 'wake'); return; }   /* only "wait" / "Yoda": keep listening */
    ingestNow(c0.woke && !hasWake(txt) ? (cfg.wakeWords[0] || 'yoda') + ' ' + txt : txt); }   /* finfix-20261018a: the page's own wake word, not a literal "Yoda" */
  function ingest(text) {
    text = String(text || '').trim(); if (!text || state === S.OFF) return null;
    if (isEcho(text)) { log('echo dropped', text); return null; }
    if (barge) {   /* 2026-10-10-hangup-v1: Yoda is talking: only "stop" / enders get through (her own words never do) */
      var bc = norm(stripWake(plain(text)));
      /* 2026-10-17-tourfix-v1: "Finn, close the weather" said over his own voice: he stops talking and does it (was: dropped).
         Never during the tutorial, and never his own words heard back (saidIt). */
      if (hasWake(text) && bc && bc.split(' ').length >= 2 && !saidIt(bc) && !(STOP.test(bc) || isEnd(bc)) &&
          !(root.__finTour && root.__finTour.running && root.__finTour.running())) {
        if (coll) { clearTimeout(coll.t); coll = null; }
        try { if (root.__bargein && root.__bargein.halt) root.__bargein.halt('wake command'); else if (root.__voice && root.__voice.quiet) root.__voice.quiet(); } catch (e) {}
        log('barge wake command', text); setTimeout(function () { ingestNow(text); }, 200); return { said: '', via: 'barge-wake' };
      }
      if (!(STOP.test(bc) || isEnd(bc)) || saidIt(bc)) { log('barge dropped', text); return null; }
      if (coll) { clearTimeout(coll.t); coll = null; }
      if (state === S.IDLE && !hasWake(text)) return null;   /* waiting for the wake word: "Yoda, stop" */
      return ingestNow(text);
    }
    if (typeof api.sleeping === 'function' && api.sleeping()) return ingestNow(text);
    var p = plain(text), woke = hasWake(text), rest = stripWake(p);
    if (coll) {
      var cn = norm(rest);
      if (STOP.test(cn) || isEnd(cn)) { clearTimeout(coll.t); collDone(); return ingestNow(text); }   /* finish what was said, then stop/end */
      if (HOLD.test(rest)) { coll.hold = true; collArm(); return { said: '', via: 'hold' }; }
      coll.hold = false; coll.parts.push(woke && !coll.parts.length ? text : (woke ? stripWake(text) : text)); coll.woke = coll.woke || woke;
      ui.heard(coll.parts.join(' '), true); collArm(); return { said: '', via: 'collect' };
    }
    if (state === S.IDLE && !woke) return ingestNow(text);                       /* idle hook (no wake word) */
    if (state === S.CONFIRM || state === S.DICTATE || state === S.BUSY) return ingestNow(text);
    if (STOP.test(norm(stripWake(text))) || isEnd(norm(stripWake(text)))) return ingestNow(text);   /* stop / end at once */
    /* 2026-10-17-wakefix-v2: a greeting with the name ("Finn, hello", "hi Finn, how are you") is a real turn for the chat brain */
    if (woke && (!rest || (FILLER.test(rest) && !/^(?:hello|hi|hey|hey there|how are you|good morning|good afternoon|good evening|can you hear me|are you there)$/.test(rest)))) {                                    /* bare "Yoda" (or "Yoda, are you there"): chime + open window */
      return ingestNow(rest ? (cfg.wakeWords[0] || 'yoda') : text);   /* finfix-20261018a */
    }
    if (state === S.IDLE) setState(S.LISTENING, 'wake');
    coll = { parts: [], at0: now(), hold: false, woke: woke, t: 0 };
    if (HOLD.test(rest)) { coll.hold = true; collArm(); return { said: '', via: 'hold' }; }
    coll.parts.push(text); ui.heard(text, true); collArm(); return { said: '', via: 'collect' };
  }
  function ingestNow(text) {
    text = String(text || '').trim(); if (!text || state === S.OFF) return null;
    /* 2026-10-10-wakesleep-v1: optional page hook for a sleep mode. The listener keeps running; the hook returns null when
       awake (normal handling), false/'' to ignore the phrase while asleep, or a reply string (e.g. after "Yoda, start
       listening"), which is spoken. Unset = old behaviour (TV unchanged). */
    if (typeof api.sleepHook === 'function') {
      var sr = null; try { sr = api.sleepHook(text); } catch (e) { sr = null; }
      if (sr === false || sr === '') { if (state === S.LISTENING) setState(S.IDLE); return null; }
      if (typeof sr === 'string') { if (state !== S.IDLE) setState(S.IDLE); record(text, sr, 'sleep-hook'); speak(sr); return { said: sr, via: 'sleep-hook' }; }
    }
    var woke = hasWake(text);
    if (state === S.IDLE && !woke) {
      /* 2026-10-10 weathercall-lock-v1: optional page hook for words that need no wake word (YouTube results waiting for a
         number). Returns the reply, or null to ignore the phrase as before. TV and laptop share it; unset = old behaviour. */
      if (typeof api.idleHook === 'function') {
        var hr = null; try { hr = api.idleHook(text); } catch (e) { hr = null; }
        if (hr) { record(text, hr, 'idle-hook'); speak(hr); return { said: hr, via: 'idle-hook' }; }
      }
      return null;
    }
    if (woke && !stripWake(plain(text))) {   /* just "Yoda" */
      if (state === S.IDLE || state === S.LISTENING) setState(S.LISTENING, 'wake');
      ui.heard(''); speak('I\u2019m here.'); return { said: 'I\u2019m here.', via: 'wake' };   /* 2026-10-12-wakefix-v1 */
    }
    if (state === S.IDLE) setState(S.LISTENING, 'wake');
    if (state === S.LISTENING) setState(S.BUSY);
    return handle(text);
  }
  function interim(text) { if (barge || (typeof api.sleeping === 'function' && api.sleeping())) return;
    if (coll) { ui.heard((coll.parts.join(' ') + ' ' + text).trim(), true); clearTimeout(coll.t); coll.t = setTimeout(collDone, Math.max(cfg.endSilenceMs, coll.hold ? cfg.holdMs : 0) + 600); return; }   /* still talking */
    if (state === S.LISTENING) { armListen(Math.max(cfg.listenMs, 4000)); ui.heard(text, true); return; }
    if (state !== S.IDLE && state !== S.OFF) ui.heard(text, true); else if (hasWake(text)) ui.heard(text, true); }
  function wake() { if (state === S.IDLE) { setState(S.LISTENING, 'wake'); commandStt(); } }

  /* ================================================================================================ WAKE ENGINES
     Adapter interface:  { name, transcribes: bool, start(sink) -> Promise, stop() }
       sink.transcript(text, isFinal)  continuous engines (Web Speech) feed every phrase; the layer finds "Yoda" itself
       sink.wake()                     keyword-only engines (Porcupine / openWakeWord) signal the wake word; the layer then
                                       runs a one-shot command recogniser (Web Speech, or the server relay)
       sink.error(code, fatal)                                                                                         */
  var Engines = {};

  /* A. PRIMARY — Web Speech API, continuous (Chrome/Edge desktop). processLocally=true keeps audio on the TV box
        (Chrome 142+ desktop); older Chrome silently uses Google's cloud recogniser. */
  Engines.webspeech = function () {
    var SR = root.SpeechRecognition || root.webkitSpeechRecognition, rec = null, running = false, backoff = 250, sink = null, local = !!cfg.processLocally;
    function make() {
      rec = new SR(); rec.lang = cfg.lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 3;
      if (local && 'processLocally' in rec) rec.processLocally = true;
      rec.onresult = function (ev) {
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var r = ev.results[i], best = r[0].transcript;
          for (var k = 1; k < r.length; k++) if (!hasWake(best) && hasWake(r[k].transcript)) best = r[k].transcript;   /* "yoga" vs "yoda" */
          sink.transcript(best, r.isFinal);
        }
        backoff = 250;
      };
      rec.onerror = function (ev) {
        var fatal = /^(not-allowed|service-not-allowed|audio-capture|language-not-supported)$/.test(ev.error);
        /* 2026-10-12-wakefix-v1: on-device recogniser missing/unsupported -> fall back to Chrome's cloud recogniser once */
        if (local && /^(language-not-supported|service-not-allowed|network)$/.test(ev.error)) {
          local = false; try { rec.onend = null; rec.abort(); } catch (e) {}
          make(); setTimeout(function () { if (running) { try { rec.start(); } catch (e) {} } }, 300); return;
        }
        sink.error(ev.error, fatal); if (fatal) running = false; else if (ev.error !== 'no-speech') backoff = Math.min(backoff * 2, 8000);
      };
      rec.onend = function () { if (running) setTimeout(function again() { if (running) { try { rec.start(); } catch (e) { backoff = Math.min(backoff * 2, 8000); setTimeout(again, backoff); } } }, backoff); };   /* Chrome ends sessions every ~60 s */
    }
    return {
      name: 'webspeech', transcribes: true,
      start: function (s) {
        sink = s; if (!SR) return Promise.reject(new Error('Web Speech API not available in this browser'));
        var pre = Promise.resolve();
        if (local && SR.available) {   /* use on-device only when the model is already installed; else cloud now, install in background */
          pre = SR.available({ langs: [cfg.lang], processLocally: true }).then(function (st) {
            if (st !== 'available') { local = false; if (st === 'downloadable' && SR.install) { try { SR.install({ langs: [cfg.lang], processLocally: true }).catch(function () {}); } catch (e) {} } }
          }).catch(function () { local = false; });
        } else if (local && !SR.available) local = false;
        return pre.then(function () { make(); running = true; try { rec.start(); } catch (e) { if (local) { local = false; make(); rec.start(); } else throw e; } });
      },
      stop: function () { running = false; if (rec) { try { rec.abort(); } catch (e) {} } }
    };
  };

  /* B. Picovoice Porcupine Web (WASM) with a custom "Yoda" .ppn. Needs an AccessKey from an enterprise/trial account
        (Picovoice ended its free tier on 2026-06-30). Never hard-code the key: fetch it from an authenticated endpoint. */
  Engines.porcupine = function () {
    var worker = null, WVP = null;
    return {
      name: 'porcupine', transcribes: false,
      start: function (sink) {
        var p = cfg.porcupine; if (!p.accessKey) return Promise.reject(new Error('Porcupine needs an AccessKey'));
        return Promise.all([import(p.moduleUrl), import(p.wvpUrl)]).then(function (mods) {
          WVP = mods[1].WebVoiceProcessor;
          return mods[0].PorcupineWorker.create(p.accessKey, [{ label: 'yoda', publicPath: p.keywordPath, sensitivity: p.sensitivity }],
            function (det) { if (det && det.label === 'yoda') sink.wake(); }, { publicPath: p.modelPath });
        }).then(function (w) { worker = w; return WVP.subscribe(worker); });
      },
      stop: function () { if (worker && WVP) { WVP.unsubscribe(worker); worker.terminate(); worker = null; } }
    };
  };

  /* C. FALLBACK — openWakeWord via onnxruntime-web (free; we train our own "yoda.onnx", see DESIGN.md).
        Per 80 ms frame (1280 samples @16 kHz): melspectrogram.onnx -> sliding 76-frame window -> embedding_model.onnx
        (96-d) -> last 16 embeddings -> yoda.onnx -> score. UNTESTED SKETCH: check tensor shapes against the exported models. */
  Engines.openwakeword = function () {
    var ctx = null, node = null, stream = null, ort = null, s = {}, mel = [], emb = [], buf = new Float32Array(0), cool = 0;
    function cat(a, b) { var o = new Float32Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }
    function feed1(name, sess, data, dims) { var x = {}; x[sess.inputNames[0]] = new ort.Tensor('float32', data, dims); return sess.run(x).then(function (r) { return r[sess.outputNames[0]].data; }); }
    function step(sink, frame) {
      return feed1('mel', s.mel, frame, [1, frame.length]).then(function (m) {
        for (var i = 0; i < m.length; i += 32) mel.push(Array.prototype.map.call(m.slice(i, i + 32), function (v) { return v / 10 + 2; }));
        if (mel.length < 76) return; mel = mel.slice(-76);
        var win = new Float32Array(76 * 32); mel.forEach(function (row, i) { win.set(row, i * 32); });
        return feed1('emb', s.emb, win, [1, 76, 32, 1]).then(function (e) {
          emb.push(Array.prototype.slice.call(e)); if (emb.length < 16) return; emb = emb.slice(-16);
          var x = new Float32Array(16 * 96); emb.forEach(function (row, i) { x.set(row, i * 96); });
          return feed1('ww', s.ww, x, [1, 16, 96]).then(function (w) {
            if (w[0] >= cfg.openWakeWord.threshold && now() > cool) { cool = now() + 1500; sink.wake(); }
          });
        });
      });
    }
    return {
      name: 'openwakeword', transcribes: false,
      start: function (sink) {
        var o = cfg.openWakeWord;
        return import(o.ortUrl).then(function (m) {
          ort = m.default || m;
          return Promise.all([o.melUrl, o.embUrl, o.wakeUrl].map(function (u) { return ort.InferenceSession.create(u); }));
        }).then(function (ss) {
          s = { mel: ss[0], emb: ss[1], ww: ss[2] };
          return root.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
        }).then(function (st) {
          stream = st; ctx = new (root.AudioContext || root.webkitAudioContext)({ sampleRate: 16000 });
          var src = ctx.createMediaStreamSource(st), busy = false;
          node = ctx.createScriptProcessor(1024, 1, 1);   /* use an AudioWorklet in production */
          node.onaudioprocess = function (ev) {
            buf = cat(buf, ev.inputBuffer.getChannelData(0));
            if (buf.length >= 1280 && !busy) {
              var f = buf.slice(0, 1280).map(function (v) { return v * 32767; }); buf = buf.slice(1280); busy = true;
              step(sink, f).catch(function () {}).then(function () { busy = false; });
            }
          };
          src.connect(node); node.connect(ctx.destination);
        });
      },
      stop: function () { if (node) node.disconnect(); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); if (ctx) ctx.close(); }
    };
  };

  /* After a keyword-only wake, one utterance of speech-to-text:
       'webspeech' one-shot recogniser (on-device when available)
       'server'    16 kHz PCM16 over WebSocket to server/voice-ws.ts, which answers {type:'partial'|'final', text} */
  function commandStt() {
    if (!engine || engine.transcribes) return;
    if (cfg.commandStt === 'server') return serverStt();
    var SR = root.SpeechRecognition || root.webkitSpeechRecognition; if (!SR) return;
    var r = new SR(); r.lang = cfg.lang; r.interimResults = true; r.continuous = false;
    if (cfg.processLocally && 'processLocally' in r) r.processLocally = true;
    r.onresult = function (ev) { var res = ev.results[ev.results.length - 1]; if (res.isFinal) ingest(res[0].transcript); else interim(res[0].transcript); };
    try { r.start(); } catch (e) {}
  }
  function serverStt() {
    /* the relay only accepts a short-lived token minted behind the site's auth (see server/voice-ws.ts) */
    var tokenUrl = cfg.serverStt.tokenUrl || '/api/voice/token';
    root.fetch(tokenUrl, { credentials: 'include', cache: 'no-store' }).then(function (r) { return r.json(); })
      .then(function (j) { openRelay(cfg.serverStt.url + '?t=' + encodeURIComponent(j.token || '')); })
      .catch(function () { speak('I can’t reach the speech server.'); setState(S.IDLE, 'stt-error'); });
  }
  function openRelay(url) {
    var ws = new root.WebSocket(url), ctx = null, node = null, stream = null, done = false;
    function end() { if (done) return; done = true; try { ws.send(JSON.stringify({ type: 'end' })); } catch (e) {} if (node) node.disconnect(); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); if (ctx) ctx.close(); }
    ws.binaryType = 'arraybuffer';
    ws.onmessage = function (m) { var j = {}; try { j = JSON.parse(m.data); } catch (e) {} if (j.type === 'partial') interim(j.text); if (j.type === 'final') { end(); ws.close(); if (j.text) ingest(j.text); } };
    ws.onopen = function () {
      ws.send(JSON.stringify({ type: 'start', sampleRate: 16000, lang: cfg.lang }));
      root.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }).then(function (st) {
        stream = st; ctx = new (root.AudioContext || root.webkitAudioContext)({ sampleRate: 16000 });
        node = ctx.createScriptProcessor(2048, 1, 1);
        node.onaudioprocess = function (ev) {
          if (done) return; var f = ev.inputBuffer.getChannelData(0), pcm = new Int16Array(f.length);
          for (var i = 0; i < f.length; i++) pcm[i] = clamp(f[i], -1, 1) * 32767;
          ws.send(pcm.buffer);
        };
        ctx.createMediaStreamSource(st).connect(node); node.connect(ctx.destination);
        setTimeout(end, cfg.listenMs);   /* hard cap; the server also ends on trailing silence */
      });
    };
  }

  /* ================================================================================================ UI
     .vl-pill     listening indicator (top centre): state label, live transcript, caption of Yoda's reply
     .vl-confirm  confirm card;  .vl-badges  number overlay;  .vl-dictate  dictation banner
     html.vl-awake is set whenever Yoda is not idle (CSS dims nothing, just lights the ring). */
  var ui = (function () {
    var pill, text, label, card, layer, dict;
    var LABEL = { off: 'Voice off', idle: 'Say \u201cFinn\u201d or \u201cAva\u201d', listening: 'Listening\u2026', busy: 'Working\u2026', confirm: 'Say \u201cconfirm\u201d or \u201ccancel\u201d', dictate: 'Dictating\u2026' };
    function build() {
      if (pill || !doc.body) return;
      pill = doc.createElement('div'); pill.className = 'vl-pill vl-layer'; pill.setAttribute('role', 'status'); pill.setAttribute('aria-live', 'polite');
      pill.innerHTML = '<span class="vl-ring"><i></i></span><span class="vl-main"><b class="vl-state"></b><i class="vl-text"></i></span>';
      text = $('.vl-text', pill); label = $('.vl-state', pill);
      card = doc.createElement('div'); card.className = 'vl-confirm vl-layer'; card.setAttribute('role', 'alertdialog');
      layer = doc.createElement('div'); layer.className = 'vl-badges vl-layer';
      dict = doc.createElement('div'); dict.className = 'vl-dictate vl-layer';
      [pill, card, layer, dict].forEach(function (e) { doc.body.appendChild(e); });
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    return {
      build: build,
      state: function (s) { build(); if (!pill) return; pill.setAttribute('data-state', s); label.textContent = LABEL[s] || s;
        doc.documentElement.classList.toggle('vl-awake', s !== 'idle' && s !== 'off'); if (s === 'idle') text.textContent = ''; },
      heard: function (t, interimOnly) { build(); if (!text) return; var v = stripWake(String(t || '').trim()).replace(/^[\s,.!:]+/, '');
        text.textContent = v ? '\u201c' + v + '\u201d' : ''; text.classList.toggle('vl-interim', !!interimOnly); },
      caption: function (t) { build(); if (text) { text.textContent = t; text.classList.remove('vl-interim'); } },
      confirm: function (q) { build(); if (!card) return; card.classList.toggle('on', !!q);
        card.innerHTML = q ? '<b>' + esc(q) + '</b><span>Say \u201cconfirm\u201d or \u201ccancel\u201d</span>' : ''; },
      dictate: function (name) { build(); if (!dict) return; dict.classList.toggle('on', !!name); dict.textContent = name ? 'Dictating into ' + name + ' \u2014 say \u201cstop dictation\u201d' : ''; },
      layer: function () { build(); return layer; }
    };
  })();

  /* ================================================================================================ __yodaHands INTEGRATION
     - H.local is wrapped (same pattern as the dashboard's own patches), so lines typed in the Yoda bar get this grammar too.
     - H.wrap tells the LLM about the auto-discovered control names; H.fromReply accepts {"a":"click","target":"…"} but only
       for a registry name that resolves to exactly one visible control that is neither denied nor confirm-gated.
       Every other ACTIONS item still goes through the original whitelist untouched. */
  function integrate() {
    var H = hands(); if (!H || H.__voiceLayer) return;
    origLocal = H.local;
    H.local = function (text) {
      if (inPipeline) return origLocal(text);
      text = cleanRaw(text);
      var c = norm(text);
      if (!pending) { var ch = null; try { ch = splitChain(text); } catch (e) { ch = null; }
        if (ch) { var sd = [], lf = []; ch.forEach(function (p) { var r = core(p); if (!r) { lf.push(p); return; } var o = r.out && typeof r.out === 'object' && typeof r.out.then !== 'function' ? r.out.say : r.out; if (typeof o === 'string' && o) sd.push(o); });
          if (!lf.length) return sd.join(' ') || 'Done.'; }   /* a part that needs the chat: the whole line goes to the chat as before */
      }
      if (pending && (YES.test(c) || NO.test(c))) { var p = pending; pending = null; ui.confirm(null); var o = YES.test(c) ? p.run() : 'Okay, I didn\u2019t do it.'; return o && typeof o === 'object' ? o.say : o; }
      var g = null; inPipeline = true;
      try { g = grammar(c, String(text || '')); } finally { inPipeline = false; }
      if (g) return g.out && typeof g.out === 'object' ? g.out.say : (g.out || 'Done.');
      return origLocal(text);
    };
    var w0 = H.wrap;
    H.wrap = function (t) {
      var s = w0 ? w0(t) : t, k = s.indexOf('] Dan says: '); if (s === t || k < 0) return s;   /* not action-like: leave the chat alone */
      return s.slice(0, k) + ' Also {"a":"click","target":"<exact name>"} presses an on-screen control; names: ' + catalog().slice(0, 40).join(', ') + s.slice(k);
    };
    var f0 = H.fromReply;
    H.fromReply = function (reply) {
      var m = /\bACTIONS:\s*(\[[\s\S]*\])\s*\.?\s*$/i.exec(reply || ''), list;
      if (!m) return f0(reply);
      try { list = JSON.parse(m[1]); } catch (e) { return f0(reply); }
      if (!Array.isArray(list)) return f0(reply);
      var said = [], rest = list.filter(function (o) {
        if (!o || String(o.a || '').toLowerCase() !== 'click') return true;
        var r = resolve(cleanName(o.target));
        if (r.hits.length === 1 && r.score >= 80 && !r.hits[0].deny && !r.hits[0].confirm) { press(r.hits[0].el); said.push('Pressed ' + cap(r.hits[0].names[0]) + '.'); }
        return false;   /* clicks never reach the original whitelist */
      });
      var head = reply.slice(0, m.index).trim();
      var out = rest.length ? f0((head + ' ACTIONS: ' + JSON.stringify(rest)).trim()) : head;
      return out || said.join(' ') || 'Done.';
    };
    H.__voiceLayer = VERSION;
    H.voice = api;
  }

  /* ================================================================================================ PUBLIC API */
  var engine = null, fellBack = false, bound = false, paused = false, lastSink = null;   /* 2026-10-10-wakeword-v1: pause()/resume() for the laptop */
  var api = {
    version: VERSION,
    init: function (opts) {
      cfg = {}; Object.keys(DEFAULTS).forEach(function (k) { cfg[k] = DEFAULTS[k]; });
      Object.keys(opts || {}).forEach(function (k) { cfg[k] = opts[k]; });
      buildWake(); ui.build(); integrate();
      if (!bound) {
        bound = true;
        doc.addEventListener('focusin', function (e) { if (isField(e.target)) lastField = e.target; });
        if (root.MutationObserver) new root.MutationObserver(function () { reg.dirty = true; }).observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-label', 'title', 'data-voice'] });
      }
      setState(S.IDLE, 'init');
      if (cfg.engine === 'none') return Promise.resolve(api);
      return api.start(cfg.engine);
    },
    /* start a wake engine; if it fails, try the other family once (webspeech <-> porcupine/openwakeword) */
    start: function (name) {
      var mk = Engines[name]; if (!mk) return Promise.reject(new Error('unknown engine ' + name));
      if (engine) { try { engine.stop(); } catch (e) {} }
      engine = mk();
      var sink = { transcript: function (t, fin) { if (fin) ingest(t); else interim(t); }, wake: wake,
        error: function (code, fatal) { log('engine error', code); if (fatal) { ui.caption(code === 'not-allowed' ? 'Microphone blocked \u2014 allow it in the kiosk settings' : 'Voice error: ' + code); setState(S.OFF, code); } } };
      lastSink = sink; paused = false;
      if (state === S.OFF) setState(S.IDLE, 'start');
      return engine.start(sink).then(function () { return api; }, function (err) {
        log('engine failed', name, err && err.message);
        if (fellBack) { setState(S.OFF, 'no engine'); throw err; }
        fellBack = true;
        return api.start(name === 'webspeech' ? (cfg.porcupine.accessKey ? 'porcupine' : 'openwakeword') : 'webspeech');
      });
    },
    stop: function () { if (coll) { clearTimeout(coll.t); coll = null; } if (engine) engine.stop(); paused = false; doc.documentElement.classList.remove('vl-paused'); setState(S.OFF, 'stopped'); },
    /* 2026-10-10-wakeword-v1 (laptop): release the mic while the voice bar's own mic or Yoda's voice is busy, then pick up
       where it left off (state, pending confirm and dictation are kept; a follow-up window restarts on resume). TV never calls these. */
    pause: function () { if (!engine || paused || state === S.OFF) return false; paused = true; try { engine.stop(); } catch (e) {} doc.documentElement.classList.add('vl-paused'); return true; },
    resume: function () {
      if (!paused) return Promise.resolve(false); paused = false; doc.documentElement.classList.remove('vl-paused');
      if (!engine || !lastSink || state === S.OFF) return Promise.resolve(false);
      if (state === S.LISTENING && !coll) setState(S.LISTENING, listenKind === 'wake' ? 'wake-resume' : 'followup');
      return engine.start(lastSink).then(function () { return true; }, function () { return false; });
    },
    paused: function () { return paused; },
    /* 2026-10-10-hangup-v1 (laptop): while Yoda talks the engine keeps running in barge mode (enders / stop only) */
    barge: function (on) { if (on === undefined) return barge; barge = !!on; doc.documentElement.classList.toggle('vl-barge', barge); return barge; },
    isEnder: function (t) { return isEnd(norm(stripWake(plain(t)))); },
    /* hang-up button: end the conversation now, back to waiting for "Yoda" (no speech, never calls back into __voice) */
    endConversation: function () { if (coll) { clearTimeout(coll.t); coll = null; } pending = null; try { ui.confirm(null); endDictation(); hideNumbers(); } catch (e) {}
      if (state !== S.OFF && state !== S.IDLE) setState(S.IDLE, 'hangup'); return state; },
    /* feed text as if heard — used by the test harness and for debugging from the console */
    hear: ingest, hearNow: function (t) { return ingestNow(t); }, handle: handle, interim: interim, collecting: function () { return coll ? coll.parts.join(' ') : null; },
    wake: function () { if (state === S.IDLE) setState(S.LISTENING, 'wake'); },
    state: function () { return state; },
    pending: function () { return pending ? pending.question : null; },
    dictating: function () { return !!(dictation && dictation.live); },
    numbers: function () { return numbered.map(function (it) { return it.names[0]; }); },
    registry: function () { reg.dirty = true; return registry().map(function (it) { return { name: it.names[0], names: it.names.slice(), scope: it.scope, field: it.field, deny: it.deny, confirm: it.confirm }; }); },
    resolve: function (p) { return resolve(norm(p)).hits.map(function (h) { return h.names[0]; }); },
    /* which grammar rule would take this phrase (no side effects) — for debugging and the grammar test */
    route: function (t) { var c = norm(t), all = extraRules.concat(RULES); for (var i = 0; i < all.length; i++) { try { if (all[i].match(c, String(t))) return all[i].id; } catch (e) {} } return null; },
    rules: function () { return extraRules.concat(RULES).map(function (r) { return { id: r.id, examples: r.examples.slice() }; }); },
    register: function (rule) { if (rule && rule.id && rule.match && rule.run) { rule.examples = rule.examples || []; if (rule.first) extraRules.unshift(rule); else extraRules.push(rule); } return api; },
    cleanRaw: function (t) { return cleanRaw(t); }, chain: function (t) { return splitChain(cleanRaw(t)); },
    history: function () { return history.slice(); },
    norm: norm, catalog: catalog, engines: Engines,
    config: function () { var o = {}; Object.keys(cfg).forEach(function (k) { o[k] = cfg[k]; }); return o; }
  };
  root.VoiceLayer = api;

  /* Same index.html serves the laptop and the TV: the layer only switches itself on for ?tv=1 (the kiosk URL).
     Optional config: window.VOICE_TV_CONFIG = { engine:'webspeech', sendPolicy:'off', … } before this script. */
  if (root.location && /[?&]tv=1\b/.test(root.location.search || '')) {
    var boot = function () { api.init(root.VOICE_TV_CONFIG || {}).catch(function (e) { log('voice layer off', e && e.message); }); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
  }
})(typeof window !== 'undefined' ? window : this);
