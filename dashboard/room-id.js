/* roomid-20261018a: unique room IDs for HubFace dashboard rooms.
   - Entering a room (App.enter) gets it a server-made ID (POST /api/rooms): HF-XXXXX-XXXXX, crypto-random, 31-char unambiguous alphabet.
     The same room title reuses its ID on this browser (localStorage 'hubface-room-ids'); renaming the room renames it on the server (owner key).
   - Share link = https://hubface.org/interface/#room=<ID>. Opening it looks the ID up (GET /api/rooms/<ID>) and drops the visitor straight
     into that room (no sign-in needed); unknown IDs show "Room not found"; the old #room=<name> form is left alone (no-op, as before).
   - The room's top bar shows "Room ID ..." with a Copy link button; Invite People + the email invite use the ID link.
   Roll back: remove the <script src="room-id.js..."> tag (and the roomid-20261018a edits in the Invite widget / invite text). */
(function () {
  'use strict';
  if (window.__roomId) return;
  var BUILD = 'roomid-20261018a', MAPK = 'hubface-room-ids', ID_RE = /^HF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;
  var RB = window.__rb, App = RB && RB.App; if (!App) { console.warn('[roomid] room builder not found'); return; }
  var room = function () { return App.state.room; };
  var pending = null, renameT = null, joined = null;
  var S = { build: BUILD, last: null, opened: null, notFound: null, error: null };
  function lsj(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (_) { return d; } }
  function map() { var m = lsj(MAPK, {}); return m && typeof m === 'object' ? m : {}; }
  function remember(title, id, key) { if (!title) return; var m = map(); m[title] = { id: id, key: key || (m[title] && m[title].id === id ? m[title].key : null) }; var ks = Object.keys(m); if (ks.length > 60) delete m[ks[0]]; try { localStorage.setItem(MAPK, JSON.stringify(m)); } catch (_) {} }
  function base() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
  function linkFor(id) { return base() + '#room=' + id; }
  function id() { var r = room(); return r && ID_RE.test(r.roomId || '') ? r.roomId : null; }
  function link() { var i = id(); return i ? linkFor(i) : null; }
  function post(url, b) { return fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(function (x) { return x.json().catch(function () { return {}; }).then(function (j) { return { s: x.status, j: j || {} }; }); }); }
  /* make sure the current room has an ID (reuse this browser's ID for the same title, else ask the server for a new one) */
  function ensure() {
    var r = room(); if (id()) return Promise.resolve(r.roomId);
    var t = (r.title || '').trim(), m = t ? map()[t] : null;
    if (m && ID_RE.test(m.id || '')) { r.roomId = m.id; r.roomKey = m.key || null; save(); paint(); return Promise.resolve(m.id); }
    if (pending) return pending;
    pending = post('/api/rooms', { name: t || 'Untitled room', meta: { desc: r.desc || '', mode: r.mode || '', type: r.type || '', path: r.path || '' } }).then(function (x) {
      pending = null; if (x.s !== 201 || !x.j.id) throw new Error(x.j.error || ('HTTP ' + x.s));
      var rr = room(); if (!rr.roomId) { rr.roomId = x.j.id; rr.roomKey = x.j.key; rr.roomName = x.j.name; remember((rr.title || '').trim(), x.j.id, x.j.key); save(); paint(); }
      S.last = x.j.id; return rr.roomId;
    }, function (e) { pending = null; throw e; });
    return pending;
  }
  function save() { try { App.save && App.save(); } catch (_) {} }
  function renameLater() {
    clearTimeout(renameT); renameT = setTimeout(function () {
      var r = room(), i = id(), t = (r.title || '').trim(); if (!i || !r.roomKey || !t || t === r.roomName) return;
      post('/api/rooms/' + i + '/name', { name: t, key: r.roomKey }).then(function (x) { if (x.s === 200) { r.roomName = x.j.name; remember(t, i, r.roomKey); save(); } }, function () {});
    }, 1200);
  }
  /* ---------- UI: top-bar badge ---------- */
  function css() {
    if (document.getElementById('rid-css')) return;
    var s = document.createElement('style'); s.id = 'rid-css';
    s.textContent = '#rbBar #rb_rid[hidden]{display:none!important}#rbBar #rb_rid .ridv{display:block;font:700 10.5px/22px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em;height:22px;white-space:nowrap}#ui #rbBar #rb_rid,#ui #rbBar #rb_rid *{pointer-events:auto!important}' +
      '#ridCard{position:fixed;left:50%;top:86px;transform:translateX(-50%);z-index:2147482000;max-width:420px;width:calc(100% - 40px);box-sizing:border-box;padding:16px 18px;border-radius:16px;' +
      'background:rgba(16,24,38,.72);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.2);box-shadow:0 12px 34px rgba(0,0,0,.4);color:#fff;' +
      'font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Montserrat,sans-serif;text-align:center}#ridCard h3{margin:0 0 6px;font-size:16px}#ridCard code{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;letter-spacing:.05em}' +
      '#ridCard .ridBtns{margin-top:12px;display:flex;gap:8px;justify-content:center}#ridCard button{border-radius:10px;padding:7px 14px;font:600 12.5px/1.2 inherit;cursor:pointer;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);color:#fff}' +
      '#ridCard button.pri{background:#009cfd;border-color:#009cfd}';
    document.head.appendChild(s);
  }
  function badge() {   /* room bar button (next to Exit room): the ID on top, "Copy link" under it */
    var bar = document.getElementById('rbBar'); if (!bar) return null;
    var b = document.getElementById('rb_rid');
    if (!b) { b = document.createElement('button'); b.id = 'rb_rid'; b.type = 'button'; b.title = 'Copy the room link';
      b.innerHTML = '<b class="ridv"></b><span>Copy link</span>';
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); copyLink(); }); }
    var ex = document.getElementById('rb_exit'); if (ex && ex.parentElement === bar) { if (b.nextElementSibling !== ex) bar.insertBefore(b, ex); } else if (b.parentElement !== bar) bar.appendChild(b);
    return b;
  }
  function paint() { css(); var b = badge(); if (!b) return; var i = id(); b.hidden = !i; b.querySelector('.ridv').textContent = i || ''; b.setAttribute('aria-label', i ? 'Room ID ' + i + ', copy link' : 'Copy link'); }
  function toast(m) { try { App.toast(m); } catch (_) {} }
  function copyLink() {
    return ensure().then(function () { var l = link(); S.copied = l;
      return (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(function () { toast('Room link copied: ' + l); return l; }, function () { window.prompt('Copy the room link:', l); return l; }); },
      function () { toast('Could not get a room ID right now. Try again in a moment.'); return null; });
  }
  /* ---------- hooks ---------- */
  function wrap(obj, k, after, before) { var f = obj && obj[k]; if (typeof f !== 'function' || f.__rid) return; var g = function () { if (before) before.apply(this, arguments); var r = f.apply(this, arguments); try { after && after.apply(this, [r].concat([].slice.call(arguments))); } catch (e) { console.warn('[roomid]', e); } return r; }; g.__rid = 1; obj[k] = g; }
  var resetId = function () { var r = room(); if (joined && joined.keep) { joined.keep = false; return; } delete r.roomId; delete r.roomKey; delete r.roomName; paint(); };
  [App, RB].forEach(function (o) {
    wrap(o, 'begin', resetId);
    wrap(o, 'enter', function () { ensure().catch(function (e) { S.error = String(e && e.message || e); }); paint(); });
    wrap(o, 'exit', function () { paint(); });
    wrap(o, 'applyRoom', function () { paint(); if (id()) renameLater(); });
  });
  RB.begin = App.begin; RB.enter = App.enter; RB.exit = App.exit; RB.applyRoom = App.applyRoom;   // one wrapper each, shared
  /* ---------- open a room from #room=<ID> ---------- */
  function card(title, html, buttons) {
    css(); var c = document.getElementById('ridCard'); if (c) c.remove();
    c = document.createElement('div'); c.id = 'ridCard'; c.setAttribute('role', 'dialog');
    c.innerHTML = '<h3></h3><div class="ridMsg"></div><div class="ridBtns"></div>'; c.querySelector('h3').textContent = title; c.querySelector('.ridMsg').innerHTML = html;
    (buttons || []).forEach(function (b) { var x = document.createElement('button'); x.type = 'button'; x.textContent = b[0]; if (b[2]) x.className = 'pri'; x.onclick = function () { c.remove(); b[1] && b[1](); }; c.querySelector('.ridBtns').appendChild(x); });
    document.body.appendChild(c); return c;
  }
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function clearHash() { try { history.replaceState(history.state, '', location.pathname + location.search); } catch (_) {} }
  function hashId() { var m = /^#room=([^&]+)/.exec(location.hash || ''); if (!m) return null; var v = ''; try { v = decodeURIComponent(m[1]).trim().toUpperCase(); } catch (_) { return null; } return /^HF-/.test(v) ? v : null; }   // non-HF values = old #room=<name> links: left alone
  function openFromHash() {
    var want = hashId(); if (!want || (id() === want && App.inRoom)) return;
    if (!ID_RE.test(want)) { S.notFound = want; card('Room not found', 'There is no HubFace room with the ID <code>' + esc(want) + '</code>. Check the link and try again.', [['Go to dashboard', clearHash, 1]]); return; }
    fetch('/api/rooms/' + encodeURIComponent(want), { cache: 'no-store', credentials: 'same-origin' }).then(function (x) { return x.json().catch(function () { return {}; }).then(function (j) { return { s: x.status, j: j || {} }; }); }).then(function (x) {
      if (x.s === 200 && x.j.id === want) {
        joined = { keep: true }; var r = room();
        RB.begin({ title: x.j.name, desc: '', src: 'invite link' });
        r = room(); r.roomId = want; r.roomKey = (map()[x.j.name] && map()[x.j.name].id === want && map()[x.j.name].key) || null; r.roomName = x.j.name; joined.keep = false;
        if (!App.inRoom) { try { RB.pickMode('chat'); } catch (_) { App.enter(); } }
        remember(x.j.name, want, r.roomKey); save(); paint(); S.opened = want;
        var c = card('You\u2019re in \u201c' + x.j.name + '\u201d', 'Room ID <code>' + esc(want) + '</code>' + (x.j.owner ? '<br>Hosted by ' + esc(x.j.owner) : ''), [['OK', null, 1]]);
        setTimeout(function () { if (c && c.isConnected) c.remove(); }, 6000);
      } else if (x.s === 404) { S.notFound = want; card('Room not found', 'There is no HubFace room with the ID <code>' + esc(want) + '</code>. It may have been typed wrong. Ask the host for a new link.', [['Go to dashboard', clearHash, 1]]); }
      else if (x.s === 429) { S.error = 'rate-limited'; card('Too many room lookups', 'Too many room links were tried from your network. Please wait a few minutes and try again.', [['OK', null, 1]]); }
      else { S.error = 'HTTP ' + x.s; card('Couldn\u2019t open the room', 'HubFace couldn\u2019t look up room <code>' + esc(want) + '</code> right now. Try again in a moment.', [['Retry', openFromHash, 1], ['Close', null]]); }
    }, function () { S.error = 'network'; card('Couldn\u2019t open the room', 'No connection to HubFace. Check your internet and try again.', [['Retry', openFromHash, 1], ['Close', null]]); });
  }
  window.addEventListener('hashchange', openFromHash);
  function boot() { paint(); setTimeout(openFromHash, 600); }
  if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);
  window.__roomId = { build: BUILD, id: id, link: link, linkFor: linkFor, ensure: ensure, copy: copyLink, state: function () { return Object.assign({ id: id(), inRoom: !!App.inRoom, owner: !!room().roomKey }, S); } };
})();
