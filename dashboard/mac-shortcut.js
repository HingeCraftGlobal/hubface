/* mac-shortcut-20261018b (zip -> HubFace-mac-v2.zip, app opens ?src=dock): first-visit "shortcut on your laptop?" card for macOS visitors only.
   Shown once per browser (localStorage 'hubface-mac-shortcut': shown | got | no). Waits until the sign-in pop-up, Finn's tour and the
   briefing card are out of the way (checked every 2 s, starting ~8 s after load) so it never blocks other first-visit flows.
   "Get the shortcut" downloads downloads/HubFace-mac-v2.zip (HubFace.app v2, opens https://hubface.org/interface/?src=dock) and shows an install tip.
   Roll back: remove the <script src="mac-shortcut.js..."> tag from index.html. */
(function () {
  'use strict';
  if (window.__macShortcut) return;
  var KEY = 'hubface-mac-shortcut', BUILD = 'mac-shortcut-20261018b', ZIP = 'downloads/HubFace-mac-v2.zip';
  function isMac() {
    try {
      var uad = navigator.userAgentData;
      if (uad && uad.platform) return /^macOS$/i.test(uad.platform);
      var ua = navigator.userAgent || '', pf = navigator.platform || '';
      if (!/Macintosh|Mac OS X/i.test(ua) && !/^Mac/i.test(pf)) return false;
      if (/iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints || 0) > 1) return false;   // iPadOS reports a Mac UA
      return true;
    } catch (_) { return false; }
  }
  function get() { try { return localStorage.getItem(KEY); } catch (_) { return 'x'; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (_) {} }
  var mac = isMac();
  window.__macShortcut = { build: BUILD, mac: mac, state: function () { return { mac: mac, stored: get(), card: !!(card && card.isConnected && !card.hidden) }; } };
  if (!mac || get()) return;

  var card = null, iv = null, since = 0;
  function vis(el) { return !!(el && !el.hidden && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden'); }
  function busy() {
    try {
      var ovs = document.querySelectorAll('.hfa-ov'); for (var i = 0; i < ovs.length; i++) if (vis(ovs[i])) return true;   // sign-in / account pop-up
      if (window.__finTour && window.__finTour.running && window.__finTour.running()) return true;                         // Finn's tour
      if (window.__brief && window.__brief.state && window.__brief.state().card) return true;                              // briefing card
    } catch (_) {}
    return document.hidden;
  }
  function css() {
    if (document.getElementById('hms-css')) return;
    var s = document.createElement('style'); s.id = 'hms-css';
    s.textContent =
      '#hmsCard{position:fixed;left:18px;bottom:18px;z-index:2147483000;width:290px;box-sizing:border-box;padding:14px 14px 12px;border-radius:16px;' +
      'background:rgba(16,24,38,.62);-webkit-backdrop-filter:blur(18px) saturate(140%);backdrop-filter:blur(18px) saturate(140%);' +
      'border:1px solid rgba(255,255,255,.18);box-shadow:0 12px 34px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.12);color:#fff;' +
      'font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Montserrat,sans-serif;opacity:0;transform:translateY(10px);transition:opacity .35s,transform .35s}' +
      '#hmsCard.in{opacity:1;transform:none}#hmsCard[hidden]{display:none!important}' +
      '#hmsCard .hmsTop{display:flex;gap:10px;align-items:center}#hmsCard img{width:38px;height:38px;flex:none}' +
      '#hmsCard .hmsQ{font-weight:700;font-size:13.5px}#hmsCard .hmsX{position:absolute;right:8px;top:6px;background:none;border:0;color:#fff;opacity:.55;font-size:16px;cursor:pointer;padding:2px 6px}' +
      '#hmsCard .hmsX:hover{opacity:1}#hmsCard .hmsBtns{display:flex;gap:8px;margin-top:12px}' +
      '#hmsCard .hmsBtns a,#hmsCard .hmsBtns button{flex:1;text-align:center;border-radius:10px;padding:7px 8px;font:600 12.5px/1.2 inherit;cursor:pointer;text-decoration:none;border:1px solid rgba(255,255,255,.22)}' +
      '#hmsCard .hmsGet{background:#009cfd;color:#fff;border-color:#009cfd}#hmsCard .hmsGet:hover{filter:brightness(1.1)}' +
      '#hmsCard .hmsNo{background:rgba(255,255,255,.08);color:#fff}#hmsCard .hmsNo:hover{background:rgba(255,255,255,.16)}' +
      '#hmsCard .hmsTip{margin-top:4px;font-size:12.5px;opacity:.92}#hmsCard .hmsTip b{font-weight:700}';
    document.head.appendChild(s);
  }
  function close() { if (!card) return; card.classList.remove('in'); setTimeout(function () { if (card) card.hidden = true; }, 380); }
  function show() {
    css(); set('shown');
    card = document.createElement('div'); card.id = 'hmsCard'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'HubFace shortcut');
    card.innerHTML =
      '<button class="hmsX" type="button" aria-label="Close">\u00d7</button>' +
      '<div class="hmsTop"><img src="assets/brand/hubface-badge.png" alt=""><div class="hmsQ">Would you like a shortcut on your laptop?</div></div>' +
      '<div class="hmsBtns"><a class="hmsGet" href="' + ZIP + '" download="HubFace-mac.zip">Get the shortcut</a><button class="hmsNo" type="button">No thanks</button></div>';
    document.body.appendChild(card);
    requestAnimationFrame(function () { requestAnimationFrame(function () { card.classList.add('in'); }); });
    card.querySelector('.hmsX').onclick = function () { set('no'); close(); };
    card.querySelector('.hmsNo').onclick = function () { set('no'); close(); };
    card.querySelector('.hmsGet').onclick = function () {
      set('got');   // the link's own default action downloads the zip
      setTimeout(function () {
        var b = card.querySelector('.hmsBtns'); if (b) b.remove();
        var q = card.querySelector('.hmsQ'); if (q) q.textContent = 'Your shortcut is downloading';
        var t = document.createElement('div'); t.className = 'hmsTip';
        t.innerHTML = 'Open <b>Downloads</b>, unzip, drag <b>HubFace</b> to <b>Applications</b>, then to your <b>Dock</b>. First time: right-click \u2192 <b>Open</b>.';
        card.appendChild(t);
        setTimeout(close, 30000);
      }, 50);
    };
  }
  function tick() {
    if (get()) { clearInterval(iv); return; }
    if (busy()) { since = 0; return; }
    if (!since) { since = Date.now(); return; }
    if (Date.now() - since >= 1500) { clearInterval(iv); if (!get()) show(); }   // quiet for a moment, then show
  }
  function boot() { iv = setInterval(tick, 2000); }
  if (document.readyState === 'complete') setTimeout(boot, 8000); else window.addEventListener('load', function () { setTimeout(boot, 8000); });
})();
