/* HubFace Dashboard Builder: Save layout (layoutsave-20261017-v1, Dan approved).
   - "Save" button in the builder top bar (top-right group, beside Widgets and Properties). Saves the screen into the CURRENTLY SELECTED layout
     (built-ins become "updated", custom ones are overwritten); with no layout selected it saves as "My Layout".
   - savemanual-v1 (Dan): NO auto-save. Nothing is written until Save is clicked or Ava/Finn is asked to save ("save", "save layout",
     "save my dashboard"); day-part "Save current" and the layout menu's own actions are explicit too. Live changes apply on screen
     and a small dot on Save marks unsaved changes; reloading without saving goes back to the last save. The page's own settings
     (box positions, panels, transparency, fog, ambient, weather place, day-part auto/times, ...) are committed together on Save
     (localStorage hinge-committed-v1, restored by a tiny script at the top of index.html before anything else reads them).
   - Storage: guests = this browser (localStorage hinge-layouts, as before). Signed in = the account on the server
     (GET / PUT /api/account/layout, session cookie), mirrored locally for a fast start. On sign-in the account's layouts load;
     if the account has none yet, nothing is uploaded until you press Save (the dot shows). On sign-out the guest layouts come back.
   - Sign-in state comes from /api/account/me and auth-popup.js's 'hubface-auth' event (auth-popup.js itself is not modified). */
