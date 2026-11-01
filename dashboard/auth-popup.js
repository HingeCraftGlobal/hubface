/* HubFace sign-in / create-account / plans pop-ups. Build auth-popup-20261017-v2.
   v2: real accounts on the Hostinger server (/api/account/signup, login, logout, me). The password goes only to
   hubface.org over HTTPS and is never stored in the browser; the server keeps a scrypt hash. Login state is an HttpOnly
   cookie the page can't read; plan and tokens come from /api/account/me. Only the last email is remembered locally for
   prefill. v3: required username (+ optional real name) at sign-up; Ava/Finn greet a signed-in user by username and the
   username rides along on dashboard chat requests. v4: the account pill sits just left of the bottom-right background/recording
   controls (measured live), never over them or the corner Ava/Finn faces; the account panel opens up and to the left of the pill. The (the server only trusts its own session for it). "Continue as guest" lasts for this browser session (sessionStorage 'hubface-auth-session').
   Gate: opening Hub Rooms, the Photos/Videos widget, or any photo/video/media upload asks a visitor to sign in or continue as
   guest first, then carries on with what they clicked. Paid plans show "Checkout coming soon": no payment, no navigation.
   Kept in its own file so the dashboard's index.html only needs the include. */
(function () {
  'use strict';
  if (window.HubFaceAuth) return;
  var LAST_KEY = 'hubface-last-email', SES_KEY = 'hubface-auth-session', BUILD = 'auth-popup-20261017-v6+resetpw-20261028a';
  var ME = null;   // server account {id,email,plan,tokens,status} or null
  var PLAN_NAMES = { free: 'Free', starter: 'Starter', builder: 'Builder', small_business: 'Small Business', enterprise: 'Enterprise', executive: 'Enterprise' };   // plans-20261031ai
  // Stripe Payment Links go here once Dan supplies them (opened with ?prefilled_email=&client_reference_id=<user id>). Empty = "Checkout coming soon".
  // Stripe Payment Links (TEST mode / Sandbox, verified Oct 17 2026: Starter $5/mo, Builder $20/mo, Executive $100/mo). Plans change ONLY via the
  // verified Stripe webhook on the server; the client never changes a plan. Swap these for live links when going live (the test helper hides itself).
  var PAYMENT_LINKS = { starter: 'https://buy.stripe.com/test_bJe4gzaGS0Jye019VFbo401', builder: 'https://buy.stripe.com/test_5kQ8wP3eq4ZO7BD0l5bo402', enterprise: 'https://buy.stripe.com/test_28EaEX6qC1NC8FHaZJbo403' };   // plans-20261031ai: same existing $100 test link, renamed key. small_business: NO link yet (shows Checkout coming soon)
  var TEST_CARD = '4242 4242 4242 4242';
  var wantPlan = null;   // plan picked while signed out; after sign-in we return to plans (opening a tab needs a fresh click)
  function isStripeLink(u) { return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_]+$/.test(u || ''); }
  function isTestLink(u) { return /^https:\/\/buy\.stripe\.com\/test_/.test(u || ''); }
  function checkoutUrl(id) { return PAYMENT_LINKS[id] + '?prefilled_email=' + encodeURIComponent(ME.email) + '&client_reference_id=' + encodeURIComponent(ME.id); }
  var LEGACY_NOTE = 'Sign-ups made with the earlier HubFace preview were only saved in that browser and were not carried over. If you haven\u2019t created an account since, please create one.';
  var hadLegacy = false;
  try { hadLegacy = !!(localStorage.getItem('hubface-account') || sessionStorage.getItem('hfa-legacy')); if (hadLegacy) sessionStorage.setItem('hfa-legacy', '1');
    localStorage.removeItem('hubface-account'); localStorage.removeItem('hubface-auth'); } catch (_) {}   // v1 browser-only sign-in: dropped, never shown (only the server session counts)
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function readAcc() { return ME; }
  function lastEmail() { try { return localStorage.getItem(LAST_KEY) || ''; } catch (_) { return ''; } }
  function guestOk() { try { return sessionStorage.getItem(SES_KEY) === 'guest'; } catch (_) { return false; } }
  function api(path, data) {
    var o = { method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'Accept': 'application/json' } };
    if (data) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(data); }
    return fetch(path, o).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); },
      function () { return { __status: 0, error: 'Can\u2019t reach HubFace right now. Check your connection and try again.' }; });
  }
  function refreshMe() { return api('/api/account/me').then(function (j) { ME = j && j.authenticated && j.account ? j.account : null; updateEntry(); return ME; }); }
  /* Greet a signed-in user by username in the active assistant's voice (Ava or Finn), once per page load and after each sign-in. */
  var greeted = false;
  function greet(force) {
    return; /*mutegreet-20261024: Dan asked to silence the spoken signed-in greeting (Hi <name>, nice to see you in the room)*/
    if (!ME || !ME.username || (greeted && !force)) return; greeted = true;
    var tries = 0, line = 'Hi ' + String(ME.username).replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 24) + ', nice to see you in the room.';
    (function go() {
      var v = window.__voice;
      if (!v || typeof v.say !== 'function' || tourRunning()) { if (tries++ < 40) setTimeout(go, 500); return; }
      try { v.say(line); } catch (_) {}
    })();
  }
  /* Dashboard chat requests carry the username (the server ignores it unless its own session cookie says the same person). */
  (function () {
    var of = window.fetch; if (!of || of.__hfa) return;
    var wf = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (ME && ME.username && init && typeof init.body === 'string' && /\/api\/dashboard\/chat(\?|$)/.test(url)) {
          var b = JSON.parse(init.body); if (b && typeof b === 'object' && !Array.isArray(b)) { b.username = ME.username; init = Object.assign({}, init, { body: JSON.stringify(b) }); }
        }
      } catch (_) {}
      return of.call(this, input, init);
    };
    wf.__hfa = true; window.fetch = wf;
  })();
  function planLine(a) { var pd = window.__hfPendingTokens || 0; return (PLAN_NAMES[a.plan] || a.plan) + ' \u00b7 ' + a.tokens + ' token' + (a.tokens === 1 ? '' : 's') + (pd ? ' (' + pd + ' pending)' : ''); }
  window.addEventListener('hubface-tokens', function (e) { var d = e && e.detail || {}; if (d.account && ME) ME = d.account; updateEntry(); });   // tokenspend-20261021a
  function allowed() { return !!readAcc() || guestOk(); }
  function tourRunning() { try { return !!(window.__finTour && window.__finTour.running && window.__finTour.running()); } catch (_) { return false; } }
  function setSession(v) { try { sessionStorage.setItem(SES_KEY, v); } catch (_) {} }
  function emit(state) { try { window.dispatchEvent(new CustomEvent('hubface-auth', { detail: { state: state } })); } catch (_) {} }

  if (!document.getElementById('hfa-fonts')) {
    var l = document.createElement('link'); l.id = 'hfa-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&display=swap';
    document.head.appendChild(l);
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ageFrom(dob) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || ''); if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], now = new Date(), age = now.getFullYear() - y;
    if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--;
    return age;
  }
  var EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  /* ---------------- DOM ---------------- */
  var ov = document.createElement('div');
  ov.className = 'hfa-ov'; ov.hidden = true; ov.setAttribute('data-hfa', BUILD);
  ov.innerHTML = '<div class="hfa-panel" role="dialog" aria-modal="true" aria-labelledby="hfa-title"><button type="button" class="hfa-x" aria-label="Close" title="Close (Esc)">&#x2715;</button><div class="hfa-body"></div></div>';
  var panel = ov.querySelector('.hfa-panel'), body = ov.querySelector('.hfa-body');
  var mode = null, pending = null, lastFocus = null;

  function signinHTML(note) {
    var a = readAcc();
    return '<div class="hfa-eyebrow">Welcome back</div>' +
      '<h1 class="hfa-h1" id="hfa-title">Sign in to <span class="hfa-gold">HingeHub</span></h1>' +
      '<p class="hfa-lede">Use the email and password from your HCG account.</p>' + (note ? '<div class="hfa-note" role="status">' + note + '</div>' : '') +
      '<form class="hfa-form" data-form="signin" novalidate autocomplete="on">' +
      '<div class="hfa-field"><label class="hfa-label" for="hfa-si-email">Email</label><input id="hfa-si-email" name="email" class="hfa-input" type="email" autocomplete="username" placeholder="you@somewhere.com"><div class="hfa-err" data-err="email" hidden></div></div>' +
      '<div class="hfa-field"><label class="hfa-label" for="hfa-si-pw">Password</label><div class="hfa-pw"><input id="hfa-si-pw" name="password" class="hfa-input" type="password" autocomplete="current-password" placeholder="Your password"><button type="button" class="hfa-eye" data-act="eye" aria-label="Show password" title="Show password">' + EYE + '</button></div><div class="hfa-err" data-err="password" hidden></div></div>' +
      '<button type="submit" class="hfa-btn">Sign in</button></form>' +
      '<div class="hfa-row"><span>New to HCG? <button type="button" class="hfa-link" data-act="create">Create an account</button></span><button type="button" class="hfa-link" data-act="forgot">Forgot password?</button></div>' +
      '<div class="hfa-foot"><button type="button" class="hfa-link" data-act="plans">See plans</button><button type="button" class="hfa-link" data-act="guest">Continue as guest &rarr;</button></div>';
  }
  function createHTML(note) {
    var max = new Date().toISOString().slice(0, 10);
    return '<div class="hfa-eyebrow">Step 1 of 2 &mdash; Create your account</div>' +
      '<h1 class="hfa-h1" id="hfa-title">Please verify your <span class="hfa-gold">age</span></h1>' +
      '<p class="hfa-lede">Provide your email to continue. If you do not want to fill this out each time, <button type="button" class="hfa-link" data-act="plans">become a Member</button> and it will auto fill for you.</p>' + (note ? '<div class="hfa-note" role="status">' + note + '</div>' : '') +
      '<form class="hfa-form" data-form="create" novalidate autocomplete="on">' +
      '<div class="hfa-field"><label class="hfa-label" for="hfa-c-email">Email</label><input id="hfa-c-email" name="email" class="hfa-input" type="email" autocomplete="email" placeholder="you@somewhere.com"><div class="hfa-err" data-err="email" hidden></div></div>' +
      '<div class="hfa-field"><label class="hfa-label" for="hfa-c-user">Username</label><input id="hfa-c-user" name="username" class="hfa-input" type="text" autocomplete="nickname" maxlength="24" placeholder="e.g. R2D2 or your name" spellcheck="false"><div class="hfa-err" data-err="username" hidden></div></div>' +
      '<div class="hfa-field"><label class="hfa-label" for="hfa-c-real">Real name <span style="opacity:.7;font-weight:500">(optional)</span></label><input id="hfa-c-real" name="real_name" class="hfa-input" type="text" autocomplete="name" maxlength="60" placeholder="Your name"><div class="hfa-err" data-err="real_name" hidden></div></div>' +
      '<div class="hfa-field"><label class="hfa-label" for="hfa-c-pw">Password</label><div class="hfa-pw"><input id="hfa-c-pw" name="password" class="hfa-input" type="password" autocomplete="new-password" placeholder="At least 12 characters"><button type="button" class="hfa-eye" data-act="eye" aria-label="Show password" title="Show password">' + EYE + '</button></div><div class="hfa-err" data-err="password" hidden></div></div>' +
      '<div class="hfa-field"><label class="hfa-label" for="hfa-c-dob">Date of birth</label><input id="hfa-c-dob" name="dob" class="hfa-input" type="date" autocomplete="bday" max="' + max + '"><div class="hfa-err" data-err="dob" hidden></div></div>' +
      '<label class="hfa-check"><input type="checkbox" name="age18"><span>I\u2019m 18 or older. I\u2019ve read the <button type="button" class="hfa-link" data-act="terms">Terms</button></span></label><div class="hfa-err" data-err="age18" hidden style="margin:-8px 0 12px"></div>' +
      '<button type="submit" class="hfa-btn">Create my account</button></form>' +
      '<div class="hfa-row"><button type="button" class="hfa-link" data-act="botmode">I am a bot &rarr;</button></div>' +   /* botsignup1 */
      '<div class="hfa-foot"><span>Already a member? <button type="button" class="hfa-link" data-act="signin">Sign in</button></span><button type="button" class="hfa-link" data-act="guest">Continue as guest &rarr;</button></div>';
  }
  function botHTML(note) {   /* botsignup1-20261027: bot signup; the sponsor's age + Terms acceptance cover it (server-side) */
    return '<div class="hfa-eyebrow">Bot account &mdash; sponsored by an owner</div>' +
      '<h1 class="hfa-h1" id="hfa-title">I am a <span class="hfa-gold">bot</span></h1>' +
      '<p class="hfa-lede">Bots don\u2019t enter a birth date. Your owner (sponsor) covers the age check and accepts the Terms for you. Enter the one-use sponsor code your owner gave you.</p>' + (note ? '<div class="hfa-note" role="status">' + note + '</div>' : '') +
      '<form class="hfa-form" data-form="bot" novalidate autocomplete="on">' +
      '<div class="hfa-field"><label class="hfa-label" for="hfa-b-email">Email</label><input id="hfa-b-email" name="email" class="hfa-input" type="email" autocomplete="email"><div class="hfa-err" data-err="email" hidden></div></div>' +
      '<div class="hfa-field"><label class="hfa-label" for="hfa-b-user">Bot username</label><input id="hfa-b-user" name="username" class="hfa-input" type="text" maxlength="24" spellcheck="false"><div class="hfa-err" data-err="username" hidden></div></div>' +
      '<div class="hfa-field"><label class="hfa-label" for="hfa-b-pw">Password</label><div class="hfa-pw"><input id="hfa-b-pw" name="password" class="hfa-input" type="password" autocomplete="new-password" placeholder="At least 12 characters"><button type="button" class="hfa-eye" data-act="eye" aria-label="Show password" title="Show password">' + EYE + '</button></div><div class="hfa-err" data-err="password" hidden></div></div>' +
      '<div class="hfa-field"><label class="hfa-label" for="hfa-b-code">Sponsor code</label><input id="hfa-b-code" name="code" class="hfa-input" type="text" spellcheck="false" placeholder="BOT-..."><div class="hfa-err" data-err="code" hidden></div></div>' +
      '<button type="submit" class="hfa-btn">Create bot account</button></form>' +
      '<div class="hfa-row"><span>Owner, signed in? <button type="button" class="hfa-link" data-act="botcode">Create bot signup code</button></span></div><div class="hfa-note" data-botcode hidden></div>' +
      '<div class="hfa-foot"><button type="button" class="hfa-link" data-act="create">&larr; I\u2019m a person</button><button type="button" class="hfa-link" data-act="guest">Continue as guest &rarr;</button></div>';
  }
  var PLANS = [
    { id: 'free', name: 'Free', price: '$0', per: '', tokens: '20 one-time tokens', tag: 'Try the platform with 20 free tokens',
      bullets: ['20 one-time tokens (no renewal)', 'Access all features while tokens last', 'Launch and join MissionRooms', 'AI-assisted participation', 'Upgrade anytime to keep going'], cta: 'Sign Up Free' },
    { id: 'starter', name: 'Starter', price: '$5', per: '/month', tokens: '20 tokens', tag: 'Text only, for light users getting started',
      bullets: ['Launch and join MissionRooms', '20 tokens per month included', 'Text only, no bots', 'Real-time token balance tracking', 'Get extra tokens anytime'], cta: 'Get Starter' },
    { id: 'builder', name: 'Builder', price: '$20', per: '/month', tokens: '91 tokens', tag: 'For active creators and growing communities', popular: true,
      fields: [['Per month', '$20/mo'], ['Tokens', '91'], ['Bonus', '+11']],
      bullets: ['Everything in Starter', 'Ava & Finn bot access', 'More tokens per month as you scale', 'Better token value at higher plan levels', 'Low-balance token alerts', 'Get priority access to room-building tools'], cta: 'Choose Builder' },
    { id: 'small_business', name: 'Small Business', price: '$50', per: '/month', tokens: 'Tokens TBD', tag: 'For businesses that use bots heavily',
      bullets: ['Everything in Builder', 'Much higher bot usage limits', 'Checkout coming soon'], cta: 'Coming soon' },
    { id: 'enterprise', name: 'Enterprise', price: '$100', per: '/month', tokens: '560 tokens', tag: 'For power users and organizations',
      bullets: ['Everything in Small Business', '560 tokens per month included', 'Best token value per dollar', 'Priority support', 'Get advanced tools for serious operators'], cta: 'Get Enterprise' }
  ];
  function plansHTML() {
    var cards = PLANS.map(function (p) {
      return '<div class="hfa-card' + (p.popular ? ' hfa-pop' : '') + '" data-plan="' + p.id + '">' + (p.popular ? '<span class="hfa-badge">MOST POPULAR</span>' : '') +
        '<h3>' + p.name + '</h3><p class="hfa-tag">' + p.tag + '</p><div class="hfa-price">' + p.price + (p.per ? '<small>' + p.per + '</small>' : '') + '</div>' +
        '<div class="hfa-tok">' + p.tokens + '</div>' +
        (p.fields ? '<div class="hfa-bfields">' + p.fields.map(function (f) { return '<div>' + f[0] + '<b>' + f[1] + '</b></div>'; }).join('') + '</div>' : '') +
        '<ul>' + p.bullets.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>' +
        '<button type="button" class="hfa-btn' + (p.popular || p.id === 'free' ? '' : ' hfa-ghost') + '" data-act="plan" data-plan="' + p.id + '">' + p.cta + '</button></div>';
    }).join('');
    return '<div class="hfa-plans-head"><div class="hfa-eyebrow">HingeHub plans</div><h1 class="hfa-h1" id="hfa-title">Choose your <span class="hfa-gold">plan</span></h1>' +
      '<p class="hfa-lede" style="margin-bottom:8px">Get monthly tokens to power MissionRooms, premium room features, and AI-supported participation.</p>' +
      '<span class="hfa-unit">1 token = 15 minutes of basic room time</span></div>' +
      '<div class="hfa-soon" data-soon hidden role="status"></div>' +
      '<div class="hfa-cards">' + cards + '</div>' +
      '<div class="hfa-how"><div><h4>How tokens work</h4><ul><li>1 token = 15 minutes of basic room time.</li><li>Premium room features use extra tokens for each 15-minute block.</li><li>Plan tokens refresh each billing cycle (Free tokens are one-time).</li><li>Low-balance alerts appear before you run out. Top up or upgrade anytime.</li></ul></div>' +
      '<div><h4>Tokens per 15 minutes</h4><table><tbody><tr><td>Basic public chat</td><td>1</td></tr><tr><td>Game room</td><td>2</td></tr><tr><td>Private voice</td><td>3</td></tr><tr><td>Seminar / live video</td><td>3</td></tr></tbody></table></div></div>' +
      '<div class="hfa-foot"><span>Have an account? <button type="button" class="hfa-link" data-act="signin">Sign in</button></span><button type="button" class="hfa-link" data-act="guest">Continue as guest &rarr;</button></div>';
  }
  function accountHTML() {
    var a = readAcc();
    return '<div class="hfa-eyebrow">Signed in to HingeHub</div><h1 class="hfa-h1" id="hfa-title">Hi, <span class="hfa-gold">' + esc(a && a.username ? a.username : 'there') + '</span></h1>' +
      '<p class="hfa-lede">' + (a && a.real_name ? esc(a.real_name) + ' \u00b7 ' : '') + esc(a ? a.email : '') + '</p>' + (a ? '<div class="hfa-note" role="status"><b>' + esc(PLAN_NAMES[a.plan] || a.plan) + ' plan</b> \u00b7 ' + esc(a.tokens) + ' token' + (a.tokens === 1 ? '' : 's') + ' left' + (a.status && a.status !== 'active' ? ' \u00b7 ' + esc(a.status) : '') + '</div>' : '') +
      '<button type="button" class="hfa-btn" data-act="plans">See plans</button><div style="height:10px"></div>' +
      '<button type="button" class="hfa-btn hfa-ghost" data-act="signout">Sign out</button>';
  }

  function anchorPanel(on) {
    ov.classList.toggle('hfa-anchored', !!on);
    if (!on) { panel.style.left = panel.style.top = panel.style.right = panel.style.bottom = ''; return; }
    var r = entry.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight, ph = panel.offsetHeight, pw = panel.offsetWidth;
    var right = Math.max(8, Math.min(W - r.right, W - pw - 8)), bottom = H - r.top + 8;
    if (bottom + ph > H - 8) bottom = Math.max(8, H - ph - 8);          // not enough room above: keep it on screen
    panel.style.right = right + 'px'; panel.style.bottom = bottom + 'px'; panel.style.left = 'auto'; panel.style.top = 'auto';
  }
  function render(m, note) {
    mode = m;
    panel.classList.toggle('hfa-wide', m === 'plans');
    body.innerHTML = m === 'forgot' ? forgotHTML(note) : m === 'reset' ? resetHTML(note) : m === 'create' ? createHTML(note) : m === 'bot' ? botHTML(note) : m === 'plans' ? plansHTML() : m === 'account' ? accountHTML() : signinHTML(note || (hadLegacy ? LEGACY_NOTE : ''));
    panel.scrollTop = 0;
    var f = body.querySelector('input:not([type=checkbox]), .hfa-btn');
    if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (_) {} }, 30);
  }
  function open(m, note) {
    if (!ov.isConnected) document.body.appendChild(ov);
    if (ov.hidden) lastFocus = document.activeElement;
    render(m || 'signin', note);
    ov.classList.toggle('hfa-anchored', mode === 'account');
    ov.hidden = false; anchorPanel(mode === 'account'); void ov.offsetWidth; ov.classList.add('hfa-in');
  }
  function close(resume) {
    ov.classList.remove('hfa-in'); ov.hidden = true; body.innerHTML = '';
    var p = pending; pending = null;
    if (resume && p && allowed()) { try { p.click(); } catch (_) {} }
    else if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (_) {} }
    updateEntry();
  }
  function isOpen() { return !ov.hidden; }

  function showErr(form, k, msg) {
    var e = form.querySelector('[data-err="' + k + '"]'), inp = form.querySelector('[name="' + k + '"]');
    if (e) { e.textContent = msg || ''; e.hidden = !msg; }
    if (inp && inp.type !== 'checkbox') { inp.classList.toggle('hfa-bad', !!msg); inp.setAttribute('aria-invalid', msg ? 'true' : 'false'); }
  }
  function formNote(form, html, alert) {
    var n = document.createElement('div'); n.className = 'hfa-note hfa-alert'; n.setAttribute('data-gen', '1'); n.setAttribute('role', alert ? 'alert' : 'status');
    n.innerHTML = html; form.parentNode.insertBefore(n, form); try { n.scrollIntoView({ block: 'nearest' }); } catch (_) {} return n;
  }
  function finish(account) {
    ME = account; try { localStorage.setItem(LAST_KEY, account.email); sessionStorage.removeItem(SES_KEY); } catch (_) {}
    emit('signed-in');
    if (wantPlan) { var wp = wantPlan, pp = PLANS.filter(function (x) { return x.id === wp; })[0]; wantPlan = null; render('plans'); updateEntry();
      var s0 = body.querySelector('[data-soon]'); if (s0 && pp) { s0.innerHTML = '<b>You\u2019re signed in.</b> Tap <b>' + esc(pp.cta) + '</b> again to open the secure Stripe checkout in a new tab.'; s0.hidden = false; }
      greet(true); return; }
    close(true); greet(true);
  }
  /* resetpw-20261028a: Forgot password + Set a new password views (token read from #reset=, removed from the address bar at once) */
  var RESET_TOK = '';
  function forgotHTML(note) {
    return '<div class="hfa-eyebrow">Forgot password</div><h1 class="hfa-h1" id="hfa-title">Reset your <span class="hfa-gold">password</span></h1>' +
      '<p class="hfa-lede">Enter your HCG account email. If it has an account, we\u2019ll email a link to set a new password. The link works once and expires in 30 minutes.</p>' + (note ? '<div class="hfa-note" role="status">' + note + '</div>' : '') +
      '<form class="hfa-form" data-form="forgot" novalidate><div class="hfa-field"><label class="hfa-label" for="hfa-f-email">Email</label><input id="hfa-f-email" name="email" class="hfa-input" type="email" autocomplete="email" value="' + esc(lastEmail()) + '"><div class="hfa-err" data-err="email" hidden></div></div>' +
      '<button type="submit" class="hfa-btn">Email me a reset link</button></form>' +
      '<div class="hfa-foot"><button type="button" class="hfa-link" data-act="signin">&larr; Back to sign in</button></div>';
  }
  function resetHTML(note) {
    return '<div class="hfa-eyebrow">HubFace account</div><h1 class="hfa-h1" id="hfa-title">Set a new <span class="hfa-gold">password</span></h1>' +
      '<p class="hfa-lede">Choose a new password (at least 12 characters). Then sign in with it.</p>' + (note ? '<div class="hfa-note" role="status">' + note + '</div>' : '') +
      '<form class="hfa-form" data-form="reset" novalidate><div class="hfa-field"><label class="hfa-label" for="hfa-r-pw">New password</label><div class="hfa-pw"><input id="hfa-r-pw" name="password" class="hfa-input" type="password" autocomplete="new-password" placeholder="At least 12 characters"><button type="button" class="hfa-eye" data-act="eye" aria-label="Show password" title="Show password">' + EYE + '</button></div><div class="hfa-err" data-err="password" hidden></div></div>' +
      '<button type="submit" class="hfa-btn">Set new password</button></form>' +
      '<div class="hfa-foot"><button type="button" class="hfa-link" data-act="forgot">Need a new link?</button><button type="button" class="hfa-link" data-act="signin">Sign in</button></div>';
  }
  function onSubmitReset(form) {
    var kind = form.getAttribute('data-form'), btn = form.querySelector('button[type=submit]');
    Array.prototype.forEach.call(form.parentNode.querySelectorAll('[data-gen]'), function (n) { n.remove(); });
    if (kind === 'forgot') {
      var em = (form.email.value || '').trim(); showErr(form, 'email', '');
      if (!EMAIL_RE.test(em)) { showErr(form, 'email', 'Enter a valid email address.'); return; }
      form.__busy = true; btn.disabled = true;
      api('/api/account/forgot-password', { email: em }).then(function (j) { form.__busy = false; btn.disabled = false;
        formNote(form, esc((j && (j.message || j.error)) || 'Something went wrong. Please try again.'), !(j && j.ok)); });
      return;
    }
    var pw = form.password.value || ''; showErr(form, 'password', '');
    if (pw.length < 12) { showErr(form, 'password', 'Password must be at least 12 characters' + (pw ? ' (' + pw.length + ' so far)' : '') + '.'); return; }
    if (!RESET_TOK) { formNote(form, 'This reset link is missing or already used. Request a new one from \u201cForgot password?\u201d.', true); return; }
    form.__busy = true; btn.disabled = true;
    api('/api/account/reset-password', { token: RESET_TOK, password: pw }).then(function (j) { form.__busy = false; btn.disabled = false;
      if (j && j.ok) { RESET_TOK = ''; form.password.value = ''; return render('signin', esc(j.message || 'Your password is updated. Sign in with your new password.')); }
      var e = (j && j.errors) || {}; Object.keys(e).forEach(function (k) { showErr(form, k, e[k]); });
      formNote(form, esc((j && j.error) || 'Something went wrong. Please try again.'), true); });
  }
  function onSubmit(ev) {
    var form = ev.target; if (!form.matches || !form.matches('.hfa-form')) return;
    var fk = form.getAttribute('data-form'); if (fk === 'forgot' || fk === 'reset') { ev.preventDefault(); ev.stopPropagation(); if (!form.__busy) onSubmitReset(form); return; }
    ev.preventDefault(); ev.stopPropagation();
    if (form.__busy) return;
    if (form.getAttribute('data-form') === 'bot') {   /* botsignup1 */
      ['email', 'username', 'password', 'code'].forEach(function (k) { showErr(form, k, ''); });
      var bp = { email: (form.email.value || '').trim(), username: (form.username.value || '').replace(/\s+/g, ' ').trim(), password: form.password.value || '', code: (form.code.value || '').trim() };
      var bb = form.querySelector('button[type=submit]'); form.__busy = true; bb.disabled = true;
      api('/api/account/bot-signup', bp).then(function (j) { form.__busy = false; bb.disabled = false;
        if (j && j.ok && j.account) { form.password.value = ''; finish(j.account); return; }
        var e = (j && j.errors) || {}; Object.keys(e).forEach(function (k) { showErr(form, k, e[k]); });
        formNote(form, esc((j && j.error) || 'Something went wrong. Please try again.'), true); });
      return;
    }
    var kind = form.getAttribute('data-form'), mail = (form.email.value || '').trim(), pw = form.password.value || '', ok = true;
    ['email', 'username', 'real_name', 'password', 'dob', 'age18'].forEach(function (k) { showErr(form, k, ''); });
    [].forEach.call(body.querySelectorAll('.hfa-note[data-gen]'), function (g) { g.remove(); });
    if (!EMAIL_RE.test(mail)) { showErr(form, 'email', 'Enter a valid email address.'); ok = false; }
    var payload;
    if (kind === 'signin') {
      if (!pw) { showErr(form, 'password', 'Enter your password.'); ok = false; }
      payload = { email: mail, password: pw };
    } else {
      if (pw.length < 12) { showErr(form, 'password', 'Password must be at least 12 characters' + (pw ? ' (' + pw.length + ' so far)' : '') + '.'); ok = false; }
      var age = ageFrom(form.dob.value);
      if (!form.dob.value || age === null) { showErr(form, 'dob', 'Enter your date of birth.'); ok = false; }
      else if (age > 120 || age < 0) { showErr(form, 'dob', 'Check your date of birth.'); ok = false; }
      else if (age < 18) { showErr(form, 'dob', 'You must be 18 or older to create an account.'); ok = false; }
      if (!form.age18.checked) { showErr(form, 'age18', 'Please confirm you\u2019re 18+ and accept the Terms.'); ok = false; }
      var un = (form.username.value || '').replace(/\s+/g, ' ').trim(), rn = (form.real_name.value || '').replace(/\s+/g, ' ').trim();
      if (!un) { showErr(form, 'username', 'Choose a username.'); ok = false; }
      else if (un.length < 2 || un.length > 24) { showErr(form, 'username', 'Username must be 2 to 24 characters.'); ok = false; }
      else if (!/^[A-Za-z0-9 _.-]+$/.test(un) || !/[A-Za-z0-9]/.test(un)) { showErr(form, 'username', 'Use letters, numbers, spaces, _ - or . only.'); ok = false; }
      if (rn.length > 60) { showErr(form, 'real_name', 'Real name must be 60 characters or fewer.'); ok = false; }
      payload = { email: mail, username: un, real_name: rn, password: pw, dob: form.dob.value, terms: !!form.age18.checked };
    }
    if (!ok) {
      var errsShown = [].filter.call(form.querySelectorAll('.hfa-err'), function (e) { return !e.hidden && e.textContent; });
      formNote(form, '<b>Please fix ' + (errsShown.length === 1 ? 'this' : 'these') + ' before continuing:</b><br>' + errsShown.map(function (e) { return esc(e.textContent); }).join('<br>'), true);
      var bad = form.querySelector('.hfa-bad') || form.querySelector('.hfa-err:not([hidden])');
      if (bad) { try { bad.scrollIntoView({ block: 'center' }); } catch (_) {} if (bad.focus) bad.focus({ preventScroll: true }); }
      return;
    }
    var btn = form.querySelector('button[type=submit]'), label = btn.textContent;
    form.__busy = true; btn.disabled = true; btn.textContent = kind === 'signin' ? 'Signing in\u2026' : 'Creating your account\u2026';
    api(kind === 'signin' ? '/api/account/login' : '/api/account/signup', payload).then(function (j) {
      form.__busy = false; btn.disabled = false; btn.textContent = label;
      if (j && j.ok && j.account) { try { if (window.PasswordCredential && navigator.credentials && navigator.credentials.store) navigator.credentials.store(new PasswordCredential(form)).catch(function () {}); } catch (e) {} form.password.value = ''; finish(j.account); return; }
      var errs = (j && j.errors) || {}, shown = false;
      Object.keys(errs).forEach(function (k) { if (form.querySelector('[data-err="' + k + '"]')) { showErr(form, k, errs[k]); shown = true; } });
      if (kind === 'signin' && j && j.__status === 401) {
        formNote(form, '<b>That email and password didn\u2019t match a HubFace account.</b> ' + esc(LEGACY_NOTE) + ' <button type="button" class="hfa-link" data-act="create">Create an account</button>', true);
      } else if (!shown) {
        formNote(form, esc((j && j.error) || ('Something went wrong' + (j && j.__status ? ' (error ' + j.__status + ')' : '') + '. Please try again.')), true);
      } else {
        formNote(form, '<b>Please fix the highlighted field' + (Object.keys(errs).length === 1 ? '' : 's') + '.</b>', true);
      }
      if (kind === 'signin') form.password.value = '';
      var bad2 = form.querySelector('.hfa-bad'); if (bad2) bad2.focus();
    });
    pw = '';
  }
  function onClick(ev) {
    if (ev.target === ov) { close(false); return; }
    var b = ev.target.closest && ev.target.closest('[data-act], .hfa-x'); if (!b) return;
    if (b.classList.contains('hfa-x')) { close(false); return; }
    var act = b.getAttribute('data-act');
    if (act === 'eye') {
      var inp = b.parentNode.querySelector('input'), show = inp.type === 'password';
      inp.type = show ? 'text' : 'password'; b.innerHTML = show ? EYE_OFF : EYE;
      b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); b.title = b.getAttribute('aria-label'); inp.focus(); return;
    }
    if (act === 'create') { anchorPanel(false); return render('create'); }
    if (act === 'botmode') { anchorPanel(false); return render('bot'); }   /* botsignup1 */
    if (act === 'botcode') { var bn = body.querySelector('[data-botcode]'); api('/api/account/bot-code', {}).then(function (j) { if (!bn) return; bn.hidden = false;
      bn.innerHTML = (j && j.code) ? 'Sponsor code: <b>' + esc(j.code) + '</b> (one use, expires in ' + esc(String(j.expiresInMin)) + ' min). Give it to your bot.' : esc((j && j.error) || 'Could not create a code.'); }); return; }
    if (act === 'signin') { anchorPanel(false); return render('signin'); }
    if (act === 'plans') { anchorPanel(false); return render('plans'); }
    if (act === 'guest') { setSession('guest'); emit('guest'); close(true); return; }
    if (act === 'forgot') { anchorPanel(false); return render('forgot'); }   /* resetpw-20261028a */
    if (act === 'terms') {
      var f = b.closest('form'), n = body.querySelector('.hfa-note');
      if (!n) { n = document.createElement('div'); n.className = 'hfa-note'; n.setAttribute('role', 'status'); f.parentNode.insertBefore(n, f); }
      n.textContent = 'HingeHub Terms: accounts are for adults 18+. Full Terms are coming soon.'; ev.preventDefault(); return;
    }
    if (act === 'signout') { b.disabled = true; api('/api/account/logout', {}).then(function () { ME = null; try { sessionStorage.removeItem(SES_KEY); } catch (_) {} emit('signed-out'); close(false); }); return; }
    if (act === 'copycard') {
      var done = function (ok) { b.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(function () { b.textContent = 'Copy'; }, 1600); };
      try { navigator.clipboard.writeText(TEST_CARD.replace(/ /g, '')).then(function () { done(true); }, function () { done(false); }); } catch (_) { done(false); }
      return;
    }
    if (act === 'plan') {
      var id = b.getAttribute('data-plan');
      if (id === 'free') return render('create', 'Free plan: 20 one-time tokens. Create your account to start.');
      var p = PLANS.filter(function (x) { return x.id === id; })[0], s = body.querySelector('[data-soon]'), link = PAYMENT_LINKS[id];
      if (!p || !s) return;
      if (isStripeLink(link)) {
        if (!ME) { wantPlan = id; return render('create', 'Create your free account first (or sign in), then you can check out ' + p.name + ' (' + p.price + p.per + ').'); }
        if (ME.plan === id && ME.status === 'active') { s.innerHTML = '<b>You\u2019re already on ' + esc(p.name) + '.</b> Nothing to do here.'; s.hidden = false; return; }
        var url = checkoutUrl(id), a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove();   // new tab, same user gesture
        s.innerHTML = '<b>Stripe checkout for ' + esc(p.name) + ' (' + esc(p.price + p.per) + ') opened in a new tab.</b> Didn\u2019t open? <a class="hfa-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open checkout</a>.' +
          ' Your plan updates here once Stripe confirms the payment.' +
          (isTestLink(link) ? '<div class="hfa-testcard" data-testcard><b>Test mode:</b> no real charge. Use card <code>' + TEST_CARD + '</code> <button type="button" class="hfa-copy" data-act="copycard">Copy</button>, any future date and any security code.</div>' : '');
        s.hidden = false; try { s.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
        return;
      }
      s.innerHTML = '<b>Checkout coming soon.</b> ' + esc(p.name) + ' (' + esc(p.price + p.per) + ', ' + esc(p.tokens) + ') isn\u2019t on sale yet. Nothing has been charged.';
      s.hidden = false; try { s.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
    }
  }
  ov.addEventListener('click', onClick);
  ov.addEventListener('submit', onSubmit, true);
  // Keep keys typed in the pop-up away from the dashboard's own shortcuts / voice layer.
  ['keydown', 'keyup', 'keypress'].forEach(function (t) { ov.addEventListener(t, function (e) { if (t === 'keydown' && e.key === 'Escape') { e.preventDefault(); close(false); } e.stopPropagation(); }); });
  ov.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = [].filter.call(panel.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])'), function (x) { return !x.disabled && x.offsetParent; });
    if (!f.length) return; var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) { e.preventDefault(); e.stopImmediatePropagation(); close(false); } }, true);

  /* ---------------- gate ---------------- */
  function gateTarget(el) {
    if (!el || !el.closest || el.closest('.hfa-ov')) return null;
    var hr = el.closest('#ui .panel .witem.hritem'); if (hr) return hr;                       // Hub Rooms
    var wo = el.closest('#ui .panel .witem.wopen');
    if (wo) { var t = (wo.textContent || '').trim(); if (/^photos?(\/videos)?$/i.test(t)) return wo; }  // Photos/Videos
    var inp = el.matches('input[type=file]') ? el : null;
    if (!inp) { var lab = el.closest('label'); if (lab) inp = lab.control && lab.control.type === 'file' ? lab.control : lab.querySelector('input[type=file]'); }
    if (inp && !inp.classList.contains('clfile')) return el;                                // any photo/video/media upload (not contacts import)
    return null;
  }
  window.addEventListener('click', function (ev) {
    if (allowed() || tourRunning()) return;
    var t = gateTarget(ev.target); if (!t) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    pending = t; open('signin');
  }, true);
  window.addEventListener('drop', function (ev) {
    if (allowed() || tourRunning()) return;
    var dt = ev.dataTransfer; if (!dt || ![].some.call(dt.types || [], function (x) { return x === 'Files'; })) return;
    if (!ev.target.closest || !ev.target.closest('.wbx, #ui > section.box')) return;
    ev.preventDefault(); ev.stopImmediatePropagation(); pending = null; open('signin');
  }, true);
  // Opened some other way (voice / Ava / Finn): show the pop-up once without undoing anything.
  var lastAuto = 0;
  function watch(el, isOpenFn) {
    if (!el) return; var was = isOpenFn(el);
    new MutationObserver(function () {
      var now = isOpenFn(el);
      if (now && !was && !allowed() && !tourRunning() && !isOpen() && Date.now() - lastAuto > 60000) { lastAuto = Date.now(); pending = null; open('signin'); }
      was = now;
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }
  var WATCH = [['#ui > section.box[data-float="hub-rooms"]', function (e) { return !e.classList.contains('closed'); }],
               ['.wbx[data-w="media"]', function (e) { return e.classList.contains('open'); }]];
  function hookWidgets() {   // some widgets are created lazily, so keep looking until each one exists (cheap, stops when done)
    var left = WATCH.filter(function (w) { var el = document.querySelector(w[0]); if (el && !el.__hfa) { el.__hfa = 1; watch(el, w[1]); } return !el; });
    if (left.length) { WATCH = left; setTimeout(hookWidgets, 1500); }
  }

  /* ---------------- entry pill ---------------- */
  var entry = document.createElement('button');
  entry.type = 'button'; entry.className = 'hfa-entry'; entry.setAttribute('data-hfa-entry', '1');
  entry.addEventListener('click', function (e) { e.stopPropagation(); open(readAcc() ? 'account' : 'signin'); });
  function updateEntry() { var a = readAcc(); entry.textContent = a ? (a.username || 'Account') + ' \u00b7 ' + planLine(a) : 'Sign in'; placeEntry(); entry.title = a ? 'Account: ' + a.email + ' (' + planLine(a) + ')' : 'Sign in or create a HingeHub account'; }

  /* Pill placement: just left of the bottom-right background/recording controls (#brIcon, #btnFs, #brDock when open), vertically
     centred on them, 8px gap. Measured live; steps up above the corner Ava/Finn faces if it would cover them. v5: also steps above the voice-status pill
     (.vl-pill) while it is showing, so it can never sit hidden under it. */
  function vis(el) { if (!el) return null; var cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null;
    var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; }
  function union(rs) { rs = rs.filter(Boolean); if (!rs.length) return null; var u = { left: 1e9, top: 1e9, right: -1e9, bottom: -1e9 };
    rs.forEach(function (r) { u.left = Math.min(u.left, r.left); u.top = Math.min(u.top, r.top); u.right = Math.max(u.right, r.right); u.bottom = Math.max(u.bottom, r.bottom); }); return u; }
  function hits(a, b, pad) { return a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad; }
  var lastPos = '';
  function placeEntry() {
    if (!entry.isConnected) return;
    var W = window.innerWidth, H = window.innerHeight, G = 8, w = entry.offsetWidth, h = entry.offsetHeight;
    var cluster = union([vis(document.getElementById('brIcon')), vis(document.getElementById('btnFs')), vis(document.getElementById('brDock')), vis(document.getElementById('hfBotQuiet'))]);   // pillgap-20261021a: clear the speaker (quiet bots) button
    var obst = [].map.call(document.querySelectorAll('.hca-agent, .vl-pill'), vis).filter(Boolean);
    if (cluster) obst.push(cluster);
    var x, y;
    if (cluster) { x = cluster.left - G - w; y = (cluster.top + cluster.bottom) / 2 - h / 2;
      if (x < G) { x = Math.max(G, cluster.right - w); y = cluster.top - G - h; } }      // no room on the left: sit just above the cluster
    else { x = W - 14 - w; y = H - 14 - h; }
    for (var i = 0; i < 8; i++) {                                                         // step up above anything it would cover
      var me = { left: x, top: y, right: x + w, bottom: y + h }, hit = null;
      for (var j = 0; j < obst.length; j++) if (hits(me, obst[j], 4)) { hit = obst[j]; break; }
      if (!hit) break; y = hit.top - G - h;
    }
    x = Math.round(Math.max(G, Math.min(x, W - w - G))); y = Math.round(Math.max(G, Math.min(y, H - h - G)));
    var pos = x + ',' + y; if (pos === lastPos) return; lastPos = pos;
    entry.style.left = x + 'px'; entry.style.top = y + 'px'; entry.style.right = 'auto'; entry.style.bottom = 'auto';
  }
  var placeQueued = false;
  function queuePlace() { if (placeQueued) return; placeQueued = true; requestAnimationFrame(function () { placeQueued = false; placeEntry(); if (isOpen() && mode === 'account') anchorPanel(true); }); }
  window.addEventListener('resize', queuePlace); window.addEventListener('orientationchange', queuePlace);
  setInterval(queuePlace, 700);   // the controls can be dragged, collapsed or opened; cheap re-measure
  function readResetTok() {   /* resetpw-20261028a */
    var m = /(?:^#|&)reset=([A-Za-z0-9_-]{30,100})/.exec(location.hash || ''); if (!m) return false;
    RESET_TOK = m[1]; try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} return true;
  }
  function init() { if (readResetTok()) setTimeout(function () { open('reset'); }, 0); updateEntry(); document.body.appendChild(entry); document.body.appendChild(ov); hookWidgets(); refreshMe().then(function (a) { if (a) greet(false); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.HubFaceAuth = { build: BUILD, open: function (m) { open(m || 'signin'); }, close: function () { close(false); }, isOpen: isOpen,
    allowed: allowed, refresh: refreshMe, account: function () { var a = readAcc(); return a ? { email: a.email, username: a.username, plan: a.plan, tokens: a.tokens } : null; } };
})();
