/* floppy-photo-20261025a (Dan, Oct 25 2026 call): small floppy on YOUR OWN tile (upper right) -> upload a photo once;
   when a person's camera is off every seat shows their photo instead of black. Members: saved to account (/api/hf-photo/me).
   Guests: hosted file + remembered in this browser (localStorage) only. Bot tiles use /api/hf-photo/bot/<name> if uploaded.
   Rollback: /root/hubface-backups/floppy-photo-20261025/ROLLBACK.sh */
(function () {
  var LK = 'hf-tile-photo', mine = null, botCache = {};
  var st = document.createElement('style');
  st.textContent = '#ui > .rlPanel .hfFloppy{position:absolute;right:24px;top:5px;z-index:8;width:16px;height:16px;display:grid;place-items:center;border-radius:4px;background:rgba(0,0,0,.35);color:#fff;opacity:.45;cursor:pointer;pointer-events:auto!important}#ui > .rlPanel .hfFloppy:hover{opacity:1}#ui > .rlPanel.collapsed .hfFloppy{display:none}' +
    '#ui > .rlPanel .rlOff{position:absolute}#ui > .rlPanel .rlOff img.hfPh{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}';
  document.head.appendChild(st);
  var ICON = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 3h13l4 4v14H4z"/><path d="M8 3v5h8V3"/><rect x="7" y="13" width="10" height="6"/></svg>';
  function setMine(u) { mine = u || null; window.__hfMyPhoto = mine; try { window.__roomLive && window.__roomLive.sendState && window.__roomLive.sendState(); } catch (_) {} paint(); }
  fetch('/api/hf-photo/me', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (j && j.ok) { setMine(j.url); return; } var g = null; try { g = JSON.parse(localStorage.getItem(LK) || 'null'); } catch (_) {} if (g && g.url) setMine(g.url);
  }).catch(function () {});
  function resize(file) { return new Promise(function (res, rej) { var img = new Image(), u = URL.createObjectURL(file); img.onload = function () { var s = Math.min(1, 512 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(function (b) { b ? res(b) : rej(); }, 'image/jpeg', 0.85); }; img.onerror = rej; img.src = u; }); }
  function pick() { var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/jpeg,image/png,image/webp'; /* detached: the page's document-level click guards never see it */
    i.onchange = function () { var f = i.files && i.files[0]; if (!f) return; if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast('JPEG, PNG or WebP only'); if (f.size > 2 * 1024 * 1024) return toast('Max 2 MB');
      resize(f).then(function (b) { return fetch('/api/hf-photo/me', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'image/jpeg' }, body: b }); }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) return toast((j && j.error) || 'Upload failed'); if (!j.member) try { localStorage.setItem(LK, JSON.stringify({ url: j.url, at: Date.now() })); } catch (_) {}
        setMine(j.url); toast(j.member ? 'Photo saved to your account' : 'Photo saved in this browser'); }).catch(function () { toast('Upload failed'); }); };
    try { if (i.showPicker) { i.showPicker(); return; } } catch (_) {} i.click(); }
  function toast(t) { try { window.__rb.App.toast(t); } catch (_) {} }
  function slug(n) { return String(n || '').toLowerCase().split(/[\s\u00b7(]/)[0].replace(/[^a-z0-9-]/g, '').slice(0, 32); }
  function botUrl(n) { var k = slug(n); if (!k) return null; if (!(k in botCache)) { botCache[k] = null; fetch('/api/hf-photo/bot/' + k, { method: 'GET' }).then(function (r) { if (r.ok) { botCache[k] = '/api/hf-photo/bot/' + k + '?v=' + Date.now(); paint(); } }).catch(function () {}); } return botCache[k]; }
  function put(t, url) { var off = t.querySelector('.rlOff'); if (!off) return; var im = off.querySelector('img.hfPh'); if (!url) { if (im) im.remove(); return; } if (!im) { im = document.createElement('img'); im.className = 'hfPh'; im.alt = ''; im.draggable = false; off.appendChild(im); } if (im.getAttribute('src') !== url) im.setAttribute('src', url); }
  function paint() {
    var RL = window.__roomLive, peers = {}; try { (RL.state().peers || []).forEach(function (p) { peers[p.id] = p; }); } catch (_) {}
    document.querySelectorAll('#ui > .rlPanel').forEach(function (t) {
      var self = t.hasAttribute('data-self'), fl = t.querySelector(':scope > .hfFloppy');
      if (self) { if (!fl) { fl = document.createElement('span'); fl.className = 'hfFloppy'; fl.setAttribute('role', 'button'); fl.title = 'Upload your camera-off photo'; fl.innerHTML = ICON; t.appendChild(fl); } put(t, mine); return; }
      if (fl) fl.remove();
      if (t.hasAttribute('data-yoda')) { var u = botUrl('yoda'), av = t.querySelector('img.rlAv'); if (u && av && av.getAttribute('src') !== u) av.setAttribute('src', u); return; }
      var p = peers[t.getAttribute('data-pid')]; if (!p) return;
      var bot = false; try { bot = RL.botMute.peerIsBot(p); } catch (_) {}
      put(t, p.photo || (bot ? botUrl(p.name) : null));
    });
  }
  ['pointerdown','mousedown','touchstart'].forEach(function (ev) { window.addEventListener(ev, function (e) { if (e.target && e.target.closest && e.target.closest('#ui > .rlPanel[data-self] .hfFloppy')) e.stopPropagation(); }, true); });
  window.addEventListener('click', function (e) { if (!(e.target && e.target.closest && e.target.closest('#ui > .rlPanel[data-self] .hfFloppy'))) return; e.stopPropagation(); e.preventDefault(); pick(); }, true);   /* window capture: runs before the page's document-level tile handlers */
  setInterval(paint, 800);
})();
