/* bellchime-20261019a: soft bell timbre (was dockchime-20261019c electronic synth). When HubFace is opened from the Mac dock shortcut (URL has src=dock), play a short original 4-note rising
   motif (Web Audio synth, no audio files, ~1.5 s, modest volume) in the bouncy "space-age cartoon theme" spirit, then strip src=dock
   from the URL with history.replaceState so a reload doesn't replay it. If autoplay rules keep the AudioContext suspended, it plays once
   on the first pointerdown / keydown. At most once per page load. Exposes window.__hfChimeFromDock / __hfChimePlayed / __hfChimeDoneAt
   (start + 1.475s + 2s pause) and window.__hfChimeReady so Finn/Ava speech waits until the chime finishes. Roll back: remove the
   <script src="dock-chime.js..."> tag. */
(function () {
  'use strict';
  if (window.__dockChime) return;
  var S = window.__dockChime = { build: 'bellchime-20261019a', fromDock: false, state: 'idle', played: false, cleaned: false };
  var CHIME_MS = 1475, PAUSE_MS = 2000;
  var u; try { u = new URL(location.href); } catch (_) { return; }
  if (u.searchParams.get('src') !== 'dock') return;
  S.fromDock = true;
  window.__hfChimeFromDock = true;
  window.__hfChimePlayed = false;
  window.__hfChimeSkip = false;
  window.__hfChimeDoneAt = 0;
  window.__hfChimeReady = new Promise(function (res) { S._resolveReady = res; });
  function markSkip() {
    window.__hfChimeSkip = true;
    window.__hfChimePlayed = true;
    window.__hfChimeDoneAt = Date.now();
    if (S._resolveReady) { S._resolveReady(); S._resolveReady = null; }
  }
  try { u.searchParams.delete('src'); history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash); S.cleaned = true; } catch (_) {}
  var AC = window.AudioContext || window.webkitAudioContext; if (!AC) { S.state = 'no-webaudio'; markSkip(); return; }
  var ctx; try { ctx = new AC(); } catch (_) { S.state = 'no-context'; markSkip(); return; }
  /* rhythm v6, half-half-quarter-quarter (quarter=0.25s): C4 0.0/0.5, E4 0.5/0.5, F4 1.0/0.25, G4 1.25/0.25; each sounds ~90% of its slot */
  var NOTES = [[261.63, 0, 0.45], [329.63, 0.5, 0.45], [349.23, 1.0, 0.225], [392.00, 1.25, 0.225]];   // dockchime-20261019c (Dan): C4 E4 F4 G4 half/half/quarter/quarter; bellchime-20261019a: bell voice below, n[2] picks the decay
  function play() {
    if (S.played) return; S.played = true; S.state = 'playing';
    var start = Date.now();
    window.__hfChimePlayed = true;
    window.__hfChimeDoneAt = start + CHIME_MS + PAUSE_MS;
    S.doneAt = window.__hfChimeDoneAt;
    try { console.log('[dockchime] play start', start, 'doneAt', window.__hfChimeDoneAt); } catch (_) {}
    setTimeout(function () { if (S._resolveReady) { S._resolveReady(); S._resolveReady = null; } }, CHIME_MS + PAUSE_MS);
    try {
      /* bellchime-20261019a (Dan): soft bell / doorbell timbre. Each note = sine fundamental + low inharmonic partials (2.0, 2.76, 5.4),
         ~5 ms attack, exponential decay (half notes ~2.0 s, quarters ~1.6 s, last note ~1.8 s) so the notes overlap and ring.
         Same notes, rhythm and 2 s speech pause; the last tail is silent (~3.1 s) before speech may start (3.475 s). */
      var t0 = ctx.currentTime + 0.04, out = ctx.createGain(), lp = ctx.createBiquadFilter();
      out.gain.value = 0.085; lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.5; lp.connect(out); out.connect(ctx.destination);
      var PARTIALS = [[1, 1, 1], [2.0, 0.32, 0.65], [2.76, 0.16, 0.45], [5.4, 0.06, 0.25]];   // [ratio, gain, decay share]
      NOTES.forEach(function (n, i) {
        var f = n[0], at = t0 + n[1], decay = i === NOTES.length - 1 ? 1.8 : (n[2] > 0.3 ? 2.0 : 1.6);
        PARTIALS.forEach(function (p) {
          var o = ctx.createOscillator(), g = ctx.createGain(), d = decay * p[2];
          o.type = 'sine'; o.frequency.value = f * p[0];
          g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(p[1], at + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 0.005 + d);
          o.connect(g); g.connect(lp); o.start(at); o.stop(at + 0.03 + d);
        });
      });
      setTimeout(function () { S.state = 'done'; try { ctx.close(); } catch (_) {} }, 3600);
    } catch (e) { S.state = 'error'; markSkip(); }
  }
  function onGesture() { off(); try { ctx.resume().then(go, function () {}); } catch (_) {} }
  function off() { removeEventListener('pointerdown', onGesture, true); removeEventListener('keydown', onGesture, true); }
  function go() { if (ctx.state === 'running') { off(); play(); } }
  function tryNow() {
    if (ctx.state !== 'running') { S.state = 'waiting-gesture'; addEventListener('pointerdown', onGesture, true); addEventListener('keydown', onGesture, true); }
    ctx.onstatechange = go;                                  // resumes without a gesture where autoplay is allowed
    try { var p = ctx.resume(); if (p && p.then) p.then(go, function () {}); } catch (_) {}   // in Chrome this stays pending until a gesture
    go();
  }
  tryNow();
})();