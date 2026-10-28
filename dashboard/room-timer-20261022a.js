/* invitefree1-20261027: rooms with server bot seats (Yoda-created/invited rooms): no timer box, no Start session, no token spend. Rollback: .bak-invitefree1 */
/* botav-20261026a (Dan approved 10:44 PM ET Oct 26): rooms with server bot seats: no timer lock on mic/cam, timer box hidden. Rollback: room-timer-20261022a.js.bak-pre-botav */
/* roomtimer-20261021c (Dan approved by voice 10:34pm ET Oct 20): room start flow.
   - On room open a small timer appears dead center, live elapsed clock from open; draggable (mouse+touch), kept on screen.
   - Mic/camera hard-gated until the timer is set (session length picked in 15-min steps, 1 step = 1 token).
   - Setting it = session started; token countdown runs from that second (local, in this browser; no server billing exists yet).
   - <=2 min left: timer turns red + toast. <1 min: picker reopens empty to add time; active Ava/Finn says the one-minute line. */
(function () {
  var App = (window.__rb && window.__rb.App) || null;   // App lives inside the room builder script; exposed as window.__rb.App
  var MAXSTEPS = 8, STEP = 15 * 60000;
  function hi() { try { return window.__i18n && window.__i18n.lang() === 'hi'; } catch (_) { return false; } }
  function T(en, h) { return hi() ? h : en; }
  function optLabel(n) { var m = n * 15; return hi() ? m + ' मिनट, ' + n + ' टोकन' : m + ' minutes, ' + n + (n === 1 ? ' token' : ' tokens'); }
  function inRoom() { var A = window.__rb && window.__rb.App; return !!(A && A.inRoom && A.state && A.state.room && A.state.room.mode && document.documentElement.classList.contains('rb-room') && document.getElementById('rbBar')); } // timergate: only after a room type is picked (App.pickMode -> App.enter)
  function toast(t) { try { if ((typeof App !== "undefined" && App) && App.toast) { App.toast(t); return; } } catch (_) {} }
  function fmt(ms) { ms = Math.max(0, ms); var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x; }

  var st = document.createElement('style');
  st.textContent = '#rtBox{position:fixed;z-index:99991;min-width:150px;max-width:230px;background:rgba(18,22,30,.88);color:#e8eef8;border:1px solid rgba(140,190,255,.45);border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,.35);font:12px system-ui;padding:8px 10px;touch-action:none;cursor:grab;user-select:none;text-align:center}' +
    '#rtBox.drag{cursor:grabbing}#rtBox .rtClk{font:600 20px ui-monospace,Menlo,monospace;letter-spacing:.5px}#rtBox .rtSub{opacity:.75;margin-top:2px}' +
    '#rtBox select,#rtBox button{font:12px system-ui;margin-top:6px;border-radius:7px;border:1px solid rgba(255,255,255,.25);background:#223;color:#fff;padding:4px 6px;cursor:pointer;max-width:100%}' +
    '#rtBox button.rtGo{background:#2a6df4;border-color:#2a6df4}#rtBox .rtPick{display:none}#rtBox.pick .rtPick{display:block}' +
    '#rtBox.warn{border-color:#ff4a4a;background:rgba(70,10,10,.9)}#rtBox.warn .rtClk{color:#ff6b6b}' +
    '#rtBox .rtPlus{display:inline-block;margin-left:6px;padding:0 6px}';
  document.head.appendChild(st);

  var S = null; // per room-open state
  function reset() { if (S && S.el) S.el.remove(); if (S && S.iv) clearInterval(S.iv); S = null; }

  function clamp(el, x, y) { var w = el.offsetWidth, h = el.offsetHeight; el.style.left = Math.max(0, Math.min(innerWidth - w, x)) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight - h, y)) + 'px'; }

  function build() {
    var el = document.createElement('div'); el.id = 'rtBox'; el.className = 'pick';
    el.innerHTML = '<div class="rtClk">0:00</div><div class="rtSub"></div><div class="rtPick"><select class="rtSel"></select><br><button type="button" class="rtGo"></button></div>';
    document.body.appendChild(el);
    S.el = el; fill(); paint();
    clamp(el, (innerWidth - el.offsetWidth) / 2, (innerHeight - el.offsetHeight) / 2);
    var d = null;
    el.addEventListener('pointerdown', function (e) { if (/SELECT|BUTTON|OPTION/.test(e.target.tagName)) return; d = { id: e.pointerId, dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop }; el.setPointerCapture(e.pointerId); el.classList.add('drag'); e.preventDefault(); });
    el.addEventListener('pointermove', function (e) { if (d && e.pointerId === d.id) clamp(el, e.clientX - d.dx, e.clientY - d.dy); });
    function up(e) { if (d && e.pointerId === d.id) { d = null; el.classList.remove('drag'); } }
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.querySelector('.rtGo').addEventListener('click', go);
  }
  function fill() {
    var sel = S.el.querySelector('.rtSel'), h = '<option value="">' + T('Choose time…', 'समय चुनें…') + '</option>';
    for (var n = 1; n <= MAXSTEPS; n++) h += '<option value="' + n + '">' + optLabel(n) + '</option>';
    sel.innerHTML = h; sel.value = (!S.end && PRESET) ? String(PRESET) : '';
    S.el.querySelector('.rtGo').textContent = S.end ? T('Add time', 'समय जोड़ें') : T('Start session', 'सत्र शुरू करें');
  }
  function openPick() { S.el.classList.add('pick'); fill(); clamp(S.el, S.el.offsetLeft, S.el.offsetTop); }
  function go() {
    var n = +S.el.querySelector('.rtSel').value;
    if (!n) { toast(T('Pick a session length first', 'पहले सत्र की अवधि चुनें')); return; }
    var now = Date.now();
    if (!S.end) { S.start = now; S.end = now + n * STEP; toast(T('Session started: ', 'सत्र शुरू: ') + optLabel(n)); }
    else { S.end = Math.max(S.end, now) + n * STEP; S.warned = false; S.oneMin = false; toast(T('Time added: ', 'समय जोड़ा: ') + optLabel(n)); }
    S.tokens += n; spend(n);
    S.el.classList.remove('pick'); paint();
  }
  /* tokenspend-20261021a: debit the real account balance once per Start / Add time (idempotency key = session id + block no).
     If the server has no spend endpoint yet (needs a restart Dan must approve), the pill shows the amount as PENDING, never as spent. */
  function spend(n) {
    if (!S.sid) { S.sid = 'rt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); S.blk = 0; }
    var key = S.sid + '-' + (S.blk++);
    function pend() { window.__hfPendingTokens = (window.__hfPendingTokens || 0) + n; try { window.dispatchEvent(new CustomEvent('hubface-tokens', { detail: { pending: window.__hfPendingTokens } })); } catch (_) {} }
    try { fetch('/api/account/spend', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ n: n, key: key }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok || r.status === 402) { try { window.dispatchEvent(new CustomEvent('hubface-tokens', { detail: { account: j.account || null } })); } catch (_) {} if (window.HubFaceAuth && HubFaceAuth.refresh) HubFaceAuth.refresh(); if (r.status === 402) toast(T('Not enough tokens on your account', '???? ??? ???????? ???? ????')); }
        else if (r.status === 404 || r.status === 405) pend(); }); }, function () { pend(); }); } catch (_) { pend(); }
  }
  function say(t) {
    try { var Ro = window.__roster, me = Ro && Ro.info ? Ro.info(Ro.current()) : null;
      if (!me || !me.connected || !window.__voice || !window.__voice.say) return; // neither Ava nor Finn on: skip
      window.__voice.say(t); } catch (_) {}
  }
  function paint() {
    if (!S || !S.el) return;
    var now = Date.now(), clk = S.el.querySelector('.rtClk'), sub = S.el.querySelector('.rtSub');
    if (!S.end) { clk.textContent = fmt(now - S.open); sub.textContent = T('Room open · set the timer to start', 'रूम खुला · शुरू करने के लिए टाइमर सेट करें'); return; }
    var left = S.end - now, usedTok = Math.min(S.tokens, Math.floor((now - S.start) / STEP) + 1);
    clk.textContent = fmt(left);
    sub.textContent = T('left · elapsed ', 'बाकी · बीता ') + fmt(now - S.open) + ' · ' + T('tokens ', 'टोकन ') + usedTok + '/' + S.tokens;
    if (left <= 120000) { S.el.classList.add('warn'); if (!S.warned) { S.warned = true; toast(T('About 2 minutes of tokens left', 'लगभग 2 मिनट के टोकन बचे हैं')); } }
    else S.el.classList.remove('warn');
    if (left < 60000 && !S.oneMin) { S.oneMin = true; openPick(); say("The room's gonna close in one minute."); }
    if (left <= 0 && !S.ended) { S.ended = true; toast(T('Session time is up', 'सत्र का समय समाप्त')); }
  }
  function started() { return !!(S && S.end && Date.now() < S.end); }
  setInterval(function () { window.__rtStarted = started(); }, 250);
  window.__roomTimer = { sync: function (st, en) { st = +st; en = +en; if (!S || !en || en <= Date.now() || en > Date.now() + 9 * 3600000) return false; if (S.end && en <= S.end) return false; if (!S.start) S.start = st || Date.now(); S.end = en; S.warned = false; S.oneMin = false; if (S.el) S.el.classList.remove('pick'); try { paint(); } catch (_) {} return true; }, started: started, state: function () { return S && { open: S.open, start: S.start, end: S.end, tokens: S.tokens }; },
    preset: function (n) { n = Math.max(1, Math.min(MAXSTEPS, n | 0)); PRESET = n; if (S && S.el && !S.end) { S.el.classList.add('pick'); S.el.querySelector('.rtSel').value = String(n); } } };
  var PRESET = 0;

  function hint() { toast(T('Set the timer first: mic and camera unlock when the session starts', 'पहले टाइमर सेट करें: सत्र शुरू होने पर माइक और कैमरा चालू होंगे')); if (S && S.el) { S.el.classList.add('pick'); } }
  function __hfBotRm(){try{var S=window.__hfServerSeats,m=/[?&#](?:room|r)=(HF-[A-Z0-9-]+)/.exec(location.href);return !!(S&&m&&S.room===m[1]&&S.bots&&S.bots.length);}catch(_){return false;}} /* botav-20261026a: bot rooms (server seats) skip the paid AV gate */
  function gated() { return inRoom() && !started() && !__hfBotRm(); }

  // Hard gate 1: App.setAV (outermost wrapper; room-timer loads after all inline scripts)
  function wrapAV() {
    if (!(typeof App !== "undefined" && App) || !App.setAV || App.setAV.__rt) return;
    var orig = App.setAV, w = function (k, on) { if (on && gated()) { hint(); try { App.paintAV && App.paintAV(); } catch (_) {} return Promise.resolve(false); } return orig.apply(this, arguments); };
    w.__rt = 1; App.setAV = w;
  }
  // Hard gate 2: getUserMedia in a room before start (covers auto-start mic/cam/speech). Screen share (getDisplayMedia) untouched.
  try { var md = navigator.mediaDevices; if (md && md.getUserMedia && !md.getUserMedia.__rt) { var gum = md.getUserMedia.bind(md), g = function (c) { if (gated()) { hint(); return Promise.reject(new DOMException('Set the room timer first', 'NotAllowedError')); } return gum(c); }; g.__rt = 1; md.getUserMedia = g; } } catch (_) {}
  function killLive() { try { var s = App.state; if (s && s.stream) s.stream.getTracks().forEach(function (t) { if (t.kind !== 'video' || !/screen|window|display/i.test(t.label)) t.stop(); }); if (s) { s.mic = false; s.cam = false; } App.paintAV && App.paintAV(); } catch (_) {} }

  setInterval(function () {
    wrapAV();
    if (inRoom() && __hfBotRm()) { if (S) reset(); return; }
    if (inRoom()) { if (!S) { S = { open: Date.now(), tokens: 0 }; build(); if ((typeof App !== "undefined" && App) && App.state && (App.state.mic || App.state.cam)) killLive(); S.iv = setInterval(paint, 500); } }
    else if (S) reset();
  }, 300);
  addEventListener('resize', function () { if (S && S.el) clamp(S.el, S.el.offsetLeft, S.el.offsetTop); });
  addEventListener('hinge:lang', function () { if (S && S.el) { var p = S.el.classList.contains('pick'); var v = S.el.querySelector('.rtSel').value; fill(); S.el.querySelector('.rtSel').value = v; paint(); if (!p) S.el.classList.remove('pick'); } });
})();

/* timergate-20261021e: visible AV lock until Start + nudge on click */
(function () {
  var st = document.createElement('style');
  st.textContent = '#rbBar button.rtLocked{opacity:.45!important;filter:grayscale(1);cursor:not-allowed!important}' +
    '.rtLockHit{position:absolute;z-index:5;cursor:not-allowed;background:transparent;pointer-events:auto}' +
    '.rtLockHit b{position:absolute;right:-4px;top:-6px;font-size:11px;line-height:1;pointer-events:none}';
  document.head.appendChild(st);
  function A() { return window.__rb && window.__rb.App; }
  function inRoom() { var a = A(); return !!(a && a.inRoom && a.state && a.state.room && a.state.room.mode && document.documentElement.classList.contains('rb-room') && document.getElementById('rbBar')); }
  function started() { var b = document.getElementById('rtBox'); return !!(b && !/rt-not-started/.test(b.className) && window.__rtStarted); }
  function nudge() { var b = document.getElementById('rtBox'); if (b) { b.classList.add('pick'); b.animate && b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 350 }); } }
  function __hfBotRm(){try{var S=window.__hfServerSeats,m=/[?&#](?:room|r)=(HF-[A-Z0-9-]+)/.exec(location.href);return !!(S&&m&&S.room===m[1]&&S.bots&&S.bots.length);}catch(_){return false;}}
  function lock(btn) {
    if (!btn.dataset.rtTitle && !btn.classList.contains('rtLocked')) btn.dataset.rtTitle = btn.title || '';
    btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); btn.classList.add('rtLocked'); btn.title = 'Set the timer to unlock';
    var bar = btn.parentNode, hit = document.querySelector('.rtLockHit[data-for="' + btn.id + '"]');
    if (!hit) { hit = document.createElement('span'); hit.className = 'rtLockHit'; hit.dataset.for = btn.id; hit.title = 'Set the timer to unlock'; hit.innerHTML = '<b>\uD83D\uDD12</b>';
      hit.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); nudge(); });
      if (getComputedStyle(bar).position === 'static') bar.style.position = 'relative'; bar.appendChild(hit); }
    hit.style.left = btn.offsetLeft + 'px'; hit.style.top = btn.offsetTop + 'px'; hit.style.width = btn.offsetWidth + 'px'; hit.style.height = btn.offsetHeight + 'px';
  }
  function unlock(btn) {
    if (btn.classList.contains('rtLocked')) { btn.disabled = false; btn.removeAttribute('aria-disabled'); btn.classList.remove('rtLocked'); btn.title = btn.dataset.rtTitle || ''; }
    var hit = document.querySelector('.rtLockHit[data-for="' + btn.id + '"]'); if (hit) hit.remove();
  }
  setInterval(function () {
    var on = inRoom() && !window.__rtStarted && !__hfBotRm();
    var bx = document.getElementById("rtBox"); if (bx) bx.style.display = __hfBotRm() ? "none" : "";
    ['rb_avMic', 'rb_avCam'].forEach(function (id) { var b = document.getElementById(id); if (b) (on ? lock : unlock)(b); });
  }, 300);
})();
