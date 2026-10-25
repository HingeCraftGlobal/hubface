/*yodaline-20261024: HubFace direct line. Polls /api/hf/ui/next (owner session only) and runs Yoda's commands; also the pinned Grok Bot button (#hfGrokBot).*/
(function () {
  if (window.__hfYodaLine) return; window.__hfYodaLine = 1;
  var PAGE = (window.top !== window ? 'embedded' : 'top') + ':' + location.pathname, seq = null, owner = false;
  function vis(e) { if (!e || !e.getBoundingClientRect) return false; var r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; var s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.02; }
  function label(e) { return String(e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || e.value || e.getAttribute('placeholder') || e.getAttribute('alt') || '').replace(/\s+/g, ' ').trim().slice(0, 80); }
  var SEL = 'button,a[href],input,select,textarea,[role=button],[role=tab],[role=menuitem],[role=switch],[role=checkbox],[role=slider],[onclick],[contenteditable=true],summary,label,[data-w],[data-wid],[class*=widget] [class*=close],[class*=handle],[draggable=true]';
  function all() { return Array.prototype.slice.call(document.querySelectorAll(SEL)).filter(vis); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function find(t, idx) { if (!t) return null; var e = document.getElementById(t); if (e) return e;
    if (/^[#.\[]/.test(t)) { try { e = document.querySelector(t); if (e) return e; } catch (_) {} }
    var n = norm(t), L = all(), hits = [];
    L.forEach(function (x) { var l = norm(label(x)); if (!l) return; var sc = l === n ? 3 : l.indexOf(n) === 0 ? 2 : l.indexOf(n) >= 0 ? 1 : 0; if (sc) hits.push({ x: x, sc: sc, len: l.length }); });
    if (!hits.length) { var w = n.split(' '); L.forEach(function (x) { var l = norm(label(x)); if (l && w.every(function (k) { return l.indexOf(k) >= 0; })) hits.push({ x: x, sc: 0.5, len: l.length }); }); }
    if (!hits.length) Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,h4,h5,header,[title],[aria-label],[data-title],[data-name],div,section,span')).forEach(function (x) { if (!vis(x)) return; var l = norm(x.getAttribute('data-title') || x.getAttribute('data-name') || label(x)); if (l && l.length < 200 && l.indexOf(n) >= 0) hits.push({ x: x, sc: l.indexOf(n) === 0 ? 0.4 : 0.2, len: l.length }); });
    hits.sort(function (a, b) { return b.sc - a.sc || a.len - b.len; }); var h = hits[idx || 0]; return h ? h.x : null; }
  function fire(e, type, o) { var r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; var opt = Object.assign({ bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }, o || {});
    var P = /^pointer/.test(type) && window.PointerEvent ? PointerEvent : MouseEvent; e.dispatchEvent(new P(type, Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, opt))); }
  function click(e) { e.scrollIntoView && e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(function (t) { fire(e, t); }); e.click(); }
  function setVal(e, v) { var proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var d = Object.getOwnPropertyDescriptor(proto, 'value'); d && d.set ? d.set.call(e, v) : (e.value = v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function widgetOf(e) { var c = e; while (c && c !== document.body) { var s = getComputedStyle(c); if ((s.position === 'absolute' || s.position === 'fixed') && c.offsetWidth > 60 && c.offsetHeight > 40) return c; c = c.parentElement; } return e; }
  function snapshot() { return all().slice(0, 600).map(function (x) { var r = x.getBoundingClientRect(); return { id: x.id || '', tag: x.tagName.toLowerCase(), role: x.getAttribute('role') || x.type || '', text: label(x), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), value: x.value != null && x.type !== 'password' ? String(x.value).slice(0, 80) : undefined, on: x.checked != null ? !!x.checked : (x.getAttribute('aria-pressed') || x.getAttribute('aria-checked') || undefined) }; }); }
  function post(o) { o.page = PAGE; o.url = location.href; o.title = document.title; return fetch('/api/hf/ui/state', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) }).catch(function () {}); }
  function run(c) { var e = c.target ? find(c.target, c.index) : null, ok = true, msg = '';
    try { switch (c.op) {
      case 'list': return post({ snapshot: snapshot(), result: { n: c.n, op: 'list', ok: true } });
      case 'reload': setTimeout(function () { location.reload(); }, 50); break;
      case 'key': (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: c.key || c.text, bubbles: true, cancelable: true })); document.dispatchEvent(new KeyboardEvent('keyup', { key: c.key || c.text, bubbles: true })); break;
      case 'scroll': var sc = e || document.scrollingElement; (sc.scrollBy ? sc : window).scrollBy({ left: c.dx || 0, top: c.dy == null ? 400 : c.dy, behavior: 'smooth' }); break;
      default:
        if (!e) { ok = false; msg = 'not found: ' + c.target; break; }
        if (c.op === 'click') click(e);
        else if (c.op === 'hover') { fire(e, 'pointerover'); fire(e, 'mouseover'); fire(e, 'mouseenter'); }
        else if (c.op === 'focus') e.focus();
        else if (c.op === 'type') { e.focus(); if (e.isContentEditable) { e.textContent = c.text || ''; e.dispatchEvent(new Event('input', { bubbles: true })); } else setVal(e, c.text || ''); if (c.key === 'Enter') { ['keydown', 'keypress', 'keyup'].forEach(function (t) { e.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })); }); if (e.form && e.form.requestSubmit) try { e.form.requestSubmit(); } catch (_) {} } }
        else if (c.op === 'set') { if (e.type === 'checkbox' || e.type === 'radio') { var want = /^(1|true|on|yes)$/i.test(c.value); if (e.checked !== want) click(e); } else setVal(e, c.value); }
        else if (c.op === 'toggle') { if (e.type === 'checkbox') click(e); else click(e); }
        else if (c.op === 'resize') { var w = widgetOf(e), r0 = w.getBoundingClientRect(), W = c.width || r0.width * (c.scale || 1), H = c.height || r0.height * (c.scale || 1);
          w.style.width = Math.round(W) + 'px'; w.style.height = Math.round(H) + 'px'; w.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('resize')); msg = 'resized ' + Math.round(r0.width) + 'x' + Math.round(r0.height) + ' -> ' + Math.round(W) + 'x' + Math.round(H); }
    } } catch (er) { ok = false; msg = String(er && er.message || er).slice(0, 200); }
    post({ result: { n: c.n, op: c.op, target: c.target || '', ok: ok, msg: msg, hit: e ? (e.id || label(e)).slice(0, 80) : '' } }); }
  function pin() { if (document.getElementById('hfGrokBot')) return; var b = document.createElement('button'); b.id = 'hfGrokBot'; b.type = 'button'; b.title = 'Grok Bot'; b.setAttribute('aria-label', 'Grok Bot');
    b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147482000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:54px;height:48px;padding:0;border:1px solid rgba(255,255,255,.25);border-radius:10px;background:rgba(10,16,30,.82);color:#fff;cursor:pointer;font:600 10px system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.45)';
    b.innerHTML = '<img src="/os/grokbot.png" alt="" style="width:22px;height:22px" draggable="false"><span>Grok Bot</span>';
    b.onclick = function () { var a = document.createElement('a'); a.href = 'grokbot://app/v1/agent?id=e3836661-3378-406b-be92-44bd0fbb1334'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); };
    document.body.appendChild(b); }
  async function loop() { for (;;) { try { var r = await fetch('/api/hf/ui/next?since=' + (seq == null ? -1 : seq), { cache: 'no-store', credentials: 'same-origin' });
        if (r.status === 403 || r.status === 401) { owner = false; await new Promise(function (z) { setTimeout(z, 60000); }); continue; }
        if (!r.ok) { await new Promise(function (z) { setTimeout(z, 5000); }); continue; }
        var d = await r.json(); if (!owner) { owner = true; pin(); }
        if (seq == null || d.seq < seq) { seq = d.seq; } else { d.cmds.forEach(function (c) { if (c.frame && c.frame !== PAGE.split(':')[0]) return; if (Date.now() - c.at < 30000) run(c); }); seq = d.seq; }
      } catch (e) { await new Promise(function (z) { setTimeout(z, 4000); }); continue; }
      await new Promise(function (z) { setTimeout(z, document.hidden ? 1500 : 250); }); } }
  if (document.body) loop(); else document.addEventListener('DOMContentLoaded', loop);
})();