(function () {
  'use strict';
  if (window.__layoutSave) return;
  var BUILD = 'layoutsave-20261018-v4-worder', CKEY = 'hinge-committed-v1', CK = window.__hfCommitKeys || [], GKEY = 'hinge-layouts-guest', OKEY = 'hinge-layouts-owner';
  var L = null, btn = null, mode = 'unknown', acct = null, importing = 0, suppressUntil = Date.now() + 7000, base = '', lastCur, saveT = null, upT = null,
      upBusy = false, upAgain = false, flashT = null, lastErr = '', lastUp = null, applied = 0, savedCur, dirty = false, lastContent = null, needUpload = false;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function hasData(s) { return !!(s && ((s.custom && s.custom.length) || (s.over && Object.keys(s.over).length))); }
  /* widgetorder-20261018a: widget list order (window.__wOrder) rides along with the account save as prefs.worder; a change lights the unsaved dot (account) */
  var pbase = null;
  function pk() { try { return window.__wOrder ? window.__wOrder.key() : ''; } catch (e) { return ''; } }
  function prefs() { try { return window.__wOrder ? window.__wOrder.prefs() : undefined; } catch (e) { return undefined; } }
  function key() { try { var s = L.snap(); delete s.clip; return JSON.stringify(s); } catch (e) { return ''; } }
  function tourOn() { try { return !!(window.__finTour && window.__finTour.running && window.__finTour.running()); } catch (e) { return false; } }
  function quiet(ms) { suppressUntil = Math.max(suppressUntil, Date.now() + ms); }
  function imp(store) { importing++; try { return L.importStore(store); } finally { importing--; } }

  /* ---------------- button ---------------- */
  function paint(state) {
    if (!btn) return; clearTimeout(flashT);
    var where = mode === 'account' ? 'your account' : 'this browser';
    btn.classList.toggle('lysv-ok', state === 'ok'); btn.classList.toggle('lysv-err', state === 'err');
    btn.textContent = state === 'saving' ? 'Saving\u2026' : state === 'ok' ? 'Saved \u2713' : state === 'err' ? 'Retry' : 'Save';
    var cur = L && L.current();
    btn.title = state === 'err' ? ('Could not save to your account: ' + (lastErr || 'try again')) :
      (dirty ? 'Unsaved changes \u2014 ' : '') + 'Save the screen into the ' + (cur ? '\u201c' + cur + '\u201d' : 'current') + ' layout (saved in ' + where + '; nothing saves until you press Save or ask Ava/Finn to save)' +
      (needUpload ? ' \u2014 this browser\u2019s layouts are not in your account yet' : '');
    btn.classList.toggle('lysv-dirty', dirty && state !== 'saving' && state !== 'ok');
    if (state === 'ok' || state === 'err') flashT = setTimeout(function () { paint(''); }, state === 'err' ? 4000 : 1600);
  }
  function addButton() {
    var bar = document.querySelector('#ui > .topbar'); if (!bar || document.getElementById('btnLytSave')) return;
    var st = document.createElement('style'); st.id = 'lysv-css';
    /* top-right group: devices | Save | Widgets | Properties (the logo and the left group are untouched) */
    /* align-v1 (Dan): the Save | Widgets | Properties group spans exactly the Properties panel below it (stage x 820..1018),
       mirroring how 'Dashboard Builder' sits over the Widgets panel on the left. */
    st.textContent = '#ui > .topbar > .devices{left:730px!important}' +
      '#ui > .topbar #btnHdrWidgets{left:877px!important;width:66px!important}#ui > .topbar #btnHdrProps{left:948px!important;width:70px!important}' +
      '#ui > .topbar .hbtn.lysave{left:820px;width:52px;white-space:nowrap}' +
      '#ui > .topbar .hbtn.lysave.lysv-ok{background:rgba(var(--hub-blue-rgb),.32);border-color:rgba(var(--hub-blue-rgb),.95);color:var(--hub-blue-pale)}' +
      '#ui > .topbar .hbtn.lysave.lysv-err{border-color:rgba(255,120,120,.85)!important;color:#ffd0d0}' +
      '#ui > .topbar .hbtn.lysave.lysv-dirty::after{content:"";position:absolute;top:3px;right:4px;width:5px;height:5px;border-radius:50%;background:#ffd166;box-shadow:0 0 4px rgba(255,209,102,.8)}';
    document.head.appendChild(st);
    btn = document.createElement('button'); btn.type = 'button'; btn.id = 'btnLytSave'; btn.className = 'live hbtn lysave';
    btn.setAttribute('aria-label', 'Save layout'); btn.setAttribute('data-voice-deny', '1');
    ['pointerdown', 'mousedown', 'dblclick'].forEach(function (ev) { btn.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    btn.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); saveNow(true); });
    bar.appendChild(btn); paint('');
  }

  /* ---------------- save (explicit only) ---------------- */
  function commit(only) {                                          // the page's settings as of this save; restored on the next load
    var o = {}; if (only) { try { o = (JSON.parse(ls(CKEY) || 'null') || {}).v || {}; } catch (e) { o = {}; } }
    (only || CK).forEach(function (k) { var v = ls(k); if (v !== null) o[k] = v; else delete o[k]; }); ls(CKEY, JSON.stringify({ t: Date.now(), v: o }));
  }
  function synced() {                                              // account data just came down from the server: mirror it locally, show the right scene
    commit(['hinge-layouts', 'hinge-dayparts-v1']); try { var dp = window.__dayparts; if (dp && dp.tick) setTimeout(function () { dp.tick(true); }, 600); } catch (e) {}
  }
  function content() { try { var s = L.exportStore(); return JSON.stringify([s.custom, s.over]); } catch (e) { return ''; } }
  function saveNow(manual) {
    clearTimeout(saveT); saveT = null;
    if (!L) return false;
    var cur = L.current(), dp = window.__dayparts, tgt = null;
    explicit++; try {
      if (dp && dp.beforeSave) dp.beforeSave();                       // scene renames / deletes made since the last save
      tgt = dp && dp.saveTarget ? dp.saveTarget() : null;             // the active scene is Custom or an added scene: its own layout
      if (tgt) { if (L.names().indexOf(tgt) >= 0) L.saveOver(tgt); else { var r0 = L.saveAs(tgt); if (r0 && r0.err) { lastErr = r0.err; paint('err'); return false; } } if (dp.saved) dp.saved(tgt); }
      else if (cur) L.saveOver(cur); else { var r = L.saveAs('My Layout'); if (r && r.err) return false; }
    } finally { explicit--; }
    commit(); lastContent = content(); base = key(); pbase = pk(); lastCur = savedCur = L.current(); dirty = false; needUpload = false;
    try { if (window.__wOrder && acct) window.__wOrder.saved(acct.id); } catch (e) {}
    if (mode === 'account') { paint('saving'); upload(true); } else paint('ok');
    return true;
  }
  var explicit = 0;
  function onStoreSaved() {                                        // the Layouts module wrote its store
    if (importing || explicit) return;
    var c = content(); if (c === lastContent) return;              // only the selected layout changed (a switch): not a save
    lastContent = c; commit(); savedCur = L.current();             // day-part "Save current", layout menu save-as / rename / delete: explicit actions
    if (mode === 'account') upload(false);
  }
  function upload(manual) {
    clearTimeout(upT); upT = null;
    if (mode !== 'account') return Promise.resolve(false);
    if (upBusy) { upAgain = true; return Promise.resolve(false); }
    upBusy = true; var dp = window.__dayparts, body = JSON.stringify({ store: L.exportStore(), scenes: dp && dp.defs ? dp.defs() : undefined, prefs: prefs() });
    return fetch('/api/account/layout', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) {
        if (x.s === 200 && x.j && x.j.ok) { lastUp = x.j.updated_at; lastErr = ''; paint(manual || btn.textContent === 'Saving\u2026' ? 'ok' : ''); return true; }
        if (x.s === 401) { mode = 'guest'; }
        lastErr = (x.j && x.j.error) || ('HTTP ' + x.s); paint('err'); return false;
      })
      .catch(function () { lastErr = 'network error'; paint('err'); return false; })
      .finally(function () { upBusy = false; if (upAgain) { upAgain = false; upload(false); } });
  }
  
  /* ---------------- unsaved-changes watcher (never saves) ---------------- */
  function tick() {
    if (!L) return;
    var cur = L.current();
    if (cur !== lastCur) { lastCur = cur; quiet(3500); }          // a layout was just switched: let it settle before comparing
    if (Date.now() < suppressUntil || tourOn() || importing || mode === 'unknown') { base = key(); }
    if (pbase === null || mode !== 'account') pbase = pk();
    var d = needUpload || (!!base && key() !== base) || (mode === 'account' && pk() !== pbase);          // switching layouts is not an unsaved change (the selection is kept)
    if (d !== dirty) { dirty = d; if (!/Sav|Retry/.test(btn ? btn.textContent : '')) paint(''); else if (btn) btn.classList.toggle('lysv-dirty', dirty && btn.textContent === 'Save'); }
  }

  /* ---------------- restore ---------------- */
  function applyCur() {
    var cur = L.current(); if (!cur || !L.hasSnap(cur)) return false;
    var want = L.exportStore(), s = null; want.custom.forEach(function (c) { if (c.name === cur) s = c.s; }); if (!s) s = want.over[cur];
    if (s) { var a = JSON.parse(JSON.stringify(s)); delete a.clip; delete a.fam; /* vidrot-v1: old video fields ignored */ var b = JSON.parse(key() || '{}'); if (JSON.stringify(a) === JSON.stringify(b)) return false; }
    quiet(4000); applied++; L.apply(cur); return true;
  }
  function enterAccount(a) {
    var owner = ls(OKEY), local = L.exportStore();
    if (!owner) ls(GKEY, JSON.stringify(local));                   // keep this browser's guest layouts for after sign-out
    var guest = owner ? (function () { try { return JSON.parse(ls(GKEY) || 'null'); } catch (e) { return null; } })() : local;
    ls(OKEY, String(a.id)); acct = a; mode = 'account';
    return fetch('/api/account/layout', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.authenticated) { mode = 'guest'; return; }
      if (j.scenes && window.__dayparts && window.__dayparts.importDefs) window.__dayparts.importDefs(j.scenes);
      if (j.store) { quiet(4500); imp(j.store); lastCur = savedCur = L.current(); lastContent = content(); applyCur(); }
      else if (owner === String(a.id)) { if (hasData(local)) needUpload = true; }                // this browser mirrors the account: Save pushes it
      else if (hasData(guest)) { if (owner) { quiet(4500); imp(guest); lastCur = savedCur = L.current(); lastContent = content(); applyCur(); } needUpload = true; }   // account has none yet: Save uploads them (no auto upload)
      if (j.store || j.scenes) synced();
      try { if (window.__wOrder) window.__wOrder.loadAccount(j.prefs || null, a.id); } catch (e) {} pbase = pk();
      paint('');
    }).catch(function () {});
  }
  function leaveAccount() {
    var g = null; try { g = JSON.parse(ls(GKEY) || 'null'); } catch (e) {}
    mode = 'guest'; acct = null; ls(OKEY, null); ls(GKEY, null);
    quiet(4500); imp(g || { cur: L.current(), custom: [], over: {} }); lastCur = savedCur = L.current(); lastContent = content(); needUpload = false; commit(['hinge-layouts']); applyCur(); try { if (window.__wOrder) window.__wOrder.loadGuest(); } catch (e) {} pbase = pk(); paint('');
  }
  var syncP = null;
  function sync() { if (syncP) return syncP; syncP = sync1().finally(function () { syncP = null; }); return syncP; }
  function sync1() {
    return fetch('/api/account/me', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.authenticated && j.account) { if (mode === 'account' && acct && acct.id === j.account.id) return; return enterAccount(j.account); }
      if (ls(OKEY)) leaveAccount(); else { mode = 'guest'; applyCur(); }
    }).catch(function () { if (mode === 'unknown') { mode = 'guest'; applyCur(); } });
  }

  function start() {
    L = window.__layouts; addButton(); lastCur = savedCur = L.current(); base = key(); lastContent = content();
    window.addEventListener('hinge:layouts-saved', onStoreSaved);
    window.addEventListener('hubface-auth', function (e) { var s = e && e.detail && e.detail.state;
      if (s === 'signed-in') { if (mode !== 'account') sync(); }
      else if (s === 'signed-out') { if (ls(OKEY)) leaveAccount(); else mode = 'guest'; } });
    setTimeout(sync, 2900);                                        // after the Layouts module's own background-clip restore (2.6 s)
    setInterval(tick, 1500);
  }
  (function wait(n) {
    if (window.__layouts && window.__layouts.exportStore && document.querySelector('#ui > .topbar .mlayout')) return start();
    if (n < 300) setTimeout(function () { wait(n + 1); }, 100);
  })(0);

  window.__layoutSave = { build: BUILD, saveNow: function () { return saveNow(true); }, sync: sync, upload: function () { return upload(true); },
    isDirty: function () { return dirty; }, state: function () { return { build: BUILD, mode: mode, dirty: dirty, needUpload: needUpload, account: acct ? acct.id : null, current: L && L.current(), owner: ls(OKEY), pendingSave: !!saveT, lastUpload: lastUp, lastErr: lastErr, applied: applied }; } };
})();
