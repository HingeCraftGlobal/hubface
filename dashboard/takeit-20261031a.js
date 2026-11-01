/* takeit-20261031a (Dan, Oct 31 2026): "Take it with me". A small phone icon on every stash-able HubFace item.
   One shared script: a MutationObserver finds items (YouTube rows/thumbs/embeds, vault/sticky/photo media, Gmail-linked emails,
   video links, and anything tagged data-stash-ref) and adds the icon. Tap = POST /api/stash (server copy is metadata only). */
(function () {
  if (window.__takeit) return; window.__takeit = { build: 'takeit-20261031a' };
  var CSS = '.tkit{position:absolute;top:3px;right:3px;z-index:30;width:22px;height:22px;border:0;border-radius:6px;padding:0;margin:0;cursor:pointer;' +
    'background:rgba(11,22,38,.72);color:#cfe6ff;display:flex;align-items:center;justify-content:center;opacity:.55;transition:opacity .15s,transform .15s;box-shadow:0 1px 3px rgba(0,0,0,.35)}' +
    '.tkit:hover,.tkit:focus-visible{opacity:1;transform:scale(1.08);outline:none}.tkit.ok{background:#1f7a46;opacity:1;color:#fff}.tkit svg{width:13px;height:13px}' +
    '@media (hover:none){.tkit{opacity:.85;width:26px;height:26px}}' +
    '.tkit-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483000;background:rgba(11,22,38,.94);color:#fff;font:13px/1.3 system-ui,sans-serif;' +
    'padding:9px 14px;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.4);display:flex;gap:10px;align-items:center}.tkit-toast a{color:#8fd0ff;text-decoration:none;font-weight:600}';
  var st = document.createElement('style'); st.textContent = CSS; (document.head || document.documentElement).appendChild(st);
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/></svg>';
  function txt(el, n) { return el ? String(el.getAttribute && (el.getAttribute('title') || el.getAttribute('alt')) || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, n || 200) : ''; }
  function ytFrom(s) { var m = /(?:i\.ytimg\.com\/vi(?:_webp)?\/|youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(String(s || '')); return m ? m[1] : ''; }
  function mediaRef(s) {
    s = String(s || ''); var m;
    if ((m = /\/api\/vault\/file\/([A-Za-z0-9_-]{1,64})/.exec(s))) return 'vault:' + m[1];
    if ((m = /\/api\/stickies\/media\/([A-Za-z0-9_-]{8,40})/.exec(s))) return 'sticky:' + m[1];
    if ((m = /\/api\/hf-photo\/f\/([a-z0-9-]{1,80}\.(?:jpg|png|webp))/.exec(s))) return 'photo:' + m[1];
    return '';
  }
  /* Each rule: selector -> {host, ref, title, channel, thumb, meta} or null */
  var RULES = [
    ['[data-stash-ref]', function (el) { return { host: el, ref: el.getAttribute('data-stash-ref'), title: el.getAttribute('data-stash-title') || txt(el, 200), meta: el.getAttribute('data-stash-text') ? { text: el.getAttribute('data-stash-text') } : null }; }],
    ['.wli[data-v]', function (el) { var id = el.getAttribute('data-v'); return /^[\w-]{11}$/.test(id) ? { host: el, ref: 'yt:' + id, title: txt(el.querySelector('.wtx'), 300), channel: txt(el.querySelector('.wch,.wsub,small'), 120) } : null; }],
    ['img[src*="i.ytimg.com/vi"]', function (el) { var id = ytFrom(el.src); var h = el.parentElement; return id && h ? { host: h, ref: 'yt:' + id, title: txt(h.querySelector('b,.wtx,[title]'), 300) || el.alt, channel: txt(h.querySelector('small'), 120).replace(/^YouTube$/, '') } : null; }],
    ['iframe[src*="youtube.com/embed/"],iframe[src*="youtube-nocookie.com/embed/"]', function (el) { var id = ytFrom(el.src); return id && el.parentElement ? { host: el.parentElement, ref: 'yt:' + id, title: el.title || '' } : null; }],
    ['img[src*="/api/vault/file/"],video[src*="/api/vault/file/"],img[src*="/api/stickies/media/"],video[src*="/api/stickies/media/"],img[src*="/api/hf-photo/f/"]', function (el) {
      var ref = mediaRef(el.getAttribute('src')); var h = el.parentElement; if (!ref || !h || (el.width && el.width < 40)) return null;
      var p = el.getAttribute('src'); return { host: h, ref: ref, title: el.alt || el.title || txt(h.querySelector('b,.name,[title]'), 160) || ref.split(':')[0] + ' item', thumb: el.tagName === 'IMG' ? p : '', meta: { mime: el.tagName === 'VIDEO' ? 'video/*' : 'image/*', name: el.alt || '' } }; }],
    ['video[src^="http"]', function (el) { return el.parentElement ? { host: el.parentElement, ref: 'url:' + el.src, title: el.title || 'Video', meta: { mime: 'video/*' } } : null; }],
    ['a[href*="mail.google.com/mail/"]', function (el) { var m = /#[a-z]+\/([0-9a-f]{8,32})/.exec(el.href); if (!m) return null; var box = el.closest('.rbox') || el.parentElement; return { host: box, ref: 'email:' + m[1], title: txt(box && box.querySelector('.rtitle'), 300) || txt(el, 200) }; }],
  ];
  var hosts = new WeakMap();
  function add(o) {
    var h = o.host; if (!h || h.nodeType !== 1 || h === document.body || h === document.documentElement || h.closest('.tkit-skip')) return;
    var prev = hosts.get(h); if (prev && prev.ref === o.ref) return; hosts.set(h, o);
    var b = h.querySelector(':scope > .tkit');
    if (!b) {
      if (getComputedStyle(h).position === 'static') h.style.position = 'relative';
      b = document.createElement('button'); b.type = 'button'; b.className = 'tkit'; b.innerHTML = ICON; b.title = 'Take it with me (save to your stash)'; b.setAttribute('aria-label', 'Save to stash');
      ['pointerdown', 'mousedown', 'touchstart', 'dblclick'].forEach(function (ev) { b.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); save(hosts.get(h), b); });
      h.appendChild(b);
    }
  }
  var busy = false;
  function scan(root) { RULES.forEach(function (r) { var list; try { list = (root || document).querySelectorAll(r[0]); } catch (e) { return; } for (var i = 0; i < list.length; i++) { if (list[i].closest('.tkit')) continue; try { var o = r[1](list[i]); if (o && o.ref) add(o); } catch (e) {} } }); }
  function toast(html) { var t = document.createElement('div'); t.className = 'tkit-toast'; t.innerHTML = html; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
  function save(o, b) {
    if (!o) return;
    var meta = o.meta || {}; meta.src = location.pathname.slice(0, 60);
    if (/^yt:/.test(o.ref)) { var v = o.host.querySelector('video'); if (v && v.currentTime) meta.t = Math.floor(v.currentTime); }
    fetch('/api/stash', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: o.ref, title: o.title || '', channel: o.channel || '', thumb: o.thumb || '', meta: meta }) })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) {
        if (x.s === 401) return toast('Sign in to HubFace to use your stash');
        if (x.s >= 400) return toast('Could not save: ' + String((x.j && x.j.error) || x.s).replace(/</g, ''));
        b.classList.add('ok'); setTimeout(function () { b.classList.remove('ok'); }, 1500);
        toast((x.j.created ? 'Saved to stash' : 'Already in your stash') + ' <a href="/interface/stash.html" target="_blank" rel="noopener">Open</a>');
      }).catch(function () { toast('Could not reach HubFace'); });
  }
  function kick() { if (busy) return; busy = true; setTimeout(function () { busy = false; scan(document); }, 250); }
  new MutationObserver(kick).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href', 'data-v', 'data-stash-ref'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kick); else kick();
  window.__takeit.scan = function () { scan(document); };
})();
