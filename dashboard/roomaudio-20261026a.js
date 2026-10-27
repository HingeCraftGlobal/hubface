/* roomaudio-20261026a (Dan, Oct 26): Room Chat = one combined infinity+mic button (hands-free, like the Bot Room), no Send (Enter sends).
   Hides the in-field dictate mic (#rb_rcDict) and Send (#rb_rcSend). #rb_rcMic becomes the single toggle: on = room mic on + room
   speech-to-text (AssemblyAI via room-live chatMic) with each pause sending; Yoda's own voice is already dropped while he speaks.
   Keeps hands-free on across widget re-renders (room-live turns chatMic off when its button is replaced). Roll back: remove the tag. */
(function () {
  if (window.__roomAudio) return;
  var S = window.__roomAudio = { build: 'roomaudio-20261026a', want: false, rearms: 0, fails: 0, pk: 0 };
  var css = document.createElement('style');
  css.textContent = '#rb_rcDict,#rb_rcSend{display:none!important}' +
    'html body #rb_rcMic.raMic{font-size:13px!important;width:auto!important;height:28px!important;min-width:44px!important;padding:0 8px!important;opacity:1!important;' +
    'border-radius:14px!important;border:1px solid rgba(102,196,254,.95)!important;background:rgba(15,20,30,.9)!important;color:#fff!important;margin-left:6px!important;cursor:pointer;line-height:1!important;white-space:nowrap}' +
    'html body #rb_rcMic.raMic.raOn{background:#d93a3a!important;border-color:#ff8a8a!important}' +
    'html body #rb_rcIn{padding-right:6px!important}';
  document.head.appendChild(css);
  function T(m) { try { var d = document.getElementById('raToast'); if (!d) { d = document.createElement('div'); d.id = 'raToast'; d.style.cssText = 'position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:2147483647;background:#111;color:#fff;border:2px solid #66c4fe;border-radius:10px;padding:10px 16px;font:15px sans-serif;max-width:80vw;box-shadow:0 4px 20px #000'; document.body.appendChild(d); } d.textContent = m; d.style.display = 'block'; clearTimeout(d._h); d._h = setTimeout(function () { d.style.display = 'none'; }, 6000); } catch (_) {} }
  /* playback probe (read-only): reports what the browser does with Yoda's voice clips */
  try { var op = HTMLMediaElement.prototype.play; if (!op.__ra) { var np = function () { var el = this, pr = op.apply(el, arguments); try { if (/say-audio/.test(el.currentSrc || el.src || '') && pr && pr.then) pr.then(function () { console.log('[roomaudio] Yoda voice clip is playing (volume ' + Math.round(el.volume * 100) + '%, muted: ' + el.muted + ')'); }, function (er) { T('The browser blocked the Yoda voice clip: ' + (er && er.name) + '. Click anywhere on the page, then try again'); }); } catch (_) {} return pr; }; np.__ra = 1; HTMLMediaElement.prototype.play = np; } } catch (_) {}
  /* rapx: reports clip playback facts to the access log (a plain GET; nothing stored) */
  try { var op2 = HTMLMediaElement.prototype.play; if (!op2.__rx) { var np2 = function () { var el = this, pr = op2.apply(el, arguments); try { if (/say-audio/.test(el.currentSrc || el.src || '')) { var X = function (k, e) { try { new Image().src = '/interface/rapx/' + k + '?vol=' + Math.round(el.volume * 100) + '&mut=' + (el.muted ? 1 : 0) + '&t=' + Math.round(el.currentTime * 100) / 100 + '&d=' + Math.round((el.duration || 0) * 100) / 100 + '&rs=' + el.readyState + '&e=' + encodeURIComponent(e || '') + '&r=' + Date.now(); } catch (_) {} }; X('call'); if (pr && pr.then) pr.then(function () { X('ok'); }, function (er) { X('blocked', er && er.name); }); el.addEventListener('ended', function () { X('ended'); }); el.addEventListener('error', function () { X('error', el.error && el.error.code); }); setTimeout(function () { X('at1s'); }, 1000); } } catch (_) {} return pr; }; np2.__rx = 1; HTMLMediaElement.prototype.play = np2; } } catch (_) {}
  function A() { return window.App || (window.__rb && window.__rb.App) || null; }
  function RL() { return window.__roomLive; }
  function els() { return { mb: document.getElementById('rb_rcMic'), ri: document.getElementById('rb_rcIn') }; }
  function paint() { var e = els(); if (!e.mb) return; var on = S.want && RL() && RL().chatMicOn && RL().chatMicOn() && A() && A().state.mic;
    S.pk = 1; e.mb.textContent = '\u221e\ud83c\udf99'; S.pk = 0; e.mb.classList.add('raMic'); e.mb.classList.toggle('raOn', !!on);
    e.mb.style.opacity = '1'; e.mb.setAttribute('aria-pressed', on ? 'true' : 'false');
    e.mb.title = on ? 'Hands-free on: talk, each pause sends to the room. Click to stop' : 'Hands-free mic: click, then just talk';
    if (e.ri && e.ri.placeholder !== undefined && !on && /Talking to the room/.test(e.ri.placeholder)) e.ri.placeholder = 'Message'; }
  function start() { var e = els(), r = RL(), a = A(); if (!e.mb || !r || !r.chatMic || !a) { try { T('Infinity mic: the room listener is not loaded on this page'); } catch (_) {} return; } var done = 0; try { T('Infinity mic: starting\u2026'); } catch (_) {} setTimeout(function () { if (!done) { try { T('Infinity mic: the browser is still waiting for microphone permission. Look for a permission box at the left of the address bar and press Allow'); } catch (_) {} } }, 4000);
        Promise.resolve(a.state.mic ? true : a.setAV('mic', true)).then(function () { done = 1; var ok = false; try { if (!r.chatMicOn()) ok = r.chatMic(e.mb, e.ri); } catch (_) {} paint(); setTimeout(function () { try { var why = !a.state.mic ? 'the browser did not give the microphone (lock icon in the address bar, Microphone, Allow)' : !a.inRoom ? 'you are not inside the room yet' : !r.chatMicOn() ? 'the room refused to start listening' : ''; if (why) T('Infinity mic: ' + why); } catch (_) {} }, 1500); }, paint); }
  function stop() { var r = RL(), a = A(); try { var e = els(); for (var i = 0; i < 2 && r && r.chatMicOn && r.chatMicOn(); i++) r.chatMic(e.mb, e.ri); } catch (_) {}
    try { if (a && a.state.mic) a.setAV('mic', false); } catch (_) {} paint(); }
  function wire() { var e = els(); if (!e.mb || e.mb.__ra) { paint(); return; } e.mb.__ra = 1; try { var d = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent'); Object.defineProperty(e.mb, 'textContent', { configurable: true, get: function () { return d.get.call(this); }, set: function (v) { if (S.pk) d.set.call(this, v); } }); } catch (_) {}
    e.mb.onclick = function (ev) { if (ev) { ev.preventDefault(); ev.stopPropagation(); } T('Infinity mic clicked'); S.clicks = (S.clicks || 0) + 1; S.want = !(S.want && RL() && RL().chatMicOn() && A().state.mic); if (S.want) start(); else stop(); };
    if (S.want) { S.rearms++; setTimeout(start, 50); } paint(); }
  setInterval(function () { wire(); var r = RL(); if (S.want && r && r.chatMicOn && !r.chatMicOn() && els().mb) { if (++S.fails > 4) { S.want = false; S.fails = 0; paint(); return; } S.rearms++; start(); } else if (r && r.chatMicOn && r.chatMicOn()) S.fails = 0; }, 700);
})();
